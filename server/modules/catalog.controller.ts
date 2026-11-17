import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Req,
  Res,
  HttpCode,
} from "@nestjs/common";
import type { Response } from "express";
import { pool, tx, fail } from "../db.js";
import { randomUUID, randomBytes, createHash } from "node:crypto";
import { OAuth2Client } from "google-auth-library";
import {
  production,
  safeUser,
  session,
  auth,
  login,
  cents,
  text,
  notify,
  broadcast,
  createInvoice,
  orderVisible,
  applyAllocation,
} from "../domain.js";

@Controller("api")
export class CatalogController {
  @Get("products")
  @HttpCode(200)
  async getProducts(
    @Req() req: any,
    @Res({ passthrough: true }) res: Response,
  ) {
    const u = auth(req);
    return (
      await pool.query(
        "SELECT p.*,COALESCE(s.price,p.price) AS price FROM products p LEFT JOIN prices s ON s.product_id=p.id AND s.client_id=$1 WHERE p.active OR $2",
        [
          u.role === "admin" && typeof req.query.clientId === "string"
            ? req.query.clientId
            : u.id,
          u.role === "admin",
        ],
      )
    ).rows;
  }
  @Post("products")
  @HttpCode(200)
  async postProducts(
    @Req() req: any,
    @Res({ passthrough: true }) res: Response,
  ) {
    auth(req, ["admin"]);
    const b = req.body;
    if (!["kg", "pack"].includes(b.unit)) fail(400, "Unidad inválida");
    return (
      await pool.query(
        "INSERT INTO products(id,name,presentation,unit,price,active,image_key) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *",
        [
          b.id || randomUUID(),
          text(b.name, 100),
          text(b.presentation, 100),
          b.unit,
          cents(b.price),
          b.active !== false,
          b.image_key || null,
        ],
      )
    ).rows[0];
  }
  @Patch("products/:id")
  @HttpCode(200)
  async patchProductsId(
    @Req() req: any,
    @Res({ passthrough: true }) res: Response,
  ) {
    auth(req, ["admin"]);
    const b = req.body;
    if (!["kg", "pack"].includes(b.unit)) fail(400, "Unidad inválida");
    return (
      await pool.query(
        "UPDATE products SET name=$2,presentation=$3,price=$4,active=$5,unit=$6,image_key=$7 WHERE id=$1 RETURNING *",
        [
          req.params.id,
          text(b.name, 100),
          text(b.presentation, 100),
          cents(b.price),
          !!b.active,
          b.unit,
          b.image_key || null,
        ],
      )
    ).rows[0];
  }
  @Put("prices")
  @HttpCode(200)
  async putPrices(@Req() req: any, @Res({ passthrough: true }) res: Response) {
    auth(req, ["admin"]);
    const b = req.body;
    await pool.query(
      "INSERT INTO prices VALUES($1,$2,$3) ON CONFLICT(client_id,product_id) DO UPDATE SET price=excluded.price",
      [b.clientId, b.productId, cents(b.price)],
    );
    return { ok: true };
  }
}
