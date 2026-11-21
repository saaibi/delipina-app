import { PeriodPicker, periodDates } from "./period-picker";
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
      g.charts.load("current", {
        packages: ["corechart", "geochart"],
        language: "es",
      });
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
export function Chart({
  title,
  type,
  rows,
  options,
  description,
  tableRows,
}: any) {
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
          chart ||= new g.visualization[type](root.current);
          chart.draw(data, {
            colors: [
              "#215438",
              "#e6bf42",
              "#789468",
              "#bd6a4d",
              "#496f9f",
              "#9b7bb6",
            ],
            backgroundColor: "transparent",
            height: 270,
            chartArea: { left: 68, top: 24, width: "77%", height: "68%" },
            legend: { position: "bottom" },
            fontName: "Arial",
            hAxis: { textStyle: { fontSize: 10 } },
            vAxis: { minValue: 0 },
            pieHole: 0.55,
            ...(options || {}),
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
  }, [rows, type, options]);
  return (
    <section className="panel chart-panel">
      <h2>{title}</h2>
      {description && <p>{description}</p>}
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
                {(tableRows || rows).map((r, i) => (
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
    [to, T] = useState(periodDates("1 Año").to),
    [report, R] = useState<any>(null),
    [error, E] = useState("");
  const requestVersion = useRef(0);
  const load = () => {
    const version = ++requestVersion.current;
    return cached(
      "/analytics?" +
        new URLSearchParams({
          ...(from ? { from } : {}),
          ...(to ? { to } : {}),
        }),
    )
      .then((data) => {
        if (version !== requestVersion.current) return;
        R(data);
        E("");
      })
      .catch((e) => {
        if (version === requestVersion.current) E(e.message);
      });
  };
  useEffect(() => {
    load();
    const handler = () => load();
    window.addEventListener("delipina:refresh", handler);
    return () => {
      requestVersion.current++;
      window.removeEventListener("delipina:refresh", handler);
    };
  }, [from, to]);
  return (
    <>
      <PeriodPicker
        onChange={({ from, to }) => {
          F(from);
          T(to);
        }}
      />
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
              title="Clientes que más compran"
              type="PieChart"
              options={{ pieHole: 0 }}
              description="Valor de pedidos aceptados (COP), según la fecha de entrega."
              rows={[
                ["Cliente", "Valor aceptado COP"],
                ...(report.customers || [])
                  .slice(0, 5)
                  .map((d) => [d.name, Number(d.total) / 100]),
                ...((report.customers || []).length > 5
                  ? [
                      [
                        "Otros clientes",
                        report.customers
                          .slice(5)
                          .reduce((sum, d) => sum + Number(d.total) / 100, 0),
                      ],
                    ]
                  : []),
              ]}
            />
            <Chart
              title="Pedidos aceptados por ciudad"
              type="GeoChart"
              description="Vista general de Colombia. El tamaño indica pedidos y el color su valor aceptado."
              options={{
                region: "CO",
                displayMode: "markers",
                magnifyingGlass: { enable: true, zoomFactor: 20 },
                colorAxis: { colors: ["#b9d7aa", "#16402e"] },
                sizeAxis: { minSize: 6, maxSize: 24 },
                datalessRegionColor: "#edf1e8",
                legend: "none",
                height: 320,
                chartArea: { left: 8, top: 8, width: "95%", height: "90%" },
              }}
              rows={[
                ["Ciudad", "Longitud", "Valor aceptado COP", "Pedidos"],
                ...(report.geography || []).map((d) => [
                  { v: Number(d.lat), f: d.city },
                  Number(d.lng),
                  Number(d.total) / 100,
                  d.count,
                ]),
              ]}
              tableRows={[
                ["Ciudad", "Pedidos", "Valor aceptado COP"],
                ...(report.geography || []).map((d) => [
                  d.city,
                  d.count,
                  Number(d.total) / 100,
                ]),
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
          {report.unmappedOrders > 0 && (
            <p>
              {report.unmappedOrders} pedidos aceptados sin ubicación vigente no
              aparecen en el mapa.
            </p>
          )}
        </>
      )}
    </>
  );
}
