import LocalShippingOutlined from "@mui/icons-material/LocalShippingOutlined";
import PlaceOutlined from "@mui/icons-material/PlaceOutlined";
import ArrowForward from "@mui/icons-material/ArrowForward";
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
          ? "orders plant-order-grid"
          : userRole === "courier"
            ? "orders courier-order-grid"
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
                    <span className={"status " + o.status}>
                      {labels[o.status]}
                    </span>
                    <span className={"urgency " + color}>
                      {!terminal && urg}
                    </span>
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
                  <span
                    className={
                      "courier-assignment " +
                      (!o.courier_id ? "available" : "assigned")
                    }
                  >
                    <LocalShippingOutlined fontSize="small" />
                    {!o.courier_id
                      ? "Disponible"
                      : o.status === "enroute"
                        ? "En reparto"
                        : "Asignado a ti"}
                  </span>
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
                  <span className={"status " + o.status}>
                    {labels[o.status]}
                  </span>
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
                    <span className={"status " + o.status}>
                      {labels[o.status]}
                    </span>

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
        <span className={"status " + o.status}>{labels[o.status]}</span>
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
