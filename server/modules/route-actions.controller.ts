import { roadGeometry } from "../road-matrix.js";
import { located } from "../route-planner.js";
import { metropolitan } from "../access.js";
import { Controller, Get, Post, Patch, Req, HttpCode } from "@nestjs/common";
import { auth, broadcast, notify } from "../domain.js";
import { pool, tx, fail } from "../db.js";
import { businessDate } from "../business-day.js";
import { randomUUID } from "node:crypto";
import { notifyEvent } from "../notification-store.js";
function ids(value: any) {
  if (
    !Array.isArray(value) ||
    !value.length ||
    value.length > 5 ||
    new Set(value).size !== value.length ||
    value.some((x) => typeof x !== "string" || !/^[a-f0-9-]{36}$/i.test(x))
  )
    fail(400, "Selecciona de 1 a 5 pedidos");
  return value as string[];
}
@Controller("api")
export class RouteActionsController {
  @Post("delivery-route-map") @HttpCode(200) async routeMap(@Req() req: any) {
    const u = auth(req, ["courier"]),
      orderIds = ids(req.body.orderIds),
      cfg = (await pool.query("SELECT data FROM settings WHERE id=1")).rows[0]
        .data;
    let stops = (
      await pool.query(
        "SELECT o.id,o.status,COALESCE(o.delivery_address,b.address) address,COALESCE(o.delivery_city,b.city) city,COALESCE(o.delivery_lat,b.lat) lat,COALESCE(o.delivery_lng,b.lng) lng,(SELECT name FROM users WHERE id=o.client_id) client_name FROM orders o JOIN branches b ON b.id=o.branch_id WHERE o.id=ANY($1::uuid[]) AND (o.courier_id=$2 OR o.courier_id IS NULL)",
        [orderIds, u.id],
      )
    ).rows;
    if (stops.length !== orderIds.length) fail(404, "Recorrido no disponible");
    stops = orderIds.map((id) => stops.find((o) => o.id === id));
    if (req.body.routeId) {
      const saved = (
        await pool.query(
          "SELECT snapshot,status FROM delivery_runs WHERE id=$1 AND courier_id=$2",
          [req.body.routeId, u.id],
        )
      ).rows[0];
      if (saved?.status === "enroute" && saved.snapshot.stops)
        stops = saved.snapshot.stops.map((s) => ({
          ...s,
          status: stops.find((o) => o.id === s.id)?.status || s.status,
        }));
    }
    if (stops.some((s) => !metropolitan(s.city)))
      return { stops, carrier: true, geometry: null };
    const origin = cfg.originLocation;
    if (!located(origin) || !stops.every(located))
      return { stops, origin, geometry: null, missing: true };
    try {
      return {
        stops,
        origin,
        geometry: await roadGeometry([origin, ...stops]),
      };
    } catch {
      return {
        stops,
        origin,
        geometry: null,
        warning:
          "El trazado vial no está disponible. Se muestran todas las paradas.",
      };
    }
  }
  @Get("delivery-route-requests") @HttpCode(200) async list(@Req() req: any) {
    const u = auth(req, ["admin", "courier"]);
    return (
      await pool.query(
        "SELECT r.*,u.name courier_name,(SELECT json_agg(json_build_object('id',o.id,'status',o.status,'address',b.address,'city',b.city)) FROM orders o JOIN branches b ON b.id=o.branch_id WHERE o.id=ANY(r.order_ids)) stops FROM delivery_runs r JOIN users u ON u.id=r.courier_id WHERE r.status='requested' AND ($1 OR r.courier_id=$2) ORDER BY r.created_at",
        [u.role === "admin", u.id],
      )
    ).rows;
  }
  @Post("delivery-route-requests") @HttpCode(200) async request(
    @Req() req: any,
  ) {
    const u = auth(req, ["courier"]),
      orderIds = ids(req.body.orderIds),
      day = await businessDate();
    const result = await tx(async (c) => {
      await c.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        "routes:" + u.id + day,
      ]);
      const rows = (
        await c.query(
          "SELECT * FROM orders WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE",
          [orderIds],
        )
      ).rows;
      if (
        rows.length !== orderIds.length ||
        rows.some(
          (o) =>
            o.courier_id ||
            !["confirmed", "preparing", "ready"].includes(o.status) ||
            (o.operation_day instanceof Date
              ? o.operation_day.toISOString().slice(0, 10)
              : String(o.operation_day).slice(0, 10)) !== day,
        )
      )
        fail(409, "Algún pedido ya no está disponible");
      const old = (
        await c.query(
          "SELECT * FROM delivery_runs WHERE courier_id=$1 AND day=$2 AND status='requested' AND order_ids @> $3::uuid[] AND cardinality(order_ids)=$4",
          [u.id, day, orderIds, orderIds.length],
        )
      ).rows[0];
      if (old) return old;
      const r = (
        await c.query(
          "INSERT INTO delivery_runs(id,courier_id,day,status,order_ids,manual) VALUES($1,$2,$3,'requested',$4,true) RETURNING *",
          [randomUUID(), u.id, day, orderIds],
        )
      ).rows[0];
      await notifyEvent(c, ["admin"], [], {
        key: "route:" + r.id,
        module: "orders",
        targetId: orderIds[0],
        title: "Recorrido solicitado · " + u.name,
        status: "route_requested",
      });
      return r;
    });
    await broadcast();
    return result;
  }
  @Post("delivery-routes/:id/decision") @HttpCode(200) async decision(
    @Req() req: any,
  ) {
    const admin = auth(req, ["admin"]);
    const result = await tx(async (c) => {
      const r = (
        await c.query("SELECT * FROM delivery_runs WHERE id=$1 FOR UPDATE", [
          req.params.id,
        ])
      ).rows[0];
      if (!r || r.status !== "requested") fail(409, "Solicitud no disponible");
      const approved = req.body.approve === true;
      if (approved) {
        const rows = (
          await c.query(
            "SELECT * FROM orders WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE",
            [r.order_ids],
          )
        ).rows;
        if (
          rows.length !== r.order_ids.length ||
          rows.some(
            (o) =>
              o.courier_id ||
              !["confirmed", "preparing", "ready"].includes(o.status),
          )
        )
          fail(409, "Un pedido ya fue asignado o cambió de estado");
        await c.query(
          "UPDATE orders SET courier_id=$2 WHERE id=ANY($1::uuid[])",
          [r.order_ids, r.courier_id],
        );
        for (const o of rows)
          await notify(c, o, "Recorrido asignado por administración", [
            "courier",
            "client",
          ]);
      }
      if (!approved)
        await notifyEvent(c, [], [r.courier_id], {
          key: "route:" + r.id,
          module: "orders",
          targetId: r.order_ids[0],
          title: "Solicitud de recorrido rechazada",
          status: "rejected",
        });
      await c.query(
        "UPDATE delivery_runs SET status=$2,decided_by=$3 WHERE id=$1",
        [r.id, approved ? "assigned" : "rejected", admin.id],
      );
      await c.query(
        "INSERT INTO audit(actor_id,action,entity_type,entity_id) VALUES($1,$2,'route',$3)",
        [admin.id, approved ? "route-approved" : "route-rejected", r.id],
      );
      return { ok: true };
    });
    await broadcast();
    return result;
  }
  @Patch("delivery-routes/:id") @HttpCode(200) async edit(@Req() req: any) {
    const u = auth(req, ["courier"]),
      orderIds = ids(req.body.orderIds);
    await tx(async (c) => {
      const r = (
        await c.query("SELECT * FROM delivery_runs WHERE id=$1 FOR UPDATE", [
          req.params.id,
        ])
      ).rows[0];
      if (
        !r ||
        r.courier_id !== u.id ||
        !["draft", "assigned"].includes(r.status)
      )
        fail(409, "Solo puedes editar recorridos que no han salido");
      const rows = (
        await c.query(
          "SELECT * FROM orders WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE",
          [orderIds],
        )
      ).rows;
      if (
        rows.length !== orderIds.length ||
        rows.some(
          (o) =>
            o.courier_id !== u.id || !["preparing", "ready"].includes(o.status),
        )
      )
        fail(409, "Selecciona únicamente tus pedidos listos o en preparación");
      const conflict = (
        await c.query(
          "SELECT 1 FROM delivery_runs WHERE id<>$1 AND status='enroute' AND order_ids && $2::uuid[]",
          [r.id, orderIds],
        )
      ).rowCount;
      if (conflict) fail(409, "Un pedido ya está en recorrido");
      await c.query(
        "UPDATE delivery_runs SET status='rejected' WHERE id<>$1 AND courier_id=$2 AND status IN ('draft','assigned') AND order_ids && $3::uuid[]",
        [r.id, u.id, orderIds],
      );
      await c.query(
        "UPDATE delivery_runs SET order_ids=$2,manual=true WHERE id=$1",
        [r.id, orderIds],
      );
      await c.query(
        "INSERT INTO audit(actor_id,action,entity_type,entity_id) VALUES($1,'route-edited','route',$2)",
        [u.id, r.id],
      );
    });
    await broadcast();
    return { ok: true };
  }
  @Post("delivery-routes/:id/start") @HttpCode(200) async start(
    @Req() req: any,
  ) {
    const u = auth(req, ["courier"]);
    await tx(async (c) => {
      const r = (
        await c.query("SELECT * FROM delivery_runs WHERE id=$1 FOR UPDATE", [
          req.params.id,
        ])
      ).rows[0];
      if (!r || r.courier_id !== u.id) fail(404, "Recorrido no disponible");
      if (r.status === "enroute") return;
      if (!["draft", "assigned"].includes(r.status))
        fail(409, "Recorrido no asignado");
      const rows = (
        await c.query(
          "SELECT o.*,COALESCE(o.delivery_address,b.address) address,COALESCE(o.delivery_city,b.city) city,COALESCE(o.delivery_lat,b.lat) lat,COALESCE(o.delivery_lng,b.lng) lng,(SELECT name FROM users WHERE id=o.client_id) client_name FROM orders o JOIN branches b ON b.id=o.branch_id WHERE o.id=ANY($1::uuid[]) ORDER BY o.id FOR UPDATE OF o",
          [r.order_ids],
        )
      ).rows;
      if (
        rows.length !== r.order_ids.length ||
        rows.some((o) => o.courier_id !== u.id || o.status !== "ready")
      )
        fail(409, "Todos los pedidos deben estar listos y asignados a ti");
      await c.query(
        "UPDATE orders SET status='enroute' WHERE id=ANY($1::uuid[])",
        [r.order_ids],
      );
      await c.query(
        "UPDATE delivery_runs SET status='enroute',started_at=clock_timestamp(),snapshot=$2 WHERE id=$1",
        [
          r.id,
          {
            ...r.snapshot,
            stops: r.order_ids.map((id) => rows.find((o) => o.id === id)),
          },
        ],
      );
      for (const o of rows) {
        await c.query(
          "INSERT INTO audit(actor_id,order_id,action,next_status) VALUES($1,$2,'route-start','enroute')",
          [u.id, o.id],
        );
        await notify(c, o, "Pedido: En camino", ["client"]);
      }
    });
    await broadcast();
    return { ok: true };
  }
}
