# Delipiña

Aplicación React + Node.js independiente del prototipo Sites. Primera base vertical para pruebas; no operar todavía con datos financieros reales.

## Arranque local

Requiere Node **26.13.1 LTS** y npm. React **19.3.1**, dependencias fijadas en `package-lock.json`.

```sh
npm ci
cp .env.example .env
npm run db:local
```

En otra terminal, desde este directorio:

```sh
npm run migrate
npm run seed
npm run dev
```

Abrir http://localhost:3000. Semillas **ficticias**, precios de ejemplo COP 5.000/kg. Los accesos demo existen solo con `NODE_ENV=development` y `DEV_AUTH=true`. El servidor aborta si se activa DEV_AUTH en producción. Google no se simula.

El motor local PGlite ejecuta PostgreSQL embebido y guarda exclusivamente datos de desarrollo en `../work/pglite`. Esta opción evita restricciones de memoria compartida de este entorno. Es de una conexión: detener `npm run dev` antes de migraciones o pruebas para liberar su conexión. **No demuestra concurrencia entre conexiones PostgreSQL reales**. El CI usa PostgreSQL 18 real con pool de 10 conexiones y las mismas pruebas.

Para PostgreSQL nativo o Docker:

```sh
docker run --name delipina-pg -e POSTGRES_PASSWORD=local-only -e POSTGRES_DB=delipina -p 55432:5432 -d postgres:18
```

Cambiar `.env`: `DATABASE_URL=postgresql://postgres:local-only@127.0.0.1:55432/delipina`, `PGLITE_LOCAL=false`. No ejecutar simultáneamente los dos motores en ese puerto.

## Verificación

```sh
npm test
npm run build
```

Las pruebas realizan solicitudes HTTP reales contra Express y SQL real: permisos, proyección de preparación sin precios/pagos/mensajero, aislamiento de cliente, transiciones, reserva concurrente de cupo, toma concurrente, abonos concurrentes, transferencias pendientes y verificación administrativa, idempotencia de pedidos y pagos. El flujo crea datos demo persistentes; usar una base desechable para CI.

## Implementado

- Sesiones opacas en cookie HttpOnly, SameSite y Secure en producción; validación de origen en escrituras.
- Google ID token validado en servidor (audiencia, firma, expiración y correo verificado); vinculación por `sub`. El registro nuevo siempre es cliente sin crédito. Para vincular un usuario precreado por correo, Google debe ser autoridad del correo (`gmail.com` o Workspace `hd`). Correos externos no se vinculan automáticamente a privilegios.
- Cuatro roles con permisos del servidor. No hay selector de privilegios en producción.
- Catálogo por kg decimal o empaque entero. Presentación textual configurable; precios por cliente y todas sus sucursales. El precio y nombre se copian al pedido al enviarlo, sin cambios retroactivos.
- Pedidos cliente pendientes; administración confirma/rechaza. Preparación avanza confirmado → preparando → listo. Tomar pedido no inicia preparación ni recorrido. Asignación y estado separados. Entrega conserva quién entregó y cuándo.
- Rango libre de entrega con horario y anticipación validada en Bogotá. Prioridad básica: pendientes primero y rango de entrega; semáforo según reloj real, **sin ETA de ruta**.
- Crédito reservado al confirmar, cupo compartido; abonos verificados liberan cupo. Sin vencimientos inventados. Cancelar con abonos requiere conciliación, se bloquea para evitar borrar movimientos.
- Factura externa con número y fotografía PNG/JPG opcional hasta 1,5 MB, durable en PostgreSQL; no emisión electrónica. Pago y entrega independientes. Abonos distribuidos, suma exacta y saldo protegido, efectivo/Nequi/Bancolombia. Transferencias verificadas por administración. Cuadre diario registra efectivo esperado/recibido y transferencias verificadas como foto del momento; un cuadre confirmado no se reabre en esta versión.
- Solicitud de cancelación, decisión administrativa y motivo de entrega fallida.
- Historial compartido, filtros combinados, campana con drawer y avisos por destinatario. Socket autenticado avisa invalidaciones y la aplicación recupera estado autorizado del servidor al reconectar.
- Web Push real preparado con VAPID y service worker. Entregas push deduplicadas por notificación/suscripción; reintentos al siguiente evento. No hay garantía de entrega si el servicio Free está dormido ni worker permanente.
- GPS voluntario solo con reparto activo; servidor guarda ubicación redondeada a 0,01° (~1 km). Cliente consulta únicamente su entrega en camino, sin identidad ni paradas ajenas. Señal perdida después de 2 minutos. Al terminar las entregas la UI detiene GPS; datos antiguos no se exponen fuera de un pedido activo.
- Google Maps abre origen/destino reales, sin ruta simulada.
- PWA con caché de aplicación y datos por usuario, cola IndexedDB y claves idempotentes. Solo creación de pedidos se encola offline; cobros, asignaciones y cambios de estado requieren conexión. En modo offline no se garantiza precio/cupo/horario hasta validar en servidor. Logout borra caché y cola local.
- Android/iOS Capacitor generados, adaptador SQLite nativo para la misma caché/cola. **Proyecto preparado, no APK compilado, no app instalada.**

