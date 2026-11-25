# VIP Ruta Segura · versión real

App para reservar asientos Trujillo ⇄ Chiclayo. Mismo diseño de siempre, pero ahora todo sale de una base de datos Neon (Postgres): cuentas, viajes, asientos, pagos, calificaciones e incidentes.

```
server.js      API (Express) + tareas programadas + sirve la app
db.js          conexión a Neon y migración automática
schema.sql     tablas (se crean solas al arrancar)
services.js    correo por Gmail y validación de DNI (apis.net.pe)
public/        la app (index.html, app.js, sw.js, manifest, íconos)
legacy/        la versión simulada anterior, por si la necesitas
```

## Puesta en marcha

```bash
npm install
```

```bash
copy .env.example .env
```

Llena el `.env` (abajo) y luego:

```bash
npm start
```

Abre http://localhost:3000. Al arrancar crea las tablas y el usuario administrador.

### Demostración con viajes de prueba

En un entorno de desarrollo, primero completa la verificación de un conductor y configúrale un número de Yape o Plin. Después agrega viajes futuros en ambos sentidos:

```bash
npm run seed:demo -- --confirm
```

El comando usa la `DATABASE_URL` del `.env`, crea hasta cuatro viajes disponibles y se puede repetir sin duplicar las salidas activas. No crea usuarios, reservas ni pagos ficticios; el pasajero puede buscar un viaje, elegir asientos y completar el flujo real de pago y confirmación. El sembrador se bloquea cuando `NODE_ENV=production`.

Para comprobar el recorrido, inicia sesión como pasajero y reserva uno de los viajes; luego confirma el pago desde la cuenta del conductor. El conductor aprobado podrá iniciar la salida cuando sus pasajeros hayan abordado o haya vencido la espera de 20 minutos. En **En ruta** verá claramente la ciudad de salida y destino, y podrá confirmar la llegada para cerrar el viaje.

## Variables (`.env`)

| Variable | De dónde sale |
|---|---|
| `DATABASE_URL` | Neon → tu proyecto → **Connection string** (la que termina en `?sslmode=require`) |
| `SESSION_SECRET` | Cualquier texto largo y aleatorio (32+ caracteres) |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NAME` | El administrador se crea (o se actualiza) solo al arrancar |
| `BREVO_API_KEY`, `BREVO_SENDER` | **Brevo por HTTPS** (la opción más simple en Render gratis). Clave en https://app.brevo.com → SMTP y API → Claves de API. `BREVO_SENDER` es el correo remitente, que debe estar **verificado** en Brevo → Remitentes. Si llenas esto, lo de Gmail se ignora |
| `GMAIL_USER` + (`GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN`) | Alternativa: **API de Gmail por HTTPS** (ver «Correo con la API de Gmail» abajo) |
| `GMAIL_USER`, `GMAIL_APP_PASSWORD` | Alternativa por SMTP, solo donde el hosting lo permita (tu PC, Render de pago): cuenta con verificación en 2 pasos → https://myaccount.google.com/apppasswords → contraseña de aplicación de 16 letras. Se ignora si llenas las tres de la API |
| `APIS_NET_PE_TOKEN` | Token de https://apis.net.pe |
| `SHEETS_SERVICE_ACCOUNT_EMAIL`, `SHEETS_PRIVATE_KEY` | Credenciales de una cuenta de servicio de Google con acceso de Editor a la hoja |
| `SHEETS_LIBRO_ID` | ID de Google Sheets; opcional si usas la hoja predeterminada del proyecto |
| `APP_URL`, `PORT`, `NODE_ENV` | Opcionales. En producción usa `NODE_ENV=production` |

Sin ninguna opción de Gmail la app arranca, pero los correos (incluido el código de registro) solo se imprimen en la consola del servidor.

### Sincronizar Neon con Google Sheets (sin Make)

Neon sigue siendo la base principal. El servidor refleja directamente en Sheets los usuarios, viajes, reservas, asientos, pagos, reseñas, incidentes y ubicaciones en vivo. Los cambios se sincronizan automáticamente; si Google está temporalmente indisponible, quedan pendientes y se reintentan. No se copian contraseñas, códigos de verificación ni archivos.

1. En [Google Cloud Console](https://console.cloud.google.com/), habilita **Google Sheets API** y crea una **cuenta de servicio**.
2. Crea una clave JSON para esa cuenta. Copia `client_email` a `SHEETS_SERVICE_ACCOUNT_EMAIL` y `private_key` a `SHEETS_PRIVATE_KEY` en el `.env` local y en las variables del hosting. Conserva los saltos de línea de la clave (también se aceptan como `\n`).
3. Comparte el archivo de Google Sheets con el correo de la cuenta de servicio y dale permiso de **Editor**. Configura `SHEETS_LIBRO_ID` con el ID del archivo si no usas el predeterminado.
4. Conserva las pestañas y encabezados existentes: `usuarios`, `viajes`, `reservas`, `asientos_reserva`, `pagos`, `resenas`, `incidentes` y `ubicaciones_en_vivo`. Reinicia el servidor. Para forzar una carga completa manual: `npm run sync:sheets`.

Los cambios se reflejan normalmente en unos segundos. Revisa los logs del servidor si falta alguna variable, permiso o pestaña.

### Correo con la API de Gmail (necesario en Render gratis)

Render gratis bloquea los puertos SMTP, así que la contraseña de aplicación no funciona allí. La API de Gmail va por HTTPS y es gratis (unos 500 correos al día).

1. Entra a https://console.cloud.google.com, crea un proyecto y en **APIs y servicios → Biblioteca** activa **Gmail API**.
2. **APIs y servicios → Pantalla de consentimiento de OAuth**: tipo **Externo**, nombre de la app, tu correo. En **Permisos** agrega `https://www.googleapis.com/auth/gmail.send`. En **Usuarios de prueba** agrega tu Gmail.
3. **Credenciales → Crear credenciales → ID de cliente de OAuth**, tipo **Aplicación web**. En **URI de redireccionamiento autorizados** pon `https://developers.google.com/oauthplayground`. Copia el **ID de cliente** (`GMAIL_CLIENT_ID`) y el **secreto** (`GMAIL_CLIENT_SECRET`).
4. **Antes de generar el token**, en la pantalla de consentimiento (**Público / Audience**) pulsa **Publicar aplicación** (estado «En producción»). Si el token se crea con la app en «Prueba», **vence a los 7 días** y los correos dejan de salir. Google avisará que la app no está verificada: para uso propio no hace falta verificarla.
5. Abre https://developers.google.com/oauthplayground, pulsa la rueda ⚙ → marca **Use your own OAuth credentials** y pega el ID y el secreto. A la izquierda escribe el permiso `https://www.googleapis.com/auth/gmail.send` → **Authorize APIs** → entra con el Gmail que enviará los correos (si sale «Google no verificó esta app»: **Avanzado → Ir a… (no seguro)**) → **Exchange authorization code for tokens**. Copia el **Refresh token** (`GMAIL_REFRESH_TOKEN`).
6. Pon `GMAIL_USER` (el mismo Gmail) y los tres valores en las variables de Render y reinicia.

