# Google Maps: configuración y validación

El propietario autorizó la publicación de Maps y Places. Las credenciales se configuran fuera del repositorio. Routes permanece desactivado hasta revisar su consumo por elementos de matriz.

## Revisión

Detener el servidor local anterior y ejecutar `npm run preview:maps`. Solo se usa localhost:3007, con `strictPort`; no se abre otro puerto automáticamente. Abrir http://localhost:3007/maps-preview.html.

La página utiliza los componentes reales de ubicación y Ajustes con datos de ejemplo; no conecta una base ni modifica datos publicados. La búsqueda real necesita `VITE_GOOGLE_MAPS_BROWSER_KEY` en `client/.env.local` (ignorado por Git). No introducir claves por chat. Sin clave se muestra el estado pendiente, sin simular resultados.

## Configuración pendiente

Proyecto de mapas: delipina-maps-2026, creado por el propietario con saaibiflorez@unac.edu.co. Firebase y Google Login continúan en delipina-app-2026. Maps JavaScript y Places API (New) están habilitadas. Routes no está habilitado. Cuotas configuradas: mapas 100 cargas/día, Autocomplete 300/día y GetPlace 100/día.

- `GOOGLE_MAPS_BROWSER_KEY`: clave pública restringida para Maps JavaScript API y Places API (New). Configurar referencias HTTPS del dominio publicado y localhost:3007 para la revisión. Validar por separado las restricciones para la WebView de Capacitor antes de entregar un APK.
- `GOOGLE_MAPS_SERVER_KEY`: secreto de servidor para Places API (New) y, si se habilita cálculo vial, Routes API. Restringir APIs y salida del servidor donde sea compatible; nunca versionar.
- `GOOGLE_ROUTES_ENABLED=true`: activa expresamente el cálculo vial; mantenerlo sin activar hasta revisar la cuota de elementos de matriz. La búsqueda de sucursales puede funcionar con Places sin habilitar Routes.
- Configurar cuotas y alertas antes de activar llamadas reales. Las alertas no bloquean cobros. Los cupos se comparten entre proyectos de la misma cuenta de facturación.
- Publicar y revisar políticas de privacidad y términos requeridos por Google antes de producción. La app debe conservar las atribuciones del proveedor.

Places, Maps JavaScript y Routes son consumos diferentes. Una matriz de 6 puntos genera hasta 36 elementos, no una sola unidad facturable. No extrapolar el costo de 300 sucursales a todos los recorridos y mapas.

## Comportamiento

- Buscar explícitamente al terminar dirección y ciudad. Autocomplete limitado a Colombia; el municipio forma parte de la consulta. Los resultados no garantizan la entrada exacta: el usuario confirma el punto.
- Solo se solicitan ID y ubicación al seleccionar, con sesión de Autocomplete. Sin coordenadas visibles. Origen y sucursales utilizan el mismo selector.
- Los mapas de sucursales, recorridos y seguimiento usan Google. Actualizar el GPS actualiza marcadores en un mapa existente.
- Agrupación mantiene como máximo cinco pedidos. Routes calcula matriz y trazado; si falla o falta clave se conserva agrupación aproximada con su aviso, sin inventar tiempo vial.
- Coordenadas obtenidas en Google se conservan hasta 29 días; guardar un formulario sin nueva consulta no prolonga el vencimiento. Place ID se conserva. Se retiran coordenadas vencidas de sucursales, copias de pedidos y snapshots de recorridos afectados. Se intenta renovar ubicaciones con Place ID mediante Places cuando hay actividad, sin consulta por cada pedido y con espera de un día si falla. Puntos marcados sin Place ID requieren reconfirmación al vencer.
- General reúne tamaño del texto y notificaciones. Acciones Quitar/Eliminar/Borrar se presentan en color de error.

## Límites de validación

Las pruebas automatizadas verifican permisos, metadatos, vencimiento, idempotencia y tratamiento de matrices incompletas/no transitables. Una prueba con respuestas simuladas o parsers no acredita precisión de Google, configuración de credenciales ni GPS en segundo plano. Falta comprobar la dirección de Girón, el origen, el trazado real y la WebView Android usando las credenciales restringidas.
