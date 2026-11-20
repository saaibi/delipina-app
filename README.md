# Delipiña

Aplicación TypeScript con React + NestJS sobre Node.js independiente del prototipo Sites. Primera base vertical para pruebas; no operar todavía con datos financieros reales.

## Arranque local

Requiere Node **26.13.1 LTS** y npm. React **19.3.1**, NestJS **12.5.1**, Material UI **9.5.0**, MUI X Date Pickers **9.18.0** (gratuitos), TypeScript **7.0.2**; dependencias fijadas en `package-lock.json`.

```sh
npm ci
npm run dev
```

Abrir http://localhost:3007. Este acceso redirige a https://delipina-app-z9br.onrender.com: inicio de sesión, API y datos usan exclusivamente el servidor y la base publicados. No levanta una base local ni ofrece recarga de cambios de código; estos requieren compilar y publicar.

Las pruebas usan una base efímera independiente, destruida al terminar. No ejecutar migraciones, semillas ni pruebas con credenciales de producción.

## Verificación

```sh
npm run test:local  # Base PostgreSQL embebida efímera, sin alterar datos de desarrollo
npm test            # Contra DATABASE_URL explícita (usar base de pruebas)
npm run typecheck
npm run build
```

Las pruebas realizan solicitudes HTTP reales contra NestJS y SQL real: permisos, proyección de preparación sin precios/pagos/mensajero, aislamiento de cliente, transiciones, reserva concurrente de cupo, toma concurrente, abonos concurrentes, transferencias pendientes y verificación administrativa, idempotencia de pedidos y pagos. El flujo crea datos demo persistentes; usar una base desechable para CI.

## Arquitectura

`server/modules/` contiene módulos y controladores NestJS de autenticación, catálogo, clientes, pedidos, pagos, notificaciones y configuración. `server/domain.ts` conserva reglas compartidas y `db.ts` las transacciones. `client/*.tsx` y `client/*.ts` son fuentes TypeScript; `client/sw.ts` se compila y su precaché se completa con los assets de producción. `shared/contracts.ts` contiene contratos de dominio. Los proyectos nativos generan código Java/Swift de Capacitor; la aplicación compartida permanece en TypeScript.

La UI usa ThemeProvider, botones, campos, Dialog, Drawer, AppBar, navegación, selectores MUI y MUI X. Barra lateral web por rol, navegación móvil con iconos/etiquetas y SpeedDial accesible. Administración tiene cuatro módulos en una línea: Pedidos, Ventas, Cobros y Ajustes. Usuarios y Catálogo están dentro de Ajustes. Los usuarios se editan, eliminan de forma lógica y restauran, conservando sus movimientos; no se permite perder el último administrador ni retirar un usuario con pedidos activos. Los listados tienen búsqueda, estados y paginación. Crear pedido aparece solo en Pedidos y en el SpeedDial, que puede arrastrarse y restablecer su posición. Todos los campos de texto y selectores usan el estilo outlined de MUI. Todos los perfiles tienen Ajustes para sus notificaciones. Si el permiso push está concedido, la suscripción se activa al entrar; si falta permiso, se muestra la solicitud y se conserva el control en Ajustes. Una desactivación elegida por el usuario se respeta, y un permiso denegado no genera solicitudes repetidas. Si faltan claves del servidor se informa allí sin solicitar un permiso inútil. No se usan paquetes Pro/Premium ni claves de licencia.

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
- Selección visual de presentaciones con las fotos proporcionadas por el usuario (recorte CSS, sin redibujar los productos), cantidades directas y referencia visual configurable en catálogo.
- Jornadas por fecha de Colombia con horarios por día y anticipación por día de entrega en Ajustes. El horario cierra la recepción; el cierre contable espera entregas resueltas, transferencias verificadas y todos los cuadres enviados por mensajero y confirmados por administración. Render Free puede dormir: los procesos se retoman al despertar o recibir una consulta.
- Pedidos y ventas unificados, tarjetas compactas con detalle en modal y vista de todos los aceptados. Cartera por cliente con abonos generales y distribución automática a facturas antiguas; transferencias pendientes reservan saldo.
- Productos genéricos con imágenes propias guardadas en PostgreSQL; usuarios y catálogo son secciones de Ajustes. Análisis con Google Charts y datos reales.
- Un aviso por pedido y destinatario, actualizado por estado; lectura por revisión al abrir y contador en Pedidos. Push web usa la misma etiqueta y abre el pedido. Deslizar hacia abajo al inicio actualiza datos; doble toque en el módulo vuelve arriba.

