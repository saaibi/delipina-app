import React, { useEffect, useRef, useState } from "react";
import Alert from "@mui/material/Alert";
import { Field, Button } from "./ui";
import { cached } from "./offline";
import { DayClosings } from "./business";
let loading: Promise<any> | undefined;
function loadCharts() {
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    const draw = () => {
      const g = (window as any).google;
      g.charts.load("current", { packages: ["corechart"], language: "es" });
      g.charts.setOnLoadCallback(() => resolve(g));
    };
    if ((window as any).google?.charts) {
      draw();
      return;
    }
    const script = document.createElement("script");
    script.src = "https://www.gstatic.com/charts/loader.js";
    script.onload = draw;
    script.onerror = () => {
      loading = undefined;
      reject(Error("Google Charts no está disponible sin conexión"));
    };
    document.head.append(script);
  });
  return loading;
}
function Chart({ title, type, rows }: any) {
  const root = useRef<HTMLDivElement>(null),
    [error, E] = useState("");
  useEffect(() => {
    if (rows.length < 2) return;
    let active = true,
      chart: any;
    const draw = () =>
      loadCharts()
        .then((g) => {
          if (!active || !root.current) return;
          const data = g.visualization.arrayToDataTable(rows);
          chart = new g.visualization[type](root.current);
          chart.draw(data, {
            colors: ["#215438", "#e6bf42", "#789468", "#bd6a4d"],
            backgroundColor: "transparent",
            height: 270,
            chartArea: { left: 68, top: 24, width: "77%", height: "68%" },
            legend: { position: "bottom" },
            fontName: "Arial",
            hAxis: { textStyle: { fontSize: 10 } },
            vAxis: { minValue: 0 },
            pieHole: 0.45,
          });
          E("");
        })
        .catch((e) => E(e.message));
    draw();
    const observer = new ResizeObserver(draw);
    if (root.current) observer.observe(root.current);
    return () => {
      active = false;
      observer.disconnect();
      chart?.clearChart();
    };
  }, [rows, type]);
  return (
    <section className="panel chart-panel">
      <h2>{title}</h2>
      {rows.length < 2 ? (
        <p>Sin datos en este rango.</p>
      ) : (
        <>
          {error && <Alert severity="info">{error}</Alert>}
          <div ref={root} role="img" aria-label={title} />
          <details>
            <summary>Ver datos del gráfico</summary>
            <table className="chart-data">
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i}>
                    {r.map((v, j) => (
                      <td key={j}>{String(v)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </>
      )}
    </section>
  );
}
export function AnalyticsView({ money, labels, closings }: any) {
  const [from, F] = useState(""),
    [to, T] = useState(""),
    [report, R] = useState<any>(null),
    [error, E] = useState("");
  const load = () =>
    cached(
      "/analytics?" +
        new URLSearchParams({
          ...(from ? { from } : {}),
          ...(to ? { to } : {}),
        }),
    )
      .then(R)
      .catch((e) => E(e.message));
  useEffect(() => {
    load();
    const handler = () => load();
    window.addEventListener("delipina:refresh", handler);
    return () => window.removeEventListener("delipina:refresh", handler);
  }, [from, to]);
  return (
    <>
      <div className="toolbar">
        <Field
          type="date"
          label="Desde"
          required={false}
          value={from}
          onChange={(e) => F(e.target.value)}
        />
        <Field
          type="date"
          label="Hasta"
          required={false}
          value={to}
          onChange={(e) => T(e.target.value)}
        />
        <Button className="neutral" onClick={load}>
          Actualizar análisis
        </Button>
      </div>
      {error && <Alert severity="error">{error}</Alert>}
      {report && (
        <>
          <div className="summary-cards">
            {[
              ["Pedidos aceptados", report.totals.accepted],
              ["Valor aceptado", money(report.totals.accepted_total)],
              ["Ventas entregadas", money(report.totals.delivered_total)],
              ["Cartera actual", money(report.totals.outstanding)],
            ].map(([label, value]) => (
              <article key={label}>
                <small>{label}</small>
                <strong>{value}</strong>
              </article>
            ))}
          </div>
          <p className="metric-basis">{report.basis}</p>
          <div className="chart-grid">
            <Chart
              title="Valor de pedidos por fecha de entrega"
              type="LineChart"
              rows={[
                ["Día", "Aceptado COP", "Entregado COP"],
                ...report.daily.map((d) => [
                  d.day,
                  Number(d.accepted_total) / 100,
                  Number(d.delivered_total) / 100,
                ]),
              ]}
            />
            <Chart
              title="Pedidos por estado"
              type="PieChart"
              rows={[
                ["Estado", "Pedidos"],
                ...report.status.map((d) => [
                  labels[d.status] || d.status,
                  d.count,
                ]),
              ]}
            />
            <Chart
              title="Productos con mayor valor aceptado"
              type="BarChart"
              rows={[
                ["Producto", "COP"],
                ...report.products.map((d) => [d.name, Number(d.total) / 100]),
              ]}
            />
            <Chart
              title="Entregas por mensajero"
              type="ColumnChart"
              rows={[
                ["Mensajero", "Entregas"],
                ...report.couriers.map((d) => [d.name, d.count]),
              ]}
            />
          </div>
        </>
      )}
      <DayClosings rows={closings} money={money} />
    </>
  );
}
