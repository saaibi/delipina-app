import { groupOrders } from "../shared/order-groups";
import { StatusChip, TimingChip, AssignmentChip } from "./order-badges";
import LocalShippingOutlined from "@mui/icons-material/LocalShippingOutlined";
import PlaceOutlined from "@mui/icons-material/PlaceOutlined";
import ArrowForward from "@mui/icons-material/ArrowForward";
import React, { useRef, useLayoutEffect } from "react";
export function OrderCards({
  orders,
  userRole,
  onSelect,
  onSelectGroup,
  actionsFor,
  urgency,
  labels,
  money,
  date,
}: any) {
  const grid = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (userRole !== "preparation" || !grid.current) return;
    const host = grid.current;
    let frame = 0;
    const layout = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        for (const card of Array.from(host.children) as HTMLElement[]) {
          const span = Math.ceil(
            (card.getBoundingClientRect().height + 13) / 2,
          );
          const value = `span ${span}`;
          if (card.style.gridRowEnd !== value) card.style.gridRowEnd = value;
        }
      });
    };
    const observer = new ResizeObserver(layout);
    observer.observe(host);
    for (const card of Array.from(host.children)) observer.observe(card);
    layout();
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      for (const card of Array.from(host.children) as HTMLElement[])
        card.style.gridRowEnd = "";
    };
  }, [orders, userRole]);
  return (
    <div
      ref={grid}
      className={
        userRole === "preparation"
          ? "orders plant-order-grid"
          : userRole === "courier"
            ? "orders courier-order-grid"
            : "orders order-grid-compact"
      }
    >
      {groupOrders(orders).map(({ key: groupKey, members, summary: o }) => {
        const preparing = members.filter((m) =>
          ["confirmed", "preparing"].includes(m.status),
        );
        const visibleItems =
          userRole === "preparation" && preparing.length
            ? groupOrders(preparing)[0].summary.items
            : o.items;
        if (members.length > 1)
          return (
            <article
              key={groupKey}
              className={
                "order grouped-order " +
                (userRole === "preparation" ? "plant-order" : "compact-order")
              }
            >
              {members.some((m) => m.demo_batch_id) && (
                <small className="demo-warning">
                  {userRole === "preparation"
                    ? "Incluye demo"
                    : "Incluye pedidos de demostración"}
                </small>
              )}
              <button
                type="button"
                className={
                  userRole === "preparation"
                    ? "plant-card-main"
                    : "compact-order-main"
                }
                onClick={() => onSelectGroup(members)}
                aria-label={`Ver ${members.length} pedidos de ${o.client_name}`}
              >
                <div className="orderhead">
                  <strong>{o.client_name}</strong>
                  <small>{members.length} pedidos</small>
                  <TimingChip order={o} />
                </div>
                {userRole !== "preparation" && (
                  <p className="compact-address">
                    {o.address} · {o.city}
                  </p>
                )}
                <div className="group-statuses">
                  {[...new Set(members.map((m) => m.status))].map((status) => (
                    <span key={status}>
                      <StatusChip status={status} />
                      <small>
                        ×{members.filter((m) => m.status === status).length}
                      </small>
                    </span>
                  ))}
                </div>
                <small className="group-due">
                  Primer vencimiento: {date(o.window_end)}
                </small>
                {userRole === "preparation" && (
                  <small>
                    {preparing.length
                      ? "Productos por preparar"
                      : "Productos de estos pedidos"}
                  </small>
                )}
                <ul className="items plant-items grouped-items">
                  {visibleItems.map((i, n) => (
                    <li key={n}>
                      <strong>{Number(i.quantity)}</strong>
                      <span>{i.name}</span>
                    </li>
                  ))}
                </ul>
                <div className="compact-summary">
                  <span>Ver detalle de los pedidos</span>
                  {userRole !== "preparation" && (
                    <strong>{money(o.total)}</strong>
                  )}
                </div>
              </button>
              {userRole !== "preparation" &&
                members
                  .filter((m) => m.status === "pending")
                  .map((m, n) => {
                    const actions = actionsFor(m);
                    return actions ? (
                      <div className="group-quick-actions" key={m.id}>
                        <small>
                          Pedido {members.indexOf(m) + 1} ·{" "}
                          {date(m.window_start)} · {money(m.total)}
                        </small>
                        {actions}
                      </div>
                    ) : null;
                  })}
            </article>
          );

        const [color, urg] = urgency(o);
        const terminal = ["delivered", "cancelled", "rejected"].includes(
          o.status,
        );
        return (
          <article
            className={
              userRole === "preparation"
                ? "order plant-order"
                : userRole === "courier"
                  ? "order compact-order courier-order " + o.status
                  : "order compact-order"
            }
            key={o.id}
          >
            {o.demo_batch_id && (
              <small className="demo-warning">
                {userRole === "preparation" ? "DEMO" : "DEMO · sin cobro real"}
              </small>
            )}
            {userRole === "preparation" ? (
              <>
                <button
                  type="button"
                  className="plant-card-main"
                  onClick={() => onSelect(o)}
                  aria-label={"Ver detalle del pedido de " + o.client_name}
                >
                  <div className="orderhead">
                    <strong className="plant-order-number">
                      {o.client_name || "Cliente"}
                    </strong>
                    <StatusChip status={o.status} />
                    <TimingChip order={o} />
                  </div>
                  <div className="plant-window">
                    {new Date(o.window_start).toLocaleTimeString("es-CO", {
                      hour: "2-digit",
                      minute: "2-digit",
                      timeZone: "America/Bogota",
                    })}{" "}
                    —{" "}
                    {new Date(o.window_end).toLocaleTimeString("es-CO", {
                      hour: "2-digit",
                      minute: "2-digit",
                      timeZone: "America/Bogota",
                    })}
                  </div>
                  <ul
                    className="items plant-items"
                    aria-label="Productos y cantidades"
                  >
                    {o.items?.map((i, j) => (
                      <li key={j}>
                        <strong>{Number(i.quantity)}</strong>
                        <span>{i.name}</span>
                      </li>
                    ))}
                  </ul>
                </button>
              </>
            ) : userRole === "courier" ? (
              <button
                type="button"
                className="courier-card-main"
                onClick={() => onSelect(o)}
                aria-label={
                  "Ver detalle del pedido " +
                  o.id.slice(0, 6) +
                  " de " +
                  o.client_name
                }
              >
                <div className="courier-card-top">
                  <AssignmentChip order={o} />
                </div>
                <h2>{o.client_name}</h2>
                <div className="courier-city">
                  <PlaceOutlined fontSize="small" />
                  {o.city}
                </div>
                <p className="courier-address">{o.address}</p>
                <div className="courier-time">
                  <span>
                    {new Date(o.window_start).toLocaleTimeString("es-CO", {
                      hour: "2-digit",
                      minute: "2-digit",
                      timeZone: "America/Bogota",
                    })}{" "}
                    —{" "}
                    {new Date(o.window_end).toLocaleTimeString("es-CO", {
                      hour: "2-digit",
                      minute: "2-digit",
                      timeZone: "America/Bogota",
                    })}
                  </span>
                  <StatusChip status={o.status} />
                  <TimingChip order={o} />
                </div>
                <div className="courier-products">
                  {o.items?.slice(0, 2).map((item, i) => (
                    <span key={i}>
                      <b>{Number(item.quantity)}</b> {item.name}
                    </span>
                  ))}
                  {o.items?.length > 2 && (
                    <small>+{o.items.length - 2} productos</small>
                  )}
                </div>
                <div className="courier-card-bottom">
                  <strong>{money(o.total)}</strong>
                  <span>
                    Ver pedido <ArrowForward fontSize="small" />
                  </span>
                </div>
              </button>
            ) : (
              <>
                <button
                  type="button"
                  className="compact-order-main"
                  onClick={() => onSelect(o)}
                  aria-label={
                    "Ver detalle del pedido " +
                    o.id.slice(0, 6) +
                    " de " +
                    o.client_name
                  }
                >
                  <div className="orderhead">
                    <StatusChip status={o.status} />

                    <TimingChip order={o} />
                  </div>
                  <h2>{o.client_name}</h2>
                  <p className="compact-address">
                    {o.address} · {o.city}
                  </p>
                  <div className="compact-window">
                    ◷ {date(o.window_start)} —{" "}
                    {new Date(o.window_end).toLocaleTimeString("es-CO", {
                      hour: "2-digit",
                      minute: "2-digit",
                      timeZone: "America/Bogota",
                    })}
                  </div>
                  <div className="compact-summary">
                    <span>{o.items?.length || 0} productos · Ver detalle</span>
                    <strong>{money(o.total)}</strong>
                  </div>
                  {o.cancel_requested && (
                    <small className="red">Cancelación solicitada</small>
                  )}
                  {o.reason && <small className="red">Requiere revisión</small>}
                </button>
              </>
            )}
            {userRole !== "preparation" &&
              o.status === "pending" &&
              actionsFor(o)}
          </article>
        );
      })}
    </div>
  );
}
export function OrderDetails({
  order: o,
  actions,
  labels,
  money,
  date,
  userRole,
}: any) {
  return (
    <section className="order-details">
      <div className="orderhead">
        <StatusChip status={o.status} />
        <TimingChip order={o} />
        <small>#{o.id.slice(0, 6)}</small>
      </div>
      {userRole === "preparation" && <h3>{o.client_name}</h3>}
      {userRole !== "preparation" && (
        <>
          <h3>{o.client_name}</h3>
          <p>
            {o.address} · {o.city}
          </p>
        </>
      )}
      <div className="window">
        {date(o.window_start)} —{" "}
        {new Date(o.window_end).toLocaleTimeString("es-CO", {
          timeZone: "America/Bogota",
          hour: "2-digit",
          minute: "2-digit",
        })}
      </div>
      {userRole !== "preparation" && o.courier_id && (
        <p>
          <strong>Mensajero asignado:</strong> {o.courier_name || "Asignado"}
        </p>
      )}
      {userRole !== "preparation" &&
        ![
          "bucaramanga",
          "piedecuesta",
          "girón",
          "giron",
          "floridablanca",
        ].includes((o.city || "").toLowerCase()) && (
          <p>Envío por transportadora · sin recorrido local.</p>
        )}
      <h3>Productos y cantidades</h3>
      <ul className="items">
        {o.items?.map((i, j) => (
          <li key={j}>
            <strong>{Number(i.quantity)}</strong>
            <span>{i.name}</span>
            {userRole !== "preparation" && i.price !== undefined && (
              <small>{money(i.price)} por unidad de venta</small>
            )}
          </li>
        ))}
      </ul>
      {o.notes && <p className="notes">{o.notes}</p>}
      {o.reason && <p className="notes">Incidencia: {o.reason}</p>}
      {o.cancel_requested && (
        <p className="alert">Cancelación solicitada; pendiente de decisión</p>
      )}
      {userRole !== "preparation" && (
        <div className="total">
          <span>{o.credit ? "Crédito autorizado" : "Pago contra entrega"}</span>
          <strong>{money(o.total)}</strong>
        </div>
      )}
      {o.delivered_at && <p>Entrega registrada: {date(o.delivered_at)}</p>}
      {actions}
    </section>
  );
}
