# Prompt para la sesión de mejoras · robustez, URLs, SEO y accesibilidad

> Copia todo lo que hay debajo de la línea y pégalo como primer mensaje de una
> sesión nueva de Claude Code abierta en este mismo repositorio.
>
> Es independiente del backend de "Súmate" (`PROMPT-BACKEND-SUMATE.md`). Se
> pueden hacer en cualquier orden, pero conviene hacer **primero este**: el
> bloque P1 es el que sostiene todo lo demás.

---

## Contexto del repositorio

Trabajo en `Por-guilas-web`, la web de **Por Águilas**, una candidatura
municipalista de izquierdas para las municipales de Águilas (Murcia) de mayo de
2027. Se despliega en **Railway** desde `main` y ya funciona.

- `index.html` — el sitio entero en un fichero. **No es HTML normal**: es una
  plantilla del runtime de Claude Design (`<x-dc>`, `<sc-if>`, `<sc-for>`,
  `{{ ... }}`) que `support.js` compila en el navegador con React 18. La lógica
  está al final, en `<script type="text/x-dc" data-dc-script>`: una clase
  `Component extends DCLogic` con `state`, `componentDidMount`, un método
  `ir(p)` y un `renderVals()` que devuelve el objeto que consume la plantilla.
- `support.js` — runtime generado. **No se toca ni se edita nunca.**
- `server.js` — servidor estático sin dependencias, con `/healthz`, ETag,
  cabeceras de seguridad básicas y una función `esPrivado()` que decide qué
  ficheros del repo no se publican.
- `package.json`, `railway.json`, `.nvmrc` (Node 22), `logo/*.svg`,
  `MANUAL-DE-MARCA.md`.

La navegación es por estado interno (`this.state.pag`, valores: `inicio`,
`quienes`, `ejes`, `prensa`, `agenda`, `sumate`), **no por rutas**.

## Qué hay que mejorar

Lo que sigue viene de una auditoría ya hecha sobre el repo y **verificada en el
navegador**. No hace falta que repitas el diagnóstico; ve a las soluciones,
pero comprueba cada punto antes de darlo por bueno.

---

### P1 · Eliminar toda dependencia de terceros en tiempo de ejecución

Es la prioridad absoluta. Hoy la web **no se pinta** si unpkg está caído o
bloqueado: `support.js` descarga React y ReactDOM desde `unpkg.com` en cada
carga. Para una web de campaña con picos de tráfico en momentos concretos, es
un punto único de fallo inaceptable.

Medido en el navegador, la página carga hoy tres recursos externos:

- `https://unpkg.com/react@18.3.1/umd/react.production.min.js`
- `https://unpkg.com/react-dom@18.3.1/umd/react-dom.production.min.js`
- una hoja de estilo de `https://fonts.googleapis.com`

(Babel **no** se carga: `support.js` solo lo pide para `<x-import>` de módulos
JSX, y esta página no usa ninguno. No hace falta ocuparse de él.)

**1a. Auto-alojar React.** El runtime trae un gancho oficial para esto:
`support.js` consulta `window.__resources[url]` antes de ir al CDN y, si
encuentra una cadena, la usa como `src`. Descarga los dos ficheros a `vendor/`
y declara el mapa **antes** de la etiqueta `<script src="./support.js">`:

```html
<script>
window.__resources = {
  "https://unpkg.com/react@18.3.1/umd/react.production.min.js": "/vendor/react.production.min.js",
  "https://unpkg.com/react-dom@18.3.1/umd/react-dom.production.min.js": "/vendor/react-dom.production.min.js"
};
</script>
<script src="./support.js"></script>
```

Esto está probado y funciona: deja la página con **cero peticiones externas de
script**, React 18.3.1 servido en local y la consola limpia.

Efecto secundario valioso: cuando `window.__resources` no existe, el runtime
**vuelve a descargar `location.href` entero** al arrancar (una segunda petición
de los 66 KB de `index.html`, solo para reparsear la plantilla). Al definir el
mapa, esa petición duplicada desaparece. Confírmalo con
`performance.getEntriesByType('resource')`.

Cuidado: las claves del mapa son las URLs **exactas** que `support.js` tiene
codificadas, versión incluida. Si algún día se regenera `support.js` con otra
versión de React, el mapa deja de coincidir y se vuelve al CDN sin avisar.
Añade una comprobación de arranque que lo detecte, o al menos un comentario
bien visible en `index.html`.

**1b. Auto-alojar las tipografías.** El `<link>` a `fonts.googleapis.com` está
dentro del bloque `<helmet>` de `index.html`. Descarga **Familjen Grotesk**
(400/500/600/700) y **Public Sans** (400/500/600/700/800) en `woff2`, sírvelas
desde `fonts/`, sustituye ese `<link>` y los dos `<link rel="preconnect">` por
reglas `@font-face` propias con `font-display: swap`, y añade
`<link rel="preload">` para los dos pesos que se usan en la primera pantalla.
Aparte del rendimiento, esto evita mandar la IP de cada visitante a Google, que
en una web política española es un problema de RGPD que no interesa tener.

**1c. Cerrar con una CSP.** Cuando ya no quede nada externo, añade en
`server.js` una `Content-Security-Policy` restrictiva (`default-src` propio)
con las excepciones mínimas que el runtime necesite de verdad — comprueba si
requiere inline para estilos y si `new Function` obliga a permitir `eval`,
porque `support.js` lo usa para evaluar el bloque `data-dc-script`. Documenta
en un comentario por qué está cada excepción. Añade también
`Strict-Transport-Security` (Railway termina el TLS).

