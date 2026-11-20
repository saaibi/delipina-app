import { Controller, Get, Patch, Req, HttpCode } from "@nestjs/common";
import { auth, broadcast } from "../domain.js";
import { pool, tx, fail } from "../db.js";
import { customerId, isCustomer, hasModule } from "../access.js";
import { recurrenceConfig, nextOccurrence } from "../recurrence.js";
@Controller("api")
export class SchedulesController {
  @Get("schedules") @HttpCode(200) async list(@Req() req: any) {
    const u = auth(req);
    if (!isCustomer(u) && !hasModule(u, "orders")) fail(403, "Sin permiso");
    return (
      await pool.query(
        "SELECT s.*,u.name client_name,(SELECT json_agg(i) FROM items i WHERE i.order_id=s.source_order_id) items FROM order_schedules s JOIN users u ON u.id=s.client_id WHERE $1 OR s.client_id=$2 OR s.created_by=$3 ORDER BY s.created_at DESC LIMIT 500",
        [u.role === "admin", isCustomer(u) ? customerId(u) : null, u.id],
      )
    ).rows;
  }
  @Patch("schedules/:id") @HttpCode(200) async update(@Req() req: any) {
    const u = auth(req);
    await tx(async (c) => {
      const r = (
        await c.query("SELECT * FROM order_schedules WHERE id=$1 FOR UPDATE", [
          req.params.id,
        ])
      ).rows[0];
      if (
        !r ||
        (u.role !== "admin" &&
          !(u.role === "client" && u.id === r.client_id) &&
          u.id !== r.created_by)
      )
        fail(404, "Frecuencia no disponible");
      if (u.role === "custom" && !hasModule(u, "orders"))
        fail(403, "Sin permiso");
      if (
        req.body.active === true &&
        !(
          await c.query(
            "SELECT 1 FROM branches WHERE id=$1 AND deleted_at IS NULL",
            [r.body.branchId],
          )
        ).rowCount
      )
        fail(409, "Restaura la sucursal antes de activar esta frecuencia");
      const b = req.body,
        cfg = recurrenceConfig({
          frequency: b.frequency ?? r.frequency,
          intervalDays: b.intervalDays ?? r.interval_days,
          weekdays: b.weekdays ?? r.weekdays,
          endDay:
            b.endDay === undefined
              ? r.end_day
                ? new Date(r.end_day).toISOString().slice(0, 10)
                : null
              : b.endDay,
        });
      let body = r.body;
      if (b.items) {
        if (
          !Array.isArray(b.items) ||
          !b.items.length ||
          b.items.some(
            (i) =>
              typeof i.productId !== "string" ||
              !Number.isFinite(i.quantity) ||
              i.quantity <= 0,
          )
        )
          fail(400, "Productos inválidos");
        for (const i of b.items)
          if (
            !(
              await c.query("SELECT id FROM products WHERE id=$1 AND active", [
                i.productId,
              ])
            ).rowCount
          )
            fail(400, "Producto no disponible");
        body = { ...body, items: b.items };
      }
      if (b.startTime || b.endTime) {
        const start = b.startTime ?? body.startTime,
          end = b.endTime ?? body.endTime;
        if (
          !/^([01]\d|2[0-3]):[0-5]\d$/.test(start) ||
          !/^([01]\d|2[0-3]):[0-5]\d$/.test(end) ||
          end <= start
        )
          fail(400, "Horario inválido");
        body = { ...body, startTime: start, endTime: end };
      }
      let next =
        b.nextDay ??
        (r.next_day instanceof Date
          ? r.next_day.toISOString().slice(0, 10)
          : String(r.next_day));
      const today = new Date().toLocaleDateString("en-CA", {
        timeZone: "America/Bogota",
      });
      if (b.nextDay === undefined && next < today && b.active === true)
        next = nextOccurrence(today, {
          frequency: cfg.frequency,
          interval_days: cfg.intervalDays,
          weekdays: cfg.weekdays,
        });
      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(next) ||
        (b.nextDay !== undefined && next < today)
      )
        fail(400, "Próxima fecha inválida");
      if (
        (b.endDay || b.active === true) &&
        cfg.endDay &&
        (cfg.endDay <= today || cfg.endDay < next)
      )
        fail(
          400,
          "La fecha final debe ser posterior a hoy e incluir la próxima entrega",
        );
      await c.query(
        "UPDATE order_schedules SET frequency=$2,interval_days=$3,weekdays=$4,end_day=$5,active=$6,body=$7,next_day=$8,updated_at=now() WHERE id=$1",
        [
          r.id,
          cfg.frequency,
          cfg.intervalDays,
          cfg.weekdays,
          cfg.endDay,
          b.active === undefined ? r.active : b.active === true,
          body,
          next,
        ],
      );
      await c.query(
        "INSERT INTO audit(actor_id,action,entity_type,entity_id) VALUES($1,'schedule-edited','schedule',$2)",
        [u.id, r.id],
      );
    });
    await broadcast();
    return { ok: true };
  }
}
