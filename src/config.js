// Configuración y constantes del backend de "Súmate".
//
// Todo lo que tiene efectos legales vive aquí y en un solo sitio: el texto de
// consentimiento, su versión, los plazos de conservación y las listas cerradas
// de valores. Si cambia algo de esto, cambia la versión de la política.
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const RAIZ = path.resolve(__dirname, "..");

// --- Versión del consentimiento ---------------------------------------------
// Tiene que coincidir con el <meta name="pa-version-politica"> de la página de
// privacidad publicada. Si no coinciden, el backend se niega a aceptar altas:
// guardar un consentimiento que apunte a un texto distinto del que la persona
// leyó no vale nada como prueba.
const VERSION_POLITICA = "privacidad-2026-09-01";

// Literal exacto de la casilla del formulario. Se guarda tal cual junto a cada
// alta. No se toca sin subir la versión de arriba.
const TEXTO_CONSENTIMIENTO =
  "Consiento expresamente que Izquierda Unida de Águilas trate mis datos, " +
  "incluida mi afinidad política —que es un dato de categoría especial—, con " +
  "la única finalidad de contactarme sobre la candidatura Por Águilas. Puedo " +
  "retirar este consentimiento cuando quiera desde el enlace de baja de " +
  "cualquier correo. He leído la política de privacidad.";

// --- Listas cerradas ---------------------------------------------------------
// Clave estable en la base de datos, etiqueta para el CSV y el formulario. Las
// claves no se renombran nunca aunque cambie el texto de cara al público.
const COMO = new Map([
  ["info", "Solo quiero recibir información"],
  ["asambleas", "Ir a las asambleas abiertas"],
  ["calle", "Echar horas en la calle y en actos"],
  ["sectorial", "Aportar en una mesa sectorial"],
  ["candidatura", "Estar en la candidatura"],
  ["economico", "Colaborar económicamente"],
]);

// Zonas del municipio. Lista cerrada a propósito: en texto libre la gente
// escribe su dirección completa, y no la queremos.
const ZONAS = new Map([
  ["casco", "Casco urbano"],
  ["molinetas", "Las Molinetas"],
  ["cocon", "El Cocón"],
  ["calarreona", "Calarreona"],
  ["calabardina", "Calabardina"],
  ["tebar", "Tébar"],
  ["marina", "La Marina de Cope"],
  ["garrobillo", "El Garrobillo"],
  ["cuesta", "Cuesta de Gos"],
  ["tovar", "Los Tovares"],
  ["otra", "Otra zona de Águilas"],
  ["nd", "Prefiero no decirlo"],
]);

// --- Límites de los campos ---------------------------------------------------
const LIMITES = {
  nombre: 80,
  email: 254,
  mensaje: 1000,
  cuerpo: 16 * 1024, // tamaño máximo del cuerpo de una petición
};

// --- Conservación ------------------------------------------------------------
const CONSERVACION = {
  diasPendiente: 30, // altas sin confirmar
  mesesIp: 12, // IP de la prueba de consentimiento
  horasToken: 48, // validez del enlace de confirmación
  // Borrado total de la lista. Seis meses después de la jornada electoral.
  fechaPurgaTotal: process.env.FECHA_PURGA_TOTAL || "2027-11-30",
};

// --- Antiabuso ---------------------------------------------------------------
const ANTIABUSO = {
  altasPorIpHora: 5,
  altasPorIpDia: 20,
  borradosPorIpHora: 3,
  adminPorIpMinuto: 20,
  correosGlobalesHora: 200, // techo duro: que esto no sea un cañón de correo
  segundosMinimoRelleno: 3,
  horasMaximoRelleno: 6,
  campoTrampa: "pa_web",
};

// --- Entorno -----------------------------------------------------------------
const env = (nombre, porDefecto = "") => (process.env[nombre] || porDefecto).trim();

