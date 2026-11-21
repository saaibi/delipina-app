import { weeklySchedule } from "./business-day.js";
import { pool, tx, fail } from "./db.js";
import { randomUUID } from "node:crypto";
import { isCustomer, customerId, hasModule } from "./access.js";
export function recurrenceConfig(b: any) {
  if (
    !["days", "weekly"].includes(b.frequency) ||
    !Number.isInteger(b.intervalDays) ||
    b.intervalDays < 1 ||
    b.intervalDays > 365
  )
    fail(400, "Frecuencia inválida");
  const weekdays = [...new Set(b.weekdays || [])] as number[];
  if (
    b.frequency === "weekly" &&
    (!weekdays.length ||
      weekdays.some((d) => !Number.isInteger(d) || d < 1 || d > 7))
  )
    fail(400, "Selecciona los días de la semana");
  if (b.endDay && !/^\d{4}-\d{2}-\d{2}$/.test(b.endDay))
    fail(400, "Fecha final inválida");
  return {
    frequency: b.frequency,
    intervalDays: b.intervalDays,
    weekdays,
    endDay: b.endDay || null,
  };
}
export function nextOccurrence(day: string, rule: any) {
  const d = new Date(day + "T12:00:00Z");
  if (rule.frequency === "days")
    d.setUTCDate(d.getUTCDate() + rule.interval_days);
  else {
    do {
      d.setUTCDate(d.getUTCDate() + 1);
    } while (!rule.weekdays.includes(d.getUTCDay() || 7));
  }
  return d.toISOString().slice(0, 10);
}
export async function saveOrderSchedule(
  c: any,
  u: any,
  o: any,
  b: any,
  body: any,
) {
  if (!b?.enabled) return;
  const cfg = recurrenceConfig(b),
    day = (
      await c.query(
        "SELECT to_char($1::timestamptz AT TIME ZONE 'America/Bogota','YYYY-MM-DD') AS day,to_char($1::timestamptz AT TIME ZONE 'America/Bogota','HH24:MI') AS start,to_char($2::timestamptz AT TIME ZONE 'America/Bogota','HH24:MI') AS end,(($2::timestamptz AT TIME ZONE 'America/Bogota')::date-($1::timestamptz AT TIME ZONE 'America/Bogota')::date)::int AS end_days",
        [o.window_start, o.window_end],
      )
    ).rows[0];
  const next = nextOccurrence(day.day, {
    frequency: cfg.frequency,
    interval_days: cfg.intervalDays,
    weekdays: cfg.weekdays,
  });
  if (cfg.endDay && cfg.endDay < next)
    fail(400, "La fecha final debe incluir al menos una repetición");
  await c.query(
    "INSERT INTO order_schedules(id,client_id,created_by,source_order_id,body,frequency,interval_days,weekdays,next_day,end_day) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
    [
      randomUUID(),
      o.client_id,
      u.id,
      o.id,
      {
        ...body,
        recurrence: undefined,
        startTime: day.start,
        endTime: day.end,
        endDayOffset: day.end_days,
      },
      cfg.frequency,
      cfg.intervalDays,
      cfg.weekdays,
      next,
      cfg.endDay,
    ],
  );
  await c.query(
    "INSERT INTO audit(actor_id,order_id,action,entity_type) VALUES($1,$2,'schedule-created','schedule')",
    [u.id, o.id],
  );
}
let running = false;
export async function ensureRecurrences() {
  if (running) return;
  running = true;
  try {
    const now = new Date(Date.now()),
      today = new Date(+now - 5 * 3600000).toISOString().slice(0, 10);
    const rules = (
      await pool.query(
        "SELECT s.*,row_to_json(u) actor FROM order_schedules s JOIN users u ON u.id=s.created_by JOIN users owner ON owner.id=s.client_id WHERE s.active AND s.next_day<=$1::date ORDER BY s.next_day LIMIT 100",
        [today],
      )
    ).rows;
    const cfg = (await pool.query("SELECT data FROM settings WHERE id=1"))
      .rows[0]?.data;
    for (const r of rules) {
      const day = String(
        r.next_day instanceof Date
          ? r.next_day.toISOString().slice(0, 10)
          : r.next_day,
      ).slice(0, 10);
      if (day > today) continue;
      if (day === today) {
        const schedule =
          weeklySchedule(cfg)[new Date(day + "T12:00:00Z").getUTCDay() || 7];
        const record = (
          await pool.query(
            "SELECT closed_at,intake_closed_at FROM business_days WHERE day=$1",
            [day],
          )
        ).rows[0];
        if (
          !schedule.enabled ||
          +now < +new Date(day + "T" + schedule.open + ":00-05:00") ||
          +now >= +new Date(day + "T" + schedule.close + ":00-05:00") ||
          record?.closed_at ||
          record?.intake_closed_at
        )
          continue;
      }
      const u = r.actor,
        owner = (
          await pool.query("SELECT active FROM users WHERE id=$1", [
            r.client_id,
          ])
        ).rows[0];
      if (
        !u.active ||
        !owner?.active ||
        (u.role === "client_member" && u.client_account_id !== r.client_id) ||
        (u.role === "custom" && !hasModule(u, "orders"))
      ) {
        await pool.query(
          "UPDATE order_schedules SET active=false,last_error='El usuario o cliente ya no tiene acceso' WHERE id=$1",
          [r.id],
        );
        continue;
      }
      if (r.end_day && day > new Date(r.end_day).toISOString().slice(0, 10)) {
        await pool.query(
          "UPDATE order_schedules SET active=false WHERE id=$1",
          [r.id],
        );
        continue;
      }
      const claim = await pool.query(
        "INSERT INTO schedule_runs(schedule_id,day,status) VALUES($1,$2,'processing') ON CONFLICT(schedule_id,day) DO UPDATE SET status='processing',updated_at=now() WHERE schedule_runs.status='error' OR schedule_runs.status='processing' AND schedule_runs.updated_at<now()-interval '2 minutes' RETURNING *",
        [r.id, day],
      );
      if (!claim.rowCount) continue;
      let status = "created",
        order: any,
        error = null;
      try {
        if (day < today) fail(409, "Repetición omitida: fecha pasada");
        const endDay = new Date(
          +new Date(day + "T12:00:00Z") +
            Number(r.body.endDayOffset || 0) * 86400000,
        )
          .toISOString()
          .slice(0, 10);
        const b = {
          ...r.body,
          clientId: r.client_id,
          start: day + "T" + r.body.startTime + ":00-05:00",
          end: endDay + "T" + r.body.endTime + ":00-05:00",
          recurrence: undefined,
        };
        const { OrdersController } =
          await import("./modules/orders.controller.js");
        order = await new OrdersController().postOrders(
          {
            user: u,
            body: b,
            path: "/api/orders",
            method: "POST",
            recurring: true,
            get: () => "recurrence:" + r.id + ":" + day,
          } as any,
          undefined as any,
        );
      } catch (e) {
        error = e.status ? e.message : "No se pudo generar; se reintentará";
        status = e.status ? "skipped" : "error";
      }
      await tx(async (c) => {
        await c.query(
          "UPDATE schedule_runs SET status=$3,order_id=$4,error=$5,updated_at=now() WHERE schedule_id=$1 AND day=$2",
          [r.id, day, status, order?.id || null, error],
        );
        if (status !== "error") {
          const next = nextOccurrence(day, r);
          await c.query(
            "UPDATE order_schedules SET next_day=$2,last_error=$3,updated_at=now() WHERE id=$1",
            [r.id, next, error],
          );
        }
        await c.query(
          "INSERT INTO audit(actor_id,action,entity_type,entity_id,details) VALUES($1,$2,'schedule',$3,$4)",
          [
            r.created_by,
            "schedule-" + status,
            r.id,
            { day, error, orderId: order?.id },
          ],
        );
      });
    }
  } finally {
    running = false;
  }
}
