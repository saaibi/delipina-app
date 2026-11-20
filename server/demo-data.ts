import { randomUUID } from "node:crypto";
import { tx, fail } from "./db.js";
import { validateDeliveryWindow, businessDate } from "./business-day.js";
export async function createDemoData(
  actor: any,
  email: string,
  courierId?: string,
) {
  return tx(async (c) => {
    const client = (
      await c.query(
        "SELECT * FROM users WHERE lower(email)=$1 AND role='client' AND active FOR UPDATE",
        [email.trim().toLowerCase()],
      )
    ).rows[0];
    if (!client)
      fail(
        400,
        "Primero registra este correo como cliente activo. No se cambiará el rol de un usuario existente.",
      );
    const existing = (
      await c.query("SELECT * FROM demo_batches WHERE client_id=$1", [
        client.id,
      ])
    ).rows[0];
    if (existing) return { ...existing, existing: true };
    if (
      courierId &&
      !(
        await c.query(
          "SELECT id FROM users WHERE id=$1 AND role='courier' AND active",
          [courierId],
        )
      ).rowCount
    )
      fail(400, "Mensajero inválido");
    const product = (
      await c.query(
        "SELECT p.*,g.name product_name FROM products p JOIN catalog_products g ON g.id=p.catalog_product_id WHERE p.active AND g.active AND p.unit='kg' ORDER BY p.name LIMIT 1",
      )
    ).rows[0];
    if (!product) fail(409, "Agrega un producto disponible");
    const batch = randomUUID(),
      branches: string[] = [],
      orders: string[] = [],
      day = await businessDate(c);
    const window = await validateDeliveryWindow(
      c,
      day + "T06:00:00-05:00",
      day + "T07:00:00-05:00",
      true,
    );
    await c.query(
      "INSERT INTO demo_batches(id,client_id,created_by) VALUES($1,$2,$3)",
      [batch, client.id, actor.id],
    );
    // Direcciones de referencia públicas, ficticias como sucursales comerciales.
    const places = [
      ["Carrera 7 # 10-25", "Piedecuesta"],
      ["Calle 6 # 6-20", "Piedecuesta"],
      ["Calle 5 # 8-18", "Floridablanca"],
      ["Carrera 26 # 36-14, Cañaveral", "Floridablanca"],
      ["Carrera 25 # 30-15", "Girón"],
      ["Calle 30 # 26-20", "Girón"],
      ["Carrera 15 # 32-18", "Bucaramanga"],
      ["Calle 45 # 33-12, Cabecera", "Bucaramanga"],
      ["Carrera 7 # 12-20", "Bogotá"],
    ];
    for (const [i, [address, city]] of places.entries()) {
      const branch = randomUUID(),
        order = randomUUID(),
        quantity = (i % 3) + 1,
        total = Number(product.price) * quantity;
      await c.query(
        "INSERT INTO branches(id,client_id,address,city) VALUES($1,$2,$3,$4)",
        [branch, client.id, "[DEMO] " + address, city],
      );
      const point = {
        Piedecuesta: [6.9871, -73.0495],
        Floridablanca: [7.0628, -73.086],
        Girón: [7.0732, -73.1681],
        Bucaramanga: [7.1193, -73.1227],
        Bogotá: [4.5981, -74.076],
      }[city];
      await c.query(
        "UPDATE branches SET lat=$2,lng=$3,location_source='demo' WHERE id=$1",
        [branch, point[0] + (i % 2 ? 0.003 : 0), point[1]],
      );
      branches.push(branch);
      await c.query(
        "INSERT INTO orders(id,client_id,branch_id,status,courier_id,window_start,window_end,total,credit,notes,operation_day,payment_method,demo_batch_id) VALUES($1,$2,$3,'ready',$4,$5,$6,$7,false,$8,$9,$10,$11)",
        [
          order,
          client.id,
          branch,
          courierId || null,
          window.start,
          window.end,
          total,
          "[DEMO RUTAS] Prueba sin factura, crédito ni cobro real. " +
            (city === "Bogotá"
              ? "Fuera del área metropolitana: sin efectivo."
              : ""),
          window.day,
          city === "Bogotá" ? "online" : "cash",
          batch,
        ],
      );
      await c.query(
        "INSERT INTO items(order_id,product_id,name,quantity,price) VALUES($1,$2,$3,$4,$5)",
        [
          order,
          product.id,
          product.product_name + " · " + product.presentation + " (kg)",
          quantity,
          product.price,
        ],
      );
      orders.push(order);
      await c.query(
        "INSERT INTO audit(actor_id,order_id,action,next_status) VALUES($1,$2,'demo-created','ready')",
        [actor.id, order],
      );
    }
    return (
      await c.query(
        "UPDATE demo_batches SET branch_ids=$2,order_ids=$3 WHERE id=$1 RETURNING *",
        [batch, branches, orders],
      )
    ).rows[0];
  });
}
