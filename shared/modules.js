export const featureLabels = {
  orders: "Pedidos",
  plant: "Planta",
  catalog: "Catálogo",
  portfolio: "Cartera",
  deliveries: "Entregas",
  recurrences: "Frecuencias",
  analytics: "Análisis",
  audit: "Trazabilidad",
  days: "Jornadas",
  inventory: "Inventario",
};
export function enabledModules(cfg = {}) {
  return Object.fromEntries(
    Object.keys(featureLabels).map((key) => [
      key,
      typeof cfg?.enabledModules?.[key] === "boolean"
        ? cfg.enabledModules[key]
        : key !== "inventory",
    ]),
  );
}
export const featureForView = (view) =>
  ({ payments: "portfolio" })[view] || view;
export function isModuleEnabled(cfg, key) {
  return enabledModules(cfg)[key] !== false;
}
