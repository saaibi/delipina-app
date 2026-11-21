import { Controller, Get, Req, HttpCode } from "@nestjs/common";
import { auth } from "../domain.js";
import { pool, fail } from "../db.js";
import { customerId, isCustomer } from "../access.js";
@Controller("api")
export class CreditsController {
  @Get("credit-accounts") @HttpCode(200) async accounts(@Req() req: any) {
    const u = auth(req, ["admin", "courier", "client"]);
    const rows = (
      await pool.query(
        `SELECT u.id,u.name,u.active,u.credit_limit,u.credit_used,t.balance,t.pending FROM users u CROSS JOIN LATERAL(SELECT COALESCE(sum(i.balance),0) AS balance,COALESCE(sum((SELECT COALESCE(sum(a.amount),0) FROM allocations a JOIN payments p ON p.id=a.payment_id WHERE a.invoice_id=i.id AND NOT p.verified AND p.rejected_at IS NULL)),0) AS pending FROM invoices i JOIN orders o ON o.id=i.order_id WHERE i.client_id=u.id AND ($2<>'courier' OR o.courier_id=$1 OR o.delivered_by=$1)) t WHERE u.role='client' AND (NOT $4::boolean OR u.id=$3) AND ($2<>'courier' OR t.balance>0) ORDER BY t.balance DESC,u.name`,
        [u.id, u.role, customerId(u), isCustomer(u)],
      )
    ).rows;
    return rows.map((r) => ({
      ...r,
      available_to_pay: Number(r.balance) - Number(r.pending),
      credit_limit: u.role === "courier" ? null : r.credit_limit,
      credit_used: u.role === "courier" ? null : r.credit_used,
    }));
  }
  @Get("credit-accounts/:id/summary")
  @HttpCode(200)
  async summary(@Req() req: any) {
    const u = auth(req, ["admin", "courier", "client"]);
    if (isCustomer(u) && customerId(u) !== req.params.id)
      fail(404, "Cuenta no disponible");
    const args = [req.params.id, u.role, u.id];
    const where =
      "o.client_id=$1 AND o.demo_batch_id IS NULL AND ($2<>'courier' OR o.courier_id=$3 OR o.delivered_by=$3)";
    const totals = (
      await pool.query(
        `SELECT count(*)::int orders, count(*) FILTER(WHERE o.status='delivered')::int delivered, COALESCE(sum(o.total) FILTER(WHERE o.status='delivered'),0) spent FROM orders o WHERE ${where}`,
        args,
      )
    ).rows[0];
    const monthly = (
      await pool.query(
        `SELECT to_char(o.window_start AT TIME ZONE 'America/Bogota','YYYY-MM') AS month,count(*)::int orders,COALESCE(sum(o.total) FILTER(WHERE o.status='delivered'),0) spent FROM orders o WHERE ${where} GROUP BY 1 ORDER BY 1 DESC LIMIT 12`,
        args,
      )
    ).rows.reverse();
    const products = (
      await pool.query(
        `SELECT i.name,COALESCE(substring(i.name from '\\(([^()]*)\\)$'),p.unit,'Unidad') AS unit,sum(i.quantity) AS quantity FROM items i JOIN orders o ON o.id=i.order_id LEFT JOIN products p ON p.id=i.product_id WHERE ${where} AND o.status='delivered' GROUP BY i.name,2 ORDER BY sum(i.quantity) DESC,i.name`,
        args,
      )
    ).rows;
    return { ...totals, monthly, products };
  }
  @Get("credit-accounts/:id/orders") @HttpCode(200) async orders(
    @Req() req: any,
  ) {
    const u = auth(req, ["admin", "courier", "client"]);
    if (isCustomer(u) && customerId(u) !== req.params.id)
      fail(404, "Cliente no disponible");
    const paged =
      req.query.page !== undefined || req.query.pageSize !== undefined;
    const page = Number(req.query.page ?? 0),
      pageSize = Number(req.query.pageSize ?? 10);
    if (
      !Number.isInteger(page) ||
      page < 0 ||
      page > 1000000 ||
      !Number.isInteger(pageSize) ||
      pageSize < 1 ||
      pageSize > 100
    )
      fail(400, "Paginación inválida");
    const params = [req.params.id, u.role, u.id];
    const where =
      "o.client_id=$1 AND ($2<>'courier' OR o.courier_id=$3 OR o.delivered_by=$3)";
    const rows = (
      await pool.query(
        `SELECT i.id AS invoice_id,i.number,COALESCE(i.balance,0) AS balance,o.id,o.total,o.status,o.created_at,o.window_start,o.window_end,(SELECT json_agg(json_build_object('name',name,'quantity',quantity)) FROM items WHERE order_id=o.id) AS items FROM orders o LEFT JOIN invoices i ON o.id=i.order_id WHERE ${where} ORDER BY o.created_at DESC,o.id${paged ? " LIMIT $4 OFFSET $5" : ""}`,
        paged ? [...params, pageSize, page * pageSize] : params,
      )
    ).rows;
    if (!paged) return rows;
    const total = Number(
      (
        await pool.query(
          `SELECT count(*) AS n FROM orders o LEFT JOIN invoices i ON o.id=i.order_id WHERE ${where}`,
          params,
        )
      ).rows[0].n,
    );
    return { rows, total, page, pageSize };
  }
}
