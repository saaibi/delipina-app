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
        `SELECT u.id,u.name,u.active,u.credit_limit,u.credit_used,t.balance,t.pending FROM users u CROSS JOIN LATERAL(SELECT COALESCE(sum(i.balance),0) AS balance,COALESCE(sum((SELECT COALESCE(sum(a.amount),0) FROM allocations a JOIN payments p ON p.id=a.payment_id WHERE a.invoice_id=i.id AND NOT p.verified)),0) AS pending FROM invoices i JOIN orders o ON o.id=i.order_id WHERE i.client_id=u.id AND ($2<>'courier' OR o.courier_id=$1 OR o.delivered_by=$1)) t WHERE u.role='client' AND (NOT $4::boolean OR u.id=$3) AND ($2<>'courier' OR t.balance>0) ORDER BY t.balance DESC,u.name`,
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
  @Get("credit-accounts/:id/orders") @HttpCode(200) async orders(
    @Req() req: any,
  ) {
    const u = auth(req, ["admin", "courier", "client"]);
    if (isCustomer(u) && customerId(u) !== req.params.id)
      fail(404, "Cliente no disponible");
    return (
      await pool.query(
        `SELECT i.id AS invoice_id,i.number,i.balance,o.id,o.total,o.status,o.created_at,o.window_start,(SELECT json_agg(json_build_object('name',name,'quantity',quantity)) FROM items WHERE order_id=o.id) AS items FROM invoices i JOIN orders o ON o.id=i.order_id WHERE i.client_id=$1 AND ($2<>'courier' OR o.courier_id=$3 OR o.delivered_by=$3) ORDER BY o.created_at DESC`,
        [req.params.id, u.role, u.id],
      )
    ).rows;
  }
}
