# Contrato HTTP v1 · NestJS

Mismo origen. Cookie `session` HttpOnly. Escrituras requieren `Origin=APP_ORIGIN`. JSON, importes enteros en centavos COP, fechas ISO con zona y cantidades hasta 3 decimales. IDs UUID. Errores `{error:string}`: 401 sin sesión, 403 sin permisos/origen, 404 fuera de alcance, 409 conflicto/cupo/estado, 400 entrada inválida. Nunca confiar en el rol del navegador.

| Ruta                                                 | Rol / contrato                                                                                                                                                                                             |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET /api/config                                      | Público; solo client ID público, VAPID público y bandera demo                                                                                                                                              |
| POST /api/auth/google                                | `{credential}` ID token Google → cookie y usuario seguro                                                                                                                                                   |
| POST /api/auth/dev                                   | Solo local explícito; `{email}` demo                                                                                                                                                                       |
| GET /api/me; POST /api/logout                        | Sesión actual / revocación                                                                                                                                                                                 |
| GET /api/products                                    | Autenticados; precio especial para cliente actual                                                                                                                                                          |
| POST /api/products; PATCH /api/products/:id          | Admin; nombre, presentación, unidad kg/pack, precio, disponibilidad                                                                                                                                        |
| GET, POST /api/users                                 | Admin; crear rol explícito, email y cupo (0 por defecto)                                                                                                                                                   |
| PATCH /api/users/:id                                 | Admin; cupo y activo, sin reducir bajo saldo reservado                                                                                                                                                     |
| PUT /api/prices                                      | Admin `{clientId,productId,price}`                                                                                                                                                                         |
| DELETE /api/users/:id                                | Admin; eliminación lógica y revocación de sesiones, sin borrar historial                                                                                                                                   |
| GET, POST /api/branches                              | Admin o cliente propietario; `{clientId?,address,city}`                                                                                                                                                    |
| GET, PUT /api/settings                               | Lectura autenticada, escritura admin; `{origin,open,close,leadHours}`                                                                                                                                      |
| GET /api/orders                                      | Proyección por rol y propiedad; preparación excluye precios/datos financieros/asignación                                                                                                                   |
| POST /api/orders                                     | Admin/cliente; cabecera Idempotency-Key obligatoria; `{clientId?,branchId,start,end,credit,notes,items:[{productId,quantity}]}`                                                                            |
| POST /api/orders/:id/action                          | `{action,reason?,courierId?}`: confirm/reject admin, prepare/ready preparación, take courier, assign admin, depart/deliver asignado, request_cancel propietario, cancel/deny_cancel admin, failed asignado |
| GET /api/invoices                                    | Admin/mensajero o cliente propietario                                                                                                                                                                      |
| PATCH /api/invoices/:id                              | Admin; número externo y URL opcional                                                                                                                                                                       |
| POST /api/invoices/:id/photo                         | Admin; `{data}` base64 PNG/JPG <=1,5 MB                                                                                                                                                                    |
| GET /api/invoices/:id/photo                          | Autenticado y autorizado, sin caché público                                                                                                                                                                |
| POST /api/payments                                   | Admin/courier; Idempotency-Key; `{clientId,method,amount,allocations:[{invoiceId,amount}]}`; noncash no reduce saldo hasta verificación                                                                    |
| GET /api/payments                                    | Admin todos; courier propios                                                                                                                                                                               |
| POST /api/payments/:id/verify                        | Admin; verificación idempotente                                                                                                                                                                            |
| GET /api/settlements                                 | Admin todos; courier propios                                                                                                                                                                               |
| POST /api/settlements                                | Courier `{day,receivedCash}` envía; admin `{courierId,day,confirm:true}` confirma; único por día y mensajero                                                                                                                                            |
| GET /api/notifications; POST /api/notifications/read | Solo usuario actual                                                                                                                                                                                        |
| POST /api/push                                       | Suscripción Web Push del usuario actual; proveedor HTTPS permitido                                                                                                                                         |
| POST, DELETE /api/location                           | Courier con reparto activo; `{lat,lng}`, redondeado en servidor                                                                                                                                            |
| GET /api/orders/:id/tracking                         | Propietario/admin/asignado; solo estado activo, zona, actualización y señal; sin identidad del courier                                                                                                     |
| GET /api/health                                      | Público; comprueba SQL                                                                                                                                                                                     |

Socket.IO exige la misma sesión. Evento `refresh` sin datos privados; consulta HTTP autorizada para recuperar el estado. No se aceptan modificaciones por socket.

Idempotencia: clave y hash de solicitud por usuario persistidos en la misma transacción; mismo cuerpo devuelve el mismo resultado, cuerpo distinto con misma clave da 409. Falla antes de commit no consume clave. El servidor recalcula los precios a partir del catálogo, nunca acepta un total enviado por cliente.

Jornadas: GET `/api/business-day` devuelve día de Colombia y estado operativo; GET `/api/business-days` lista cierres administrativos; POST `/api/business-day/close` recibe `{day}` y exige administración, pedidos resueltos y transferencias verificadas. No reinicia la cartera. Pedidos futuros se conservan.


Ampliación de operación:

| Ruta | Contrato |
| --- | --- |
| GET /api/product-groups; GET /api/product-groups/:id | Admin; grupos de producto y variantes |
| POST /api/product-groups; PUT /api/product-groups/:id | Admin; `{name,active?,presentations:[{label,image?,units:[{id?,unit,price}]}]}`; atómico, variantes omitidas se desactivan |
| PATCH /api/product-groups/:id | Admin; disponibilidad del producto |
| GET, POST /api/client-members; PATCH /api/client-members/:id | Titular cliente o admin; `{clientId? ,name,email,canViewPortfolio?}`; edición de nombre, activo y cartera. El cliente titular se obtiene de sesión; no acepta reasociar un usuario existente |
| GET /api/schedules | Cliente y gestores del mismo cliente; admin todos; personalizado con Pedidos solo propias |
| PATCH /api/schedules/:id | Titular/admin/creador autorizado; `{active?,frequency?,intervalDays?,weekdays?,endDay?,nextDay?,startTime?,endTime?,items?}` |
| GET /api/settlement-days | Admin o courier propio; días con actividad y estado de envío/confirmación |
| GET /api/audit?page=0&pageSize=25&q= | Admin o personalizado autorizado; `{rows,total,page,pageSize}`, máximo 100 por página |
| GET /api/business-days?page=0&pageSize=25 | Admin o personalizado autorizado; paginado, recepción y cierre contable separados |

POST `/api/orders` acepta `paymentMethod:cash|online|credit` y `recurrence:{enabled,frequency:days|weekly,intervalDays,weekdays,endDay?}`. Cliente y gestores comparten cuenta, sucursales y precios; sin permiso de Cartera no acceden a sus rutas. El servidor ajusta al siguiente día habilitado si venció cierre menos anticipación. Las repeticiones usan clave de idempotencia por regla y fecha y generan pedidos pendientes, no pagos.

Rol `custom`: `permissions:[orders,plant,portfolio,analytics,audit,days]` con lista explícita de módulos; por defecto Pedidos y Planta. El servidor comprueba cada operación y revoca sesiones al cambiar permisos. El mensajero solo consulta y abona facturas de sus pedidos. No hay efectivo fuera de Bucaramanga, Girón, Floridablanca y Piedecuesta.

El cierre contable exige todos los cuadres confirmados, entregas resueltas y transferencias verificadas. La hora de cierre solo termina la recepción. Pasarela pendiente de cuenta de comercio: no existe endpoint que simule aprobación de un proveedor.
