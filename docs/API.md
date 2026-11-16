# Contrato HTTP v1

Mismo origen. Cookie `session` HttpOnly. Escrituras requieren `Origin=APP_ORIGIN`. JSON, importes enteros en centavos COP, fechas ISO con zona y cantidades hasta 3 decimales. IDs UUID. Errores `{error:string}`: 401 sin sesión, 403 sin permisos/origen, 404 fuera de alcance, 409 conflicto/cupo/estado, 400 entrada inválida. Nunca confiar en el rol del navegador.

| Ruta | Rol / contrato |
|---|---|
| GET /api/config | Público; solo client ID público, VAPID público y bandera demo |
| POST /api/auth/google | `{credential}` ID token Google → cookie y usuario seguro |
| POST /api/auth/dev | Solo local explícito; `{email}` demo |
| GET /api/me; POST /api/logout | Sesión actual / revocación |
| GET /api/products | Autenticados; precio especial para cliente actual |
| POST /api/products; PATCH /api/products/:id | Admin; nombre, presentación, unidad kg/pack, precio, disponibilidad |
| GET, POST /api/users | Admin; crear rol explícito, email y cupo (0 por defecto) |
| PATCH /api/users/:id | Admin; cupo y activo, sin reducir bajo saldo reservado |
| PUT /api/prices | Admin `{clientId,productId,price}` |
| GET, POST /api/branches | Admin o cliente propietario; `{clientId?,address,city}` |
| GET, PUT /api/settings | Lectura autenticada, escritura admin; `{origin,open,close,leadHours}` |
| GET /api/orders | Proyección por rol y propiedad; preparación excluye precios/datos financieros/asignación |
| POST /api/orders | Admin/cliente; cabecera Idempotency-Key obligatoria; `{clientId?,branchId,start,end,credit,notes,items:[{productId,quantity}]}` |
| POST /api/orders/:id/action | `{action,reason?,courierId?}`: confirm/reject admin, prepare/ready preparación, take courier, assign admin, depart/deliver asignado, request_cancel propietario, cancel/deny_cancel admin, failed asignado |
| GET /api/invoices | Admin/mensajero o cliente propietario |
| PATCH /api/invoices/:id | Admin; número externo y URL opcional |
| POST /api/invoices/:id/photo | Admin; `{data}` base64 PNG/JPG <=1,5 MB |
| GET /api/invoices/:id/photo | Autenticado y autorizado, sin caché público |
| POST /api/payments | Admin/courier; Idempotency-Key; `{clientId,method,amount,allocations:[{invoiceId,amount}]}`; noncash no reduce saldo hasta verificación |
| GET /api/payments | Admin todos; courier propios |
| POST /api/payments/:id/verify | Admin; verificación idempotente |
| GET /api/settlements | Admin todos; courier propios |
| POST /api/settlements | Admin `{courierId,day,receivedCash}`; único por día y mensajero |
| GET /api/notifications; POST /api/notifications/read | Solo usuario actual |
| POST /api/push | Suscripción Web Push del usuario actual; proveedor HTTPS permitido |
| POST, DELETE /api/location | Courier con reparto activo; `{lat,lng}`, redondeado en servidor |
| GET /api/orders/:id/tracking | Propietario/admin/asignado; solo estado activo, zona, actualización y señal; sin identidad del courier |
| GET /api/health | Público; comprueba SQL |

Socket.IO exige la misma sesión. Evento `refresh` sin datos privados; consulta HTTP autorizada para recuperar el estado. No se aceptan modificaciones por socket.

Idempotencia: clave y hash de solicitud por usuario persistidos en la misma transacción; mismo cuerpo devuelve el mismo resultado, cuerpo distinto con misma clave da 409. Falla antes de commit no consume clave. El servidor recalcula los precios a partir del catálogo, nunca acepta un total enviado por cliente.
