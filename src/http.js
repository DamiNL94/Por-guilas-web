// Utilidades de petición y respuesta compartidas por los manejadores de la API.
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { LIMITES } = require("./config.js");

// Nada de lo que sale de la API se cachea: son datos personales y respuestas
// que dependen de quién pregunta.
const SIN_CACHE = {
  "cache-control": "no-store, no-cache, must-revalidate, private",
  pragma: "no-cache",
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
  "x-robots-tag": "noindex, nofollow",
};

function json(res, codigo, objeto, extra = {}) {
  const cuerpo = JSON.stringify(objeto);
  res.writeHead(codigo, {
    ...SIN_CACHE,
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(cuerpo),
    ...extra,
  });
  res.end(cuerpo);
}

// Responde y cierra la conexión. Para cuando queda cuerpo sin leer en la
// petición —un envío que se pasó de tamaño— y no interesa seguir tragándolo.
function jsonYCerrar(req, res, codigo, objeto) {
  const cuerpo = JSON.stringify(objeto);
  res.writeHead(codigo, {
    ...SIN_CACHE,
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(cuerpo),
    connection: "close",
  });
  res.end(cuerpo, () => req.destroy());
}

function html(res, codigo, cuerpo, extra = {}) {
  res.writeHead(codigo, {
    ...SIN_CACHE,
    "content-type": "text/html; charset=utf-8",
    "content-length": Buffer.byteLength(cuerpo),
    ...extra,
  });
  res.end(cuerpo);
}

function texto(res, codigo, cuerpo, extra = {}) {
  res.writeHead(codigo, {
    ...SIN_CACHE,
    "content-type": "text/plain; charset=utf-8",
    "content-length": Buffer.byteLength(cuerpo),
    ...extra,
  });
  res.end(cuerpo);
}

// 303 en vez de 302: tras un POST hay que seguir con GET, y así recargar la
// página de destino no reenvía el formulario.
function redirigir(res, destino, codigo = 303) {
  res.writeHead(codigo, { ...SIN_CACHE, location: destino });
  res.end();
}

// --- Cuerpo de la petición ---------------------------------------------------

// Lee el cuerpo con tope de tamaño y lo interpreta según el content-type.
// Acepta JSON (lo que manda el formulario de la web) y urlencoded (lo que
// mandan los formularios HTML sin JavaScript de las páginas de confirmación).
async function leerCuerpo(req, maximo = LIMITES.cuerpo) {
  const tipo = String(req.headers["content-type"] || "").split(";")[0].trim().toLowerCase();

  if (tipo !== "application/json" && tipo !== "application/x-www-form-urlencoded") {
    return { error: "tipo", tipo };
  }

  const trozos = [];
  let total = 0;
  for await (const trozo of req) {
    total += trozo.length;
    if (total > maximo) {
      // No se destruye aquí el socket: si se corta ahora, quien envió el
      // formulario ve una conexión rota en vez del 413 y no entiende nada.
      // Se deja de leer y contesta `jsonYCerrar`, que cierra al terminar.
      req.pause();
      return { error: "grande" };
    }
    trozos.push(trozo);
  }

  const crudo = Buffer.concat(trozos).toString("utf8");

  if (tipo === "application/x-www-form-urlencoded") {
    const p = new URLSearchParams(crudo);
    const datos = {};
    // Solo el primer valor de cada clave: repetir un campo es la forma barata
    // de intentar confundir a un validador.
    for (const clave of new Set(p.keys())) datos[clave] = p.get(clave);
    return { datos, formulario: true };
  }

  if (!crudo.trim()) return { datos: {}, formulario: false };
  try {
    const datos = JSON.parse(crudo);
    if (datos === null || typeof datos !== "object" || Array.isArray(datos)) {
      return { error: "json" };
    }
    return { datos, formulario: false };
  } catch {
    return { error: "json" };
  }
}

// Mismo origen. El navegador ya impide mandar JSON desde otro origen sin
// preflight, y como no respondemos cabeceras CORS ese preflight nunca pasa;
// esto cubre además los formularios urlencoded, que sí son peticiones simples.
function origenAjeno(req) {
  const origen = req.headers.origin;
  if (!origen) return false; // los formularios del propio sitio pueden no mandarlo

  // Origen opaco. Las páginas de confirmar y de borrar se sirven con
  // Referrer-Policy: no-referrer, para que el token de la URL no viaje en el
  // Referer, y Chrome ata a esa política el Origin de los POST de navegación:
  // manda literalmente "null" aunque el formulario esté en la propia página.
  // Sin esto, confirmar el alta desde Chrome contestaba siempre "ese enlace ya
  // no vale", y nadie llegaba a quedar apuntado. Se resuelve con Sec-Fetch-Site,
  // que lo pone el navegador y una web ajena no puede falsear: "same-origin" es
  // justo lo que se quería comprobar. Si no llega ninguna de las dos cabeceras
  // no hay forma de saberlo, y entonces sí se rechaza.
  if (origen === "null") return req.headers["sec-fetch-site"] !== "same-origin";

  try {
    return new URL(origen).host !== String(req.headers.host || "");
  } catch {
    return true;
  }
}

const quiereJson = (req) => String(req.headers.accept || "").includes("application/json");

// --- Plantillas --------------------------------------------------------------

const cache = new Map();

// Las plantillas viven en src/, que el servidor estático no publica, así que
// nadie puede pedirlas con el marcador dentro.
function plantilla(nombre, sustituciones = {}) {
  let bruto = cache.get(nombre);
  if (bruto === undefined) {
    bruto = fs.readFileSync(path.join(__dirname, "plantillas", nombre), "utf8");
    cache.set(nombre, bruto);
  }
  let salida = bruto;
  for (const [clave, valor] of Object.entries(sustituciones)) {
    salida = salida.split(`__${clave}__`).join(valor);
  }
  return salida;
}

module.exports = {
  SIN_CACHE,
  json,
  jsonYCerrar,
  html,
  texto,
  redirigir,
  leerCuerpo,
  origenAjeno,
  quiereJson,
  plantilla,
};
