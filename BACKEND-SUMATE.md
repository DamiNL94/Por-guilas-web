# Backend de "Súmate" — estado, integración y puesta en marcha

Documento interno. No se publica: `esPrivado()` excluye todos los `.md`.

---

## Qué hay construido

Todo el backend vive en `src/`, que el servidor estático ya excluía de la
publicación (`CARPETAS_PRIVADAS` en `server.js`). Una sola dependencia nueva en
todo el proyecto: **`pg`**. El correo va por la API REST de Brevo con el `fetch`
que trae Node 22, sin SDK.

| Fichero | Qué hace |
|---|---|
| `src/config.js` | Constantes con efectos legales: versión de la política, texto del consentimiento, listas cerradas, plazos de conservación. Y el guardián de arranque. |
| `src/util.js` | Saneado de texto, validación, tokens, comparación en tiempo constante, IP tras proxy. |
| `src/db.js` | Pool de Postgres y esquema idempotente. |
| `src/http.js` | Lectura de cuerpo con tope, respuestas sin caché, plantillas. |
| `src/limites.js` | Límite por IP con ventana deslizante, en memoria. |
| `src/correo.js` | Los tres correos: confirmación, "ya estabas" y borrado. |
| `src/sumate.js` | Alta, confirmación, baja y supresión. |
| `src/admin.js` | Listado JSON y CSV para el equipo. |
| `src/purga.js` | Borrado automático por conservación. |
| `src/api.js` | Enrutado de `/api/*`. |
| `test/prueba.js` | Banco de pruebas. `npm test`. |

Páginas publicadas: `legal/privacidad.html`, `legal/aviso-legal.html`,
`legal/cookies.html`, y `sumate/{gracias,baja,enlace-caducado,borrar,revisa-tu-correo}.html`.

---

## Lo que falta para que funcione

### 1. Dos costuras de integración, sin hacer

No se han tocado `server.js` ni `index.html` porque **otra sesión los estaba
reescribiendo a la vez** (bloque P1 de `PROMPT-MEJORAS-WEB.md`: auto-alojar
React y tipografías, CSP). Editarlos en paralelo se habría pisado.

**`server.js`** — dos cambios:

```js
// 1. Arriba, con el resto de requires:
const api = require("./src/api.js");
const db = require("./src/db.js");
const purga = require("./src/purga.js");

// 2. Dentro de createServer, ANTES del control de método que devuelve 405
//    (hoy es lo primero que hay) y antes del estático:
if (url.startsWith("/api/")) return api.manejar(req, res);
```

Y en el arranque, junto al `listen`:

```js
const estado = api.informarEstado();
if (estado.listo) {
  db.migrar()
    .then(() => { console.log("[db] esquema al día"); purga.arrancar(); })
    .catch((e) => console.error("[db] no se pudo migrar:", e.message));
}
```

**Rutas limpias.** `comoFichero` no prueba a añadir `.html`, así que
`/legal/privacidad` cae en el fallback y sirve el `index.html` de la SPA. Hay
que añadir, justo antes de ese fallback:

```js
if (!destino && !path.extname(abs)) destino = await comoFichero(abs + ".html");
```

**Ojo con la CSP** que está montando la otra sesión: las páginas legales usan
atributos `style=` en línea, así que `style-src` necesita `'unsafe-inline'` (o
`'unsafe-hashes'`). No llevan ningún `<script>`, así que a `script-src` no le
afectan.

**`index.html`** — reescribir el handler `enviar` de `renderVals()`, y en el
formulario: poner `name`/`id` al checkbox de consentimiento, `value` a los
`<option>` con las claves de `COMO`, convertir la zona en `<select>` con las de
`ZONAS`, quitar el campo de teléfono, y añadir el campo trampa y el `t0`.
Comprobado en `support.js` que el runtime lo permite: `compileAttr`
(support.js:400) pasa el valor crudo cuando el atributo es exactamente
`{{ x }}`, así que `disabled="{{ enviando }}"` funciona con un booleano real; y
support.js:803 convierte un `style` en cadena a objeto, así que se puede
alternar el color verde/rojo del aviso con `style="{{ estiloAviso }}"`.
`sc-else` está en el regex de control de flujo pero `walkIf` no lo implementa:
hay que usar dos `<sc-if>`.

