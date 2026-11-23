import { enabledModules } from "../shared/modules.js";
import { fail } from "./db.js";
export function assertFeature(req: any, cfg: any) {
  const flags = enabledModules(cfg),
    p = req.path.replace(/^\/api\//, ""),
    action = req.body?.action;
  let module: string | undefined;
  if (/^inventory(?:\/|$)/.test(p)) module = "inventory";
  else if (/^analytics(?:\/|$)/.test(p)) module = "analytics";
  else if (/^audit(?:\/|$)/.test(p)) module = "audit";
  else if (/^business-days(?:\/|$)/.test(p)) module = "days";
  else if (
    /^(credit-accounts|invoices|payments|settlements|settlement-days)(?:\/|$)/.test(
      p,
    )
  )
    module = "portfolio";
  else if (/^(schedules|order-schedules)(?:\/|$)/.test(p))
    module = "recurrences";
  else if (
    /^(delivery-routes|delivery-route-requests|route-requests|location)(?:\/|$)/.test(
      p,
    ) ||
    p.endsWith("/tracking")
  )
    module = "deliveries";
  else if (
    /^product-groups(?:\/|$)/.test(p) ||
    p === "prices" ||
    (/^products(?:\/|$)/.test(p) && req.method !== "GET")
  )
    module = "catalog";
  else if (/^orders(?:\/|$)/.test(p)) {
    if (req.method === "GET") {
      if (!flags.orders && !flags.plant && !flags.deliveries)
        fail(403, "Pedidos, Planta y Entregas están deshabilitados");
      return;
    }
    module = ["prepare", "ready"].includes(action)
      ? "plant"
      : [
            "take",
            "assign",
            "depart",
            "deliver",
            "failed",
            "reschedule",
          ].includes(action)
        ? "deliveries"
        : "orders";
    if (req.body?.recurrence?.enabled && !flags.recurrences)
      fail(403, "Frecuencias está deshabilitado");
  }
  if (module && !flags[module])
    fail(403, "Módulo deshabilitado en Ajustes: " + module);
}
