// Enrutado de /api/*.
//
// Va montado dentro del mismo servidor y el mismo puerto que el sitio estático:
// mismo origen, así que no hay CORS que configurar ni un segundo despliegue que
// mantener. Deliberadamente no se responde ninguna cabecera CORS, y eso ya
// impide que otro sitio mande peticiones JSON aquí.
"use strict";

const { revisarPuestaEnMarcha } = require("./config.js");
const { json } = require("./http.js");
const sumate = require("./sumate.js");
const donacion = require("./donacion.js");
const admin = require("./admin.js");

// Se evalúa una vez al arrancar. La regla es la del encargo: sin política de
// privacidad publicada y sin secretos configurados, no se recoge ni un dato.
const ESTADO = revisarPuestaEnMarcha();

const MENSAJE_NO_LISTO = {
  ok: false,
  mensaje:
    "El formulario todavía no está activo. Escríbenos a hola@poraguilas.es y te apuntamos a mano.",
};

async function manejar(req, res) {
  let url;
  try {
    url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  } catch {
    return json(res, 400, { ok: false, mensaje: "Petición no válida." });
  }

  const ruta = url.pathname.replace(/\/+$/, "") || "/api";
  const metodo = req.method || "GET";

  try {
    // --- Súmate ---------------------------------------------------------------
    if (ruta === "/api/sumate") {
      if (metodo !== "POST") return noPermitido(res, "POST");
      if (!ESTADO.listo) return json(res, 503, MENSAJE_NO_LISTO);
      return await sumate.alta(req, res);
    }

    if (ruta === "/api/sumate/confirmar") {
      if (metodo === "GET") return sumate.confirmarPagina(req, res, url);
      if (metodo === "POST") return await sumate.confirmar(req, res);
      return noPermitido(res, "GET, POST");
    }

    if (ruta === "/api/sumate/baja") {
      if (metodo === "GET") return sumate.bajaPagina(req, res, url);
      if (metodo === "POST") return await sumate.baja(req, res, url);
      return noPermitido(res, "GET, POST");
    }

    if (ruta === "/api/sumate/borrar") {
      if (metodo !== "POST") return noPermitido(res, "POST");
      // Borrarse tiene que funcionar siempre, esté o no abierto el alta.
      return await sumate.borrar(req, res);
    }

    // --- Donaciones -----------------------------------------------------------
    // Comunicación previa de una transferencia. No cobra: ver donacion.js.
    if (ruta === "/api/donacion") {
      if (metodo !== "POST") return noPermitido(res, "POST");
      if (!ESTADO.listo) return json(res, 503, MENSAJE_NO_LISTO);
      return await donacion.comunicar(req, res);
    }

    // --- Panel del equipo -----------------------------------------------------
    if (
      ruta === "/api/admin/altas" ||
      ruta === "/api/admin/altas.csv" ||
      ruta === "/api/admin/donaciones" ||
      ruta === "/api/admin/donaciones.csv"
    ) {
      return await admin.manejar(req, res, url);
    }

    // --- Diagnóstico ----------------------------------------------------------
    // Sin secretos y sin cifras de la lista: solo si el sistema está en marcha
    // y, si no lo está, qué falta por hacer.
    if (ruta === "/api/salud" && metodo === "GET") {
      return json(res, ESTADO.listo ? 200 : 503, {
        ok: ESTADO.listo,
        altasAbiertas: ESTADO.listo,
        pendiente: ESTADO.problemas,
      });
    }

    return json(res, 404, { ok: false, mensaje: "No existe." });
  } catch (err) {
    console.error("[api] error no controlado:", err?.code || err?.message || "error");
    if (!res.headersSent) {
      return json(res, 500, { ok: false, mensaje: "Algo ha fallado por nuestra parte." });
    }
    res.destroy();
  }
}

const noPermitido = (res, permitidos) =>
  json(res, 405, { ok: false, mensaje: "Método no permitido." }, { allow: permitidos });

// Para que server.js pueda avisar por consola en el arranque.
function informarEstado() {
  for (const aviso of ESTADO.avisos) console.warn(`[sumate] aviso: ${aviso}`);
  if (ESTADO.listo) {
    console.log("[sumate] backend activo: el formulario acepta altas.");
  } else {
    console.warn("[sumate] backend INACTIVO. El formulario responde 503 hasta resolver:");
    for (const p of ESTADO.problemas) console.warn(`  · ${p}`);
  }
  return ESTADO;
}

module.exports = { manejar, informarEstado, ESTADO };