**Criterio de aceptación de P1:** cargar la web con el cortafuegos bloqueando
`unpkg.com` y `fonts.googleapis.com` y que se vea idéntica.

---

### P2 · URLs reales

Hoy todo el sitio vive en `/`. No se puede compartir el enlace a una nota de
prensa, ni a un eje del programa, ni a la pestaña "Súmate". En una campaña eso
es justo lo que la gente hace, así que es una pérdida directa de difusión.

- Mapea el estado a rutas: `/`, `/quienes-somos`, `/programa`, `/prensa`,
  `/agenda`, `/sumate`.
- El estado inicial se deduce de `location.pathname` en lugar de ser siempre
  `inicio`.
- `ir(p)` hace `history.pushState`; añade un listener de `popstate` en
  `componentDidMount` (y su `removeEventListener` en `componentWillUnmount`,
  siguiendo el patrón que ya usa el listener de `resize`) para que el botón
  Atrás del navegador funcione.
- Los enlaces del pie y de la navegación deben llevar un `href` real además del
  `onClick`, para que se puedan abrir en pestaña nueva y copiar el enlace. Hoy
  hay seis `href="#"` en `index.html`.
- Actualiza `document.title` y `<link rel="canonical">` en cada cambio de ruta.
- `server.js` ya hace fallback a `index.html` para rutas sin extensión, así que
  los enlaces directos deberían funcionar sin tocar el servidor. **Verifícalo**
  cargando `/programa` directamente, no solo navegando desde la home.

Si sale bien y no se complica, valora enlaces permanentes por nota de prensa
(`/prensa/censo-vivienda-vacia`) a partir de un slug en el array `NOTAS`.

---

### P3 · Que se vea bien al compartir y en buscadores

- **`og:image` está mal**: apunta a `logo/por-aguilas-logotipo.svg`, y
  WhatsApp, Telegram, Twitter/X y Facebook **no renderizan SVG** en las
  previsualizaciones. Hay que generar un PNG o JPG de 1200×630 con la marca y
  apuntar ahí, con URL **absoluta** (los rastreadores no resuelven rutas
  relativas de forma fiable). Añade `og:image:width`, `og:image:height` y
  `og:image:alt`, y un `og:url` absoluto.
- Meta description y `og:title` propios por ruta, no los mismos en todas.
- `robots.txt` y `sitemap.xml` con las rutas reales de P2.
- JSON-LD de tipo `Organization` con nombre, logo, ámbito y contacto.
- El contenido se pinta en cliente, así que los buscadores tienen que ejecutar
  JS para verlo. Si quieres arreglarlo de raíz haría falta prerenderizar un
  HTML estático por ruta en el build; **plantéamelo como opción con su coste
  antes de meterte**, no lo hagas por tu cuenta.

---

### P4 · Accesibilidad

La base está cuidada (`:focus-visible`, `prefers-reduced-motion`, labels
reales, campos de 50px de alto, `role="status"` en el aviso del formulario).
Faltan cosas concretas:

- **Bug real**: el botón del menú móvil tiene `aria-expanded="false"`
  codificado a pelo en `index.html`, y nunca pasa a `true` al abrirse. Debe
  enlazarse al estado.
- El panel del menú móvil es un `role="dialog"`: necesita cierre con `Esc`,
  foco atrapado dentro mientras está abierto, y devolución del foco al botón
  que lo abrió al cerrarse.
- Solo la home tiene `<h1>`; el resto de pestañas empiezan en `<h2>`. Cada
  ruta debe tener su propio `<h1>`.
- Falta un enlace de salto al contenido principal. Ya existe un `<main>`.
- La marquesina animada (`@keyframes pa-marquee`) debe quedar fuera del árbol
  de accesibilidad (`aria-hidden="true"`) por ser decorativa. Ya respeta
  `prefers-reduced-motion` desde el CSS global; confírmalo.
- Comprueba con números el contraste de `#6F6867` sobre blanco y de `#9A9291`
  sobre `#141414`, y corrígelos si no llegan a 4.5:1.

---

### P5 · Contenido y cierre antes de publicar

- Los enlaces "Aviso legal", "Privacidad" y "Cookies" del pie son `href="#"`.
  Hay que crear esas páginas. **Es bloqueante para activar el formulario de
  Súmate**, porque apuntarse a una candidatura revela opinión política y eso es
  categoría especial del art. 9 del RGPD (más detalle en
  `PROMPT-BACKEND-SUMATE.md`).
- Todo el contenido es de ejemplo, como avisa la propia barra negra superior:
  notas de prensa, fechas de agenda y datos de contacto. La barra se controla
  con la prop `avisoBorrador` y hay que quitarla antes de publicar.
- `hola@poraguilas.es` aparece en el pie: comprueba que el buzón existe de
  verdad antes de publicitarlo.

---

## Cómo quiero que trabajes

- **No toques `support.js`.** Es un fichero generado.
- Nada de frameworks ni bundlers nuevos. El runtime ya trae React; el objetivo
  es tener menos dependencias externas, no más.
- Respeta el manual de marca (`MANUAL-DE-MARCA.md`): verde `#0E7A5F`, rojo
  `#D9351F`, negro `#141414`, Familjen Grotesk y Public Sans.
- Ve por bloques y ve enseñándome el resultado: P1 completo y verificado antes
  de empezar P2. No abras los cinco a la vez.
- Verifica en el navegador de verdad, en escritorio y en móvil (375px), no solo
  con `curl`. Comprueba la consola en cada bloque.

Empieza revisando el repo y confirmándome si el diagnóstico de P1 sigue siendo
correcto; si algo no cuadra con lo que encuentres, dímelo antes de cambiar nada.
