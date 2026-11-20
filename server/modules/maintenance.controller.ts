import {
  Controller,
  Get,
  Post,
  Req,
  Res,
  HttpCode,
  Param,
} from "@nestjs/common";
import type { Response } from "express";
import { auth, broadcast } from "../domain.js";
import { pool, fail } from "../db.js";
import {
  maintenancePreview,
  cleanupOperations,
  restoreOperations,
} from "../maintenance.js";
@Controller("api/maintenance")
export class MaintenanceController {
  @Get("preview") async preview(@Req() req: any) {
    auth(req, ["admin"]);
    return maintenancePreview();
  }
  @Get("archives") async archives(@Req() req: any) {
    auth(req, ["admin"]);
    return (
      await pool.query(
        "SELECT id,created_at,summary FROM maintenance_archives ORDER BY created_at DESC",
      )
    ).rows;
  }
  @Post("cleanup") @HttpCode(200) async cleanup(@Req() req: any) {
    const u = auth(req, ["admin"]);
    const r = await cleanupOperations(u.id, req.body.confirmation);
    await broadcast();
    return r;
  }
  @Post("archives/:id/restore") @HttpCode(200) async restore(
    @Req() req: any,
    @Param("id") id: string,
  ) {
    const u = auth(req, ["admin"]);
    const r = await restoreOperations(u.id, id, req.body.confirmation);
    await broadcast();
    return r;
  }
  @Get("archives/:id/download") async download(
    @Req() req: any,
    @Param("id") id: string,
    @Res() res: Response,
  ) {
    auth(req, ["admin"]);
    const r = (
      await pool.query("SELECT payload FROM maintenance_archives WHERE id=$1", [
        id,
      ])
    ).rows[0];
    if (!r) fail(404, "Respaldo no encontrado");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="delipina-operacion-${id}.json.gz"`,
    );
    res.type("application/gzip").send(r.payload);
  }
}