De paso, dos detalles menores vistos al leer el fichero: el checkbox usa
`accent-color:#6B2D5C`, un morado que el manual de marca tiene entre los
colores vetados, y los `<option>` sin `value` mandan la frase entera como dato.

### 2. Rellenar los huecos legales

`legal/privacidad.html` y `legal/aviso-legal.html` tienen marcadores
`PENDIENTE:` en el NIF, el domicilio y la inscripción registral. **El backend
los comprueba al arrancar**: mientras haya un solo `PENDIENTE:`, `/api/sumate`
responde 503 y no se guarda ni un dato. Es a propósito.

Falta decidir además si hay que designar delegado de protección de datos: el
art. 37 del RGPD y el 34 de la LOPDGDD lo exigen a los partidos que tratan
datos de opinión política a gran escala.

Y hay una cuestión previa que no es técnica: **una asamblea local de IU
normalmente no tiene personalidad jurídica ni NIF propios**. El responsable del
tratamiento tiene que ser una entidad que exista legalmente y pueda responder
ante la AEPD. Hay que confirmarlo con quien lleve lo orgánico antes de publicar.

### 3. Configurar el entorno

Variables en `.env.example`. Las obligatorias: `DATABASE_URL`, `ADMIN_TOKEN`,
`SECRETO_HMAC`, `URL_BASE`, `BREVO_API_KEY`.

**DNS de `poraguilas.es`**, sin esto los correos van a spam:

- SPF: `v=spf1 include:spf.brevo.com ~all`
- DKIM: el registro que dé Brevo al verificar el dominio.
- DMARC: empezar en `v=DMARC1; p=none; rua=mailto:...`, y subir a
  `p=quarantine` cuando los informes salgan limpios.

**Región de Railway:** hay que desplegar en la región europea. La política de
privacidad afirma que los servidores están en la UE.

---

## Decisiones que conviene tener por escrito

**Postgres y no SQLite sobre volumen.** No por rendimiento —para unos miles de
registros da igual— sino porque el plugin trae copias de seguridad, porque el
dato vive en un servicio aparte y no se lo lleva por delante una reconfiguración
del servicio web, y porque `pg` es JavaScript puro frente a un `node:sqlite`
todavía experimental o un `better-sqlite3` que exige compilar.

**Brevo y no Resend.** Empresa e infraestructura en la UE. Con datos del art. 9
eso ahorra el capítulo de transferencias internacionales. Solo se usa la parte
transaccional: subir la lista a los "contactos" de Brevo duplicaría la base de
datos dentro de una herramienta de marketing de terceros.

**Al proveedor de correo solo le llega la dirección de destino.** Ni el nombre,
ni la zona, ni el mensaje. Los correos se redactan sin nombre propio a
propósito.

**El enlace de baja no se guarda.** Se deriva de `SECRETO_HMAC` y del id de la
fila, y en la base solo queda su hash, que sirve para localizar la fila. Así un
enlace repartido hace ocho meses sigue valiendo y, a la vez, un volcado robado
de la base no contiene ni un enlace utilizable. Contrapartida: **si se cambia
`SECRETO_HMAC`, todos los enlaces de baja repartidos dejan de funcionar.**

