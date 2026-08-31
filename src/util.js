// Validación, normalización y utilidades de criptografía.
//
// Nada de lo que llega del navegador se cree: el `required` del HTML es una
// comodidad para quien rellena el formulario, no una defensa.
"use strict";

const crypto = require("node:crypto");
const { LIMITES, COMO, ZONAS, CONFIG, ANTIABUSO } = require("./config.js");

// --- Texto -------------------------------------------------------------------
//
// Estas expresiones se construyen con `new RegExp` y escapes ASCII a propósito:
// escritas con los caracteres literales, cualquier editor o herramienta que
// toque el fichero puede comérselos o convertirlos, y el fichero deja de
// compilar sin que se vea por qué.

// Caracteres de control C0 y C1, más DEL.
const CONTROL = new RegExp("[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\u007F-\\u009F]", "g");
// Espacios "raros": no separable, de puntuación, ideográfico y compañía.
const ESPACIOS = new RegExp("[ \\t\\u00A0\\u1680\\u2000-\\u200A\\u202F\\u205F\\u3000]+", "g");
// Invisibles de anchura cero, marcas de dirección y BOM. Se cuelan al pegar
// desde otras aplicaciones y sirven para camuflar texto.
const INVISIBLES = new RegExp(
  "[\\u200B-\\u200F\\u202A-\\u202E\\u2060-\\u2064\\u2066-\\u2069\\uFEFF]",
  "g"
);
const SALTOS = new RegExp("[\\r\\n\\u2028\\u2029]+", "g");

function limpiar(v) {
  if (typeof v !== "string") return "";
  return v
    .normalize("NFC")
    .replace(INVISIBLES, "")
    .replace(CONTROL, " ")
    .replace(SALTOS, " ")
    .replace(ESPACIOS, " ")
    .trim();
}

// Igual, pero conservando los saltos de línea (para el mensaje libre).
function limpiarMultilinea(v) {
  if (typeof v !== "string") return "";
  return v
    .normalize("NFC")
    .replace(new RegExp("\\r\\n?|\\u2028|\\u2029", "g"), "\n")
    .replace(INVISIBLES, "")
    .replace(CONTROL, " ")
    .replace(ESPACIOS, " ")
    .replace(new RegExp(" *\\n *", "g"), "\n")
    .replace(new RegExp("\\n{3,}", "g"), "\n\n")
    .trim();
}

// --- Correo ------------------------------------------------------------------

