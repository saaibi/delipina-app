import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { Providers, Button, Field } from "./ui";
import { LocationPicker } from "./location-picker";
import { SettingsView } from "./settings";
import "./style.css";
function Preview() {
  const [address, A] = useState("Cl. 43 #26-106, Poblado"),
    [city, C] = useState("Girón"),
    [point, P] = useState(null),
    [origin, O] = useState("Plaza de San Francisco"),
    [originPoint, OP] = useState(null);
  return (
    <Providers>
      <main style={{ maxWidth: 850, margin: "auto", padding: 24 }}>
        <p className="banner">
          Revisión local · Sin pedidos ni cambios en la base publicada
        </p>
        <h1>Google Maps · Sucursales y origen</h1>
        <section className="panel">
          <h2>Sucursal de prueba</h2>
          <Field
            label="Ciudad"
            value={city}
            onChange={(e) => {
              C(e.target.value);
              P(null);
            }}
          />
          <Field
            label="Dirección"
            value={address}
            onChange={(e) => {
              A(e.target.value);
              P(null);
            }}
          />
          <LocationPicker
            address={address}
            city={city}
            point={point}
            onChange={P}
          />
          <div className="actions">
            <Button className="neutral" onClick={() => P(null)}>
              Quitar ubicación
            </Button>
            <Button onClick={() => P(null)}>Eliminar sucursal de prueba</Button>
          </div>
        </section>
        <section className="panel">
          <h2>Origen del reparto</h2>
          <Field
            label="Origen del reparto"
            value={origin}
            onChange={(e) => {
              O(e.target.value);
              OP(null);
            }}
          />
          <LocationPicker
            address={origin}
            city="Bucaramanga"
            point={originPoint}
            onChange={OP}
          />
        </section>
        <SettingsView
          user={{ role: "preparation", id: "local-preview" }}
          push={{
            available: false,
            enabled: false,
            status: "Vista previa: no se cambia el permiso de notificaciones",
          }}
          products={[]}
          users={[]}
          branches={[]}
        />
      </main>
    </Providers>
  );
}
createRoot(document.getElementById("root")!).render(<Preview />);
