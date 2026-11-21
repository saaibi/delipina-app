export const moduleLabels = {
  orders: "Pedidos",
  plant: "Planta",
  catalog: "Catálogo",
  portfolio: "Cartera",
  analytics: "Análisis",
  audit: "Trazabilidad",
  days: "Jornadas",
};
export const customer = (u: any) =>
  ["client", "client_member"].includes(u?.role);
export const has = (u: any, key: string) =>
  u?.role === "admin" || (u?.role === "custom" && u.permissions?.includes(key));
export const portfolio = (u: any) =>
  u?.role === "admin" ||
  u?.role === "courier" ||
  u?.role === "client" ||
  (u?.role === "client_member" && u.canViewPortfolio) ||
  has(u, "portfolio");
