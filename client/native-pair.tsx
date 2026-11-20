import React, { useState } from "react";
import { api } from "./offline";
import { Modal, Button } from "./ui";
import Alert from "@mui/material/Alert";
export function NativePair({ userId, onLinked }: any) {
  const code = new URLSearchParams(location.search).get("pushPair");
  const [closed, C] = useState(false),
    [error, E] = useState(""),
    [busy, B] = useState(false);
  if (!userId || closed || !code || !/^[a-f0-9]{64}$/.test(code)) return null;
  function dismiss() {
    const url = new URL(location.href);
    url.searchParams.delete("pushPair");
    history.replaceState(null, "", url);
    C(true);
  }
  return (
    <Modal title="Vincular avisos del teléfono" onClose={dismiss}>
      <p>
        Continúa solo si acabas de abrir Delipiña para Android y viste este
        código en tu teléfono:
      </p>
      <h2 style={{ textAlign: "center" }}>{code.slice(-4).toUpperCase()}</h2>
      <p>
        Este teléfono recibirá las notificaciones de tu cuenta, incluso con la
        aplicación cerrada.
      </p>
      {error && <Alert severity="error">{error}</Alert>}
      <div className="actions">
        <Button className="neutral" onClick={dismiss}>
          Cancelar
        </Button>
        <Button
          disabled={busy}
          onClick={async () => {
            B(true);
            try {
              const r = await api("/native-push/claim", {
                method: "POST",
                body: { code },
              });
              localStorage.setItem("delipina-native-device:" + userId, r.id);
              localStorage.removeItem("delipina-push-disabled:" + userId);
              dismiss();
              onLinked?.();
            } catch (e) {
              E(e.message);
            } finally {
              B(false);
            }
          }}
        >
          Coincide, activar avisos
        </Button>
      </div>
    </Modal>
  );
}
