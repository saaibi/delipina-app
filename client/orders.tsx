import React from "react";
export function OrderCards({
  orders,
  userRole,
  onSelect,
  actionsFor,
  urgency,
  labels,
  money,
  date,
}: any) {
  return (
    <div
      className={
        userRole === "preparation"
          ? "orders compact"
          : "orders order-grid-compact"
      }
    >
      {orders.map((o) => {
        const [color, urg] = urgency(o);
        const terminal = ["delivered", "cancelled", "rejected"].includes(
          o.status,
        );
        return (
          <article
            className={
              userRole === "preparation" ? "order" : "order compact-order"
            }
            key={o.id}
          >
            {o.demo_batch_id && (
              <small className="demo-warning">DEMO · sin cobro real</small>
            )}
            {userRole === "preparation" ? (
              <>
                <div className="orderhead">
                  <span className={"status " + o.status}>
                    {labels[o.status]}
                  </span>
                  <span className={"urgency " + color}>{!terminal && urg}</span>
                </div>
                <h2>#{o.id.slice(0, 6)}</h2>
                <div className="window">
                  {date(o.window_start)} —{" "}
                  {new Date(o.window_end).toLocaleTimeString("es-CO", {
                    hour: "2-digit",
                    minute: "2-digit",
                    timeZone: "America/Bogota",
                  })}
                </div>
                <ul className="items">
                  {o.items?.map((i, j) => (
                    <li key={j}>
                      <strong>{Number(i.quantity)}</strong>
                      <span>{i.name}</span>
                    </li>
                  ))}
                </ul>
                {o.notes && <p className="notes">{o.notes}</p>}
                {actionsFor(o)}
              </>
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
                    <span className={"status " + o.status}>
                      {labels[o.status]}
                    </span>
                    <small>#{o.id.slice(0, 6)}</small>
                    <span className={"urgency " + color}>
                      {!terminal && urg}
                    </span>
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
        <span className={"status " + o.status}>{labels[o.status]}</span>
        <small>#{o.id.slice(0, 6)}</small>
      </div>
      <h3>{o.client_name}</h3>
      <p>
        {o.address} · {o.city}
      </p>
      <div className="window">
        {date(o.window_start)} —{" "}
        {new Date(o.window_end).toLocaleTimeString("es-CO", {
          timeZone: "America/Bogota",
          hour: "2-digit",
          minute: "2-digit",
        })}
      </div>
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
