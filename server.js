// Servidor del sitio de Por Águilas. Una sola dependencia (`pg`), un solo
// proceso y un solo puerto: sirve los ficheros estáticos y monta debajo, en
// /api/*, el backend de "Súmate" y el de las comunicaciones de donación.
//
// Mismo origen para la web y para la API a propósito: sin CORS que configurar,
// sin un segundo despliegue que mantener y sin un tercer sitio donde se pueda
// quedar vieja la configuración. Detalles del backend en src/ y en
// README-DESPLIEGUE.md.
"use strict";

const http = require("node:http");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const { pipeline } = require("node:stream/promises");

const PORT = Number(process.env.PORT) || 3000;
const HOST = "0.0.0.0";
const ROOT = __dirname;

// --- .env para desarrollo local ----------------------------------------------
//
// .env.example lleva desde el principio diciendo "copiar a .env para desarrollo
// local", pero nadie lo leía: sin esto había que exportar seis variables a mano
// en cada terminal. Son quince líneas y ahorran una dependencia.
//
// En producción no hace nada: Railway pone las variables en el entorno y ahí no
// hay ningún .env. Lo que ya venga en process.env NUNCA se pisa, que es la
// regla que evita que un .env olvidado en el servidor tape la configuración
// real.
(function cargarEnv() {
  let bruto;
  try {
    bruto = fs.readFileSync(path.join(ROOT, ".env"), "utf8");
  } catch {
    return; // no hay .env: es lo normal en producción
  }
  for (const linea of bruto.split(/\r?\n/)) {
    const t = linea.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 1) continue;
    const clave = t.slice(0, i).trim();
    if (process.env[clave] !== undefined) continue;
    let valor = t.slice(i + 1).trim();
    // Comillas opcionales alrededor del valor, por si lleva espacios.
    if (valor.length > 1 && /^(".*"|'.*')$/.test(valor)) valor = valor.slice(1, -1);
    process.env[clave] = valor;
  }
  console.log("[env] variables cargadas desde .env (desarrollo local).");
})();

// Backend de Súmate y de las donaciones. Vive en src/, que el servidor estático
// no publica (ver CARPETAS_PRIVADAS), y se monta más abajo en /api/*.
const api = require("./src/api.js");
const db = require("./src/db.js");
const purga = require("./src/purga.js");
const { donacionesPublicas } = require("./src/config.js");


const TIPOS = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".pdf": "application/pdf",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".webmanifest": "application/manifest+json",
};

// Solo se publica lo que forma parte del sitio. Todo lo demás (código de
// servidor, configuración, documentación interna, ficheros de diseño) queda
// fuera aunque exista en el repositorio.
const FICHEROS_PRIVADOS = new Set([
  // index.html deja de publicarse: es la FUENTE que el equipo edita, no lo que
  // se sirve. Lo que se sirve es su compilación, en publico/. Si se publicara,
  // volvería a hacer falta 'unsafe-eval' para pintarla.
  "index.html",
  "support.js",
  "server.js",
  "package.json",
  "package-lock.json",
  "railway.json",
  "nixpacks.toml",
]);
const CARPETAS_PRIVADAS = new Set(["node_modules", "api", "src", "scripts", "test", "tests"]);

function esPrivado(rel) {
  const p = rel.split(path.sep).join("/");
  if (!p) return false;
  const segmentos = p.split("/");
  // Cualquier fichero o carpeta oculta: .git, .env, .thumbnail, .nvmrc...
  if (segmentos.some((s) => s.startsWith("."))) return true;
  if (CARPETAS_PRIVADAS.has(segmentos[0])) return true;
  if (FICHEROS_PRIVADOS.has(p)) return true;
  // Documentación interna y fuentes de Claude Design.
  if (/\.md$/i.test(p) || /\.dc\.html$/i.test(p)) return true;
  return false;
}

