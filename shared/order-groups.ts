const normalized = (value: any) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
export function groupOrders(orders: any[]) {
  const grouped = new Map<string, any[]>();
  for (const o of orders) {
    const key =
      o.delivery_group ||
      (o.address?.trim()
        ? JSON.stringify([
            o.client_id || o.client_name,
            normalized(o.address),
            normalized(o.city),
          ])
        : o.id);
    const list = grouped.get(key) || [];
    list.push(o);
    grouped.set(key, list);
  }
  return [...grouped.entries()].map(([key, members]) => {
    const items = new Map<string, any>();
    for (const o of members)
      for (const i of o.items || []) {
        const k = JSON.stringify([i.product_id || i.productId, i.name]);
        const previous = items.get(k);
        items.set(k, {
          ...i,
          quantity:
            Math.round(
              (Number(i.quantity) + Number(previous?.quantity || 0)) * 1000,
            ) / 1000,
        });
      }
    const active = members.filter(
        (o) => !["delivered", "cancelled", "rejected"].includes(o.status),
      ),
      pool = active.length ? active : members;
    const due = pool.reduce((a, b) =>
      +new Date(a.window_end) < +new Date(b.window_end) ? a : b,
    );
    return {
      key,
      members,
      summary: {
        ...members[0],
        status: due.status,
        window_start: members.reduce((a, b) =>
          +new Date(a.window_start) < +new Date(b.window_start) ? a : b,
        ).window_start,
        window_end: due.window_end,
        items: [...items.values()],
        total: members.reduce((sum, o) => sum + Number(o.total || 0), 0),
      },
    };
  });
}
