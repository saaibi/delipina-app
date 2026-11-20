import React, { useEffect, useState } from "react";
import { api } from "./offline";
import { Button, Modal } from "./ui";
import Switch from "@mui/material/Switch";
import FormControlLabel from "@mui/material/FormControlLabel";
import Alert from "@mui/material/Alert";
import type { AppConfig } from "../shared/contracts";
export function usePushPreferences(
  userId: string | undefined,
  config: AppConfig | null,
) {
  const [enabled, S] = useState(false),
    [status, ST] = useState("Consultando permisos"),
    [ask, A] = useState(false),
    [error, E] = useState("");
  const available = () =>
    typeof Notification !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window;
  const key = "delipina-push-disabled:" + userId;
  const nativeId = () =>
    localStorage.getItem("delipina-native-device:" + userId);
  async function nativeStatus() {
    const id = nativeId();
    if (!id) return false;
    const d = await api("/native-push/device?id=" + encodeURIComponent(id));
    if (!d?.id) {
      localStorage.removeItem("delipina-native-device:" + userId);
      return false;
    }
    S(d.enabled);
    ST(
      d.enabled
        ? "Notificaciones Android activas"
        : "Notificaciones Android desactivadas",
    );
    A(false);
    return true;
  }
  useEffect(() => {
    const linked = () => void nativeStatus();
    window.addEventListener("native-push-linked", linked);
    return () => window.removeEventListener("native-push-linked", linked);
  }, [userId]);
  async function activate(requestPermission = false) {
    E("");
    try {
      if (nativeId()) {
        await api("/native-push/device", {
          method: "PUT",
          body: { id: nativeId(), enabled: true },
        });
        localStorage.removeItem(key);
        await nativeStatus();
        return;
      }
      if (!available())
        throw Error("Este dispositivo o navegador no admite Web Push.");
      if (!config?.vapidPublicKey)
        throw Error("Push todavía no está configurado en el servidor.");
      let permission = Notification.permission;
      if (permission === "default" && requestPermission)
        permission = await Notification.requestPermission();
      if (permission !== "granted") {
        ST(
          permission === "denied"
            ? "Permiso bloqueado en el navegador"
            : "Permiso pendiente",
        );
        S(false);
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const subscription =
        (await reg.pushManager.getSubscription()) ||
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: config.vapidPublicKey,
        }));
      await api("/push", { method: "POST", body: subscription.toJSON() });
      localStorage.removeItem(key);
      S(true);
      ST("Notificaciones activas en este dispositivo");
      A(false);
    } catch (e) {
      E(e.message);
      ST("No fue posible activar las notificaciones");
    }
  }
  async function disable() {
    try {
      if (nativeId()) {
        await api("/native-push/device", {
          method: "PUT",
          body: { id: nativeId(), enabled: false },
        });
        localStorage.setItem(key, "true");
        await nativeStatus();
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await api("/push", {
          method: "DELETE",
          body: { endpoint: sub.endpoint },
        });
        await sub.unsubscribe();
      }
      localStorage.setItem(key, "true");
      S(false);
      ST("Desactivadas por tu preferencia");
    } catch (e) {
      E(e.message);
    }
  }
  useEffect(() => {
    if (!userId) return;
    if (nativeId()) {
      void nativeStatus().catch((e) => E(e.message));
      return;
    }
    if (new URLSearchParams(location.search).has("pushPair")) {
      A(false);
      return;
    }
    if (!available()) {
      ST("Web Push no disponible en este dispositivo");
      return;
    }
    if (!config?.vapidPublicKey) {
      ST("Pendiente de configurar en el servidor");
      return;
    }
    if (localStorage.getItem(key)) {
      ST("Desactivadas por tu preferencia");
      return;
    }
    if (Notification.permission === "granted") {
      void activate();
      return;
    }
    ST(
      Notification.permission === "denied"
        ? "Permiso bloqueado en el navegador"
        : "Permiso pendiente",
    );
    if (
      Notification.permission === "default" &&
      !sessionStorage.getItem("delipina-push-prompt:" + userId)
    )
      A(true);
  }, [userId, config?.vapidPublicKey]);
  return {
    enabled,
    status,
    ask,
    error,
    available: !!nativeId() || (available() && !!config?.vapidPublicKey),
    activate: () => activate(true),
    disable,
    dismiss() {
      sessionStorage.setItem("delipina-push-prompt:" + userId, "true");
      A(false);
    },
  };
}
export function PushPermissionPrompt({ controller: p }: any) {
  return p.ask ? (
    <Modal title="Recibe avisos de tus pedidos" onClose={p.dismiss}>
      <p>
        Activa las notificaciones para recibir novedades aunque no tengas
        abierta Delipiña. Puedes cambiar esta preferencia en Ajustes.
      </p>
      {p.error && <Alert severity="error">{p.error}</Alert>}
      <div className="actions">
        <Button className="neutral" onClick={p.dismiss}>
          Ahora no
        </Button>
        <Button onClick={p.activate}>Activar notificaciones</Button>
      </div>
    </Modal>
  ) : null;
}
export function NotificationSettings({ controller: p }: any) {
  return (
    <section>
      <h2>Notificaciones</h2>
      <FormControlLabel
        control={
          <Switch
            checked={p.enabled}
            disabled={!p.available}
            onChange={(_, checked) => (checked ? p.activate() : p.disable())}
          />
        }
        label="Avisos en este dispositivo"
      />
      <p>{p.status}</p>
      {p.error && <Alert severity="error">{p.error}</Alert>}
      <p>
        Si el permiso está bloqueado, habilítalo en los ajustes del navegador.
        La campana mantiene tus avisos dentro de la aplicación.
      </p>
    </section>
  );
}
