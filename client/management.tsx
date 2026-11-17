import FormControlLabel from "@mui/material/FormControlLabel";
import Switch from "@mui/material/Switch";
import React, { useState } from "react";
import Table from "@mui/material/Table";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableBody from "@mui/material/TableBody";
import TableRow from "@mui/material/TableRow";
import TableCell from "@mui/material/TableCell";
import TablePagination from "@mui/material/TablePagination";
import Chip from "@mui/material/Chip";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import Edit from "@mui/icons-material/Edit";
import DeleteOutline from "@mui/icons-material/DeleteOutlined";
import Restore from "@mui/icons-material/Restore";
import Block from "@mui/icons-material/Block";
import { Field } from "./ui";
const roles = {
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
export function ManagementTable({
  kind,
  rows,
  onEdit,
  onRemove,
  onRestore,
}: any) {
  const [archived, SA] = useState(false);
  const [search, S] = useState(""),
    [page, P] = useState(0);
  const users = kind === "users";
  const filtered = rows
    .filter((r) => !users || archived || !r.deleted_at)
    .filter((r) =>
      (users
        ? [r.name, r.email, roles[r.role]]
        : [r.name, r.presentation, r.unit]
      )
        .join(" ")
        .toLowerCase()
        .includes(search.toLowerCase()),
    );
  return (
    <>
      <Field
        required={false}
        label={
          users
            ? "Buscar por nombre, correo o rol"
            : "Buscar producto o presentación"
        }
        value={search}
        onChange={(e) => {
          S(e.target.value);
          P(0);
        }}
      />
      {users && (
        <FormControlLabel
          control={
            <Switch
              checked={archived}
              onChange={(_, v) => {
                SA(v);
                P(0);
              }}
            />
          }
          label="Mostrar usuarios eliminados"
        />
      )}
      <TableContainer sx={{ maxHeight: 440 }}>
        <Table
          size="small"
          stickyHeader
          aria-label={users ? "Listado de usuarios" : "Listado de catálogo"}
        >
          <TableHead>
            <TableRow>
              {(users
                ? ["Nombre", "Correo", "Rol", "Estado", "Acciones"]
                : [
                    "Producto",
                    "Presentación",
                    "Venta por",
                    "Precio",
                    "Estado",
                    "Acciones",
                  ]
              ).map((c) => (
                <TableCell
                  key={c}
                  sx={{ fontWeight: 700, whiteSpace: "nowrap" }}
                >
                  {c}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {filtered.slice(page * 10, page * 10 + 10).map((r) => (
              <TableRow hover key={r.id}>
                <TableCell sx={{ fontWeight: 600 }}>{r.name}</TableCell>
                {users ? (
                  <>
                    <TableCell>{r.email}</TableCell>
                    <TableCell>{roles[r.role]}</TableCell>
                  </>
                ) : (
                  <>
                    <TableCell>{r.presentation}</TableCell>
                    <TableCell>
                      {r.unit === "kg" ? "Kilogramos" : "Empaques"}
                    </TableCell>
                    <TableCell sx={{ whiteSpace: "nowrap" }}>
                      {money(r.price)}
                    </TableCell>
                  </>
                )}
                <TableCell>
                  <Chip
                    size="small"
                    color={r.active ? "success" : "default"}
                    variant="outlined"
                    label={
                      r.deleted_at
                        ? "Eliminado"
                        : r.active
                          ? "Activo"
                          : "Deshabilitado"
                    }
                  />
                </TableCell>
                <TableCell sx={{ whiteSpace: "nowrap" }}>
                  <Tooltip title="Editar">
                    <IconButton
                      aria-label={"Editar " + r.name}
                      onClick={() => onEdit(r)}
                    >
                      <Edit fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  {r.active ? (
                    <Tooltip
                      title={
                        users ? "Eliminar usuario" : "Deshabilitar producto"
                      }
                    >
                      <IconButton
                        color="error"
                        aria-label={
                          (users ? "Eliminar " : "Deshabilitar ") + r.name
                        }
                        onClick={() => onRemove(r)}
                      >
                        {users ? (
                          <DeleteOutline fontSize="small" />
                        ) : (
                          <Block fontSize="small" />
                        )}
                      </IconButton>
                    </Tooltip>
                  ) : (
                    <Tooltip title="Restaurar">
                      <IconButton
                        color="primary"
                        aria-label={"Restaurar " + r.name}
                        onClick={() => onRestore(r)}
                      >
                        <Restore fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {!filtered.length && (
              <TableRow>
                <TableCell colSpan={users ? 5 : 6}>
                  No hay resultados para esta búsqueda.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
      <TablePagination
        component="div"
        count={filtered.length}
        page={Math.min(page, Math.max(0, Math.ceil(filtered.length / 10) - 1))}
        onPageChange={(_, p) => P(p)}
        rowsPerPage={10}
        rowsPerPageOptions={[10]}
        labelDisplayedRows={({ from, to, count }) =>
          `${from}–${to} de ${count}`
        }
      />
    </>
  );
}
