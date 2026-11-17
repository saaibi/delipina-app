import React from "react";
import Table from "@mui/material/Table";
import TableHead from "@mui/material/TableHead";
import TableBody from "@mui/material/TableBody";
import TableRow from "@mui/material/TableRow";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
export function DayClosings({ rows, money }: any) {
  return (
    <div className="panel">
      <h2>Cierres por jornada</h2>
      {!rows.length ? (
        <p>Aún no hay cierres registrados.</p>
      ) : (
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                {[
                  "Día",
                  "Pedidos",
                  "Ventas entregadas",
                  "Cobros en efectivo",
                  "Transferencias verificadas",
                ].map((c) => (
                  <TableCell key={c}>{c}</TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.day}>
                  <TableCell>{r.day}</TableCell>
                  <TableCell>{r.summary?.orders}</TableCell>
                  <TableCell>
                    {money(r.summary?.delivered_total || 0)}
                  </TableCell>
                  <TableCell>{money(r.summary?.cash || 0)}</TableCell>
                  <TableCell>
                    {money(r.summary?.verified_transfers || 0)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </div>
  );
}