Para comprobarlo, abre `/health`: `"mail": true` indica que las variables están. Luego pide un código de registro; si falla, el motivo exacto queda en los registros de Render (`[correo] no se pudo enviar…`).

## Qué hace cada punto de tu lista

| # | Requerimiento | Dónde está |
|---|---|---|
| 1 | BD y entorno | `schema.sql` (users, driver_profiles, trips, bookings, booking_seats, payments, reviews, incidents, live_locations, files, email_codes) |
| 2 | Cuentas y 3 roles | Pasajero, chófer y admin. Una misma persona puede ser pasajero y chófer con el mismo correo. El admin sale del `.env` |
| 3 | Código por correo | `/api/auth/code` y `/api/auth/verify`: 6 dígitos, vence en 10 min, 5 intentos |
| 4 | DNI | `/api/dni` consulta apis.net.pe **desde el servidor**; el nombre de la cuenta es el de RENIEC y el DNI no se repite |
| 5 | Aprobaciones del admin | Pestaña **Revisión**: ve selfie, foto del DNI, licencia, SOAT, antecedentes y fotos del vehículo; aprueba o rechaza con motivo. Sin aprobación el chófer no publica |
| 6 | Chófer: viajes | Publicar, editar y cancelar con su precio (S/ 20–120) |
| 7 | Búsqueda | Solo viajes reales; asientos libres y perfil del chófer salen de la BD |
| 8 | Pago Yape/Plin manual | El pasajero ve el número del chófer, paga, sube captura y n.º de operación. El chófer (o el admin) confirma o rechaza. Visa se quitó |
| 9 | QR y abordaje | Boleto con QR; el chófer lo escanea con la cámara (o escribe el código) |
| 10 | Espera y «No presentado» | Una tarea cada 30 s libera: reservas sin pagar (10 min) y pasajeros que no abordaron 20 min después de la salida |
| 11 | Ventas en vivo | Datos reales; las pantallas se actualizan solas cada pocos segundos |
| 12 | Calificaciones | Reales, con promedio calculado; 3 estrellas o menos generan un incidente para el admin |
| 13 | Correos de aviso | Pago por confirmar (al chófer), reserva confirmada o pago rechazado (al pasajero), viaje editado o cancelado, cuenta aprobada o rechazada y SOS (al admin) |
| 14 | Panel admin | Resumen, revisión, usuarios (con bloqueo), pagos, viajes e incidentes |
| 15 | Conectar el prototipo | Toda la simulación (conductores falsos, ventas falsas, reloj acelerado, códigos SMS en pantalla) se eliminó |

El GPS en vivo ahora es real: el celular del chófer transmite su ubicación cada ~8 s mientras el viaje está iniciado y la pantalla **En ruta** está abierta.

## Publicarla

Necesita un servidor Node (no sirve Netlify Drop, que solo aloja archivos). Render, Railway o Fly funcionan: comando de inicio `npm start`, carga las mismas variables, pon `NODE_ENV=production` y `APP_URL` con tu dirección https. La tarea de liberar asientos corre dentro del servidor, así que debe estar encendido (en planes gratuitos que se duermen, también se ejecuta al recibir cualquier petición).

## Google Sheets

La hoja funciona como espejo de lectura para reportes; la app sigue usando Neon para todas sus operaciones. Las pestañas espejo son `usuarios`, `viajes`, `reservas`, `asientos_reserva`, `pagos`, `resenas`, `incidentes` y `ubicaciones_en_vivo`. Los archivos binarios y los códigos de verificación permanecen únicamente en Neon.

## Lo que conviene saber

- **Token de apis.net.pe:** el servidor lo envía como `Authorization: Bearer <token>` y lee `nombres`, `apellidoPaterno` y `apellidoMaterno`. No pude comprobarlo contra su servicio real; si responde otra cosa, el único lugar a ajustar es `lookupDni` en `services.js`.
- **GPS:** el navegador del chófer solo transmite con la página abierta. Si bloquea el teléfono, se detiene.
- **No incluido** (no estaba en la lista): recuperar contraseña, devoluciones de dinero (el chófer devuelve por su cuenta) y notificaciones push.
- Las fotos y PDF se guardan en la propia BD (máx. 4 MB cada una); solo las ve su dueño, el admin y quien lo necesita (el chófer ve la selfie de sus pasajeros y la captura de su pago).