// Deliberadamente conservador. No intenta validar el RFC entero: comprueba que
// tiene forma de dirección y que se puede entregar. Lo que de verdad valida la
// dirección es que llegue el correo de confirmación.
const RE_EMAIL =
  /^[^\s@,;:<>()[\]\\"]{1,64}@(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;

function normalizarEmail(v) {
  // Sin quitar puntos ni sufijos "+algo": esa convención es de cada proveedor,
  // y decidir por nuestra cuenta que dos direcciones son la misma acabaría
  // fusionando las fichas de dos personas distintas.
  return limpiar(v).toLowerCase();
}

function emailValido(v) {
  if (!v || v.length > LIMITES.email) return false;
  if (v.includes("..")) return false;
  if (v.startsWith(".") || v.startsWith("@") || v.endsWith(".")) return false;
  return RE_EMAIL.test(v);
}

// --- Criptografía ------------------------------------------------------------

// 32 bytes aleatorios: ni se adivina ni se fuerza por bruta. En la base de
// datos solo se guarda el hash, así que un volcado robado no da enlaces
// funcionando.
function nuevoToken() {
  const claro = crypto.randomBytes(32).toString("base64url");
  return { claro, hash: hashToken(claro) };
}

function hashToken(claro) {
  return crypto.createHash("sha256").update(claro, "utf8").digest("hex");
}

// Los tokens salen de base64url, así que cualquier otra cosa se rechaza antes
// de tocar la base de datos o de acabar dentro de una plantilla HTML.
const RE_TOKEN = /^[A-Za-z0-9_-]{43}$/;
const tokenConForma = (v) => typeof v === "string" && RE_TOKEN.test(v);

// Comparación en tiempo constante. Se pasa por un hash primero para que las dos
// cadenas midan siempre lo mismo: timingSafeEqual lanza si difieren en longitud,
// y esa excepción ya sería una filtración.
function igualSeguro(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const da = crypto.createHash("sha256").update(a, "utf8").digest();
  const db = crypto.createHash("sha256").update(b, "utf8").digest();
  return crypto.timingSafeEqual(da, db);
}

// Seudonimiza un valor para poder anotarlo sin guardar el dato en claro.
function hmac(valor) {
  return crypto
    .createHmac("sha256", CONFIG.secretoHmac || "sin-secreto")
    .update(String(valor), "utf8")
    .digest("hex");
}

function escaparHtml(v) {
  return String(v)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// --- IP ----------------------------------------------------------------------

// Railway va detrás de proxy: la IP real es el primer salto de la cadena. Se
// confía en la cabecera porque el proxy la reescribe; servido a pelo, sin
// proxy delante, esto sería falsificable.
function ipDe(req) {
  const cab = req.headers["x-forwarded-for"];
  if (typeof cab === "string" && cab.length) {
    const primera = cab.split(",")[0].trim();
    if (primera) return primera.replace(/^::ffff:/, "");
  }
  return (req.socket?.remoteAddress || "").replace(/^::ffff:/, "") || "0.0.0.0";
}

// --- Validación del formulario ----------------------------------------------

// Devuelve { datos, errores }. `errores` es un objeto campo -> mensaje, listo
// para pintarlo debajo de cada campo del formulario.
function validarAlta(cuerpo) {
  const errores = {};
  const d = {};

  d.nombre = limpiar(cuerpo.nombre);
  if (!d.nombre) errores.nombre = "Escribe tu nombre.";
  else if (d.nombre.length < 2) errores.nombre = "Ese nombre se queda corto.";
  else if (d.nombre.length > LIMITES.nombre) errores.nombre = `Máximo ${LIMITES.nombre} caracteres.`;
  else if (!/\p{L}/u.test(d.nombre)) errores.nombre = "El nombre tiene que llevar alguna letra.";

  d.email = normalizarEmail(cuerpo.email);
  if (!d.email) errores.email = "Necesitamos un correo para escribirte.";
  else if (!emailValido(d.email)) errores.email = "Ese correo no parece válido. Revísalo.";

  const zona = limpiar(cuerpo.zona);
  if (!zona) d.zona = null;
  else if (ZONAS.has(zona)) d.zona = zona;
  else errores.zona = "Elige una zona de la lista.";

  const como = limpiar(cuerpo.como) || "info";
  if (COMO.has(como)) d.como = como;
  else errores.como = "Elige una opción de la lista.";

  d.mensaje = limpiarMultilinea(cuerpo.mensaje) || null;
  if (d.mensaje && d.mensaje.length > LIMITES.mensaje) {
    errores.mensaje = `Máximo ${LIMITES.mensaje} caracteres.`;
  }

  // El consentimiento no admite interpretaciones: o llega afirmativo, o no hay
  // alta. Es la única base jurídica que tenemos.
  const acepta = cuerpo.consentimiento;
  d.consentimiento = acepta === true || acepta === "true" || acepta === "on" || acepta === "1";
  if (!d.consentimiento) {
    errores.consentimiento = "Sin tu permiso expreso no podemos guardar nada. Es obligatorio.";
  }

  return { datos: d, errores };
}

// Trampa y tiempo de relleno. No son una defensa seria —el reloj lo pone el
// navegador y se puede falsear— pero filtran los robots tontos sin poner un
// CAPTCHA de terceros delante de nadie. La defensa de verdad es el doble
// opt-in: un alta basura nunca se confirma y se borra a los 30 días.
function pareceRobot(cuerpo, ahora = Date.now()) {
  if (limpiar(cuerpo[ANTIABUSO.campoTrampa])) return true;

  const t0 = Number(cuerpo.t0);
  if (!Number.isFinite(t0) || t0 <= 0) return true;
  const segundos = (ahora - t0) / 1000;
  if (segundos < ANTIABUSO.segundosMinimoRelleno) return true;
  if (segundos > ANTIABUSO.horasMaximoRelleno * 3600) return true;

  return false;
}

module.exports = {
  limpiar,
  limpiarMultilinea,
  normalizarEmail,
  emailValido,
  nuevoToken,
  hashToken,
  tokenConForma,
  igualSeguro,
  hmac,
  escaparHtml,
  ipDe,
  validarAlta,
  pareceRobot,
};
