import React, { useState } from "react";
import Switch from "@mui/material/Switch";
import FormControlLabel from "@mui/material/FormControlLabel";
import { Select } from "./ui";
import { moduleLabels } from "./access";
export function RoleFields({
  role = "custom",
  permissions = ["orders", "plant"],
  client = false,
}: any) {
  const [value, V] = useState(
    client ? "client" : role === "plant_admin" ? "custom" : role,
  );
  return (
    <>
      <Select
        name="role"
        label="Rol"
        value={value}
        onChange={(e) => V(e.target.value)}
      >
        {Object.entries(
          client
            ? { client: "Cliente" }
            : {
                admin: "Administrador",
                courier: "Mensajero",
                preparation: "Planta",
                custom: "Personalizado",
              },
        ).map(([id, name]) => (
          <option key={id} value={id}>
            {name}
          </option>
        ))}
      </Select>
      {value === "custom" && (
        <fieldset className="permission-grid">
          <legend>Módulos que puede ver</legend>
          {Object.entries(moduleLabels).map(([id, name]) => (
            <FormControlLabel
              key={id}
              control={
                <Switch
                  name={"module_" + id}
                  defaultChecked={permissions.includes(id)}
                />
              }
              label={name}
            />
          ))}
          <small>
            Pedidos permite crear, aceptar y rechazar solicitudes; Planta
            permite preparar. Catálogo permite administrar productos,
            presentaciones, imágenes y precios. Cartera y análisis son de
            consulta. La gestión de accesos y la confirmación de cobros siguen
            en administración.
          </small>
        </fieldset>
      )}
    </>
  );
}