## Producción / Render Free

`render.yaml` define **solo** un web service Free en Virginia y referencia la base existente `playita-db`, sin administrarla ni cambiar su configuración. Toda la aplicación usa el schema exclusivo `delipina`, sin `public` en su search_path. Las migraciones se ejecutan dentro de una transacción, con bloqueo y auditoría de la estructura externa antes/después. El pool limita Delipiña a tres conexiones. Se comparten capacidad y vencimiento físico con Playita. El servidor sirve frontend y Socket.IO en el mismo origen. La base se migra al iniciar, nunca se siembra en producción. No utiliza disco persistente del servidor para datos de negocio.

Render Free suspende el servidor tras 15 minutos sin tráfico; puede tardar ~1 minuto al despertar. El disco es efímero. La instancia compartida Free **vence el 9 de diciembre de 2026** (no se reinicia su plazo al agregar el schema): es almacenamiento temporal para pruebas, no gratis permanente. Exportar con `pg_dump` antes del vencimiento y decidir continuidad. No se ha contratado ningún plan pago.

Configurar exclusivamente en Render → Environment (no en chat ni Git):

- `GOOGLE_CLIENT_ID`: Google Cloud, aplicación web OAuth; habilitar origen HTTPS de Render y el local si procede. Es un identificador público, no requiere client secret con este flujo GIS.
- `BOOTSTRAP_ADMIN_EMAIL`: correo Google del administrador inicial. Redesplegar con esa variable: el arranque precrea el administrador únicamente si no existe ninguno. Luego retirarla. También existe `npm run bootstrap` para entornos con ejecución de comandos. No convierte automáticamente al primer visitante en administrador.
- `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`. Generar las claves localmente y guardarlas en el gestor de secretos. No incluirlas en logs, capturas o commits.
- `APP_ORIGIN`: opcional en Render (usa `RENDER_EXTERNAL_URL`); local obligatorio.
- `DATABASE_URL`: conexión privada de `playita-db` referenciada por el Blueprint; `DATABASE_SCHEMA=delipina`, `PG_POOL_MAX=3`; `DEV_AUTH=false`, `NODE_ENV=production`, `PGLITE_LOCAL=false` o ausente.

Si se instala en otro entorno, el despliegue puede iniciar sin Google pero queda cerrado al ingreso hasta completar OAuth y precrear al administrador. En el servicio actual, OAuth web ya está conectado y se verificó el acceso del administrador inicial.

## Próximos módulos / límites explícitos

- Google Routes/Places embebidos y ETA de tráfico: **no conectados**, sin key ni habilitación de servicio/costo. Solo enlace Maps. No crear un proyecto facturable automáticamente.
- Recorridos de hasta cinco pedidos: agrupación geográfica y orden vial por grupo; solicitud del mensajero y aprobación administrativa. No se calcula tráfico ni ETA.
- Edición de direcciones, reversión/rechazo de transferencias y reapertura de cuadres: pendientes. No reemplazar movimientos históricos para corregirlos.
- Notificaciones móviles por FCM/APNs y Google OAuth nativo: plugins presentes, configuración/canales nativos pendientes. El login web GIS no debe usarse como login Google embebido de producción en WebView. Abrir con navegador de sistema e implementar retorno OAuth nativo antes de distribuir.
- Interacciones móviles de deslizar para aceptar/revisar rechazo: pendientes; los botones accesibles actuales funcionan. No equivaler abrir a aceptar.
- Cola offline necesita una pantalla completa de edición/resolución de conflictos. En esta base los fallos conservan el borrador y muestran el error; no se descartan silenciosamente.
- Auditoría SQL base; panel de auditoría, paginación y búsqueda del historial por servidor pendientes para escalar.
- Login Google web real verificado con el administrador inicial. Sin pruebas reales de permisos GPS de dispositivo, push en segundo plano ni SQLite de dispositivo hasta disponer de configuración/dispositivo. Las claves Web Push y el cliente OAuth web están guardados en Render; los canales móviles siguen pendientes.

