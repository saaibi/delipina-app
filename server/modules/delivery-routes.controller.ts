import { Controller, Get, Req, HttpCode } from "@nestjs/common";
import { auth } from "../domain.js";
import { pool, tx } from "../db.js";
import { businessDate } from "../business-day.js";
import {
  groupStops,
  located,
  distanceMatrix,
  bestOrder,
} from "../route-planner.js";
import { roadMatrix } from "../google-roads.js";
import { metropolitan } from "../access.js";
import { randomUUID } from "node:crypto";
@Controller("api")
export class DeliveryRoutesController {
  @Get("delivery-routes") @HttpCode(200) async get(@Req() req: any) {
    const u = auth(req, ["courier"]);
    return this.plan(u);
  }
  async plan(u: any) {
    const day = await businessDate(),
      cfg = (await pool.query("SELECT data FROM settings WHERE id=1")).rows[0]
        .data,
      origin = cfg.originLocation,
      deadline = Date.now() + 10000;
    const all = (
      await pool.query(
        "SELECT o.id,o.client_id,o.courier_id,o.status,o.window_start,o.demo_batch_id,COALESCE(o.delivery_address,b.address) address,COALESCE(o.delivery_city,b.city) city,b.id branch_id,COALESCE(o.delivery_lat,b.lat) lat,COALESCE(o.delivery_lng,b.lng) lng,b.location_source,(SELECT name FROM users WHERE id=o.client_id) client_name FROM orders o JOIN branches b ON b.id=o.branch_id WHERE o.operation_day=$1 AND (o.courier_id=$2 OR o.courier_id IS NULL) ORDER BY o.created_at,o.id",
        [day, u.id],
      )
    ).rows;
    const own = all.filter((o) => o.courier_id === u.id),
      saved = (
        await pool.query(
          "SELECT * FROM delivery_runs WHERE courier_id=$1 AND day=$2 AND (status IN ('assigned','enroute') OR status='draft' AND manual) ORDER BY created_at",
          [u.id, day],
        )
      ).rows;
    const reserved = new Set(saved.flatMap((r) => r.order_ids));
    const decorate = async (stops: any[]) => {
      let mode = stops.some((s) => !metropolitan(s.city))
          ? "carrier"
          : "pending_location",
        ordered = stops,
        seconds = null;
      if (mode !== "carrier" && located(origin) && stops.every(located)) {
        let matrix;
        try {
          if (
            process.env.ROUTING_DISABLE_NETWORK === "true" ||
            Date.now() > deadline
          )
            throw Error("Sin red");
          matrix = await roadMatrix([origin, ...stops]);
          mode = "road";
        } catch {
          matrix = distanceMatrix(origin, stops);
          mode = "distance";
        }
        const result = bestOrder(stops, matrix);
        if (result) {
          ordered = result.stops;
          if (mode === "road") seconds = Math.round(result.cost);
        } else mode = "unreachable";
      }
      return {
        stops: ordered,
        mode,
        seconds,
        demo: stops.some((s) => s.location_source === "demo"),
      };
    };
    const groups: any[] = [],
      newPlans: any[] = [];
    for (const r of saved) {
      const stops = r.order_ids
        .map((id) => own.find((o) => o.id === id))
        .filter(Boolean);
      if (!stops.length) continue;
      if (
        r.status === "enroute" &&
        stops.every((o) =>
          ["delivered", "cancelled", "rejected"].includes(o.status),
        )
      ) {
        await pool.query(
          "UPDATE delivery_runs SET status='completed' WHERE id=$1",
          [r.id],
        );
        continue;
      }
      const plan =
        r.status === "enroute"
          ? {
              ...r.snapshot,
              stops: (r.snapshot.stops || stops)
                .filter((s) => stops.some((o) => o.id === s.id))
                .map((s) => ({
                  ...s,
                  client_name:
                    stops.find((o) => o.id === s.id)?.client_name ||
                    s.client_name,
                  status: stops.find((o) => o.id === s.id)?.status || s.status,
                })),
            }
          : await decorate(stops);
      if (r.status !== "enroute")
        await pool.query(
          "UPDATE delivery_runs SET snapshot=$2,order_ids=$3 WHERE id=$1 AND status IN ('draft','assigned')",
          [r.id, plan, plan.stops.map((o) => o.id)],
        );
      groups.push({ ...plan, id: r.id, status: r.status, manual: r.manual });
    }
    for (const stops of groupStops(
      own.filter(
        (o) => ["preparing", "ready"].includes(o.status) && !reserved.has(o.id),
      ),
      origin,
    ))
      newPlans.push(await decorate(stops));
    await tx(async (c) => {
      await c.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        "routes:" + u.id + day,
      ]);
      const kept = [];
      for (const plan of newPlans) {
        const ids = plan.stops.map((s) => s.id);
        const valid = (
          await c.query(
            "SELECT id FROM orders WHERE id=ANY($1::uuid[]) AND courier_id=$2 AND status IN ('preparing','ready') AND NOT EXISTS(SELECT 1 FROM delivery_runs r WHERE r.courier_id=$2 AND (r.status IN ('assigned','enroute') OR r.status='draft' AND r.manual) AND orders.id=ANY(r.order_ids)) ORDER BY id FOR UPDATE",
            [ids, u.id],
          )
        ).rows;
        if (valid.length !== ids.length) continue;
        const old = (
          await c.query(
            "SELECT id FROM delivery_runs WHERE courier_id=$1 AND day=$2 AND status='draft' AND NOT manual AND order_ids @> $3::uuid[] AND cardinality(order_ids)=$4 LIMIT 1",
            [u.id, day, ids, ids.length],
          )
        ).rows[0];
        const id = old?.id || randomUUID();
        await c.query(
          "INSERT INTO delivery_runs(id,courier_id,day,status,order_ids,snapshot) VALUES($1,$2,$3,'draft',$4,$5) ON CONFLICT(id) DO UPDATE SET order_ids=excluded.order_ids,snapshot=excluded.snapshot",
          [id, u.id, day, ids, plan],
        );
        kept.push(id);
        groups.push({ ...plan, id, status: "draft", manual: false });
      }
      await c.query(
        "DELETE FROM delivery_runs WHERE courier_id=$1 AND day=$2 AND status='draft' AND NOT manual AND NOT(id=ANY($3::uuid[]))",
        [u.id, day, kept],
      );
    });
    const available = [];
    for (const stops of groupStops(
      all.filter(
        (o) =>
          !o.courier_id &&
          ["confirmed", "preparing", "ready"].includes(o.status),
      ),
      origin,
    )) {
      const plan = await decorate(stops);
      available.push({
        ...plan,
        id: stops
          .map((s) => s.id)
          .sort()
          .join(":"),
      });
    }
    return {
      day,
      origin: cfg.origin,
      originLocation: located(origin) ? origin : null,
      groups,
      available,
      editableOrders: own.filter((o) =>
        ["preparing", "ready"].includes(o.status),
      ),
      missingOrigin: !located(origin),
    };
  }
}
