export function orderUrgency(o: any, now = Date.now()) {
  if (["delivered", "cancelled", "rejected"].includes(o.status)) return null;
  const remaining = +new Date(o.window_end) - now;
  return remaining < 0 ? "late" : remaining <= 3600000 ? "soon" : "onTime";
}
export function comparePlantOrders(a: any, b: any, now = Date.now()) {
  const tier = (o: any) =>
    ["confirmed", "preparing"].includes(o.status)
      ? 0
      : o.status === "ready"
        ? 1
        : o.status === "pending"
          ? 2
          : 3;
  const rank = (o: any) =>
    ({ late: 0, soon: 1, onTime: 2 })[orderUrgency(o, now) || "onTime"];
  return (
    tier(a) - tier(b) ||
    (tier(a) === 0
      ? rank(a) - rank(b) ||
        (rank(a) < 2 ? +new Date(a.window_end) - +new Date(b.window_end) : 0)
      : 0) ||
    +new Date(a.created_at || a.window_start) -
      +new Date(b.created_at || b.window_start) ||
    String(a.id).localeCompare(String(b.id))
  );
}
