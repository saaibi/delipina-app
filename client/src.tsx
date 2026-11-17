import { ProductChoices, productImages } from "./products";
import { DayClosings } from "./business";
import { suggestedDelivery } from "./ui";
import Alert from "@mui/material/Alert";
import { ManagementTable } from "./management";
import {
  usePushPreferences,
  PushPermissionPrompt,
  NotificationSettings,
} from "./push";
import React, { useEffect, useState, useRef } from "react";
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
import {
  Providers,
  Navigation,
  SecondaryActions,
  Button,
  Field,
  Select,
  Modal,
  DateInput,
  NoticeDrawer,
} from "./ui";
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
    [modal, setModal] = useState(null),
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
    [business, BD] = useState(null),
    [closings, CL] = useState([]),
    [settlements, SS] = useState([]);
  const authEpoch = useRef(0),
    subject = useRef<string | null>(null);
  function clearData() {
    authEpoch.current++;
    subject.current = null;
    O([]);
    P([]);
    B([]);
    US([]);
    I([]);
    PAY([]);
    N([]);
    SS([]);
    CL([]);
    BD(null);
    PN(0);
  }
  async function enter(u: any) {
    clearData();
    subject.current = u.id;
    L(true);
    try {
      await refresh(u);
      U(u);
    } finally {
      L(false);
    }
  }
  const M = (value: any) => {
    E("");
    setModal(value);
  };
  const push = usePushPreferences(user?.id, config);
  useEffect(() => {
    if (!user) return;
    const timer = setInterval(() => {
      if (!document.hidden)
        cached("/business-day")
          .then(BD)
          .catch(() => {});
    }, 60000);
    return () => clearInterval(timer);
  }, [user?.id]);
  useEffect(() => {
    if (user) V(user.role === "courier" ? "mine" : "orders");
  }, [user?.id]);
  useEffect(() => {
    if (business?.day && view === "orders") FD(business.day);
  }, [business?.day]);
  const run = async (fn) => {
    E("");
    try {
      return await fn();
    } catch (e) {
      if (e.status === 401) {
        clearData();
        U(null);
        await clearOffline();
      }
      E(e.message);
    }
  };
  async function refresh(u = user) {
    if (!u || subject.current !== u.id) return;
    const epoch = authEpoch.current;
    const guard = (setter: any) => (value: any) => {
      if (epoch === authEpoch.current && subject.current === u.id)
        setter(value);
    };
    setOfflineUser(u.id);
    await saveIdentity(u);
    const tasks = [
      cached("/orders").then(guard(O)),
      cached("/products").then(guard(P)),
      cached("/notifications").then(guard(N)),
      cached("/settings").then(guard(SET)),
      cached("/business-day").then(guard(BD)),
      queued().then((q) => guard(PN)(q.length)),
    ];
    if (["admin", "client"].includes(u.role))
      tasks.push(cached("/branches").then(guard(B)));
    if (u.role === "admin")
      tasks.push(
        cached("/users").then(guard(US)),
        cached("/business-days").then(guard(CL)),
      );
    if (u.role !== "preparation")
      tasks.push(cached("/invoices").then(guard(I)));
    if (["admin", "courier"].includes(u.role))
      tasks.push(
        cached("/payments").then(guard(PAY)),
        cached("/settlements").then(guard(SS)),
      );
    await Promise.all(tasks);
  }
  useEffect(() => {
    (async () => {
      try {
        C(await api("/config"));
        const u = await api("/me");
        subject.current = u.id;
        U(u);
        await refresh(u);
      } catch {
        if (!navigator.onLine) {
          const u = await savedIdentity();
          if (u) {
            subject.current = u.id;
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
    return () => {
      socket.disconnect();
    };
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
            await enter(u);
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
  const editUser = (u) => M({ kind: "editUser", user: u });
  const deleteUser = (u) => M({ kind: "deleteUser", user: u });
  const restoreUser = (u) =>
    run(async () => {
      await api("/users/" + u.id, {
        method: "PATCH",
        body: { active: true, restore: true },
      });
      await refresh();
    });
  const editProduct = (p) => M({ kind: "editProduct", product: p });
  const toggleProduct = (p) =>
    run(async () => {
      await api("/products/" + p.id, {
        method: "PATCH",
        body: { ...p, price: Number(p.price), active: !p.active },
      });
      await refresh();
    });
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
              <Button
                key={r}
                onClick={() =>
                  run(async () =>
                    enter(
                      await api("/auth/dev", {
                        method: "POST",
                        body: { email: r + "@demo.test" },
                      }),
                    ),
                  )
                }
              >
                {n} →
              </Button>
            ))}
          </section>
        )}
        {error && <p role="alert">{error}</p>}
      </main>
    );
  const scoped = orders.filter(
    (o) =>
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
  );
  const selected = scoped
    .filter((o) => !status || o.status === status)
    .sort(
      (a, b) =>
        (a.status === "pending" ? -1 : a.status === "ready" && prep ? 1 : 0) -
          (b.status === "pending"
            ? -1
            : b.status === "ready" && prep
              ? 1
              : 0) || +new Date(a.window_start) - +new Date(b.window_start),
    );
  function urgency(o) {
    const left = +new Date(o.window_end) - Date.now();
    return left < 0
      ? ["red", "Rango vencido"]
      : left < 3600000
        ? ["orange", "Margen ajustado"]
        : ["green", "Con tiempo"];
  }

  return (
    <>
      <PushPermissionPrompt controller={push} />
      <Navigation
        user={user}
        view={view}
        online={online}
        pending={pending}
        business={business}
        unread={notifications.filter((n) => !n.read).length}
        onNotice={() => D(!drawer)}
        onNavigate={(v) => {
          V(v);
          ST("");
        }}
        onLogout={() =>
          run(async () => {
            await api("/logout", { method: "POST" });
            clearData();
            await clearOffline();
            U(null);
          })
        }
      />
      <SecondaryActions role={user.role} onAction={M} />
      <main className={full ? "workspace maximized" : "workspace"}>
        <div className="heading">
          <div>
            <small>DELIPIÑA / OPERACIÓN</small>
            <h1>
              {view === "payments"
                ? "Cartera y cobros"
                : view === "history"
                  ? "Ventas"
                  : view === "users"
                    ? "Usuarios"
                    : view === "catalog"
                      ? "Catálogo"
                      : view === "settings"
                        ? "Ajustes"
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
          {(admin || client) && view === "orders" && (
            <Button onClick={() => M("order")}>＋ Crear pedido</Button>
          )}
          {admin && view === "history" && (
            <Button onClick={() => M("closeDay")}>Cerrar jornada</Button>
          )}
          {prep && (
            <Button className="neutral" onClick={() => F(!full)}>
              {full ? "Minimizar" : "Maximizar"}
            </Button>
          )}
        </div>
        {error && (
          <div className="alert" role="alert">
            {error}
            <Button onClick={() => E("")}>✕</Button>
          </div>
        )}
        {notice && (
          <div className="success" role="status">
            {notice}
            <Button onClick={() => S("")}>✕</Button>
          </div>
        )}
        {!online && (
          <div className="banner">
            Consulta guardada en este dispositivo. Los pedidos nuevos se envían
            al reconectar y vuelven a validar horario, precios y cupo.
          </div>
        )}
        {view === "settings" ||
        (["users", "catalog"].includes(view) && admin) ? (
          <div className="panel">
            <h2>
              {view === "users"
                ? "Usuarios y acceso"
                : view === "catalog"
                  ? "Productos y precios"
                  : "Ajustes"}
            </h2>
            {view === "users" ? (
              <>
                <Button onClick={() => M("user")}>Crear usuario</Button>
                {users.map((u) => (
                  <p key={u.id}>
                    {u.name} · {u.email} · {roles[u.role]} ·{" "}
                    {u.active ? "Activo" : "Deshabilitado"}
                  </p>
                ))}
              </>
            ) : view === "catalog" ? (
              <>
                <Button onClick={() => M("catalog")}>
                  Administrar catálogo
                </Button>
                <ManagementTable
                  kind="catalog"
                  rows={products}
                  onEdit={editProduct}
                  onRemove={toggleProduct}
                  onRestore={toggleProduct}
                />
              </>
            ) : (
              <>
                <NotificationSettings controller={push} />
                {admin && (
                  <>
                    <h2>Administración</h2>
                    <Button
                      className="neutral"
                      onClick={() => M("catalogList")}
                    >
                      Catálogo de productos
                    </Button>
                    <Button onClick={() => M("users")}>
                      Usuarios y acceso
                    </Button>
                    <p>{settings?.origin}</p>
                    <p>
                      Entregas {settings?.open}:00–{settings?.close}:00 ·
                      Anticipación {settings?.leadHours} h
                    </p>
                    <Button onClick={() => M("settings")}>
                      Configuración operativa
                    </Button>
                  </>
                )}
              </>
            )}
          </div>
        ) : view === "payments" ? (
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
                    <Button
                      onClick={() =>
                        M({ kind: "payment", clientId: i.client_id })
                      }
                    >
                      Registrar abono
                    </Button>
                  )}
                  {admin && (
                    <Button
                      className="neutral"
                      onClick={() => M({ kind: "invoice", invoice: i })}
                    >
                      Vincular factura
                    </Button>
                  )}
                </article>
              ))}
            </div>
            {!client && (
              <div className="panel">
                <h2>Movimientos recibidos</h2>
                {admin && (
                  <Button onClick={() => M({ kind: "settlement" })}>
                    Confirmar cuadre diario
                  </Button>
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
                      <Button
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
                      </Button>
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
                  <Button
                    className={status === s ? "active" : ""}
                    key={s}
                    onClick={() => ST(s)}
                  >
                    <span>{l}</span>
                    <strong>
                      {scoped.filter((o) => !s || o.status === s).length}
                    </strong>
                  </Button>
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
                  <Button
                    className={view === "mine" ? "" : "neutral"}
                    onClick={() => V("mine")}
                  >
                    Mis entregas
                  </Button>
                  <Button
                    className={view === "available" ? "" : "neutral"}
                    onClick={() => V("available")}
                  >
                    Disponibles
                  </Button>
                </>
              )}
              {admin && (
                <>
                  <Field
                    required={false}
                    label="Buscar cliente"
                    value={search}
                    onChange={(e) => Q(e.target.value)}
                    sx={{ m: 0, minWidth: 170, flex: 1 }}
                  />
                  <DateInput
                    label="Fecha de entrega"
                    value={filterDate}
                    onChange={(e) => FD(e.target.value)}
                  />
                  {view === "history" && (
                    <DateInput
                      label="Hasta fecha"
                      value={historyEnd}
                      onChange={(e) => HE(e.target.value)}
                    />
                  )}
                  <Select
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
                  </Select>
                </>
              )}
              <Select
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
              </Select>
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
                          <Button
                            aria-label="Aceptar pedido"
                            onClick={() => action(o, "confirm")}
                          >
                            ✓ Aceptar
                          </Button>
                          <Button
                            className="danger"
                            onClick={() => M({ kind: "reject", order: o })}
                          >
                            ✕ Rechazar
                          </Button>
                        </>
                      )}
                      {(admin || prep) && o.status === "confirmed" && (
                        <Button onClick={() => action(o, "prepare")}>
                          Iniciar preparación
                        </Button>
                      )}
                      {(admin || prep) && o.status === "preparing" && (
                        <Button onClick={() => action(o, "ready")}>
                          Marcar listo
                        </Button>
                      )}
                      {delivery &&
                        !o.courier_id &&
                        ["confirmed", "preparing", "ready"].includes(
                          o.status,
                        ) && (
                          <Button onClick={() => action(o, "take")}>
                            Tomar pedido
                          </Button>
                        )}
                      {(admin || (delivery && o.courier_id === user.id)) &&
                        o.status === "ready" && (
                          <Button onClick={() => action(o, "depart")}>
                            Iniciar recorrido
                          </Button>
                        )}
                      {(admin || (delivery && o.courier_id === user.id)) &&
                        o.status === "enroute" && (
                          <>
                            <Button onClick={() => action(o, "deliver")}>
                              Confirmar entrega
                            </Button>
                            <Button
                              className="neutral"
                              onClick={() => M({ kind: "failed", order: o })}
                            >
                              Entrega fallida
                            </Button>
                          </>
                        )}
                      {admin &&
                        ["confirmed", "preparing", "ready", "enroute"].includes(
                          o.status,
                        ) && (
                          <Button
                            className="neutral"
                            onClick={() => M({ kind: "assign", order: o })}
                          >
                            Asignar mensajero
                          </Button>
                        )}
                      {(admin || delivery) &&
                        ![
                          "pending",
                          "rejected",
                          "cancelled",
                          "delivered",
                        ].includes(o.status) && (
                          <Button
                            className="neutral"
                            onClick={() => M({ kind: "map", order: o })}
                          >
                            Ver recorrido en mapa
                          </Button>
                        )}
                      {client && o.status === "enroute" && (
                        <Button
                          className="neutral"
                          onClick={() => M({ kind: "tracking", order: o })}
                        >
                          Seguir entrega
                        </Button>
                      )}
                      {client &&
                        !o.cancel_requested &&
                        !["delivered", "rejected", "cancelled"].includes(
                          o.status,
                        ) && (
                          <Button
                            className="neutral"
                            onClick={() => action(o, "request_cancel")}
                          >
                            Solicitar cancelación
                          </Button>
                        )}
                      {admin &&
                        o.cancel_requested &&
                        !["delivered", "rejected", "cancelled"].includes(
                          o.status,
                        ) && (
                          <>
                            <Button
                              className="danger"
                              onClick={() => action(o, "cancel")}
                            >
                              Aprobar cancelación
                            </Button>
                            <Button
                              className="neutral"
                              onClick={() => action(o, "deny_cancel")}
                            >
                              Rechazar cancelación
                            </Button>
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
        {admin && view === "history" && (
          <DayClosings rows={closings} money={money} />
        )}
        <footer>
          Plaza San Francisco · Bucaramanga{" "}
          <span>
            {config?.devAuth
              ? "Datos de demostración solo en el entorno local"
              : "Delipiña · Pedidos y entregas"}
          </span>
        </footer>
      </main>
      {drawer && (
        <NoticeDrawer onClose={() => D(false)}>
          <header>
            <h2>Notificaciones</h2>
            <Button
              className="neutral"
              aria-label="Cerrar notificaciones"
              onClick={() => D(false)}
            >
              ✕
            </Button>
          </header>
          <Button
            className="neutral"
            onClick={() =>
              run(async () => {
                await api("/notifications/read", { method: "POST" });
                await refresh();
              })
            }
          >
            Marcar leídas
          </Button>
          {notifications.map((n) => (
            <article className={n.read ? "" : "unread"} key={n.id}>
              <strong>{n.title}</strong>
              <p>{date(n.created_at)}</p>
            </article>
          ))}
        </NoticeDrawer>
      )}
      {modal && (
        <Modal
          onClose={() => M(null)}
          title={
            typeof modal === "string"
              ? {
                  order: "Crear pedido",
                  user: "Crear usuario",
                  users: "Usuarios y acceso",
                  catalogList: "Catálogo de productos",
                  closeDay: "Cerrar jornada",
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
                  editUser: "Editar usuario",
                  deleteUser: "Eliminar usuario",
                  editProduct: "Editar producto",
                }[modal.kind]
          }
        >
          {error && <Alert severity="error">{error}</Alert>}
          {modal === "catalogList" && admin && (
            <>
              <Button onClick={() => M("catalog")}>Crear producto</Button>
              <ManagementTable
                kind="catalog"
                rows={products}
                onEdit={editProduct}
                onRemove={toggleProduct}
                onRestore={toggleProduct}
              />
            </>
          )}
          {modal === "closeDay" && admin && (
            <Form
              onSubmit={(b) =>
                run(async () => {
                  await api("/business-day/close", {
                    method: "POST",
                    body: { day: b.day },
                  });
                  M(null);
                  S("Jornada cerrada. El historial y los saldos se conservan.");
                  await refresh();
                })
              }
            >
              <Field
                name="day"
                label="Día de la jornada"
                type="date"
                defaultValue={business?.day}
              />
              <p>
                Se guardará el resumen del día. Los pedidos programados para
                mañana seguirán en la jornada de mañana. Antes de cerrar deben
                resolverse los pedidos y verificarse las transferencias de este
                día.
              </p>
              <Button type="submit">Confirmar cierre de jornada</Button>
            </Form>
          )}
          {modal === "order" && (
            <OrderForm
              {...{
                admin,
                users,
                branches,
                products,
                settings,
                user,
                business,
              }}
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
          {modal === "users" && admin && (
            <>
              <Button onClick={() => M("user")}>Crear usuario</Button>
              <ManagementTable
                kind="users"
                rows={users}
                onEdit={editUser}
                onRemove={deleteUser}
                onRestore={restoreUser}
              />
            </>
          )}
          {modal.kind === "editUser" && (
            <Form
              onSubmit={(b) =>
                run(async () => {
                  await api("/users/" + modal.user.id, {
                    method: "PATCH",
                    body: {
                      name: b.name,
                      email: b.email,
                      role: b.role,
                      creditLimit: Math.round(Number(b.creditLimit) * 100),
                      active: b.active === "on",
                      restore: !!modal.user.deleted_at && b.active === "on",
                    },
                  });
                  M("users");
                  await refresh();
                })
              }
            >
              <Field
                label="Nombre"
                name="name"
                defaultValue={modal.user.name}
              />
              <Field
                label="Correo Google"
                name="email"
                type="email"
                defaultValue={modal.user.email}
              />
              <Select label="Rol" name="role" defaultValue={modal.user.role}>
                {Object.entries(roles).map(([key, label]) => (
                  <option value={key} key={key}>
                    {label}
                  </option>
                ))}
              </Select>
              <Field
                label="Cupo total COP"
                type="number"
                name="creditLimit"
                min="0"
                defaultValue={Number(modal.user.credit_limit) / 100}
              />
              <label className="check">
                <input
                  type="checkbox"
                  name="active"
                  defaultChecked={modal.user.active}
                />{" "}
                Acceso activo
              </label>
              <p>
                Si cambias el correo o el rol, se revocan sus sesiones. El nuevo
                correo deberá verificarse con Google.
              </p>
              <Button type="submit">Guardar usuario</Button>
            </Form>
          )}
          {modal.kind === "deleteUser" && (
            <>
              <p>
                ¿Eliminar el acceso de <strong>{modal.user.name}</strong>?
              </p>
              <p>
                Su historial de pedidos y cobros se conserva. Puedes restaurar
                el usuario después.
              </p>
              <Button
                className="danger"
                onClick={() =>
                  run(async () => {
                    await api("/users/" + modal.user.id, { method: "DELETE" });
                    M("users");
                    await refresh();
                  })
                }
              >
                Eliminar usuario
              </Button>
            </>
          )}
          {modal.kind === "editProduct" && (
            <Form
              onSubmit={(b) =>
                run(async () => {
                  await api("/products/" + modal.product.id, {
                    method: "PATCH",
                    body: {
                      ...b,
                      price: Math.round(Number(b.price) * 100),
                      active: b.active === "on",
                    },
                  });
                  M("catalogList");
                  await refresh();
                })
              }
            >
              <Field
                name="name"
                label="Producto / corte"
                defaultValue={modal.product.name}
              />
              <Field
                name="presentation"
                label="Presentación"
                defaultValue={modal.product.presentation}
              />
              <Select
                name="unit"
                label="Venta por"
                defaultValue={modal.product.unit}
              >
                <option value="kg">Kilogramos (decimales)</option>
                <option value="pack">Empaque de peso fijo (entero)</option>
              </Select>
              <Field
                name="price"
                label="Precio COP"
                type="number"
                min="0"
                defaultValue={Number(modal.product.price) / 100}
              />
              <label className="check">
                <input
                  type="checkbox"
                  name="active"
                  defaultChecked={modal.product.active}
                />{" "}
                Producto disponible
              </label>
              <Select
                name="image_key"
                label="Imagen de la presentación"
                defaultValue={modal.product.image_key || ""}
              >
                <option value="">Sin imagen específica</option>
                {productImages.map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </Select>{" "}
              <p>
                Los pedidos ya registrados conservan sus precios y
                presentaciones.
              </p>
              <Button type="submit">Guardar producto</Button>
            </Form>
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
              <Select label="Rol" name="role">
                {Object.entries(roles).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </Select>
              <Field
                label="Cupo autorizado COP (0 sin crédito)"
                name="creditLimit"
                type="number"
                defaultValue="0"
                min="0"
              />
              <Button type="submit">Crear usuario</Button>
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
                <Select label="Cliente" name="clientId">
                  {users
                    .filter((u) => u.role === "client")
                    .map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                </Select>
              )}
              <Field name="address" label="Dirección" />
              <Select label="Municipio" name="city">
                {["Bucaramanga", "Girón", "Floridablanca", "Piedecuesta"].map(
                  (c) => (
                    <option key={c}>{c}</option>
                  ),
                )}
              </Select>
              <Button type="submit">Guardar sucursal</Button>
            </Form>
          )}
          {modal === "catalog" && (
            <>
              {config?.devAuth && (
                <p>
                  Precios locales ficticios. Configura los valores comerciales
                  antes de operar.
                </p>
              )}
              <Form
                onSubmit={(b) =>
                  run(async () => {
                    await api("/products", {
                      method: "POST",
                      body: { ...b, price: Math.round(Number(b.price) * 100) },
                    });
                    M("catalogList");
                    await refresh();
                  })
                }
              >
                <Field name="name" label="Producto / corte" />
                <Field name="presentation" label="Presentación" />
                <Select label="Unidad" name="unit">
                  <option value="kg">Kilogramos (decimales)</option>
                  <option value="pack">Empaque de peso fijo (entero)</option>
                </Select>
                <Select
                  name="image_key"
                  label="Imagen de la presentación"
                  defaultValue=""
                >
                  <option value="">Sin imagen específica</option>
                  {productImages.map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </Select>
                <Field name="price" label="Precio COP" type="number" min="0" />
                <Button type="submit">Agregar producto</Button>
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
              <Button type="submit">Guardar configuración</Button>
            </Form>
          )}
          {modal === "adminActions" && (
            <div className="stack">
              <Button onClick={() => M("user")}>Crear usuario</Button>
              <Button onClick={() => M("catalog")}>Catálogo</Button>
              <Button onClick={() => M("settings")}>Configuración</Button>
              <Button onClick={() => M({ kind: "credit" })}>
                Autorizar cupo
              </Button>
              <Button onClick={() => M({ kind: "price" })}>
                Precios por cliente
              </Button>
              <Button onClick={() => M("branch")}>Crear sucursal</Button>
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
              <Button
                type="submit"
                className={modal.kind === "reject" ? "danger" : ""}
              >
                Confirmar {modal.kind === "reject" ? "rechazo" : "incidencia"}
              </Button>
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
              <Select label="Cliente" name="clientId">
                {users
                  .filter((u) => u.role === "client")
                  .map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} · cupo {money(u.credit_limit)} · reservado{" "}
                      {money(u.credit_used)}
                    </option>
                  ))}
              </Select>
              <Field
                name="creditLimit"
                label="Cupo total COP"
                type="number"
                min="0"
              />
              <Button type="submit">Guardar cupo</Button>
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
              <Select label="Cliente" name="clientId">
                {users
                  .filter((u) => u.role === "client")
                  .map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
              </Select>
              <Select label="Producto" name="productId">
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} · {p.presentation}
                  </option>
                ))}
              </Select>
              <Field
                name="price"
                label="Precio especial COP · todas las sucursales"
                type="number"
                min="0"
              />
              <Button type="submit">Guardar precio</Button>
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
              <Select label="Mensajero" name="courierId">
                {users
                  .filter((u) => u.role === "courier")
                  .map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
              </Select>
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
              <Button type="submit">Confirmar cuadre</Button>
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
              <Select label="Mensajero" name="courierId">
                {users
                  .filter((u) => u.role === "courier")
                  .map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
              </Select>
              <Button type="submit">Guardar asignación</Button>
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
                        r.onload = () =>
                          resolve(String(r.result).split(",")[1]);
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
              <Button type="submit">Guardar número</Button>
            </Form>
          )}
        </Modal>
      )}
    </>
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
function OrderForm({
  admin,
  users,
  branches,
  products,
  onSubmit,
  user,
  settings,
  business,
}) {
  const [c, C] = useState(
      admin ? users.find((u) => u.role === "client")?.id : user.id,
    ),
    [quant, Q] = useState({});
  const [suggested] = useState(() => suggestedDelivery(settings, business));
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
        <Select label="Cliente" value={c} onChange={(e) => C(e.target.value)}>
          {users
            .filter((u) => u.role === "client")
            .map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
        </Select>
      )}
      <Select label="Sucursal" name="branchId" required>
        {branches
          .filter((b) => b.client_id === c)
          .map((b) => (
            <option key={b.id} value={b.id}>
              {b.address} · {b.city}
            </option>
          ))}
      </Select>
      <div className="row">
        <Field
          name="start"
          label="Entrega desde"
          type="datetime-local"
          defaultValue={suggested.start}
        />
        <Field
          name="end"
          label="Hasta"
          type="datetime-local"
          defaultValue={suggested.end}
        />
      </div>
      <p>
        Hora de Colombia · mínimo 2 horas de anticipación según configuración.
      </p>
      <ProductChoices
        products={products}
        quantities={quant}
        onQuantity={(id, value) => Q({ ...quant, [id]: value })}
        money={money}
      />
      <label className="check">
        <input name="credit" type="checkbox" /> Solicitar crédito autorizado
      </label>
      <label>
        <Field
          name="notes"
          label="Observaciones"
          required={false}
          multiline
          rows={3}
          maxLength={1000}
        />
      </label>
      <Button type="submit">
        Confirmar pedido{admin ? "" : " para revisión"}
      </Button>
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
      <Select label="Medio" name="method">
        <option value="cash">Efectivo</option>
        <option value="nequi">Nequi · pendiente de verificación</option>
        <option value="bancolombia">
          Transferencia Bancolombia · pendiente de verificación
        </option>
      </Select>
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
      <Button type="submit">Registrar abono</Button>
    </Form>
  );
}
createRoot(document.getElementById("root")).render(
  <Providers>
    <App />
  </Providers>,
);
