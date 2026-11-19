import { SettingsView } from "./settings";
import { ProductEditor } from "./product-editor";
import { CreditsView, CreditDetails, GeneralPaymentForm } from "./credits";
import { AnalyticsView } from "./analytics";
import { OrderCards, OrderDetails } from "./orders";
import { NotificationList } from "./notifications";
import { usePullRefresh, PullIndicator, scrollModuleTop } from "./interactions";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";
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
    [noticeCounts, NC] = useState([]),
    [accounts, AC] = useState([]),
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
    NC([]);
    AC([]);
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
  const lastTap = useRef({ id: "", at: 0 });
  function navigateModule(id: string) {
    const current = view === "accepted" ? "orders" : view;
    const now = Date.now();
    if (current === id) {
      if (lastTap.current.id === id && now - lastTap.current.at < 400)
        scrollModuleTop();
      lastTap.current = { id, at: now };
      return;
    }
    lastTap.current = { id, at: now };
    V(id);
    ST("");
    if (id === "orders") {
      FD(business?.day || "");
      HE("");
    }
    scrollModuleTop();
  }
  const pull = usePullRefresh(
    async () => {
      await run(() => refresh());
    },
    !user || !!modal || drawer,
  );
  async function openNotice(n: any) {
    await run(async () => {
      await api("/notifications/" + n.id + "/read", {
        method: "POST",
        body: n.revision ? { revision: n.revision } : {},
      });
      D(false);
      if (n.module === "orders") {
        V("orders");
        FD("");
        ST("");
        const order =
          orders.find((o) => o.id === n.target_id) ||
          (await api("/orders/" + n.target_id));
        M({ kind: "orderDetail", order });
      } else if (n.module === "credits") {
        V("payments");
        const all = accounts.length ? accounts : await api("/credit-accounts");
        const client = all.find((a) => a.id === n.target_id);
        if (client) M({ kind: "creditDetail", client });
      } else if (n.module === "analytics") V("analytics");
      await refresh();
    });
  }
  useEffect(() => {
    if (!user) return;
    const q = new URLSearchParams(window.location.search);
    const order = q.get("order"),
      credit = q.get("credit"),
      id = q.get("notice");
    if (id && (order || credit || q.get("module") === "analytics"))
      void openNotice({
        id,
        target_id: order || credit,
        module: order ? "orders" : credit ? "credits" : "analytics",
        revision: q.get("revision") ? Number(q.get("revision")) : undefined,
      });
    else if (order)
      void run(async () => {
        M({ kind: "orderDetail", order: await api("/orders/" + order) });
      });
  }, [user?.id]);
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
      cached("/orders").then((value) => {
        guard(O)(value);
        if (epoch === authEpoch.current && subject.current === u.id)
          setModal((prev) =>
            prev?.kind === "orderDetail"
              ? {
                  ...prev,
                  order:
                    value.find((o) => o.id === prev.order.id) || prev.order,
                }
              : prev,
          );
      }),
      cached("/products").then(guard(P)),
      cached("/notifications").then(guard(N)),
      cached("/notifications/counts").then(guard(NC)),
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
      tasks.push(
        cached("/invoices").then(guard(I)),
        cached("/credit-accounts").then(guard(AC)),
      );
    if (["admin", "courier"].includes(u.role))
      tasks.push(
        cached("/payments").then(guard(PAY)),
        cached("/settlements").then(guard(SS)),
      );
    await Promise.all(tasks);
    window.dispatchEvent(new Event("delipina:refresh"));
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
    if (loading || user || !config?.googleClientId) return;
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
  }, [config, user, loading]);
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
  const actionsFor = (o: any) => (
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
        <Button onClick={() => action(o, "ready")}>Marcar listo</Button>
      )}
      {delivery &&
        !o.courier_id &&
        ["confirmed", "preparing", "ready"].includes(o.status) && (
          <Button onClick={() => action(o, "take")}>Tomar pedido</Button>
        )}
      {(admin || (delivery && o.courier_id === user.id)) &&
        o.status === "ready" && (
          <Button onClick={() => action(o, "depart")}>Iniciar recorrido</Button>
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
        ["confirmed", "preparing", "ready", "enroute"].includes(o.status) && (
          <Button
            className="neutral"
            onClick={() => M({ kind: "assign", order: o })}
          >
            Asignar mensajero
          </Button>
        )}
      {(admin || delivery) &&
        !["pending", "rejected", "cancelled", "delivered"].includes(
          o.status,
        ) && (
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
        !["delivered", "rejected", "cancelled"].includes(o.status) && (
          <Button
            className="neutral"
            onClick={() => action(o, "request_cancel")}
          >
            Solicitar cancelación
          </Button>
        )}
      {admin &&
        o.cancel_requested &&
        !["delivered", "rejected", "cancelled"].includes(o.status) && (
          <>
            <Button className="danger" onClick={() => action(o, "cancel")}>
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
      {admin && !["delivered", "cancelled", "rejected"].includes(o.status) && (
        <Button
          className="neutral"
          onClick={() => M({ kind: "reschedule", order: o })}
        >
          Reprogramar
        </Button>
      )}
    </div>
  );
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
      (view !== "accepted" ||
        !["pending", "cancelled", "rejected"].includes(o.status)) &&
      (!search ||
        o.client_name?.toLowerCase().includes(search.toLowerCase())) &&
      (!admin ||
        !filterDate ||
        (view === "accepted"
          ? new Date(o.window_start).toLocaleDateString("en-CA", {
              timeZone: "America/Bogota",
            }) >= filterDate
          : o.status === "pending" ||
            new Date(o.window_start).toLocaleDateString("en-CA", {
              timeZone: "America/Bogota",
            }) === filterDate)) &&
      (!admin ||
        view !== "accepted" ||
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
      <PullIndicator controller={pull} />
      <PushPermissionPrompt controller={push} />
      <Navigation
        user={user}
        view={view}
        online={online}
        pending={pending}
        business={business}
        unread={noticeCounts.reduce((sum, n) => sum + n.count, 0)}
        counts={Object.fromEntries(
          noticeCounts.map((n) => [n.module, n.count]),
        )}
        onNotice={() => D(!drawer)}
        onNavigate={navigateModule}
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
                ? "Créditos de clientes"
                : view === "analytics"
                  ? "Inteligencia de negocio"
                  : view === "accepted"
                    ? "Pedidos aceptados"
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
          {(admin || client) && ["orders", "accepted"].includes(view) && (
            <Button onClick={() => M("order")}>＋ Crear pedido</Button>
          )}
          <Button
            className="neutral"
            aria-label="Actualizar módulo"
            onClick={() => pull.refresh()}
          >
            ↻
          </Button>
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
        {view === "settings" ? (
          <SettingsView
            {...{ user, push, settings, users, products, branches }}
            onAction={M}
            onEditUser={editUser}
            onRemoveUser={deleteUser}
            onRestoreUser={restoreUser}
            onEditProduct={editProduct}
            onToggleProduct={toggleProduct}
            onRefresh={() => run(() => refresh())}
          />
        ) : view === "analytics" && admin ? (
          <AnalyticsView money={money} labels={labels} closings={closings} />
        ) : view === "payments" ? (
          <>
            <CreditsView
              accounts={accounts}
              user={user}
              payments={payments}
              money={money}
              onReview={(client) => M({ kind: "creditDetail", client })}
              onPay={(client) => M({ kind: "payment", client })}
              onVerify={(p) =>
                run(async () => {
                  await api("/payments/" + p.id + "/verify", {
                    method: "POST",
                  });
                  await refresh();
                })
              }
            />
            {admin && (
              <div className="panel">
                <h2>Cuadre de mensajeros</h2>
                <Button
                  className="neutral"
                  onClick={() => M({ kind: "settlement" })}
                >
                  Confirmar cuadre diario
                </Button>
                {settlements.map((r) => (
                  <p key={r.id}>
                    {r.day.slice(0, 10)} · {r.courier_name} · recibido{" "}
                    {money(r.received_cash)} · esperado {money(r.expected_cash)}
                  </p>
                ))}
              </div>
            )}
          </>
        ) : (
          <>
            {admin && (
              <Tabs
                value={view === "accepted" ? "accepted" : "orders"}
                onChange={(_, value) => {
                  V(value);
                  ST("");
                  FD(value === "accepted" ? "" : business?.day || "");
                  HE("");
                }}
                aria-label="Vista de pedidos"
              >
                <Tab label="Operación del día" value="orders" />
                <Tab label="Todos los aceptados" value="accepted" />
              </Tabs>
            )}
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
                  {view === "accepted" && (
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
            <OrderCards
              orders={selected}
              userRole={user.role}
              actionsFor={actionsFor}
              urgency={urgency}
              labels={labels}
              money={money}
              date={date}
              onSelect={(o) => M({ kind: "orderDetail", order: o })}
            />
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
          <NotificationList
            rows={notifications}
            onSelect={openNotice}
            labels={labels}
            date={date}
          />
        </NoticeDrawer>
      )}
      {modal && (
        <Modal
          wide={
            modal === "users" ||
            modal === "catalogList" ||
            modal === "order" ||
            modal.kind === "creditDetail"
          }
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
                  orderDetail: "Detalle del pedido",
                  creditDetail: "Pedidos y saldo del cliente",
                  reschedule: "Reprogramar entrega",
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
                  M(null);
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
                    M(null);
                    await refresh();
                  })
                }
              >
                Eliminar usuario
              </Button>
            </>
          )}
          {modal.kind === "editProduct" && (
            <ProductEditor
              product={modal.product}
              onSaved={async () => {
                M(null);
                await refresh();
              }}
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
            <ProductEditor
              onSaved={async () => {
                M(null);
                await refresh();
              }}
            />
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
            <GeneralPaymentForm
              client={modal.client}
              business={business}
              money={money}
              onSaved={async (r) => {
                M(null);
                S("Abono registrado en jornada " + r.businessDay);
                await refresh();
              }}
            />
          )}
          {modal.kind === "creditDetail" && (
            <CreditDetails
              client={
                accounts.find((a) => a.id === modal.client.id) || modal.client
              }
              money={money}
              canPay={admin || delivery}
              onPay={(client) => M({ kind: "payment", client })}
            />
          )}
          {modal.kind === "orderDetail" && (
            <OrderDetails
              order={orders.find((o) => o.id === modal.order.id) || modal.order}
              userRole={user.role}
              actions={actionsFor(
                orders.find((o) => o.id === modal.order.id) || modal.order,
              )}
              labels={labels}
              money={money}
              date={date}
            />
          )}
          {modal.kind === "reschedule" && (
            <Form
              onSubmit={(b) =>
                run(async () => {
                  await api("/orders/" + modal.order.id + "/action", {
                    method: "POST",
                    body: { action: "reschedule", start: b.start, end: b.end },
                  });
                  M(null);
                  await refresh();
                })
              }
            >
              <Field
                name="start"
                label="Nueva entrega desde"
                type="datetime-local"
                defaultValue={suggestedDelivery(settings, business).start}
              />
              <Field
                name="end"
                label="Hasta"
                type="datetime-local"
                defaultValue={suggestedDelivery(settings, business).end}
              />
              <Button type="submit">Guardar reprogramación</Button>
            </Form>
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
  const [priced, PR] = useState(products);
  useEffect(() => {
    let valid = true;
    if (admin && c)
      cached("/products?clientId=" + c)
        .then((p) => {
          if (valid) PR(p);
        })
        .catch(() => {});
    else PR(products);
    return () => {
      valid = false;
    };
  }, [c, products]);
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
        products={priced}
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
createRoot(document.getElementById("root")).render(
  <Providers>
    <App />
  </Providers>,
);
