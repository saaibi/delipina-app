import { notifyEvent } from "./notification-store.js";
import type { PoolClient } from "pg";
import { pool, tx, fail } from "./db.js";
export interface DaySchedule {
  enabled: boolean;
  open: string;
  close: string;
  leadHours: number;
}
export function weeklySchedule(cfg: any): Record<string, DaySchedule> {
  const out: Record<string, DaySchedule> = {};
  for (let d = 1; d <= 7; d++) {
    const base = cfg.weeklySchedule?.[d];
    out[d] = {
      ...(base || {
        enabled: true,
        open: String(cfg.open ?? 6).padStart(2, "0") + ":00",
        close: String(cfg.close ?? 18).padStart(2, "0") + ":00",
      }),
      leadHours: base?.leadHours ?? cfg.leadHours ?? 2,
    };
  }
  return out;
}
export function validateSchedule(cfg: any) {
  const week = weeklySchedule(cfg);
  if (!Object.values(week).some((d) => d.enabled))
    fail(400, "Habilita al menos un día de operación");
  for (const d of Object.values(week)) {
    if (
      typeof d.enabled !== "boolean" ||
      !Number.isFinite(d.leadHours) ||
      d.leadHours < 0 ||
      d.leadHours > 720 ||
      !/^([01]\d|2[0-3]):[0-5]\d$/.test(d.open) ||
      !/^([01]\d|2[0-3]):[0-5]\d$/.test(d.close) ||
      (d.enabled && d.open >= d.close)
    )
      fail(400, "Revisa el horario de cada día");
  }
  return week;
}
export async function businessDate(c?: PoolClient) {
  const r = c
    ? await c.query(
        "SELECT to_char(now() AT TIME ZONE 'America/Bogota','YYYY-MM-DD') AS day",
      )
    : await pool.query(
        "SELECT to_char(now() AT TIME ZONE 'America/Bogota','YYYY-MM-DD') AS day",
      );
  return r.rows[0].day as string;
}
export async function prepareDay(c: PoolClient, day: string, cfg: any) {
  const weekday = Number(
    (
      await c.query("SELECT EXTRACT(ISODOW FROM $1::date)::int AS weekday", [
        day,
      ])
    ).rows[0].weekday,
  );
  const schedule = weeklySchedule(cfg)[weekday];
  const cutoff = (
    await c.query(
      "SELECT ($1::date+$2::time) AT TIME ZONE 'America/Bogota' AS cutoff",
      [day, schedule.enabled ? schedule.close : "00:00"],
    )
  ).rows[0].cutoff;
  await c.query(
    "INSERT INTO business_days(day,cutoff_at) VALUES($1,$2) ON CONFLICT(day) DO UPDATE SET cutoff_at=COALESCE(business_days.cutoff_at,excluded.cutoff_at)",
    [day, cutoff],
  );
  return { schedule, cutoff };
}
export async function operatingDate(c: PoolClient, at = new Date()) {
  const cfg = (await c.query("SELECT data FROM settings WHERE id=1")).rows[0]
    .data;
  const dates = (
    await c.query(
      "SELECT to_char(($1::timestamptz AT TIME ZONE 'America/Bogota')::date+i,'YYYY-MM-DD') AS day FROM generate_series(0,14) i",
      [at],
    )
  ).rows;
  for (const { day } of dates) {
    const { schedule } = await prepareDay(c, day, cfg);
    const record = (
      await c.query(
        "SELECT cutoff_at,closed_at,intake_closed_at FROM business_days WHERE day=$1",
        [day],
      )
    ).rows[0];
    if (
      schedule.enabled &&
      !record.intake_closed_at &&
      +new Date(record.cutoff_at) > +at
    ) {
      await c.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        "delipina:day:" + day,
      ]);
      return day as string;
    }
  }
  fail(409, "No hay una jornada abierta disponible en el horario configurado");
}
export async function assertBusinessDateOpen(c: PoolClient, day?: string) {
  if (!day) return operatingDate(c);
  const cfg = (await c.query("SELECT data FROM settings WHERE id=1")).rows[0]
    .data;
  const { schedule } = await prepareDay(c, day, cfg);
  await c.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
    "delipina:day:" + day,
  ]);
  const r = (
    await c.query(
      "SELECT closed_at,cutoff_at,intake_closed_at FROM business_days WHERE day=$1",
      [day],
    )
  ).rows[0];
  if (
    !schedule.enabled ||
    r.intake_closed_at ||
    +new Date(r.cutoff_at) <= Date.now()
  )
    fail(
      409,
      "La jornada de entrega está cerrada. Reprograma para un día habilitado.",
    );
  return day;
}
export async function validateDeliveryWindow(
  c: PoolClient,
  startValue: any,
  endValue: any,
  customer = false,
) {
  const cfg = (await c.query("SELECT data FROM settings WHERE id=1")).rows[0]
    .data;
  let start = new Date(startValue),
    end = new Date(endValue);
  if (customer && Number.isFinite(+start) && Number.isFinite(+end)) {
    const duration = +end - +start;
    let found = false;
    for (let offset = 0; offset < 45; offset++) {
      const info = (
          await c.query(
            "SELECT to_char($1::timestamptz AT TIME ZONE 'America/Bogota','YYYY-MM-DD') AS day,EXTRACT(ISODOW FROM $1::timestamptz AT TIME ZONE 'America/Bogota')::int dow",
            [start],
          )
        ).rows[0],
        d = weeklySchedule(cfg)[info.dow];
      const cutoff = new Date(
        (
          await c.query(
            "SELECT (($1::date+$2::time) AT TIME ZONE 'America/Bogota')-$3*interval '1 hour' AS t",
            [info.day, d.close, d.leadHours],
          )
        ).rows[0].t,
      );
      const record = (
        await c.query(
          "SELECT intake_closed_at FROM business_days WHERE day=$1",
          [info.day],
        )
      ).rows[0];
      if (
        d.enabled &&
        Date.now() <= +cutoff &&
        +start > Date.now() &&
        !record?.intake_closed_at
      ) {
        found = true;
        break;
      }
      const next = new Date(info.day + "T12:00:00Z");
      next.setUTCDate(next.getUTCDate() + 1);
      const day = next.toISOString().slice(0, 10),
        dow = next.getUTCDay() || 7,
        nextSchedule = weeklySchedule(cfg)[dow];
      start = new Date(day + "T" + nextSchedule.open + ":00-05:00");
      end = new Date(+start + duration);
    }
    if (!found)
      fail(400, "No hay fecha disponible con la anticipación configurada");
  }
  if (!Number.isFinite(+start) || !Number.isFinite(+end) || end <= start)
    fail(400, "Rango inválido o sin la anticipación requerida");
  const r = (
    await c.query(
      "SELECT to_char($1::timestamptz AT TIME ZONE 'America/Bogota','YYYY-MM-DD') AS day,to_char($2::timestamptz AT TIME ZONE 'America/Bogota','YYYY-MM-DD') AS end_day,to_char($1::timestamptz AT TIME ZONE 'America/Bogota','HH24:MI') AS start_time,to_char($2::timestamptz AT TIME ZONE 'America/Bogota','HH24:MI') AS end_time,EXTRACT(ISODOW FROM $1::timestamptz AT TIME ZONE 'America/Bogota')::int AS weekday",
      [start, end],
    )
  ).rows[0];
  const schedule = weeklySchedule(cfg)[r.weekday];
  if (!customer && +start < Date.now() + schedule.leadHours * 3600000)
    fail(400, "No cumple la anticipación del día de entrega");
  if (
    !schedule.enabled ||
    r.day !== r.end_day ||
    r.start_time < schedule.open ||
    r.end_time > schedule.close
  )
    fail(400, "El rango está fuera del horario del día elegido");
  await assertBusinessDateOpen(c, r.day);
  return { start, end, day: r.day };
}
export async function daySummary(c: PoolClient, day: string, cutoff: Date) {
  const ops = (
    await c.query(
      "SELECT count(*)::int AS orders,count(*) FILTER(WHERE COALESCE(a.next_status,o.status) NOT IN ('delivered','cancelled','rejected'))::int AS unresolved,COALESCE(sum(o.total) FILTER(WHERE COALESCE(a.next_status,o.status) NOT IN ('pending','cancelled','rejected')),0) AS accepted_total FROM orders o LEFT JOIN LATERAL(SELECT next_status FROM audit WHERE order_id=o.id AND next_status IS NOT NULL AND created_at<=$2 ORDER BY id DESC LIMIT 1)a ON true WHERE (o.window_start AT TIME ZONE 'America/Bogota')::date=$1 AND o.created_at<=$2",
      [day, cutoff],
    )
  ).rows[0];
  const sales = (
    await c.query(
      "SELECT count(*)::int AS delivered,COALESCE(sum(total),0) AS delivered_total FROM orders WHERE sale_day=$1 AND delivered_at<=$2",
      [day, cutoff],
    )
  ).rows[0];
  const payments = (
    await c.query(
      "SELECT COALESCE(sum(amount) FILTER(WHERE method='cash' AND business_day=$1),0) AS cash,COALESCE(sum(amount) FILTER(WHERE method<>'cash' AND verified AND verified_day=$1 AND verified_at<=$2),0) AS verified_transfers,COALESCE(sum(amount) FILTER(WHERE method<>'cash' AND business_day=$1 AND (verified_at IS NULL OR verified_at>$2)),0) AS pending_transfers,count(*) FILTER(WHERE method<>'cash' AND business_day=$1 AND (verified_at IS NULL OR verified_at>$2))::int AS unverified_count FROM payments WHERE created_at<=$2",
      [day, cutoff],
    )
  ).rows[0];
  const outstanding = (
    await c.query(
      `SELECT COALESCE(sum(GREATEST(i.total-COALESCE(paid.amount,0),0)),0) AS outstanding FROM invoices i JOIN orders o ON o.id=i.order_id LEFT JOIN LATERAL(SELECT next_status FROM audit WHERE order_id=o.id AND next_status IS NOT NULL AND created_at<=$1 ORDER BY id DESC LIMIT 1) state ON true LEFT JOIN LATERAL(SELECT sum(a.amount) AS amount FROM allocations a JOIN payments p ON p.id=a.payment_id WHERE a.invoice_id=i.id AND p.verified AND COALESCE(p.verified_at,p.created_at)<=$1) paid ON true WHERE o.created_at<=$1 AND COALESCE(state.next_status,o.status) NOT IN ('pending','cancelled','rejected')`,
      [cutoff],
    )
  ).rows[0].outstanding;
  return { day, ...ops, ...sales, ...payments, outstanding };
}
let closing: Promise<boolean> | null = null;
export async function ensureBusinessClock() {
  if (closing) return closing;
  closing = tx(async (c) => {
    await c.query(
      "SELECT pg_advisory_xact_lock(hashtext('delipina:auto-close'))",
    );
    const cfg = (await c.query("SELECT data FROM settings WHERE id=1")).rows[0]
      ?.data;
    if (!cfg) return false;
    const today = await businessDate(c);
    await prepareDay(c, today, cfg);
    const gaps = (
      await c.query(
        "SELECT to_char(d,'YYYY-MM-DD') AS day FROM generate_series(COALESCE((SELECT min(day) FROM business_days),$1::date),$1::date,interval '1 day') d WHERE NOT EXISTS(SELECT 1 FROM business_days b WHERE b.day=d::date)",
        [today],
      )
    ).rows;
    for (const { day } of gaps) await prepareDay(c, day, cfg);

    const missing = (
      await c.query(
        "SELECT to_char(day,'YYYY-MM-DD') AS day FROM business_days WHERE cutoff_at IS NULL",
      )
    ).rows;
    for (const { day } of missing) await prepareDay(c, day, cfg);
    const days = (
      await c.query(
        "SELECT to_char(day,'YYYY-MM-DD') AS day,cutoff_at FROM business_days WHERE intake_closed_at IS NULL AND cutoff_at<=now() ORDER BY day FOR UPDATE",
      )
    ).rows;
    for (const d of days) {
      await c.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        "delipina:day:" + d.day,
      ]);
      await c.query(
        "UPDATE business_days SET intake_closed_at=cutoff_at WHERE day=$1",
        [d.day],
      );
    }
    const accounting = (
      await c.query(
        "SELECT to_char(day,'YYYY-MM-DD') AS day FROM business_days WHERE closed_at IS NULL AND intake_closed_at IS NOT NULL ORDER BY day FOR UPDATE",
      )
    ).rows;
    let closed = 0;
    for (const { day } of accounting) {
      const pending = (
        await c.query(
          `SELECT count(*)::int n FROM (SELECT DISTINCT COALESCE(o.delivered_by,o.courier_id) id FROM orders o WHERE o.operation_day=$1 AND COALESCE(o.delivered_by,o.courier_id) IS NOT NULL UNION SELECT receiver_id FROM payments WHERE business_day=$1) couriers JOIN users u ON u.id=couriers.id AND u.role='courier' WHERE NOT EXISTS(SELECT 1 FROM settlements s WHERE s.courier_id=couriers.id AND s.day=$1 AND s.status='confirmed')`,
          [day],
        )
      ).rows[0].n;
      const unresolved = (
        await c.query(
          "SELECT count(*)::int n FROM orders WHERE operation_day=$1 AND status NOT IN ('delivered','cancelled','rejected')",
          [day],
        )
      ).rows[0].n;
      const transfers = (
        await c.query(
          "SELECT count(*)::int n FROM payments WHERE business_day=$1 AND NOT verified",
          [day],
        )
      ).rows[0].n;
      if (pending || unresolved || transfers) continue;
      const cutoff = new Date();
      const summary = await daySummary(c, day, cutoff);
      await c.query(
        "UPDATE business_days SET closed_at=$2,automatic=true,processed_at=now(),summary=$3 WHERE day=$1",
        [day, cutoff, summary],
      );
      await notifyEvent(c, ["admin"], [], {
        key: "day:" + day,
        module: "analytics",
        targetId: day,
        title: "Jornada cerrada · cuadres confirmados",
        status: "closed",
      });
      await c.query(
        "INSERT INTO audit(action,entity_type,entity_id) VALUES('accounting-close','business_day',$1)",
        [day],
      );
      closed++;
    }
    return !!days.length || closed > 0;
  }).finally(() => {
    closing = null;
  });
  return closing;
}

export async function accountingDate(c: PoolClient, receiver?: string) {
  const today = await businessDate(c);
  const row = (
    await c.query(
      "SELECT to_char(d.day,'YYYY-MM-DD') AS day FROM business_days d WHERE d.closed_at IS NULL AND d.day<=$1 AND ($2::uuid IS NULL OR EXISTS(SELECT 1 FROM orders o WHERE o.operation_day=d.day AND (o.courier_id=$2 OR o.delivered_by=$2)) OR EXISTS(SELECT 1 FROM payments p WHERE p.business_day=d.day AND p.receiver_id=$2)) ORDER BY d.day LIMIT 1",
      [today, receiver || null],
    )
  ).rows[0];
  if (row) return row.day;
  const cfg = (await c.query("SELECT data FROM settings WHERE id=1")).rows[0]
    .data;
  await prepareDay(c, today, cfg);
  const record = (
    await c.query("SELECT closed_at FROM business_days WHERE day=$1", [today])
  ).rows[0];
  return record.closed_at ? operatingDate(c) : today;
}
