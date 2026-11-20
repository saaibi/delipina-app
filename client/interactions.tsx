import { singleFlight } from "../shared/refresh-task";
import React, { useEffect, useRef, useState } from "react";
import CircularProgress from "@mui/material/CircularProgress";
import Refresh from "@mui/icons-material/Refresh";
export function scrollModuleTop() {
  window.scrollTo({
    top: 0,
    behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ? "auto"
      : "smooth",
  });
}
export function usePullRefresh(refresh: () => Promise<any>, blocked: boolean) {
  const [distance, D] = useState(0),
    [busy, B] = useState(false),
    action = useRef(refresh),
    disabled = useRef(blocked),
    drag = useRef<any>(null);
  const perform = useRef<() => Promise<any>>(null);
  if (!perform.current)
    perform.current = singleFlight(async () => {
      B(true);
      try {
        return await action.current();
      } finally {
        B(false);
      }
    });
  action.current = refresh;
  disabled.current = blocked;
  useEffect(() => {
    const start = (e: TouchEvent) => {
      if (disabled.current || window.scrollY > 2 || e.touches.length !== 1)
        return;
      drag.current = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY,
        distance: 0,
      };
    };
    const move = (e: TouchEvent) => {
      const p = drag.current;
      if (!p) return;
      const dy = e.touches[0].clientY - p.y,
        dx = e.touches[0].clientX - p.x;
      if (dy < 0 || Math.abs(dx) > 50) {
        drag.current = null;
        D(0);
        return;
      }
      if (dy > 10) {
        e.preventDefault();
        p.distance = Math.min(dy * 0.55, 95);
        D(p.distance);
      }
    };
    const end = () => {
      const p = drag.current;
      drag.current = null;
      D(0);
      if (p?.distance >= 65) {
        void perform.current().catch(() => {});
      }
    };
    window.addEventListener("touchstart", start, { passive: true });
    window.addEventListener("touchmove", move, { passive: false });
    window.addEventListener("touchend", end);
    return () => {
      window.removeEventListener("touchstart", start);
      window.removeEventListener("touchmove", move);
      window.removeEventListener("touchend", end);
    };
  }, []);
  return {
    distance,
    busy,
    refresh: () => perform.current(),
  };
}
export function PullIndicator({ controller: p }: any) {
  return p.busy || p.distance > 10 ? (
    <div className="pull-indicator" role="status">
      {p.busy ? <CircularProgress size={18} /> : <Refresh fontSize="small" />}
      {p.busy
        ? "Actualizando…"
        : p.distance >= 65
          ? "Suelta para actualizar"
          : "Desliza para actualizar"}
    </div>
  ) : null;
}