## Fuentes verificadas (16 noviembre 2026)

- [Versiones Node](https://nodejs.org/dist/index.json), [React npm](https://registry.npmjs.org/react/latest).
- [Google ID token servidor](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token).
- [Render Free](https://render.com/docs/free).
- [PGlite Socket](https://pglite.dev/docs/pglite-socket).
- [Capacitor SQLite](https://github.com/capacitor-community/sqlite), [Push móvil](https://capacitorjs.com/docs/apis/push-notifications).

## Resultado de publicación y compilaciones (19 noviembre 2026)

Repositorio **privado**: https://github.com/saaibi/delipina-app .

Render confirmó el espacio `Saaibi Yesid's workspace`. Una segunda base Free fue rechazada por el límite de una instancia gratuita. El usuario autorizó usar **un schema específico `delipina` dentro de `playita-db`**, preservando el schema de Playita. El Blueprint solo crea el web service Free y referencia la conexión privada existente; no declara ni modifica la instancia de base de datos. No se cambia el allowlist y no se habilita acceso externo. El resultado efectivo del despliegue se registra en `outputs/validacion-delipina.md` del chat y en el Dashboard, URL del servicio: https://delipina-app-z9br.onrender.com . Google OAuth web ya está configurado en el proyecto independiente `delipina-app-2026`, cliente `Delipiña Web`, con orígenes del servicio y `http://localhost:3000`. `GOOGLE_CLIENT_ID` está en Render y `DEV_AUTH=false`. El flujo GIS solo solicita identidad básica (openid/email/profile); no usa client secret. Google conserva estado Prueba; su excepción para identidad básica permite usuarios fuera de la lista de prueba (https://support.google.com/cloud/answer/15549945?hl=en). No se habilitó facturación.

Capacitor `add` y `sync` completados para Android/iOS. `assembleDebug` llegó a Gradle y falló porque **no existe Android SDK configurado** (`SDK location not found`). `xcodebuild` falló porque **la licencia de Xcode está sin aceptar**. No hay APK, IPA ni app instalada. Se conserva el proyecto y los comandos para continuar después de que el propietario instale/configure SDK y acepte las licencias correspondientes.

```sh
npm run build
npx cap sync
# Android (ANDROID_HOME debe apuntar a SDK 36 instalado):
cd android && ./gradlew assembleDebug
# iOS, después de aceptar la licencia Xcode y habilitar el SDK:
xcodebuild -project ios/App/App.xcodeproj -scheme App -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO build
```

Las apps nativas necesitan URL de API/CORS, OAuth de navegador de sistema, FCM/APNs y configuración de firma para distribución. Estos pasos no están conectados y no se afirma que el contenedor móvil sea una app productiva terminada.

## Actualización de operación (19 noviembre 2026)

Lema: «Piña lista para tu negocio». Subtítulo: «Calidad, frescura y diferentes presentaciones para tu operación comercial».

Usuarios y acceso separa dos tablas: usuarios internos y clientes. Planta conserva el identificador técnico anterior para no romper cuentas existentes. El nuevo administrador de planta puede consultar clientes activos (sin correos/cupos), sucursales y precios, crear pedidos pendientes de revisión, y avanzar la preparación. No administra usuarios, catálogo, cupos, cartera ni confirma pedidos.

El catálogo admite kilo, libra (500 g), arroba colombiana (25 libras / 12,5 kg) y empaque, cada combinación con precio independiente. La migración 010 agrega piña en cuatro presentaciones, panela y azúcar con precios ficticios explícitamente autorizados por el usuario; no modifica precios existentes. En pedidos, cada presentación se muestra en una sola tarjeta con selector de medida y cantidad; cambiar de medida conserva cantidades ya elegidas.

Los precios especiales se editan desde el catálogo de un cliente, con búsqueda, precio general como referencia y guardado conjunto transaccional. Campo vacío restaura precio general. Los pedidos previos conservan sus importes. La tabla de clientes muestra cupo total, utilizado y saldo por cobrar, con acciones de edición y precios.

Cada día del horario tiene su propia anticipación. Los valores anteriores se usan como respaldo hasta guardar la configuración semanal. La notificación tiene cierre en la esquina superior derecha. Firebase/FCM y APNs todavía no están configurados: la web usa Web Push/VAPID y la bandeja interna.


### Operación y accesos ampliados
- Rol Personalizado con módulos seleccionables (Pedidos y Planta por defecto). Los permisos se verifican en servidor y sus cambios revocan sesiones.
- Usuarios gestores asociados a un cliente: el titular puede agregar y desactivar accesos y habilitar consulta de Cartera. Comparten sucursales, pedidos y precios del cliente; no se envían invitaciones automáticas.
- Catálogo agrupado por producto con múltiples presentaciones, imagen por presentación y precios independientes por kilo, libra, arroba colombiana y empaque. Las ediciones conservan los pedidos históricos.
- La fecha del pedido de cliente se ajusta al siguiente día habilitado cuando pasa el cierre menos la anticipación de ese día.
- Frecuencias diarias, por intervalo o días de la semana, editables y pausables. Cada repetición crea un pedido pendiente con disponibilidad y precios vigentes; una clave única evita duplicados. En Render Free se procesan mientras el servicio está despierto y al reactivarse; las fechas vencidas se omiten con motivo visible.
- Entregas reúne pedidos propios y disponibles. La Cartera del mensajero y sus abonos solo incluyen pedidos asignados a él.
- El mensajero envía el cuadre y administración confirma. La jornada conserva actividad recibida después del horario hasta completar el cierre contable; no se puede desactivar un mensajero con cuadre pendiente.
- Análisis abre en 1 Año y permite períodos editables o rango. Trazabilidad y jornadas usan paginación en servidor.
- Pagos en línea: pendiente crear cuenta de comercio y configurar credenciales y confirmaciones del proveedor. No se habilita un cobro real ni se aprueba un pago sin verificación. Fuera del área metropolitana no se ofrece efectivo.
- Maps: enlaces de ruta y ubicación GPS aproximada; no se han habilitado APIs de rutas con facturación ni estimaciones de llegada.


### Rutas y vista previa
`npm run dev` mantiene el único acceso local en http://localhost:3007 y abre la aplicación publicada. Cierra el proceso con Ctrl+C.

Entregas agrupa automáticamente hasta cinco pedidos listos o en preparación. El mensajero solicita los grupos disponibles y administración aprueba su asignación. Puede ajustar los pedidos antes de salir; iniciar el recorrido exige que todos estén listos y los marca En camino en una transacción. Después de iniciar, el recorrido queda fijo. «Ver mapa» abre directamente la aplicación de mapas para el recorrido; cada parada y pedido también tiene acceso individual. Se incluyen todas las paradas en el enlace. Google Maps admite hasta tres paradas intermedias en navegador móvil y hasta nueve en otros entornos; para cinco entregas conviene abrir la aplicación o utilizar el acceso de cada parada.

El seguimiento muestra OpenStreetMap mediante su visor embebido, con atribución incluida y GPS aproximado obtenido de la aplicación. No usa Google Maps de pago, no conserva un historial de recorrido ni calcula ETA. La app debe mantenerse activa y con permiso de ubicación; los teléfonos pueden suspender el GPS en segundo plano. La disponibilidad del visor público es de mejor esfuerzo.

La herramienta administrativa de datos demo (sección de Ajustes retirada) crea un lote idempotente para un cliente existente: nueve sucursales y pedidos claramente marcados. No envía notificaciones, genera facturas ni reservas de crédito; queda fuera de análisis y cierre contable. Los identificadores se guardan en `demo_batches` para su futura limpieza específica. El destino fuera de zona usa pago online. No ejecuta cobros.

Favicon, Apple Touch Icon, iconos PWA y lanzadores iOS/Android usan el logo existente con márgenes para evitar recortes. La sincronización Capacitor no equivale a un binario firmado.

### Recorridos automáticos (reemplaza armado manual)
Entregas muestra automáticamente grupos de máximo cinco pedidos asignados y listos/en preparación de la jornada. Agrupa por cercanía, mantiene ciudades externas separadas y usa OSRM/FOSSGIS para minimizar el tiempo vial dentro de cada grupo. Las sucursales se ubican al crearlas o editarlas, con búsqueda de dirección o selección del punto; el origen tiene coordenadas editables. La búsqueda explícita utiliza Photon; el mapa usa Leaflet y teselas OpenStreetMap. No se habilita una API con facturación. El proveedor público es de mejor esfuerzo: ante indisponibilidad el orden se señala como aproximado por distancia. No hay tráfico en tiempo real ni garantía de óptimo global de toda la flota.

Política: https://routing.openstreetmap.de/about.html . Caché, identificación y límite de una solicitud por 1,1 segundos; atribución visible. La salida de Plaza San Francisco usa la referencia pública de la Alcaldía, editable para precisar el punto de cargue. Los puntos de las sucursales demo son ficticios, identificados como tales.

Planta usa tarjetas compactas con nombre del cliente, estado, franja horaria, productos y cantidades; omite dirección, cliente, precio y notas generales. La sección Datos demo fue retirada de Ajustes sin borrar los lotes ya creados.

### Unidades, sucursales y comprobantes
Cada presentación configura una lista de unidades con nombre editable, precio, posibilidad de cantidades decimales y eliminación de la oferta. Los pedidos anteriores conservan nombre y precio. Los precios especiales utilizan las unidades activas del catálogo.

Clientes administran sus sucursales; administración accede desde la tabla de clientes en Ajustes. Los pedidos conservan la dirección y coordenadas originales. Los destinos externos al área metropolitana se señalan para transportadora y omiten el mapa local.

El mensajero que registra dinero recibido debe adjuntar comprobante de factura; la imagen queda vinculada al pago con acceso restringido. Las transferencias siguen requiriendo verificación administrativa. Las notificaciones muestran estados en español.

### Eliminar sucursales y buscar direcciones
Clientes y administración pueden eliminar sucursales con confirmación y restaurarlas desde «Sucursales eliminadas». Se conserva el historial de pedidos, se impide usarlas en pedidos nuevos y se pausan sus frecuencias. Restaurar una sucursal no reactiva frecuencias automáticamente.

La búsqueda espera una dirección colombiana con placa completa (p. ej. Carrera 23 #6-68) y 1,2 segundos sin escribir. Conserva la búsqueda manual para lugares sin nomenclatura. Normaliza abreviaturas comunes, incluye municipio y país, descarta respuestas de consultas anteriores y prioriza coincidencias de calle y placa. Photon/OpenStreetMap no cubre todas las placas: los resultados sin coincidencia se identifican como aproximados y requieren confirmar el punto en el mapa.

Las tarjetas de pedidos abren el detalle al seleccionarlas. Solo los pendientes muestran Aceptar/Rechazar para administración o roles personalizados con Pedidos. Las acciones de preparación y entrega, y «Ver mapa», están en el detalle.

### Horarios y señales de operación
Al crear pedidos, clientes y administración reciben Desde = hora actual + anticipación del día y Hasta por defecto = cierre − anticipación. Se respeta la apertura y se propone otro día habilitado cuando no hay rango. Cambiar el día actualiza Hasta; guardar horarios actualiza los formularios abiertos sin recargar. El servidor exige la anticipación para ambos roles y rechaza la recepción después de cierre menos anticipación.

Planta coloca primero pedidos aceptados/en preparación, prioriza atrasados o próximos a salir y luego el orden de llegada. Usa acomodo por altura conservando el orden de lectura. Los estados y urgencia son chips Material UI; Próximo a salir indica que queda hasta una hora para terminar el rango. Confirmado es violeta; En reparto es azul y Asignado a ti verde.

Los avisos generales, de horarios y del catálogo usan Snackbar arriba a la derecha, con cierre a los cinco segundos. Las pestañas seleccionadas usan el color primario. La cabecera no añade margen inferior.

Al crear una sucursal se elige primero el municipio. La búsqueda descarta coincidencias ubicadas por el proveedor en otro municipio y exige confirmar manualmente las ubicaciones aproximadas; no inventa coordenadas para placas ausentes.

### Fechas, cartera y controles
Pedidos y Planta permiten elegir la fecha de la jornada; inicia en la jornada actual. Las solicitudes de recorridos se consultan para esa fecha y muestran cliente, dirección y chip de estado en tarjetas compactas. Los chips de urgencia incluyen reloj. Se conserva la selección de pestaña en móvil y las acciones de papelera son rojas. Los controles binarios usan Switch de Material UI.

Pedidos y saldo del cliente pagina en servidor con 10, 25 o 50 registros por página, manteniendo el alcance del cliente y del mensajero. Los precios especiales muestran únicamente presentaciones/unidades activas del catálogo: variantes desactivadas conservan el historial, pero no aparecen como ofertas actuales.

Se comprobó el 20/11/2026 la consulta pública «Cl. 43 #26-106, POBLADO, Girón, Santander»: Photon devolvió comercios próximos y placa 26-06, no la 26-106. El aviso de aproximación refleja esa falta de datos. La sucursal permite abrir la búsqueda completa en la app de mapas y pegar latitud/longitud validadas para fijar el punto. No se habilitaron APIs de Google con facturación ni se sustituyó la placa por una coincidencia cercana.

### Incidencias, asignación y comprobantes de entrega
Administración y el mensajero asignado pueden registrar una entrega fallida únicamente en estado En camino. Se conserva la incidencia sin marcar el pedido como entregado. El filtro de mensajero incluye Sin mensajero asignado.

Las solicitudes muestran solo pedidos que siguen disponibles. Asignar un pedido lo retira de las solicitudes visibles; si no quedan pedidos, la solicitud se oculta. Aprobar una solicitud parcial bloquea los pedidos y asigna únicamente los que todavía están disponibles, preservando las asignaciones ya realizadas.

El comprobante al confirmar entrega tiene un campo para cargar imagen y cámara integrada a la derecha. En móvil, la cámara solicita captura posterior mediante el selector nativo; la carga normal mantiene la galería disponible. La foto sigue siendo obligatoria si el mensajero recibe dinero. La apertura real de cámara depende del navegador y sus permisos.

Los enlaces de navegación de pedidos y paradas incluyen el origen de reparto configurado, preferentemente sus coordenadas, en vez de depender de la ubicación actual del teléfono.

### Agrupar pedidos y reprogramar entregas fallidas
Las tarjetas agrupan al mismo cliente y dirección dentro de la fecha/filtros elegidos. El resumen suma cantidades y muestra los estados y número de pedidos; el detalle permite revisar y actuar sobre cada pedido por separado. La agrupación no fusiona facturas, pagos ni estados. Planta utiliza una clave de agrupación opaca sin recibir la dirección y muestra un subtotal de productos por preparar cuando hay pedidos confirmados/en preparación. Las paradas y solicitudes también compactan destinos repetidos.

Registrar una entrega fallida cambia a Rechazado y conserva mensajero, factura y crédito. Reprogramar una entrega fallida la devuelve a En camino, actualiza la jornada de entrega y conserva la asignación; exige mensajero activo. Los rechazos de pedidos sin aceptar no se convierten en entregas. Los motivos quedan en trazabilidad. Los recorridos actualizan sus paradas para no mostrar una entrega trasladada a otra jornada.

Recargar fuerza consultas sin caché HTTP, actualiza recorridos aunque no cambien los IDs y comparte clics simultáneos. Las respuestas antiguas no sobrescriben la última actualización; la cartera y solicitudes se vuelven a consultar mediante la invalidación del módulo. La interfaz indica cuándo está actualizando y confirma la recarga.


### Limpieza y recuperación
Solo administración puede usar Ajustes → Administración de datos. Cada limpieza conserva usuarios, catálogo, imágenes y ajustes; archiva comprimidos los datos operativos antes de retirarlos en una transacción limitada al schema de Delipiña. Los respaldos permiten descargar y restaurar la operación. Una restauración respalda también el estado que reemplaza. La jornada vacía de hoy se abre automáticamente. No hay una opción de purga permanente de respaldos.

### Inicio de sesión con Apple
Pendiente de cuenta activa Apple Developer Program. La configuración web requiere App ID, Services ID, dominio y retorno HTTPS registrados y clave privada. No se muestra un botón sin configuración. Documentación: https://developer.apple.com/help/account/capabilities/configure-sign-in-with-apple-for-the-web/
