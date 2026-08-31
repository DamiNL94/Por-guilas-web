# Prompt para la sesión de backend · pestaña "Súmate"

> Copia todo lo que hay debajo de la línea y pégalo como primer mensaje de una
> sesión nueva de Claude Code abierta en este mismo repositorio.

---

## Contexto del repositorio

Trabajo en `Por-guilas-web`, la web de **Por Águilas**, una candidatura
municipalista de izquierdas para las elecciones municipales de Águilas (Murcia)
de mayo de 2027. Está desplegada en **Railway** desde la rama `main`.

Estado actual:

- `index.html` — el sitio entero en un solo fichero. **No es HTML normal**: es
  una plantilla del runtime de Claude Design (`<x-dc>`, `<sc-if>`, `<sc-for>`,
  interpolación `{{ ... }}`) que `support.js` compila en el navegador cargando
  React 18 y Babel standalone desde unpkg. La lógica vive en el bloque
  `<script type="text/x-dc" data-dc-script>` del final del fichero, en una clase
  `Component extends DCLogic` con `state`, métodos y un `renderVals()` que
  devuelve el objeto de valores que consume la plantilla.
- `support.js` — runtime generado, **no se toca**.
- `server.js` — servidor estático sin dependencias (Node puro) que sirve la raíz
  del repo, expone `/healthz` y bloquea ficheros privados mediante `esPrivado()`.
- `package.json` (`start: node server.js`), `railway.json` (Nixpacks +
  healthcheck en `/healthz`), `.nvmrc` (Node 22).
- `logo/*.svg`, `MANUAL-DE-MARCA.md` (paleta y tipografías de la marca).

La navegación del sitio es por estado interno (`this.state.pag`), no por rutas.
La pestaña "Súmate" está en `index.html` dentro de `<sc-if value="{{ esSumate }}">`.

## Qué hay que construir

Un backend pequeño, en el mismo repo y el mismo servicio de Railway, que dé
funcionalidad real a la pestaña "Súmate". Hoy el formulario no envía nada: el
handler `enviar` de `renderVals()` solo pinta un aviso de maqueta.

### 1. Alta en el proyecto (`POST /api/sumate`)

Campos del formulario actual: `nombre` (obligatorio), `email` (obligatorio),
`tel` (opcional), `zona` (opcional), `como` (select con 6 opciones), `mensaje`
(opcional) y un checkbox de consentimiento obligatorio.

Requisitos:

- Validación en servidor de todos los campos (no confiar en el `required` del
  HTML): longitudes máximas, formato de email, `como` restringido a la lista
  cerrada de opciones, normalización de espacios.
- Idempotencia por email: un segundo alta con el mismo correo actualiza el
  registro en vez de duplicarlo, y responde igual que la primera vez.
- **Respuesta neutra siempre**: nunca revelar si un email ya estaba dado de alta
  (evita usar la web para comprobar militancia ajena).
- Anti-spam sin CAPTCHA de terceros: campo honeypot oculto, comprobación de
  tiempo mínimo de relleno, y rate limiting por IP (por ejemplo 5 altas / hora)
  con la IP real tomada de `x-forwarded-for` (Railway va detrás de proxy).
- **Doble opt-in**: el alta queda `pendiente` hasta que la persona confirma
  desde un enlace con token de un solo uso y caducidad (24–48 h). Solo los
  registros `confirmado` cuentan como contacto válido.

### 2. Confirmación y baja

- `GET /api/sumate/confirmar?token=…` → marca confirmado y redirige a una página
  de gracias del propio sitio.
- `GET /api/sumate/baja?token=…` → baja inmediata, sin pedir login. El enlace de
  baja debe ir en todos los correos.
- `POST /api/sumate/borrar` → ejercicio del derecho de supresión: borra el
  registro de verdad, no lo marca como borrado.

### 3. Panel mínimo para el equipo de campaña

- `GET /api/admin/altas` y `GET /api/admin/altas.csv`, protegidos por un token
  en cabecera (`ADMIN_TOKEN` en variables de entorno), con comparación en tiempo
  constante. Nada de exponerlo en el frontend.
- El CSV debe abrirse bien en Excel en español (BOM UTF-8, separador `;`) y
  llevar prefijo defensivo en celdas que empiecen por `=`, `+`, `-` o `@`.

### 4. Conexión del frontend

- Reescribir el handler `enviar` de `renderVals()` en `index.html` para que haga
  `fetch("/api/sumate", …)` con el `FormData` del formulario.
- Estados visibles: enviando (botón deshabilitado), éxito ("te hemos mandado un
  correo para confirmar"), error de validación por campo y error de red.
- El bloque `<sc-if value="{{ mensajeForm }}">` con `role="status"` ya existe;
  reutilizarlo y añadir lo que falte respetando el manual de marca
  (`MANUAL-DE-MARCA.md`): verde `#0E7A5F`, rojo `#D9351F`, negro `#141414`,
  tipografías Familjen Grotesk y Public Sans.
- Sin librerías nuevas en el frontend: el runtime ya trae React y Babel.

## Restricciones legales — importantes, no las trates como un detalle

1. **Los datos de esta lista son categoría especial del art. 9 RGPD**: apuntarse
   a una candidatura revela opinión política. Eso exige consentimiento
   *explícito*, informado y granular, no un checkbox genérico. Hay que guardar
   prueba del consentimiento: marca de tiempo, versión del texto aceptado e IP.
2. **Sin política de privacidad publicada no se puede recoger ni un dato.** Los
   enlaces "Aviso legal", "Privacidad" y "Cookies" del pie son hoy `href="#"`.
   Hay que crear esas páginas antes de activar el formulario: responsable del
   tratamiento, finalidad, base jurídica, plazo de conservación, destinatarios,
   y cómo ejercer los derechos ARCO-POL.
3. **Minimización**: no pidas ni guardes nada que no se vaya a usar. Revisa si
   el teléfono y la zona son necesarios ya o pueden esperar.
4. **Conservación**: define y aplica un borrado automático (por ejemplo, altas
   sin confirmar a los 30 días, y toda la lista a los X meses de las elecciones).
5. Cifra o pseudonimiza lo que puedas, y no metas datos personales en logs.

## Fuera de alcance en esta sesión: donaciones

La tarjeta de "Financiación" muestra importes de ejemplo (10 €, 25 €, 50 €).
**No implementes la pasarela de pago todavía.** La financiación de campañas
electorales en España está regulada (LOREG y LO 8/2007): cuenta electoral
específica, prohibición de donaciones anónimas, límites por persona, y un
administrador electoral responsable ante el Tribunal de Cuentas. Eso se decide
con la persona que lleve las cuentas de la candidatura, no en una sesión de
código. Deja la tarjeta como está y anota lo que haría falta.

## Decisiones técnicas que quiero que me plantees antes de escribir código

- **Almacenamiento**: Postgres del plugin de Railway (`DATABASE_URL`) frente a
  SQLite sobre un volumen de Railway. Dime cuál recomiendas para una lista que
  como mucho llegará a unos pocos miles de registros, y por qué.
- **Servidor**: ampliar el `server.js` actual (sin dependencias) o pasar a
  Express/Fastify. Si añades dependencias, justifica cada una.
- **Correo transaccional** para el doble opt-in: Resend, Brevo o Mailjet. Ten en
  cuenta que el dominio `poraguilas.es` necesitará SPF, DKIM y DMARC.
- Cómo mantener el sitio servido y la API en el mismo servicio y puerto
  (`process.env.PORT`), sin CORS ni segundo despliegue.

Empieza analizando el repo y proponme el plan con esas decisiones resueltas
antes de tocar nada.
