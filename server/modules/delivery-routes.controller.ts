import { Controller, Get, Req, HttpCode } from "@nestjs/common";
import { auth } from "../domain.js";
import { pool } from "../db.js";
import { businessDate } from "../business-day.js";
import {
  groupStops,
  located,
  distanceMatrix,
  bestOrder,
} from "../route-planner.js";
import { roadMatrix } from "../road-matrix.js";
@Controller("api")
export class DeliveryRoutesController {
  @Get("delivery-routes") @HttpCode(200) async get(@Req() req: any) {
    const u = auth(req, ["courier"]);
    return this.plan(u);
  }
  async plan(u: any) {
    const day = await businessDate(),
      cfg = (await pool.query("SELECT data FROM settings WHERE id=1")).rows[0]
        .data;
    const orders = (
      await pool.query(
        "SELECT o.id,o.status,o.window_start,o.demo_batch_id,b.address,b.city,b.id branch_id,b.lat,b.lng,b.location_source FROM orders o JOIN branches b ON b.id=o.branch_id WHERE o.courier_id=$1 AND o.operation_day=$2 AND o.status IN ('ready','enroute') ORDER BY o.created_at,o.id",
        [u.id, day],
      )
    ).rows;
    const origin = cfg.originLocation,
      groups = [],
      deadline = Date.now() + 8000;
    for (const stops of groupStops(orders, origin)) {
      let mode = "pending_location",
        ordered = stops,
        seconds = null;
      if (located(origin) && stops.every(located)) {
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
        const plan = bestOrder(stops, matrix);
        if (plan) {
          ordered = plan.stops;
          if (mode === "road") seconds = Math.round(plan.cost);
        } else mode = "unreachable";
      }
      groups.push({
        id: stops
          .map((s) => s.id)
          .sort()
          .join(":"),
        stops: ordered,
        mode,
        seconds,
        demo: stops.some((s) => s.location_source === "demo"),
      });
    }
    return {
      day,
      origin: cfg.origin,
      originLocation: located(origin) ? origin : null,
      groups,
      missingOrigin: !located(origin),
    };
  }
}
