import { fail } from "./db.js";
export const modules = [
  "orders",
  "plant",
  "portfolio",
  "analytics",
  "audit",
  "days",
];
export const isCustomer = (u: any) =>
  ["client", "client_member"].includes(u.role);
export const customerId = (u: any) =>
  u.role === "client_member" ? u.client_account_id : u.id;
export function hasModule(u: any, module: string) {
  return (
    u.role === "admin" ||
    (u.role === "custom" &&
      Array.isArray(u.permissions) &&
      u.permissions.includes(module))
  );
}
export function requireModule(u: any, module: string) {
  if (!hasModule(u, module)) fail(403, "Módulo no autorizado");
}
export function canPortfolio(u: any) {
  return u.role !== "client_member" || u.can_view_portfolio;
}
export const metropolitan = (city: string) =>
  ["bucaramanga", "girón", "giron", "floridablanca", "piedecuesta"].includes(
    city.trim().toLowerCase(),
  );