const CONFIG = {
  urlBase: env("URL_BASE", "http://localhost:3000").replace(/\/+$/, ""),
  databaseUrl: env("DATABASE_URL"),
  adminToken: env("ADMIN_TOKEN"),
  brevoApiKey: env("BREVO_API_KEY"),
  remitente: env("REMITENTE", "no-responder@poraguilas.es"),
  remitenteNombre: env("REMITENTE_NOMBRE", "Por Águilas"),
  respuestaA: env("RESPUESTA_A", "hola@poraguilas.es"),
  secretoHmac: env("SECRETO_HMAC"),
  // Permite arrancar en local sin Brevo: los correos se escriben en consola.
  correoEnConsola: env("CORREO_EN_CONSOLA") === "1",
};

// --- Comprobaciones de arranque ----------------------------------------------
// La regla es la del prompt: sin política de privacidad publicada no se recoge
// ni un dato. Aquí se convierte en código, no en una nota en un documento.
function revisarPuestaEnMarcha() {
  const problemas = [];
  const avisos = [];

  // RUTA_POLITICA solo lo usa el banco de pruebas, para apuntar a una copia de
  // la política con los huecos rellenos. No relaja la comprobación: el fichero
  // al que apunte tiene que pasar exactamente los mismos controles.
  const politica = env("RUTA_POLITICA") || path.join(RAIZ, "legal", "privacidad.html");
  let html = null;
  try {
    html = fs.readFileSync(politica, "utf8");
  } catch {
    problemas.push("No existe legal/privacidad.html: no se puede recoger ningún dato sin ella.");
  }

  if (html) {
    const meta = /name="pa-version-politica"\s+content="([^"]+)"/.exec(html);
    if (!meta) {
      problemas.push("legal/privacidad.html no declara <meta name=\"pa-version-politica\">.");
    } else if (meta[1] !== VERSION_POLITICA) {
      problemas.push(
        `Descuadre de versión: la política publicada dice "${meta[1]}" y el backend espera "${VERSION_POLITICA}".`
      );
    }
    // Los huecos por rellenar (NIF, domicilio) se marcan con "PENDIENTE:" en la
    // plantilla. Con huecos, la política no identifica al responsable y el
    // consentimiento que se recoja no es informado.
    if (/PENDIENTE:/.test(html)) {
      problemas.push(
        "legal/privacidad.html todavía tiene huecos PENDIENTE: (NIF, domicilio). " +
          "Hay que rellenarlos antes de aceptar altas."
      );
    }
  }

  for (const [clave, nombre] of [
    ["databaseUrl", "DATABASE_URL"],
    ["adminToken", "ADMIN_TOKEN"],
    ["secretoHmac", "SECRETO_HMAC"],
  ]) {
    if (!CONFIG[clave]) problemas.push(`Falta la variable de entorno ${nombre}.`);
  }

  if (CONFIG.adminToken && CONFIG.adminToken.length < 32) {
    problemas.push("ADMIN_TOKEN es demasiado corto: mínimo 32 caracteres aleatorios.");
  }
  if (CONFIG.secretoHmac && CONFIG.secretoHmac.length < 32) {
    problemas.push("SECRETO_HMAC es demasiado corto: mínimo 32 caracteres aleatorios.");
  }

  if (!CONFIG.brevoApiKey && !CONFIG.correoEnConsola) {
    problemas.push("Falta BREVO_API_KEY (o CORREO_EN_CONSOLA=1 para desarrollo local).");
  }
  if (CONFIG.correoEnConsola) {
    avisos.push("CORREO_EN_CONSOLA=1: los correos se imprimen, no se envían. Solo para local.");
  }
  if (!/^https:\/\//.test(CONFIG.urlBase) && !/localhost/.test(CONFIG.urlBase)) {
    problemas.push(`URL_BASE debería ser https:// en producción (ahora: ${CONFIG.urlBase}).`);
  }

  return { listo: problemas.length === 0, problemas, avisos };
}

module.exports = {
  RAIZ,
  VERSION_POLITICA,
  TEXTO_CONSENTIMIENTO,
  COMO,
  ZONAS,
  LIMITES,
  CONSERVACION,
  ANTIABUSO,
  CONFIG,
  revisarPuestaEnMarcha,
};
