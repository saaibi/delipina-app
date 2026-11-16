import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { io } from "socket.io-client";
import {
  api,
  cached,
  submitOrder,
  sync,
  setOfflineUser,
  clearOffline,
  queued,
  saveIdentity,
  savedIdentity,
} from "./offline";
import "./style.css";
import { GPS, Tracking } from "./gps";
const labels = {
    pending: "Pendiente de confirmar",
    confirmed: "Confirmado",
    preparing: "En preparación",
    ready: "Listo para despacho",
    enroute: "En camino",
    delivered: "Entregado",
    rejected: "Rechazado",
    cancelled: "Cancelado",
  },
  roles = {
    admin: "Administración",
    courier: "Mensajero",
    client: "Cliente",
    preparation: "Preparación",
  };
const money = (n) =>
  new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(Number(n) / 100);
const date = (s) =>
  new Date(s).toLocaleString("es-CO", {
    timeZone: "America/Bogota",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
function App() {
  const [user, U] = useState(null),
    [config, C] = useState(null),
    [loading, L] = useState(true),
    [orders, O] = useState([]),
    [products, P] = useState([]),
    [branches, B] = useState([]),
    [users, US] = useState([]),
    [invoices, I] = useState([]),
    [payments, PAY] = useState([]),
    [notifications, N] = useState([]),
    [modal, M] = useState(null),
    [drawer, D] = useState(false),
    [view, V] = useState("orders"),
    [error, E] = useState(""),
    [notice, S] = useState(""),
    [status, ST] = useState(""),
    [search, Q] = useState(""),
    [filterDate, FD] = useState(
      new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" }),
    ),
    [historyEnd, HE] = useState(""),
    [courier, CR] = useState(""),
    [full, F] = useState(false),
    [online, ON] = useState(navigator.onLine),
    [pending, PN] = useState(0),
    [settings, SET] = useState(null),
    [settlements, SS] = useState([]);
  const run = async (fn) => {
    E("");
    try {
      return await fn();
    } catch (e) {
      E(e.message);
    }
  };
  async function refresh(u = user) {
    if (!u) return;
    setOfflineUser(u.id);
    await saveIdentity(u);
    const tasks = [
      cached("/orders").then(O),
      cached("/products").then(P),
      cached("/notifications").then(N),
      cached("/settings").then(SET),
      queued().then((q) => PN(q.length)),
    ];
    if (["admin", "client"].includes(u.role))
      tasks.push(cached("/branches").then(B));
    if (u.role === "admin") tasks.push(cached("/users").then(US));
    if (u.role !== "preparation") tasks.push(cached("/invoices").then(I));
    if (["admin", "courier"].includes(u.role))
      tasks.push(
        cached("/payments").then(PAY),
        cached("/settlements").then(SS),
      );
    await Promise.all(tasks);
  }
  useEffect(() => {
    (async () => {
      try {
        C(await api("/config"));
        const u = await api("/me");
        U(u);
        await refresh(u);
      } catch {
        if (!navigator.onLine) {
          const u = await savedIdentity();
          if (u) {
            U(u);
            await refresh(u);
          }
        }
      } finally {
        L(false);
      }
    })();
    navigator.serviceWorker?.register("/sw.js");
    const online = () => {
      ON(true);
      run(async () => {
        const errors = await sync();
        if (errors.length) E("Cambios pendientes: " + errors.join("; "));
        await refresh();
      });
    };
    const offline = () => ON(false);
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    return () => {
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
    };
  }, [user?.id]);
  useEffect(() => {
    if (!user) return;
    const socket = io();
    socket.on("refresh", () => run(() => refresh()));
    socket.on("connect", () => run(() => refresh()));
    return () => socket.disconnect();
  }, [user?.id]);
  useEffect(() => {
    const handler = (e) => {
      if (e.key === "Escape") {
        M(null);
        F(false);
        D(false);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);
  useEffect(() => {
    if (user || !config?.googleClientId) return;
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.onload = () => {
      google.accounts.id.initialize({
        client_id: config.googleClientId,
        callback: (r) =>
          run(async () => {
            const u = await api("/auth/google", {
              method: "POST",
              body: { credential: r.credential },
            });
            U(u);
          }),
      });
      google.accounts.id.renderButton(document.getElementById("google"), {
        theme: "outline",
        size: "large",
      });
    };
    document.head.append(script);
    return () => script.remove();
  }, [config, user]);
  async function action(o, a, extra = {}) {
    await run(async () => {
      await api(`/orders/${o.id}/action`, {
        method: "POST",
        body: { action: a, ...extra },
      });
      await refresh();
    });
  }
  const admin = user?.role === "admin",
    prep = user?.role === "preparation",
    client = user?.role === "client",
    delivery = user?.role === "courier";
  if (loading)
    return (
      <div className="splash">
        <div className="brand">
          <img src="/logo.png" />
          <svg
            className="brand-effect"
            viewBox="0 0 800 400"
            aria-hidden="true"
          >
            <defs>
              <linearGradient id="sheen">
                <stop stopColor="white" stopOpacity="0" />
                <stop offset=".5" stopColor="white" stopOpacity=".32" />
                <stop offset="1" stopColor="white" stopOpacity="0" />
              </linearGradient>
              <clipPath id="pine-region">
                <path d="M75 0H325V100L270 108V390H75Z" />
              </clipPath>
              <mask id="pine-alpha" style={{ maskType: "alpha" }}>
                <image href="/logo.png" width="800" height="400" />
              </mask>
            </defs>
            <g clipPath="url(#pine-region)" mask="url(#pine-alpha)">
              <rect
                className="brand-sheen"
                x="-95"
                y="0"
                width="75"
                height="400"
                fill="url(#sheen)"
              />
            </g>
          </svg>
        </div>
        <div className="dots">
          {[1, 2, 3, 4].map((i) => (
            <b key={i} />
          ))}
        </div>
      </div>
    );
  if (!user)
    return (
      <main className="login">
        <img src="/logo.png" alt="Delipiña" />
        <h1>Del campo a tu negocio.</h1>
        <p>Pedidos, preparación y entregas en un mismo lugar.</p>
        <div id="google" />
        {!config?.googleClientId && (
          <p>El ingreso con Google requiere configurar el proyecto OAuth.</p>
        )}
        {config?.devAuth && (
          <section>
            <small>ENTORNO LOCAL · DATOS FICTICIOS</small>
            <h2>Explorar la aplicación</h2>
            {Object.entries(roles).map(([r, n]) => (
              <button
                key={r}
                onClick={() =>
                  run(async () =>
                    U(
                      await api("/auth/dev", {
                        method: "POST",
                        body: { email: r + "@demo.test" },
                      }),
                    ),
                  )
                }
              >
                {n} →
              </button>
            ))}
          </section>
        )}
        {error && <p role="alert">{error}</p>}
      </main>
    );
  const selected = orders
    .filter(
      (o) =>
        (!status || o.status === status) &&
        (!search ||
          o.client_name?.toLowerCase().includes(search.toLowerCase())) &&
        (!admin ||
          !filterDate ||
          (view === "history"
            ? new Date(o.window_start).toLocaleDateString("en-CA", {
                timeZone: "America/Bogota",
              }) >= filterDate
            : o.status === "pending" ||
              new Date(o.window_start).toLocaleDateString("en-CA", {
                timeZone: "America/Bogota",
              }) === filterDate)) &&
        (!admin ||
          view !== "history" ||
          !historyEnd ||
          new Date(o.window_start).toLocaleDateString("en-CA", {
            timeZone: "America/Bogota",
          }) <= historyEnd) &&
        (!courier || o.courier_id === courier) &&
        (view !== "available" || !o.courier_id) &&
        (view !== "mine" || o.courier_id === user.id),
    )
    .sort(
      (a, b) =>
        (a.status === "pending" ? -1 : a.status === "ready" && prep ? 1 : 0) -
          (b.status === "pending"
            ? -1
            : b.status === "ready" && prep
              ? 1
              : 0) || new Date(a.window_start) - new Date(b.window_start),
    );
  function urgency(o) {
    const left = new Date(o.window_end) - Date.now();
    return left < 0
      ? ["red", "Rango vencido"]
      : left < 3600000
        ? ["orange", "Margen ajustado"]
        : ["green", "Con tiempo"];
  }

  return (
    <>
      <header className="top">
        <img src="/logo.png" alt="Delipiña" />
        <span className="role">{roles[user.role]}</span>
        <span className="connection">
          {online ? "● En línea" : "○ Sin conexión"}
          {pending > 0 && ` · ${pending} por sincronizar`}
        </span>
        <button
          className="bell neutral"
          aria-label="Notificaciones"
          onClick={() => D(!drawer)}
        >
          ♧
          {notifications.some((n) => !n.read) && (
            <b>{notifications.filter((n) => !n.read).length}</b>
          )}
        </button>
        <details>
          <summary aria-label="Acciones">☰ Acciones</summary>
          <div className="menu">
            {admin && (
              <>
                <button onClick={() => M("user")}>
                  Usuarios · Crear usuario
                </button>
                <button onClick={() => M("catalog")}>Catálogo</button>
                <button onClick={() => M("settings")}>Configuración</button>
                <button onClick={() => M({ kind: "credit" })}>
                  Autorizar cupo
                </button>
                <button onClick={() => M({ kind: "price" })}>
                  Precios por cliente
                </button>
                <button
                  onClick={() => {
                    V("history");
                    ST("");
                  }}
                >
                  Historial de pedidos
                </button>
              </>
            )}
            {(admin || client) && (
              <button onClick={() => M("branch")}>Crear sucursal</button>
            )}
            {user.role !== "preparation" && (
              <button
                onClick={() => {
                  V("payments");
                  ST("");
                }}
              >
                Cartera y cobros
              </button>
            )}
            <button
              onClick={() =>
                run(async () => {
                  if (!config.vapidPublicKey)
                    throw Error("Push pendiente de configurar VAPID");
                  const permission = await Notification.requestPermission();
                  if (permission !== "granted")
                    throw Error("Permiso de notificación no concedido");
                  const reg = await navigator.serviceWorker.ready;
                  const sub = await reg.pushManager.subscribe({
                    userVisibleOnly: true,
                    applicationServerKey: config.vapidPublicKey,
                  });
                  await api("/push", { method: "POST", body: sub.toJSON() });
                  S("Notificaciones activadas");
                })
              }
            >
              Activar notificaciones push
            </button>
            <button
              onClick={() =>
                run(async () => {
                  await api("/logout", { method: "POST" });
                  await clearOffline();
                  U(null);
                })
              }
            >
              Cerrar sesión
            </button>
          </div>
        </details>
      </header>
      <main className={full ? "workspace maximized" : "workspace"}>
        <div className="heading">
          <div>
            <small>DELIPIÑA / OPERACIÓN</small>
            <h1>
              {view === "payments"
                ? "Cartera y cobros"
                : view === "history"
                  ? "Historial de pedidos"
                  : prep
                    ? "Preparación"
                    : client
                      ? "Mis pedidos"
                      : delivery
                        ? "Mis entregas"
                        : "Pedidos del día"}
            </h1>
            <p>
              {prep
                ? "Cantidades claras, entregas a tiempo."
                : client
                  ? "Organiza tu próxima entrega."
                  : "Cada pedido, en su momento."}
            </p>
          </div>
          {(admin || client) && (
            <button onClick={() => M("order")}>＋ Crear pedido</button>
          )}
          {prep && (
            <button className="neutral" onClick={() => F(!full)}>
              {full ? "Minimizar" : "Maximizar"}
            </button>
          )}
        </div>
        {error && (
          <div className="alert" role="alert">
            {error}
            <button onClick={() => E("")}>✕</button>
          </div>
        )}
        {notice && (
          <div className="success" role="status">
            {notice}
            <button onClick={() => S("")}>✕</button>
          </div>
        )}
        {!online && (
          <div className="banner">
            Consulta guardada en este dispositivo. Los pedidos nuevos se envían
            al reconectar y vuelven a validar horario, precios y cupo.
          </div>
        )}
        {view === "payments" ? (
          <>
            <div className="panel">
              <h2>Facturas externas registradas</h2>
              {invoices.length === 0 && <p>No hay facturas registradas.</p>}
              {invoices.map((i) => (
                <article className="invoice" key={i.id}>
                  <div>
                    <strong>{i.client_name}</strong>
                    <p>
                      {i.number || "Número externo por vincular"} · Saldo{" "}
                      {money(i.balance)}
                    </p>
                  </div>
                  {(admin || delivery) && Number(i.balance) > 0 && (
                    <button
                      onClick={() =>
                        M({ kind: "payment", clientId: i.client_id })
                      }
                    >
                      Registrar abono
                    </button>
                  )}
                  {admin && (
                    <button
                      className="neutral"
                      onClick={() => M({ kind: "invoice", invoice: i })}
                    >
                      Vincular factura
                    </button>
                  )}
                </article>
              ))}
            </div>
            {!client && (
              <div className="panel">
                <h2>Movimientos recibidos</h2>
                {admin && (
                  <button onClick={() => M({ kind: "settlement" })}>
                    Confirmar cuadre diario
                  </button>
                )}
                {payments.map((p) => (
                  <article className="invoice" key={p.id}>
                    <div>
                      {money(p.amount)} · {p.method} · {p.receiver}
                      <p>
                        {date(p.created_at)} ·{" "}
                        {p.verified ? "Verificado" : "Pendiente de verificar"}
                      </p>
                    </div>
                    {admin && !p.verified && (
                      <button
                        onClick={() =>
                          run(async () => {
                            await api(`/payments/${p.id}/verify`, {
                              method: "POST",
                            });
                            await refresh();
                          })
                        }
                      >
                        Verificar transferencia
                      </button>
                    )}
                  </article>
                ))}
                <h3>Cuadres confirmados</h3>
                {settlements.map((s) => (
                  <p key={s.id}>
                    {s.day.slice(0, 10)} · {s.courier_name} · efectivo recibido{" "}
                    {money(s.received_cash)} · esperado {money(s.expected_cash)}{" "}
                    · transferencias verificadas {money(s.verified_transfers)}
                  </p>
                ))}
              </div>
            )}
          </>
        ) : (
          <>
            {!client && !prep && (
              <div className="stats">
                {[
                  ["", "Todos"],
                  ["pending", "Por confirmar"],
                  ["preparing", "En preparación"],
                  ["ready", "Listos"],
                  ["enroute", "En camino"],
                  ["delivered", "Entregados"],
                ].map(([s, l]) => (
                  <button
                    className={status === s ? "active" : ""}
                    key={s}
                    onClick={() => ST(s)}
                  >
                    <span>{l}</span>
                    <strong>
                      {orders.filter((o) => !s || o.status === s).length}
                    </strong>
                  </button>
                ))}
              </div>
            )}
            <div className="toolbar">
              {delivery && (
                <GPS
                  active={orders.some(
                    (o) => o.courier_id === user.id && o.status === "enroute",
                  )}
                  onError={E}
                />
              )}
              {delivery && (
                <>
                  <button
                    className={view === "mine" ? "" : "neutral"}
                    onClick={() => V("mine")}
                  >
                    Mis entregas
                  </button>
                  <button
                    className={view === "available" ? "" : "neutral"}
                    onClick={() => V("available")}
                  >
                    Disponibles
                  </button>
                </>
              )}
              {admin && (
                <>
                  <input
                    placeholder="Buscar cliente"
                    aria-label="Buscar cliente"
                    value={search}
                    onChange={(e) => Q(e.target.value)}
                  />
                  <input
                    type="date"
                    aria-label="Fecha de entrega"
                    value={filterDate}
                    onChange={(e) => FD(e.target.value)}
                  />
                  {view === "history" && (
                    <input
                      type="date"
                      aria-label="Hasta fecha"
                      value={historyEnd}
                      onChange={(e) => HE(e.target.value)}
                    />
                  )}
                  <select
                    aria-label="Mensajero"
                    value={courier}
                    onChange={(e) => CR(e.target.value)}
                  >
                    <option value="">Todos los mensajeros</option>
                    {users
                      .filter((u) => u.role === "courier")
                      .map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name}
                        </option>
                      ))}
                  </select>
                </>
              )}
              <select
                aria-label="Estado"
                value={status}
                onChange={(e) => ST(e.target.value)}
              >
                <option value="">Todos los estados</option>
                {Object.entries(labels).map(([s, l]) => (
                  <option value={s} key={s}>
                    {l}
                  </option>
                ))}
              </select>
              <span>{selected.length} pedidos</span>
            </div>
            <div className={prep ? "orders compact" : "orders"}>
              {selected.map((o) => {
                const [color, urg] = urgency(o);
                return (
                  <article className="order" key={o.id}>
                    <div className="orderhead">
                      <span className={"status " + o.status}>
                        {labels[o.status]}
                      </span>
                      <small>#{o.id.slice(0, 6)}</small>
                      <span className={"urgency " + color}>
                        {!["delivered", "cancelled", "rejected"].includes(
                          o.status,
                        ) && urg}
                      </span>
                    </div>
                    <h2>
                      {prep ? "Pedido #" + o.id.slice(0, 6) : o.client_name}
                    </h2>
                    {!prep && (
                      <p className="address">
                        {o.address} · {o.city}
                      </p>
                    )}
                    <div className="window">
                      ◷ {date(o.window_start)} —{" "}
                      {new Date(o.window_end).toLocaleTimeString("es-CO", {
                        hour: "2-digit",
                        minute: "2-digit",
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
                    {!prep && (
                      <div className="total">
                        <span>
                          {o.credit ? "A crédito" : "Pago contra entrega"}
                        </span>
                        <strong>{money(o.total)}</strong>
                      </div>
                    )}
                    {o.cancel_requested && (
                      <p className="alert">
                        Cancelación solicitada · pendiente de decisión
                      </p>
                    )}
                    {o.reason && (
                      <p className="notes">Observación: {o.reason}</p>
                    )}
                    <div className="actions">
                      {admin && o.status === "pending" && (
                        <>
                          <button
                            aria-label="Aceptar pedido"
                            onClick={() => action(o, "confirm")}
                          >
                            ✓ Aceptar
                          </button>
                          <button
                            className="danger"
                            onClick={() => M({ kind: "reject", order: o })}
                          >
                            ✕ Rechazar
                          </button>
                        </>
                      )}
                      {(admin || prep) && o.status === "confirmed" && (
                        <button onClick={() => action(o, "prepare")}>
                          Iniciar preparación
                        </button>
                      )}
                      {(admin || prep) && o.status === "preparing" && (
                        <button onClick={() => action(o, "ready")}>
                          Marcar listo
                        </button>
                      )}
                      {delivery &&
                        !o.courier_id &&
                        ["confirmed", "preparing", "ready"].includes(
                          o.status,
                        ) && (
                          <button onClick={() => action(o, "take")}>
                            Tomar pedido
                          </button>
                        )}
                      {(admin || (delivery && o.courier_id === user.id)) &&
                        o.status === "ready" && (
                          <button onClick={() => action(o, "depart")}>
                            Iniciar recorrido
                          </button>
                        )}
                      {(admin || (delivery && o.courier_id === user.id)) &&
                        o.status === "enroute" && (
                          <>
                            <button onClick={() => action(o, "deliver")}>
                              Confirmar entrega
                            </button>
                            <button
                              className="neutral"
                              onClick={() => M({ kind: "failed", order: o })}
                            >
                              Entrega fallida
                            </button>
                          </>
                        )}
                      {admin &&
                        ["confirmed", "preparing", "ready", "enroute"].includes(
                          o.status,
                        ) && (
                          <button
                            className="neutral"
                            onClick={() => M({ kind: "assign", order: o })}
                          >
                            Asignar mensajero
                          </button>
                        )}
                      {(admin || delivery) &&
                        ![
                          "pending",
                          "rejected",
                          "cancelled",
                          "delivered",
                        ].includes(o.status) && (
                          <button
                            className="neutral"
                            onClick={() => M({ kind: "map", order: o })}
                          >
                            Ver recorrido en mapa
                          </button>
                        )}
                      {client && o.status === "enroute" && (
                        <button
                          className="neutral"
                          onClick={() => M({ kind: "tracking", order: o })}
                        >
                          Seguir entrega
                        </button>
                      )}
                      {client &&
                        !o.cancel_requested &&
                        !["delivered", "rejected", "cancelled"].includes(
                          o.status,
                        ) && (
                          <button
                            className="neutral"
                            onClick={() => action(o, "request_cancel")}
                          >
                            Solicitar cancelación
                          </button>
                        )}
                      {admin &&
                        o.cancel_requested &&
                        !["delivered", "rejected", "cancelled"].includes(
                          o.status,
                        ) && (
                          <>
                            <button
                              className="danger"
                              onClick={() => action(o, "cancel")}
                            >
                              Aprobar cancelación
                            </button>
                            <button
                              className="neutral"
                              onClick={() => action(o, "deny_cancel")}
                            >
                              Rechazar cancelación
                            </button>
                          </>
                        )}
                    </div>
                    {o.delivered_at && (
                      <small>Entrega registrada: {date(o.delivered_at)}</small>
                    )}
                  </article>
                );
              })}
            </div>
            {!selected.length && (
              <div className="empty">
                <span>✧</span>
                <h2>Todo despejado por aquí</h2>
                <p>Los pedidos aparecerán cuando se registren.</p>
              </div>
            )}
          </>
        )}
        <footer>
          Plaza San Francisco · Bucaramanga{" "}
          <span>Datos de demostración solo en el entorno local</span>
        </footer>
      </main>
      {admin && (
        <nav className="bottom">
          {[
            ["orders", "▦", "Pedidos"],
            ["history", "◷", "Historial"],
            ["payments", "$", "Cobros"],
            ["menu", "☰", "Acciones"],
          ].map(([v, icon, l]) => (
            <button
              className="neutral"
              key={v}
              onClick={() => (v === "menu" ? M("adminActions") : V(v))}
            >
              {icon}
              <small>{l}</small>
            </button>
          ))}
        </nav>
      )}
      {drawer && (
        <>
          <div className="shade" onClick={() => D(false)} />
          <aside className="drawer">
            <header>
              <h2>Notificaciones</h2>
              <button
                className="neutral"
                aria-label="Cerrar notificaciones"
                onClick={() => D(false)}
              >
                ✕
              </button>
            </header>
            <button
              className="neutral"
              onClick={() =>
                run(async () => {
                  await api("/notifications/read", { method: "POST" });
                  await refresh();
                })
              }
            >
              Marcar leídas
            </button>
            {notifications.map((n) => (
              <article className={n.read ? "" : "unread"} key={n.id}>
                <strong>{n.title}</strong>
                <p>{date(n.created_at)}</p>
              </article>
            ))}
          </aside>
        </>
      )}
      {modal && (
        <Modal
          onClose={() => M(null)}
          title={
            typeof modal === "string"
              ? {
                  order: "Crear pedido",
                  user: "Crear usuario",
                  branch: "Crear sucursal",
                  catalog: "Catálogo",
                  settings: "Configuración",
                  adminActions: "Acciones",
                }[modal]
              : {
                  reject: "Revisar rechazo",
                  failed: "Entrega fallida",
                  assign: "Asignar mensajero",
                  map: "Recorrido",
                  payment: "Registrar abono",
                  invoice: "Vincular factura externa",
                  tracking: "Seguimiento",
                  settlement: "Confirmar cuadre diario",
                  credit: "Autorizar cupo",
                  price: "Precio especial por cliente",
                }[modal.kind]
          }
        >
          {modal === "order" && (
            <OrderForm
              {...{ admin, users, branches, products, settings, user }}
              onSubmit={(b) =>
                run(async () => {
                  const r = await submitOrder(b);
                  M(null);
                  S(
                    r.queued
                      ? "Pedido guardado para sincronizar. Aún no está confirmado."
                      : "Pedido registrado",
                  );
                  await refresh();
                })
              }
            />
          )}
          {modal === "user" && (
            <Form
              onSubmit={(b) =>
                run(async () => {
                  await api("/users", {
                    method: "POST",
                    body: {
                      ...b,
                      creditLimit: Math.round(Number(b.creditLimit) * 100),
                    },
                  });
                  M(null);
                  await refresh();
                })
              }
            >
              <Field label="Nombre" name="name" />
              <Field label="Correo Google" name="email" type="email" />
              <label>
                Rol
                <select name="role">
                  {Object.entries(roles).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>
              <Field
                label="Cupo autorizado COP (0 sin crédito)"
                name="creditLimit"
                type="number"
                defaultValue="0"
                min="0"
              />
              <button>Crear usuario</button>
            </Form>
          )}
          {modal === "branch" && (
            <Form
              onSubmit={(b) =>
                run(async () => {
                  await api("/branches", { method: "POST", body: b });
                  M(null);
                  await refresh();
                })
              }
            >
              {admin && (
                <label>
                  Cliente
                  <select name="clientId">
                    {users
                      .filter((u) => u.role === "client")
                      .map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name}
                        </option>
                      ))}
                  </select>
                </label>
              )}
              <Field name="address" label="Dirección" />
              <label>
                Municipio
                <select name="city">
                  {["Bucaramanga", "Girón", "Floridablanca", "Piedecuesta"].map(
                    (c) => (
                      <option key={c}>{c}</option>
                    ),
                  )}
                </select>
              </label>
              <button>Guardar sucursal</button>
            </Form>
          )}
          {modal === "catalog" && (
            <>
              <p>
                Precios locales ficticios. Configura los valores comerciales
                antes de operar.
              </p>
              {products.map((p) => (
                <p key={p.id}>
                  {p.name} · {p.presentation} · {money(p.price)}{" "}
                  <button
                    className="danger"
                    onClick={() =>
                      run(async () => {
                        await api("/products/" + p.id, {
                          method: "PATCH",
                          body: {
                            ...p,
                            price: Number(p.price),
                            active: !p.active,
                          },
                        });
                        await refresh();
                      })
                    }
                  >
                    {p.active ? "Deshabilitar" : "Habilitar"}
                  </button>
                </p>
              ))}
              <Form
                onSubmit={(b) =>
                  run(async () => {
                    await api("/products", {
                      method: "POST",
                      body: { ...b, price: Math.round(Number(b.price) * 100) },
                    });
                    await refresh();
                  })
                }
              >
                <Field name="name" label="Producto / corte" />
                <Field name="presentation" label="Presentación" />
                <label>
                  Unidad
                  <select name="unit">
                    <option value="kg">Kilogramos (decimales)</option>
                    <option value="pack">Empaque de peso fijo (entero)</option>
                  </select>
                </label>
                <Field name="price" label="Precio COP" type="number" min="0" />
                <button>Agregar producto</button>
              </Form>
            </>
          )}
          {modal === "settings" && settings && (
            <Form
              onSubmit={(b) =>
                run(async () => {
                  await api("/settings", {
                    method: "PUT",
                    body: {
                      ...b,
                      open: Number(b.open),
                      close: Number(b.close),
                      leadHours: Number(b.leadHours),
                    },
                  });
                  M(null);
                  await refresh();
                })
              }
            >
              <Field
                name="origin"
                label="Origen"
                defaultValue={settings.origin}
              />
              <Field
                name="open"
                label="Hora apertura"
                type="number"
                defaultValue={settings.open}
              />
              <Field
                name="close"
                label="Hora cierre"
                type="number"
                defaultValue={settings.close}
              />
              <Field
                name="leadHours"
                label="Anticipación (horas)"
                type="number"
                defaultValue={settings.leadHours}
              />
              <button>Guardar configuración</button>
            </Form>
          )}
          {modal === "adminActions" && (
            <div className="stack">
              <button onClick={() => M("user")}>Crear usuario</button>
              <button onClick={() => M("catalog")}>Catálogo</button>
              <button onClick={() => M("settings")}>Configuración</button>
              <button onClick={() => M({ kind: "credit" })}>
                Autorizar cupo
              </button>
              <button onClick={() => M({ kind: "price" })}>
                Precios por cliente
              </button>
              <button onClick={() => M("branch")}>Crear sucursal</button>
            </div>
          )}
          {["reject", "failed"].includes(modal.kind) && (
            <Form
              onSubmit={(b) =>
                run(async () => {
                  await api("/orders/" + modal.order.id + "/action", {
                    method: "POST",
                    body: { action: modal.kind, reason: b.reason },
                  });
                  M(null);
                  await refresh();
                })
              }
            >
              <Field
                name="reason"
                label={
                  modal.kind === "reject"
                    ? "Motivo (opcional)"
                    : "Motivo de entrega fallida"
                }
                required={modal.kind === "failed"}
              />
              <button className={modal.kind === "reject" ? "danger" : ""}>
                Confirmar {modal.kind === "reject" ? "rechazo" : "incidencia"}
              </button>
            </Form>
          )}
          {modal.kind === "tracking" && <Tracking orderId={modal.order.id} />}
          {modal.kind === "credit" && (
            <Form
              onSubmit={(b) =>
                run(async () => {
                  await api("/users/" + b.clientId, {
                    method: "PATCH",
                    body: {
                      creditLimit: Math.round(Number(b.creditLimit) * 100),
                      active: true,
                    },
                  });
                  M(null);
                  await refresh();
                })
              }
            >
              <label>
                Cliente
                <select name="clientId">
                  {users
                    .filter((u) => u.role === "client")
                    .map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name} · cupo {money(u.credit_limit)} · reservado{" "}
                        {money(u.credit_used)}
                      </option>
                    ))}
                </select>
              </label>
              <Field
                name="creditLimit"
                label="Cupo total COP"
                type="number"
                min="0"
              />
              <button>Guardar cupo</button>
            </Form>
          )}
          {modal.kind === "price" && (
            <Form
              onSubmit={(b) =>
                run(async () => {
                  await api("/prices", {
                    method: "PUT",
                    body: { ...b, price: Math.round(Number(b.price) * 100) },
                  });
                  M(null);
                  await refresh();
                })
              }
            >
              <label>
                Cliente
                <select name="clientId">
                  {users
                    .filter((u) => u.role === "client")
                    .map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                Producto
                <select name="productId">
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} · {p.presentation}
                    </option>
                  ))}
                </select>
              </label>
              <Field
                name="price"
                label="Precio especial COP · todas las sucursales"
                type="number"
                min="0"
              />
              <button>Guardar precio</button>
            </Form>
          )}
          {modal.kind === "settlement" && (
            <Form
              onSubmit={(b) =>
                run(async () => {
                  await api("/settlements", {
                    method: "POST",
                    body: {
                      ...b,
                      receivedCash: Math.round(Number(b.receivedCash) * 100),
                    },
                  });
                  M(null);
                  await refresh();
                })
              }
            >
              <label>
                Mensajero
                <select name="courierId">
                  {users
                    .filter((u) => u.role === "courier")
                    .map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                </select>
              </label>
              <Field name="day" label="Fecha del cuadre" type="date" />
              <Field
                name="receivedCash"
                label="Efectivo recibido en local COP"
                type="number"
                min="0"
              />
              <p>
                Confirma el efectivo recibido y registra las transferencias
                verificadas del día.
              </p>
              <button>Confirmar cuadre</button>
            </Form>
          )}
          {modal.kind === "assign" && (
            <Form
              onSubmit={(b) =>
                run(async () => {
                  await api("/orders/" + modal.order.id + "/action", {
                    method: "POST",
                    body: { action: "assign", courierId: b.courierId },
                  });
                  M(null);
                  await refresh();
                })
              }
            >
              <label>
                Mensajero
                <select name="courierId">
                  {users
                    .filter((u) => u.role === "courier")
                    .map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                </select>
              </label>
              <button>Guardar asignación</button>
            </Form>
          )}
          {modal.kind === "map" && (
            <>
              <p>
                {settings?.origin} → {modal.order.address}, {modal.order.city}
              </p>
              <p>
                Ruta y tiempos se consultan en Google Maps. Aún no hay ubicación
                en vivo ni ETA calculada en la aplicación.
              </p>
              <a
                className="button"
                href={
                  "https://www.google.com/maps/dir/?api=1&origin=" +
                  encodeURIComponent(settings?.origin || "Bucaramanga") +
                  "&destination=" +
                  encodeURIComponent(
                    modal.order.address + ", " + modal.order.city,
                  ) +
                  "&travelmode=driving"
                }
                target="_blank"
                rel="noreferrer"
              >
                Abrir recorrido en Google Maps ↗
              </a>
            </>
          )}
          {modal.kind === "payment" && (
            <PaymentForm
              invoices={invoices.filter(
                (i) => i.client_id === modal.clientId && Number(i.balance) > 0,
              )}
              onSubmit={(b) =>
                run(async () => {
                  await api("/payments", {
                    method: "POST",
                    headers: { "Idempotency-Key": crypto.randomUUID() },
                    body: { ...b, clientId: modal.clientId },
                  });
                  M(null);
                  await refresh();
                })
              }
            />
          )}
          {modal.kind === "invoice" && (
            <Form
              onSubmit={(b) =>
                run(async () => {
                  await api("/invoices/" + modal.invoice.id, {
                    method: "PATCH",
                    body: b,
                  });
                  M(null);
                  await refresh();
                })
              }
            >
              <Field name="number" label="Número de factura externa" />
              <label>
                Foto opcional (PNG/JPG hasta 1,5 MB)
                <input
                  type="file"
                  accept="image/png,image/jpeg"
                  onChange={(e) => {
                    const file = e.target.files[0];
                    if (!file) return;
                    run(async () => {
                      if (file.size > 1500000)
                        throw Error("La imagen supera 1,5 MB");
                      const data = await new Promise((resolve, reject) => {
                        const r = new FileReader();
                        r.onload = () => resolve(r.result.split(",")[1]);
                        r.onerror = reject;
                        r.readAsDataURL(file);
                      });
                      await api("/invoices/" + modal.invoice.id + "/photo", {
                        method: "POST",
                        body: { data },
                      });
                      S("Fotografía guardada");
                    });
                  }}
                />
              </label>
              <p>La factura se emite externamente.</p>
              <button>Guardar número</button>
            </Form>
          )}
        </Modal>
      )}
    </>
  );
}
function Modal({ title, children, onClose }) {
  return (
    <div className="overlay" onClick={() => onClose()}>
      <section
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <header>
          <h2>{title}</h2>
          <button
            className="neutral"
            aria-label="Cerrar"
            onClick={() => onClose()}
          >
            ✕
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}
function Form({ onSubmit, children }) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(Object.fromEntries(new FormData(e.currentTarget)));
      }}
    >
      {children}
    </form>
  );
}
function Field({ label, required = true, ...props }) {
  return (
    <label>
      {label}
      <input required={required} {...props} />
    </label>
  );
}
function OrderForm({ admin, users, branches, products, onSubmit, user }) {
  const [c, C] = useState(
      admin ? users.find((u) => u.role === "client")?.id : user.id,
    ),
    [quant, Q] = useState({});
  return (
    <Form
      onSubmit={(b) =>
        onSubmit({
          clientId: c,
          branchId: b.branchId,
          start: new Date(b.start).toISOString(),
          end: new Date(b.end).toISOString(),
          credit: b.credit === "on",
          notes: b.notes,
          items: Object.entries(quant)
            .filter(([, q]) => Number(q) > 0)
            .map(([productId, quantity]) => ({
              productId,
              quantity: Number(quantity),
            })),
        })
      }
    >
      {admin && (
        <label>
          Cliente
          <select value={c} onChange={(e) => C(e.target.value)}>
            {users
              .filter((u) => u.role === "client")
              .map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
          </select>
        </label>
      )}
      <label>
        Sucursal
        <select name="branchId" required>
          {branches
            .filter((b) => b.client_id === c)
            .map((b) => (
              <option key={b.id} value={b.id}>
                {b.address} · {b.city}
              </option>
            ))}
        </select>
      </label>
      <div className="row">
        <Field name="start" label="Entrega desde" type="datetime-local" />
        <Field name="end" label="Hasta" type="datetime-local" />
      </div>
      <p>
        Hora de Colombia · mínimo 2 horas de anticipación según configuración.
      </p>
      {products
        .filter((p) => p.active)
        .map((p) => (
          <label className="product" key={p.id}>
            <span>
              {p.name}
              <small>
                {p.presentation} · {money(p.price)} / {p.unit}
              </small>
            </span>
            <input
              aria-label={"Cantidad " + p.name}
              type="number"
              min="0"
              step={p.unit === "kg" ? ".001" : "1"}
              value={quant[p.id] || ""}
              onChange={(e) => Q({ ...quant, [p.id]: e.target.value })}
            />
          </label>
        ))}
      <label className="check">
        <input name="credit" type="checkbox" /> Solicitar crédito autorizado
      </label>
      <label>
        Observaciones
        <textarea name="notes" maxLength="1000" />
      </label>
      <button>Confirmar pedido{admin ? "" : " para revisión"}</button>
    </Form>
  );
}
function PaymentForm({ invoices, onSubmit }) {
  return (
    <Form
      onSubmit={(b) =>
        onSubmit({
          method: b.method,
          amount: Math.round(Number(b.amount) * 100),
          allocations: invoices
            .filter((i) => Number(b[i.id]) > 0)
            .map((i) => ({
              invoiceId: i.id,
              amount: Math.round(Number(b[i.id]) * 100),
            })),
        })
      }
    >
      <Field label="Total recibido COP" name="amount" type="number" min="1" />
      <label>
        Medio
        <select name="method">
          <option value="cash">Efectivo</option>
          <option value="nequi">Nequi · pendiente de verificación</option>
          <option value="bancolombia">
            Transferencia Bancolombia · pendiente de verificación
          </option>
        </select>
      </label>
      <h3>Distribución por factura</h3>
      {invoices.map((i) => (
        <Field
          key={i.id}
          name={i.id}
          label={
            (i.number || i.id.slice(0, 6)) + " · saldo " + money(i.balance)
          }
          type="number"
          min="0"
          defaultValue="0"
        />
      ))}
      <button>Registrar abono</button>
    </Form>
  );
}
createRoot(document.getElementById("root")).render(<App />);
