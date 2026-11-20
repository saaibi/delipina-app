import { Controller, Get, Req, HttpCode } from "@nestjs/common";
import { auth } from "../domain.js";
import { pool, fail } from "../db.js";
@Controller("api")
export class AnalyticsController {
  @Get("analytics") @HttpCode(200) async report(@Req() req: any) {
    auth(req, ["admin"]);
    const today = new Date().toLocaleDateString("en-CA", {
        timeZone: "America/Bogota",
      }),
      last = new Date(today + "T12:00:00Z");
    last.setUTCFullYear(last.getUTCFullYear() - 1);
    const from = req.query.from || last.toISOString().slice(0, 10),
      to = req.query.to || today;
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(from) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(to) ||
      from > to
    )
      fail(400, "Rango de fechas inválido");
    const values = [from, to];
    const where =
      "(o.window_start AT TIME ZONE 'America/Bogota')::date BETWEEN $1 AND $2";
    const accepted = "o.status NOT IN ('pending','cancelled','rejected')";
    const [totals, daily, status, products, couriers, accounts] =
      await Promise.all([
        pool.query(
          `SELECT count(*)::int AS orders,count(*) FILTER(WHERE ${accepted})::int AS accepted,COALESCE(sum(total) FILTER(WHERE ${accepted}),0) AS accepted_total,COALESCE(sum(total) FILTER(WHERE status='delivered'),0) AS delivered_total FROM orders o WHERE ${where}`,
          values,
        ),
        pool.query(
          `SELECT to_char(o.window_start AT TIME ZONE 'America/Bogota','YYYY-MM-DD') AS day,COALESCE(sum(total) FILTER(WHERE ${accepted}),0) AS accepted_total,COALESCE(sum(total) FILTER(WHERE status='delivered'),0) AS delivered_total FROM orders o WHERE ${where} GROUP BY 1 ORDER BY 1`,
          values,
        ),
        pool.query(
          `SELECT status,count(*)::int AS count FROM orders o WHERE ${where} GROUP BY status ORDER BY status`,
          values,
        ),
        pool.query(
          `SELECT i.name,round(sum(i.price*i.quantity)) AS total FROM items i JOIN orders o ON o.id=i.order_id WHERE ${where} AND ${accepted} GROUP BY i.name ORDER BY total DESC LIMIT 10`,
          values,
        ),
        pool.query(
          `SELECT u.name,count(*)::int AS count FROM orders o JOIN users u ON u.id=o.delivered_by WHERE ${where} AND o.status='delivered' GROUP BY u.id,u.name ORDER BY count DESC`,
          values,
        ),
        pool.query(
          "SELECT COALESCE(sum(balance),0) AS outstanding FROM invoices",
        ),
      ]);
    return {
      totals: { ...totals.rows[0], outstanding: accounts.rows[0].outstanding },
      daily: daily.rows,
      status: status.rows,
      products: products.rows,
      couriers: couriers.rows,
      period: { from, to },
      basis: "Fecha programada de entrega; cartera al momento de consulta",
    };
  }
}