// Devuelve la ruta absoluta pedida, o null si es inválida o privada.
function rutaSegura(urlPath) {
  let decodificado;
  try {
    decodificado = decodeURIComponent(urlPath.split("?")[0]);
  } catch {
    return null; // %-encoding inválido
  }
  if (decodificado.includes("\0")) return null;

  // path.join normaliza y trata la barra inicial como relativa a ROOT.
  const abs = path.resolve(path.join(ROOT, decodificado));
  // Anti path traversal: nunca salir de ROOT.
  if (abs !== ROOT && !abs.startsWith(ROOT + path.sep)) return null;
  if (esPrivado(path.relative(ROOT, abs))) return null;
  return abs;
}

async function comoFichero(abs) {
  try {
    const st = await fsp.stat(abs);
    if (st.isDirectory()) {
      const idx = path.join(abs, "index.html");
      // El índice de un directorio pasa el MISMO filtro de privacidad que
      // cualquier otra petición. Sin esto, pedir "/" servía el index.html de la
      // raíz aunque estuviera declarado privado: la comprobación se hacía sobre
      // la ruta pedida, no sobre el fichero al que se acababa resolviendo. Era
      // la puerta trasera por la que la plantilla sin compilar seguía saliendo
      // a Internet, con su runtime y su necesidad de 'unsafe-eval'.
      if (esPrivado(path.relative(ROOT, idx))) return null;
      const stIdx = await fsp.stat(idx).catch(() => null);
      return stIdx?.isFile() ? { file: idx, stat: stIdx } : null;
    }
    return st.isFile() ? { file: abs, stat: st } : null;
  } catch {
    return null;
  }
}

function cacheHeader(file) {
  // El HTML cambia en cada despliegue; los assets casi nunca, pero como no hay
  // hash en el nombre se usa una revalidación corta en lugar de immutable.
  const ext = path.extname(file).toLowerCase();
  if (ext === ".html") return "no-cache";
  const rel = path.relative(ROOT, file).split(path.sep).join("/");
  // Las tipografías son subconjuntos congelados: no van a cambiar sin cambiar
  // también de nombre. React sí puede subir de versión, así que un día.
  if (rel.startsWith("fonts/")) return "public, max-age=31536000, immutable";
  if (rel.startsWith("vendor/")) return "public, max-age=86400";

  // app.js y la hoja compilada cambian en cada despliegue y no llevan hash en
  // el nombre. Con una hora de caché, un arreglo tarda una hora en llegar a
  // quien ya haya visitado la web: se revalidan siempre. Cuestan poco y son
  // exactamente lo que se querría poder corregir deprisa.
  if (rel === "app.js" || rel.startsWith("publico/")) return "no-cache";

  return "public, max-age=3600, must-revalidate";
}

// --- Rutas de página ---------------------------------------------------------
// La navegación del sitio es por estado interno, pero cada estado tiene su URL
// real. El servidor devuelve index.html en estas rutas para que los enlaces
// directos y los compartidos funcionen.
//
// IMPORTANTE: esta lista tiene que ir a la par con la tabla RUTAS del bloque
// <script data-dc-script> de index.html y con sitemap.xml. Si se añade una
// página hay que darla de alta en los tres sitios.
//
// Cualquier otra ruta da 404 de verdad. Antes se devolvía la portada con un
// 200 para todo, y eso son "soft 404": Google indexa /cualquier-cosa como si
// fuera una página buena y acaba con decenas de URLs duplicadas de la portada.
// Qué fichero de publico/ sirve cada ruta. Lo genera scripts/compilar.js y se
// lee de su manifiesto, para que no haya que mantener la tabla dos veces.
const PAGINAS_COMPILADAS = (() => {
  try {
    const manifiesto = JSON.parse(fs.readFileSync(path.join(ROOT, "publico", "build.json"), "utf8"));
    return manifiesto.rutas || {};
  } catch {
    return {};
  }
})();

const RUTAS_SPA = new Set([
  "/",
  "/quienes-somos",
  "/programa",
  "/prensa",
  "/agenda",
  "/sumate",
]);

// Normaliza la parte de ruta de la URL: sin query y sin barras finales.
function rutaDePagina(url) {
  let p;
  try {
    p = decodeURIComponent(url.split("?")[0].split("#")[0]);
  } catch {
    return null;
  }
  return p.replace(/\/+$/, "") || "/";
}

