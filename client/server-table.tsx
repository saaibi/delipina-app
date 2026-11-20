import React, { useEffect, useState } from "react";
import Table from "@mui/material/Table";
import TableHead from "@mui/material/TableHead";
import TableBody from "@mui/material/TableBody";
import TableRow from "@mui/material/TableRow";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TablePagination from "@mui/material/TablePagination";
import Alert from "@mui/material/Alert";
import { Field } from "./ui";
import { api } from "./offline";
export function ServerTable({ kind }: any) {
  const [page, P] = useState(0),
    [size, S] = useState(25),
    [q, Q] = useState(""),
    [result, R] = useState<any>({ rows: [], total: 0 }),
    [error, E] = useState("");
  useEffect(() => {
    let live = true;
    const load = () =>
      api(
        "/" +
          (kind === "audit" ? "audit" : "business-days") +
          "?" +
          new URLSearchParams({
            page: String(page),
            pageSize: String(size),
            q,
          }),
      )
        .then((r) => {
          if (live) {
            R(r);
            E("");
          }
        })
        .catch((e) => {
          if (live) E(e.message);
        });
    load();
    window.addEventListener("delipina:refresh", load);
    return () => {
      live = false;
      window.removeEventListener("delipina:refresh", load);
    };
  }, [page, size, q, kind]);
  const audit = kind === "audit";
  return (
    <section className="panel">
      <h2>{audit ? "Trazabilidad" : "Jornadas"}</h2>
      {error && <Alert severity="error">{error}</Alert>}
      {audit && (
        <Field
          required={false}
          label="Buscar acción, usuario o pedido"
          value={q}
          onChange={(e) => {
            Q(e.target.value);
            P(0);
          }}
        />
      )}
      <TableContainer>
        <Table size="small">
          <TableHead>
            <TableRow>
              {(audit
                ? ["Fecha", "Usuario", "Acción", "Entidad / pedido", "Estado"]
                : [
                    "Día",
                    "Recepción de pedidos",
                    "Cierre contable",
                    "Cuadres pendientes",
                    "Pedidos",
                  ]
              ).map((v) => (
                <TableCell key={v}>{v}</TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {result.rows.map((r) => (
              <TableRow key={audit ? r.id : r.day}>
                {(audit
                  ? [
                      new Date(r.created_at).toLocaleString("es-CO"),
                      r.actor_name || "Sistema",
                      r.action,
                      r.order_id?.slice(0, 8) || r.entity_id || r.entity_type,
                      r.next_status || "—",
                    ]
                  : [
                      r.day,
                      r.intake_closed_at ? "Finalizada" : "Abierta",
                      r.closed_at
                        ? new Date(r.closed_at).toLocaleString("es-CO")
                        : "Esperando cuadre / entregas",
                      r.pending_settlements,
                      r.summary?.orders ?? "—",
                    ]
                ).map((v, i) => (
                  <TableCell key={i}>{v}</TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      <TablePagination
        component="div"
        count={result.total}
        page={page}
        rowsPerPage={size}
        onPageChange={(_, p) => P(p)}
        onRowsPerPageChange={(e) => {
          S(Number(e.target.value));
          P(0);
        }}
        rowsPerPageOptions={[10, 25, 50, 100]}
        labelRowsPerPage="Filas"
        labelDisplayedRows={({ from, to, count }) =>
          `${from}–${to} de ${count}`
        }
      />
    </section>
  );
}
