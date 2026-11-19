import { Controller, Get, Req, HttpCode } from "@nestjs/common";
import { auth } from "../domain.js";
import { pool, fail } from "../db.js";
@Controller("api")
export class CreditsController {
  @Get("credit-accounts") @HttpCode(200) async accounts(@Req() req: any) {
    const u = auth(req, ["admin", "courier", "client"]);
    const rows = (
      await pool.query(
        "SELECT u.id,u.name,u.active,u.credit_limit,u.credit_used,COALESCE(sum(i.balance),0) AS balance,(SELECT COALESCE(sum(a.amount),0) FROM payments p JOIN allocations a ON a.payment_id=p.id WHERE p.client_id=u.id AND NOT p.verified) AS pending FROM users u LEFT JOIN invoices i ON i.client_id=u.id WHERE u.role='client' AND (u.id=$1 OR $2) GROUP BY u.id ORDER BY balance DESC,u.name",
        [u.id, u.role !== "client"],
      )
    ).rows;
    return rows
      .filter(
        (r) =>
          u.role === "admin" || u.role === "client" || Number(r.balance) > 0,
      )
      .map((r) => ({
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
    if (u.role === "client" && u.id !== req.params.id)
      fail(404, "Cliente no disponible");
    return (
      await pool.query(
        "SELECT i.id AS invoice_id,i.number,i.balance,o.id,o.total,o.status,o.created_at,o.window_start,(SELECT json_agg(json_build_object('name',name,'quantity',quantity)) FROM items WHERE order_id=o.id) AS items FROM invoices i JOIN orders o ON o.id=i.order_id WHERE i.client_id=$1 ORDER BY o.created_at DESC",
        [req.params.id],
      )
    ).rows;
  }
}