const PAGINA_404 = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Página no encontrada · Por Águilas</title>
</head>
<body>
<h1>Aquí no hay nada</h1>
<p>La página que buscas no existe o ha cambiado de dirección.</p>
<p><a href="/">Volver a la portada de Por Águilas</a></p>
</body>
</html>
`;

function responder404(res, metodo) {
  const cuerpo = Buffer.from(PAGINA_404, "utf8");
  res.writeHead(404, {
    "content-type": "text/html; charset=utf-8",
    "content-length": String(cuerpo.length),
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "referrer-policy": "strict-origin-when-cross-origin",
  });
  res.end(metodo === "HEAD" ? undefined : cuerpo);
}

// --- Metadatos por ruta ------------------------------------------------------
// Fuente única de la verdad para títulos y descripciones. Se usan dos veces:
//
//   1. El servidor los inyecta en el <head> del HTML que sirve. Es la única
//      forma de que funcionen las og:*, porque los rastreadores de WhatsApp,
//      Telegram, Twitter y Facebook NO ejecutan JavaScript: leen el HTML tal
//      como sale del servidor y se quedan con lo que encuentren ahí.
//   2. Se mandan al cliente como un bloque JSON para que la navegación interna
//      (que sí es JavaScript) mantenga <title> y canonical al día sin duplicar
//      esta tabla en index.html.
//
// Si se añade una ruta hay que darla de alta aquí y en RUTAS_SPA.
const META = {
  "/": {
    titulo: "Por Águilas · Candidatura municipalista de izquierdas · Municipales 2027",
    ogTitulo: "Por Águilas · Municipales 2027",
    desc: "Candidatura municipalista de izquierdas para las elecciones municipales de 2027 en Águilas. Vivienda, servicios públicos, litoral y democracia municipal.",
  },
  "/quienes-somos": {
    titulo: "Quiénes somos · Por Águilas",
    ogTitulo: "Quiénes somos · Por Águilas",
    desc: "Quién está detrás de Por Águilas: una candidatura de unidad de la izquierda hecha en Águilas, con IU y el PCE como fuerzas impulsoras y las puertas abiertas a independientes.",
  },
  "/programa": {
    titulo: "Programa · Por Águilas",
    ogTitulo: "El programa de Por Águilas",
    desc: "Cuatro ejes y propuestas que se pueden llevar a un pleno, presupuestar y auditar: vivienda y coste de vida, servicios públicos y cuidados, litoral y agua, y democracia municipal.",
  },
  "/prensa": {
    titulo: "Sala de prensa · Por Águilas",
    ogTitulo: "Sala de prensa · Por Águilas",
    desc: "Notas de prensa y posiciones públicas de Por Águilas, con fecha y por escrito. Los medios pueden reproducir estos textos libremente citando la fuente.",
  },
  "/agenda": {
    titulo: "Agenda y calendario electoral · Por Águilas",
    ogTitulo: "Agenda de Por Águilas",
    desc: "Asambleas abiertas, mesas sectoriales y actos de Por Águilas, junto al calendario hacia las elecciones municipales de mayo de 2027.",
  },
  "/sumate": {
    titulo: "Súmate a la candidatura · Por Águilas",
    ogTitulo: "Súmate a Por Águilas",
    desc: "Aquí no hace falta carné. Apúntate para recibir las convocatorias de asamblea, participar en las mesas sectoriales o echar una mano en la campaña.",
  },
};

// Páginas sueltas que también deben salir en el sitemap. Son ficheros .html
// reales del repositorio, no rutas de la aplicación.
const PAGINAS_SUELTAS = ["/legal/aviso-legal", "/legal/privacidad", "/legal/cookies"];

const OG_IMAGEN = "/og/por-aguilas-1200x630.png";
const OG_IMAGEN_ALT =
  "Tarjeta de Por Águilas: el logotipo sobre fondo blanco y, debajo, el lema «Águilas se vive todo el año» en blanco sobre verde.";

// Marcadores del bloque que se sustituye en index.html.
const META_INICIO = "<!-- metadatos:inicio -->";
const META_FIN = "<!-- metadatos:fin -->";

function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// El origen sale de la petición, no de una constante: así las URL absolutas son
// correctas hoy en el subdominio de Railway y el día que se apunte el dominio
// propio, sin tocar ni una línea. (Ver decisión de dominio pendiente.)
function origenDe(req) {
  const proto = (req.headers["x-forwarded-proto"] || "").split(",")[0].trim() || "http";
  const host = (req.headers["x-forwarded-host"] || req.headers.host || "localhost").split(",")[0].trim();
  return proto + "://" + host;
}

function jsonLd(origen) {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Por Águilas",
    alternateName: "Por Águilas · Candidatura municipalista",
    url: origen + "/",
    logo: origen + "/logo/por-aguilas-logotipo.png",
    image: origen + OG_IMAGEN,
    description: META["/"].desc,
    email: "admin@por-aguilas.es",
    areaServed: {
      "@type": "AdministrativeArea",
      name: "Águilas",
      address: {
        "@type": "PostalAddress",
        addressLocality: "Águilas",
        addressRegion: "Región de Murcia",
        addressCountry: "ES",
      },
    },
    contactPoint: {
      "@type": "ContactPoint",
      contactType: "información general",
      email: "admin@por-aguilas.es",
      availableLanguage: ["es"],
    },
  };
}

// Construye el bloque de <head> que se inyecta para una ruta concreta.
function bloqueMeta(ruta, origen) {
  const m = META[ruta] || META["/"];
  const url = origen + ruta;
  const imagen = origen + OG_IMAGEN;
  const l = [];
  l.push("<title>" + esc(m.titulo) + "</title>");
  l.push('<meta name="description" content="' + esc(m.desc) + '">');
  l.push('<link rel="canonical" href="' + esc(url) + '">');
  l.push('<meta property="og:type" content="website">');
  l.push('<meta property="og:locale" content="es_ES">');
  l.push('<meta property="og:site_name" content="Por Águilas">');
  l.push('<meta property="og:title" content="' + esc(m.ogTitulo) + '">');
  l.push('<meta property="og:description" content="' + esc(m.desc) + '">');
  l.push('<meta property="og:url" content="' + esc(url) + '">');
  // URL absoluta y PNG: los rastreadores no resuelven rutas relativas de forma
  // fiable y ninguno de los cuatro grandes rasteriza SVG en la vista previa.
  l.push('<meta property="og:image" content="' + esc(imagen) + '">');
  l.push('<meta property="og:image:width" content="1200">');
  l.push('<meta property="og:image:height" content="630">');
  l.push('<meta property="og:image:alt" content="' + esc(OG_IMAGEN_ALT) + '">');
  l.push('<meta name="twitter:card" content="summary_large_image">');
  l.push('<meta name="twitter:title" content="' + esc(m.ogTitulo) + '">');
  l.push('<meta name="twitter:description" content="' + esc(m.desc) + '">');
  l.push('<meta name="twitter:image" content="' + esc(imagen) + '">');
  l.push('<meta name="twitter:image:alt" content="' + esc(OG_IMAGEN_ALT) + '">');
  l.push(
    '<script type="application/ld+json">' +
      JSON.stringify(jsonLd(origen)).replace(/</g, "\\u003c") +
      "</script>"
  );
  // Tabla completa para el cliente. Es un <script type="application/json">: el
  // navegador no lo ejecuta, así que no necesita hash en la CSP.
  l.push(
    '<script type="application/json" id="pa-meta">' +
      JSON.stringify({ origen, rutas: META }).replace(/</g, "\\u003c") +
      "</script>"
  );
  // Datos de la cuenta de donaciones, tal como los declara src/config.js. El
  // index.html del repositorio lleva escrito este mismo bloque para que la web
  // siga enseñando el IBAN correcto abierta con doble clic, sin servidor; aquí
  // se reescribe con lo que diga la configuración, que es la fuente única. El
  // arranque aborta si los dos dejan de coincidir (revisarPuestaEnMarcha).
  l.push(
    '<script type="application/json" id="pa-donaciones">' +
      JSON.stringify(donacionesPublicas()).replace(/</g, "\\u003c") +
      "</script>"
  );
  return l.join("\n");
}

// Cachea el HTML ya inyectado. La clave incluye el origen porque las URL
// absolutas cambian con el dominio desde el que se pide.
const htmlCache = new Map();

async function htmlConMeta(file, ruta, origen, stat) {
  const clave = file + "|" + ruta + "|" + origen;
  const guardado = htmlCache.get(clave);
  if (guardado && guardado.mtimeMs === stat.mtimeMs) return guardado;

  const bruto = await fsp.readFile(file, "utf8");
  const i = bruto.indexOf(META_INICIO);
  const j = bruto.indexOf(META_FIN);
  // Las páginas sueltas (legal/, sumate/) no llevan marcadores: se sirven tal cual.
  if (i === -1 || j === -1 || j < i) return null;

  const html = bruto.slice(0, i) + bloqueMeta(ruta, origen) + bruto.slice(j + META_FIN.length);
  const buf = Buffer.from(html, "utf8");
  const entrada = {
    mtimeMs: stat.mtimeMs,
    buf,
    etag: 'W/"' + buf.length + "-" + Number(stat.mtimeMs).toString(36) + "-" +
      crypto.createHash("sha256").update(clave).digest("base64url").slice(0, 8) + '"',
  };
  htmlCache.set(clave, entrada);
  return entrada;
}

function robotsTxt(origen) {
  return [
    "User-agent: *",
    "Allow: /",
    "",
    "# Páginas de confirmación de altas y bajas: son de un solo uso y llevan",
    "# token en la URL, no tienen nada que indexar.",
    "Disallow: /sumate/",
    "",
    "Sitemap: " + origen + "/sitemap.xml",
    "",
  ].join("\n");
}

function sitemapXml(origen, lastmod) {
  const urls = [...RUTAS_SPA, ...PAGINAS_SUELTAS];
  const cuerpo = urls
    .map((r) => {
      // La portada es la más importante; el resto, por debajo.
      const prio = r === "/" ? "1.0" : r.startsWith("/legal/") ? "0.2" : "0.7";
      return (
        "  <url>\n" +
        "    <loc>" + esc(origen + r) + "</loc>\n" +
        "    <lastmod>" + lastmod + "</lastmod>\n" +
        "    <priority>" + prio + "</priority>\n" +
        "  </url>"
      );
    })
    .join("\n");
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    cuerpo +
    "\n</urlset>\n"
  );
}

function responderTexto(res, metodo, cuerpoTexto, tipo) {
  const buf = Buffer.from(cuerpoTexto, "utf8");
  res.writeHead(200, {
    "content-type": tipo,
    "content-length": String(buf.length),
    "cache-control": "public, max-age=3600",
    "x-content-type-options": "nosniff",
  });
  res.end(metodo === "HEAD" ? undefined : buf);
}

// --- Content-Security-Policy -------------------------------------------------
// La política es "todo desde el propio dominio" y nada más: desde que React y
// las tipografías están auto-alojados (ver el <head> de index.html) no queda
// ningún tercero al que haga falta abrir la puerta. Las excepciones son estas,
// y cada una está aquí por un motivo concreto del runtime de Claude Design:
//
//   (ya no hay 'unsafe-eval')  Lo hubo mientras la web se pintaba en el
//                              navegador con el runtime de Claude Design, que
//                              compila su lógica con new Function(). Desde que
//                              lo que se publica es HTML compilado por
//                              scripts/compilar.js, no queda nada que evaluar y
//                              la política puede decir script-src 'self'.
//   script-src 'sha256-...'    en lugar de 'unsafe-inline' para los dos <script>
//                              en línea de index.html (el mapa __resources y el
//                              centinela de dependencias externas). Se calculan
//                              leyendo el index.html real, así que un XSS que
//                              inyecte otro <script> en línea NO se ejecuta.
//   style-src 'unsafe-inline'  la plantilla está hecha con atributos style= en
//                              cada nodo, y el runtime inyecta <style> generados
//                              (BASE_CSS, FULL_PAGE_CSS y las reglas de
//                              style-hover). No es "hasheable" y el riesgo de
//                              CSS en línea es mucho menor que el de JS.
//   img-src data:              margen para iconos en línea; hoy no se usa ninguno.
//
// object-src/base-uri a 'none' y form-action a 'self' cierran los vectores
// clásicos (plugins, secuestro de <base>, envío del formulario a un tercero).
const CSP_BASE = [
  "default-src 'self'",
  "base-uri 'none'",
  "object-src 'none'",
  "frame-ancestors 'self'",
  "form-action 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "style-src 'self' 'unsafe-inline'",
];

// Los hashes se calculan del HTML que se va a servir, no siempre del index:
// las páginas sueltas (legal/, sumate/) tienen sus propios scripts en línea, o
// ninguno. Se cachea por fichero y mtime para no releer en cada petición y para
// que editar en local no obligue a reiniciar el servidor.
const cspCache = new Map();

function hashesDeScriptsEnLinea(html) {
  const hashes = [];
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const attrs = m[1];
    if (/\bsrc\s*=/i.test(attrs)) continue; // externo: lo cubre 'self'
    // Los <script type="..."> con un tipo que no es JavaScript (aquí
    // text/x-dc) no los ejecuta el navegador, así que CSP ni los mira.
    const tipo = /\btype\s*=\s*["']?([^"'\s>]+)/i.exec(attrs);
    if (tipo && !/^(text\/javascript|application\/javascript|module)$/i.test(tipo[1])) continue;
    hashes.push("'sha256-" + crypto.createHash("sha256").update(m[2], "utf8").digest("base64") + "'");
  }
  return hashes;
}

async function csp(file) {
  try {
    const st = await fsp.stat(file);
    const guardado = cspCache.get(file);
    if (guardado && guardado.mtimeMs === st.mtimeMs) return guardado.valor;
    const html = await fsp.readFile(file, "utf8");
    // Ya no hay ninguna página que necesite 'unsafe-eval'. Lo que se publica es
    // HTML compilado (publico/, generado por scripts/compilar.js) más app.js,
    // que es JavaScript normal servido desde el propio sitio. Nada evalúa nada.
    //
    // Si alguna página vuelve a cargar el runtime, la política deja de cuadrar
    // y se avisa en vez de reabrir el agujero en silencio: es exactamente el
    // riesgo R12 y no debe volver por la puerta de atrás.
    if (html.includes("support.js")) {
      console.error(
        "[csp] " + file + " carga support.js, que necesita 'unsafe-eval'. NO se abre la " +
          "política: la página se servirá rota. Compílala con scripts/compilar.js."
      );
    }
    const fuentes = ["'self'"];
    for (const h of hashesDeScriptsEnLinea(html)) fuentes.push(h);
    const valor = [...CSP_BASE, "script-src " + fuentes.join(" ")].join("; ");
    cspCache.set(file, { mtimeMs: st.mtimeMs, valor });
    return valor;
  } catch (err) {
    // Si el hasheo falla preferimos una política más floja a una web en blanco,
    // pero que quede constancia en los logs de Railway.
    console.error("[csp] no se han podido calcular los hashes en línea:", err.message);
    return [...CSP_BASE, "script-src 'self'"].join("; ");
  }
}

const servidor = http.createServer(async (req, res) => {
  const metodo = req.method || "GET";
  const url = req.url || "/";

  // La API va montada en el mismo proceso y el mismo puerto que el sitio
  // estático: mismo origen, así que no hay CORS que abrir ni un segundo
  // despliegue que mantener. Tiene que ir ANTES del filtro de método, porque
  // es la única parte que recibe POST.
  if (url === "/api" || url.startsWith("/api/") || url.startsWith("/api?")) {
    await api.manejar(req, res);
    return;
  }

  if (metodo !== "GET" && metodo !== "HEAD") {
    res.writeHead(405, { "content-type": "text/plain; charset=utf-8", allow: "GET, HEAD" });
    res.end("Método no permitido");
    return;
  }

  // Healthcheck de Railway.
  if (url === "/healthz" || url === "/healthz/") {
    res.writeHead(200, {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    });
    res.end(JSON.stringify({ ok: true, uptime: process.uptime() }));
    return;
  }

  const ruta = rutaDePagina(url);
  if (ruta === null) {
    responder404(res, metodo);
    return;
  }

  // Se generan al vuelo para que las URL lleven el dominio real desde el que se
  // está sirviendo, sin tener que codificarlo en ningún fichero.
  if (ruta === "/robots.txt") {
    responderTexto(res, metodo, robotsTxt(origenDe(req)), "text/plain; charset=utf-8");
    return;
  }
  if (ruta === "/sitemap.xml") {
    const st = await fsp.stat(path.join(ROOT, "index.html")).catch(() => null);
    const lastmod = (st ? st.mtime : new Date()).toISOString().slice(0, 10);
    responderTexto(res, metodo, sitemapXml(origenDe(req), lastmod), "application/xml; charset=utf-8");
    return;
  }

  // /programa/ y /programa serían dos URLs distintas para Google. Una redirección
  // permanente deja solo la versión sin barra, que es la del canonical.
  if (ruta !== "/" && ruta !== url.split("?")[0] && RUTAS_SPA.has(ruta)) {
    const query = url.includes("?") ? url.slice(url.indexOf("?")) : "";
    res.writeHead(301, { location: ruta + query, "cache-control": "no-store" });
    res.end();
    return;
  }

  const abs = rutaSegura(url);
  if (abs === null) {
    responder404(res, metodo);
    return;
  }

  let destino = await comoFichero(abs);

  // URLs limpias para las páginas sueltas que sí son ficheros del repositorio:
  // /legal/privacidad sirve legal/privacidad.html. Así los enlaces públicos no
  // tienen que llevar .html a rastras.
  if (!destino && !path.extname(abs)) {
    destino = await comoFichero(abs + ".html");
  }

  // Las rutas de página se sirven ya pintadas desde publico/, que genera
  // scripts/compilar.js a partir de index.html. Ya no se manda una plantilla
  // para que la monte el navegador: llega el HTML entero, sin runtime y sin
  // nada que evaluar. Ese es el cambio que permite quitar 'unsafe-eval'.
  if (!destino && RUTAS_SPA.has(ruta)) {
    const pagina = PAGINAS_COMPILADAS[ruta];
    if (pagina) destino = await comoFichero(path.join(ROOT, "publico", pagina + ".html"));
  }

  if (!destino) {
    responder404(res, metodo);
    return;
  }

  const { file, stat } = destino;
  const esHtml = path.extname(file).toLowerCase() === ".html";

  // El HTML del index se sirve con los metadatos de la ruta ya escritos dentro,
  // porque los rastreadores de redes sociales no ejecutan JavaScript. Las demás
  // páginas HTML no llevan marcadores y salen tal cual (inyectado === null).
  const inyectado = esHtml ? await htmlConMeta(file, ruta, origenDe(req), stat) : null;

  const etag = inyectado
    ? inyectado.etag
    : `W/"${stat.size}-${Number(stat.mtimeMs).toString(36)}"`;

  const cabeceras = {
    "content-type": TIPOS[path.extname(file).toLowerCase()] || "application/octet-stream",
    "content-length": String(inyectado ? inyectado.buf.length : stat.size),
    "cache-control": cacheHeader(file),
    etag,
    "last-modified": stat.mtime.toUTCString(),
    "x-content-type-options": "nosniff",
    "referrer-policy": "strict-origin-when-cross-origin",
    "x-frame-options": "SAMEORIGIN",
  };

  // La CSP solo tiene sentido en el documento; en los assets es peso muerto.
  if (esHtml) cabeceras["content-security-policy"] = await csp(file);

  // Railway termina el TLS y reenvía el esquema original. Solo se manda HSTS
  // sobre HTTPS: en http:// el navegador la ignora y en local estorba.
  if ((req.headers["x-forwarded-proto"] || "").split(",")[0].trim() === "https") {
    cabeceras["strict-transport-security"] = "max-age=31536000; includeSubDomains";
  }

  if (req.headers["if-none-match"] === etag) {
    res.writeHead(304, { etag, "cache-control": cabeceras["cache-control"] });
    res.end();
    return;
  }

  res.writeHead(200, cabeceras);
  if (metodo === "HEAD") {
    res.end();
    return;
  }

  if (inyectado) {
    res.end(inyectado.buf);
    return;
  }

  try {
    await pipeline(fs.createReadStream(file), res);
  } catch (err) {
    if (err?.code !== "ERR_STREAM_PREMATURE_CLOSE") {
      console.error("[static] error sirviendo", file, err);
    }
    res.destroy();
  }
});

// Comprobación de arranque: si vendor/ o fonts/ no llegan al despliegue (por
// ejemplo, porque se olvidó añadirlos al commit), el navegador se encuentra
// con un 404 en React y la web se queda en blanco sin ninguna pista. Mejor
// que grite aquí, en los logs de Railway.
// La compilación tiene que estar al día. Si alguien edita index.html y no
// vuelve a compilar, lo que se publica sigue siendo lo anterior: un fallo
// silencioso donde el equipo cree haber cambiado la web y no ha cambiado nada.
// Se compara la huella del index con la que guardó el build.
(function revisarCompilacion() {
  let manifiesto;
  try {
    manifiesto = JSON.parse(fs.readFileSync(path.join(ROOT, "publico", "build.json"), "utf8"));
  } catch {
    console.error(
      "\n[ARRANQUE] No hay compilación en publico/. La web no se puede servir.\n" +
        "  Ejecuta:  node scripts/compilar.js\n"
    );
    return;
  }
  try {
    const actual = crypto
      .createHash("sha256")
      .update(fs.readFileSync(path.join(ROOT, "index.html"), "utf8"), "utf8")
      .digest("hex");
    if (actual !== manifiesto.huellaIndex) {
      console.warn(
        "\n[ARRANQUE] index.html ha cambiado desde la última compilación.\n" +
          "  Lo que se está sirviendo es la versión ANTERIOR.\n" +
          "  Ejecuta:  node scripts/compilar.js\n"
      );
    }
  } catch {
    console.warn("[ARRANQUE] no se ha podido comprobar si la compilación está al día.");
  }
})();

const IMPRESCINDIBLES = [
  "publico/inicio.html",
  "publico/sumate.html",
  "publico/estilos.css",
  "app.js",
  "fonts/familjen-grotesk-latin.woff2",
  "fonts/familjen-grotesk-latin-ext.woff2",
  "fonts/public-sans-latin.woff2",
  "fonts/public-sans-latin-ext.woff2",
];
const faltan = IMPRESCINDIBLES.filter((f) => !fs.existsSync(path.join(ROOT, f)));
if (faltan.length) {
  console.error(
    "\n[ARRANQUE] Faltan ficheros auto-alojados:\n  - " +
      faltan.join("\n  - ") +
      "\n  publico/ lo genera scripts/compilar.js; las tipografías van en fonts/." +
      "\n  Sin ellos la web no se sirve o se sirve sin tipografías.\n"
  );
}

// Puesta en marcha del backend. El orden importa: primero se dice en voz alta
// si el sistema está en condiciones de recoger datos, y solo si lo está se toca
// la base de datos. Si no lo está, la web se sirve igual y los formularios
// responden 503 con una dirección de correo: mejor una web que funciona con el
// formulario cerrado que una web caída.
const estadoApi = api.informarEstado();

async function arrancarBackend() {
  if (!estadoApi.listo) return;
  try {
    await db.migrar();
    console.log("[db] esquema al día.");
    purga.arrancar();
  } catch (err) {
    console.error(
      "[db] no se ha podido preparar el esquema:",
      err?.code || err?.message || "error",
      "\n     Los formularios darán error hasta que se resuelva."
    );
  }
}

servidor.listen(PORT, HOST, () => {
  console.log(`Por Águilas · sirviendo ${ROOT} en http://${HOST}:${PORT}`);
  arrancarBackend();
});

// Railway envía SIGTERM en cada redespliegue.
for (const sig of ["SIGTERM", "SIGINT"]) {
  process.on(sig, () => {
    console.log(`[${sig}] cerrando servidor...`);
    purga.parar();
    servidor.close(() => db.cerrar().finally(() => process.exit(0)));
    setTimeout(() => process.exit(0), 5000).unref();
  });
}