**Confirmar y borrar piden un clic más.** El enlace del correo (GET) solo pinta
una página con un botón; quien actúa es el POST. Se desvía de lo que pedía el
encargo, y el motivo es que hay filtros de correo corporativos que abren
automáticamente los enlaces que reciben para analizarlos: con un GET que
confirma, uno de esos analizadores daría de alta a alguien que nunca dijo que
sí, que es justo lo que el doble opt-in existe para evitar. Con el borrado sería
peor todavía. El botón "cancelar suscripción" del cliente de correo (RFC 8058)
sí borra de un golpe, porque ahí el POST lo dispara una persona.

**`POST /api/sumate/borrar` manda un enlace, no borra al vuelo.** Si borrase con
solo recibir una dirección, cualquiera podría eliminar los datos de otra
persona escribiendo su correo. La respuesta es idéntica exista o no la
dirección.

**El formulario manda JSON, no `multipart/form-data`.** Se lee con `FormData` y
se serializa a JSON antes de enviarlo. Evita escribir un parser de multipart a
mano y, de paso, es la mejor defensa contra CSRF: el navegador obliga a
*preflight* para mandar JSON desde otro origen, y no se responde ninguna
cabecera CORS.

**Sobre el antispam, sin venderlo mejor de lo que es.** La trampa oculta y el
tiempo mínimo de relleno paran robots tontos y poco más: el reloj lo pone el
navegador y se puede falsear. El límite por IP vive en memoria y se reinicia en
cada redespliegue. **La defensa de verdad es el doble opt-in**: un alta basura
nunca se confirma y se borra sola a los 30 días.

---

## Financiación: retirada de la web

**La tarjeta de "Financiación" se ha quitado de `index.html`.** Mostraba
importes de ejemplo (10 €, 25 €, 50 €) que no llevaban a ninguna parte, en una
materia que está regulada. Se retira hasta que haya con qué sustituirla.

Se ha ajustado de paso la entradilla de "Súmate", que anunciaba tres formas de
colaborar —la tercera era poner dinero— y ahora anuncia dos.

**Lo que sí se conserva** es la opción "Colaborar económicamente" del
desplegable del formulario. No mueve dinero: recoge una intención, que es
información útil para planificar y que se puede atender cuando exista el cauce
legal. Si se prefiere quitarla también, es la clave `economico` de `COMO` en
`src/config.js` y su `<option>` en `index.html`.

Antes de volver a plantear una pasarela hay que tener resuelto, con quien lleve
las cuentas de la candidatura:

- **Administrador electoral designado** ante la Junta Electoral, que es quien
  responde personalmente ante el Tribunal de Cuentas.
- **Cuenta corriente electoral** abierta y comunicada, separada de cualquier
  otra. Todos los ingresos de campaña pasan por ahí y por ningún otro sitio.
- **Prohibición de donaciones anónimas** (LO 8/2007). Cada aportación tiene que
  quedar identificada con nombre, NIF y domicilio de quien la hace.
- **Prohibición de aportaciones de personas jurídicas** y de entes sin
  personalidad.
- **Límites por persona** y tope de gasto de campaña según la LOREG.
- **Trazabilidad**: quién, cuánto, cuándo, y contabilidad que cuadre con el
  extracto bancario, para el informe al Tribunal de Cuentas.
- Y una decisión aparte: si el TPV o la pasarela guarda datos de pago, entra
  otro tratamiento distinto en la política de privacidad.

Nada de esto se decide escribiendo código.

Mientras tanto, si alguien quiere aportar, el camino es escribir a
`hola@poraguilas.es` y que se lo explique una persona.

---

## Pruebas

```bash
npm test
```

Sin `DATABASE_URL` ejecuta todo lo que no necesita base de datos —validación,
saneado, trampa, origen ajeno, límites por IP, tokens, plantillas, autorización
del panel y escapado del CSV— y salta cuatro pruebas de flujo completo.

Con base de datos las ejecuta todas:

```bash
DATABASE_URL="postgres://usuario:clave@localhost:5432/pruebas" npm test
```

La base que se le pase se usa de verdad: crea las tablas y las vacía al
terminar. **No apuntar nunca a la de producción.**