## Producción / Render Free

`render.yaml` define **solo** un web service Free y PostgreSQL Free en Virginia. El servidor sirve frontend y Socket.IO en el mismo origen. La base se migra al iniciar, nunca se siembra en producción. No utiliza disco persistente del servidor para datos de negocio.

Render Free suspende el servidor tras 15 minutos sin tráfico; puede tardar ~1 minuto al despertar. El disco es efímero. PostgreSQL Free **expira a los 30 días**: es almacenamiento temporal para pruebas, no gratis permanente. Exportar con `pg_dump` antes del vencimiento y decidir continuidad. No se ha contratado ningún plan pago.

Configurar exclusivamente en Render → Environment (no en chat ni Git):

- `GOOGLE_CLIENT_ID`: Google Cloud, aplicación web OAuth; habilitar origen HTTPS de Render y el local si procede. Es un identificador público, no requiere client secret con este flujo GIS.
- `BOOTSTRAP_ADMIN_EMAIL`: correo Google del administrador inicial. Ejecutar `npm run bootstrap` **una sola vez** con esa variable y luego retirarla. No convierte automáticamente al primer visitante en administrador.
- `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`. Generar las claves localmente y guardarlas en el gestor de secretos. No incluirlas en logs, capturas o commits.
- `APP_ORIGIN`: opcional en Render (usa `RENDER_EXTERNAL_URL`); local obligatorio.
- `DATABASE_URL`: conexión privada proporcionada por el Blueprint; `DEV_AUTH=false`, `NODE_ENV=production`, `PGLITE_LOCAL=false` o ausente.

El despliegue puede iniciar sin Google, pero queda **cerrado al ingreso** hasta completar OAuth y precrear al administrador.

## Próximos módulos / límites explícitos

- Google Routes/Places embebidos y ETA de tráfico: **no conectados**, sin key ni habilitación de servicio/costo. Solo enlace Maps. No crear un proyecto facturable automáticamente.
- Agrupación óptima de recorridos, tiempos de preparación, salida sugerida y toma atómica de grupos: pendientes; no agrupar solo por municipio ni inventar trayectos.
- Reprogramación desde interfaz, edición de direcciones/catálogo completo, reversión/rechazo de transferencias y reapertura de cuadres: pendientes. No reemplazar movimientos históricos para corregirlos.
- Notificaciones móviles por FCM/APNs y Google OAuth nativo: plugins presentes, configuración/canales nativos pendientes. El login web GIS no debe usarse como login Google embebido de producción en WebView. Abrir con navegador de sistema e implementar retorno OAuth nativo antes de distribuir.
- Interacciones móviles de deslizar para aceptar/revisar rechazo: pendientes; los botones accesibles actuales funcionan. No equivaler abrir a aceptar.
- Cola offline necesita una pantalla completa de edición/resolución de conflictos. En esta base los fallos conservan el borrador y muestran el error; no se descartan silenciosamente.
- Auditoría SQL base; panel de auditoría, paginación y búsqueda del historial por servidor pendientes para escalar.
- Sin pruebas reales de permisos GPS de dispositivo, push en segundo plano, login Google o SQLite de dispositivo hasta disponer de configuración/dispositivo.

## Fuentes verificadas (16 noviembre 2026)

- [Versiones Node](https://nodejs.org/dist/index.json), [React npm](https://registry.npmjs.org/react/latest).
- [Google ID token servidor](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token).
- [Render Free](https://render.com/docs/free).
- [PGlite Socket](https://pglite.dev/docs/pglite-socket).
- [Capacitor SQLite](https://github.com/capacitor-community/sqlite), [Push móvil](https://capacitorjs.com/docs/apis/push-notifications).
