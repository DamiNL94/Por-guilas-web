// Validación, normalización y utilidades de criptografía.
//
// Nada de lo que llega del navegador se cree: el `required` del HTML es una
// comodidad para quien rellena el formulario, no una defensa.
"use strict";

const crypto = require("node:crypto");
const {
  LIMITES,
  COMO,
  ZONAS,
  CONFIG,
  ANTIABUSO,
  CONSENTIMIENTOS,
  DECLARACIONES,
  DONACIONES,
  ibanValido,
} = require("./config.js");

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

// --- Documento de identidad --------------------------------------------------
//
// Solo persona física: DNI (8 dígitos + letra) o NIE (X/Y/Z + 7 dígitos +
// letra). El NIF de una persona jurídica empieza por A, B, C, D, E, F, G, H, J,
// N, P, Q, R, S, U, V o W, y ninguno de esos encaja en la expresión de abajo,
// así que un CIF se rechaza por construcción y no por una lista negra que haya
// que mantener. Es la traducción a código del art. 5.1.a de la LO 8/2007: las
// donaciones de personas jurídicas están prohibidas y son nulas.
const LETRAS_DNI = "TRWAGMYFPDXBNJZSQVHLCKE";
const RE_DNI = /^([XYZ]?)(\d{7,8})([A-Z])$/;

const normalizarDni = (v) => limpiar(v).toUpperCase().replace(/[\s.\-_/]/g, "");

function dniNieValido(v) {
  const s = normalizarDni(v);
  if (s.length > LIMITES.dni) return false;
  const m = RE_DNI.exec(s);
  if (!m) return false;

  const [, prefijo, digitos, letra] = m;
  let numero;
  if (prefijo) {
    if (digitos.length !== 7) return false; // NIE: X + 7 dígitos, ni uno más
    numero = String("XYZ".indexOf(prefijo)) + digitos;
  } else {
    if (digitos.length !== 8) return false;
    numero = digitos;
  }
  return LETRAS_DNI[Number(numero) % 23] === letra;
}

// --- Teléfono ----------------------------------------------------------------
//
// Solo se pide a quien marca la casilla de colaborar, y solo sirve para
// llamarle. Se acepta el formato de aquí, con o sin prefijo, y se guarda
// normalizado a nueve dígitos.
function normalizarTelefono(v) {
  const s = limpiar(v).replace(/[\s.\-()/]/g, "");
  return /^(\+34|0034|34)/.test(s) ? s.replace(/^(\+34|0034|34)/, "") : s;
}

const telefonoValido = (v) => /^[6789]\d{8}$/.test(v);

// --- Importes ----------------------------------------------------------------
//
// Se acepta lo que la gente escribe de verdad: "50", "50,00", "1.250,50" y
// "1250.50". Devuelve céntimos enteros o null. En céntimos y no en coma
// flotante porque 0.1 + 0.2 no es 0.3 y con dinero eso no se negocia.
function parsearImporte(v) {
  let s = limpiar(v).replace(/[\s€]/g, "");
  if (!s) return null;
  // Con las dos, la última manda como separador decimal.
  if (s.includes(",") && s.includes(".")) {
    s = s.lastIndexOf(",") > s.lastIndexOf(".") ? s.replace(/\./g, "") : s.replace(/,/g, "");
  }
  s = s.replace(",", ".");
  if (!/^\d{1,9}(\.\d{1,2})?$/.test(s)) return null;
  const centimos = Math.round(Number(s) * 100);
  return Number.isSafeInteger(centimos) ? centimos : null;
}

const euros = (centimos) => (centimos / 100).toFixed(2).replace(".", ",");

// --- Fechas ------------------------------------------------------------------
//
// La fecha prevista del ingreso sirve para cuadrar la comunicación con el
// apunte del banco. Ni en el pasado ni a tres meses vista: fuera de esa
// horquilla no cuadra nada.
function fechaPrevistaValida(v, hoy = new Date()) {
  const s = limpiar(v);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + "T12:00:00Z");
  if (!Number.isFinite(d.getTime()) || !s.startsWith(String(d.getUTCFullYear()))) return false;

  const desde = new Date(hoy);
  desde.setUTCHours(0, 0, 0, 0);
  desde.setUTCDate(desde.getUTCDate() - 1); // margen de un día por husos horarios
  const hasta = new Date(desde);
  hasta.setUTCDate(hasta.getUTCDate() + LIMITES.diasFechaPrevista + 1);
  return d >= desde && d <= hasta;
}

// --- Concepto de la transferencia --------------------------------------------
//
// Es la pieza que convierte un ingreso anónimo —prohibido por el art. 5.1.c de
// la LO 8/2007— en una donación nominativa. Formato acordado con la federación,
// que es la titular de la cuenta:
//
//     DONACION AGUILAS <NOMBRE APELLIDOS> <DNI>
//
// Sin tildes ni eñes: hay bancos que las convierten en interrogaciones al
// generar el fichero, y un nombre ilegible en el concepto no identifica a nadie.
function sinAcentos(v) {
  return String(v)
    .normalize("NFD")
    .replace(new RegExp("[\u0300-\u036F]", "g"), "")
    .replace(/[^A-Za-z0-9 ]/g, " ")
    .replace(/ +/g, " ")
    .trim();
}

function conceptoDonacion({ nombre = "", apellidos = "", dni = "" } = {}) {
  const persona = sinAcentos(`${nombre} ${apellidos}`).toUpperCase();
  const doc = normalizarDni(dni);
  const completo = `${DONACIONES.conceptoPrefijo} ${persona} ${doc}`.replace(/ +/g, " ").trim();
  // Muchos bancos recortan el concepto. Si no cabe, esta versión sigue
  // identificando el ingreso: el DNI ya es único y la comunicación previa
  // aporta el resto.
  const corto = `${DONACIONES.conceptoPrefijo} ${doc}`.trim();
  return {
    completo,
    corto,
    largo: completo.length,
    cabe: completo.length <= DONACIONES.conceptoMaximoBanco,
  };
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

// Nombre del campo del formulario por cada casilla. La clave es la que va a la
// base de datos y no se renombra nunca; el nombre del campo es el que viaja en
// el envío. Se declaran juntos para que el servidor valide exactamente las
// mismas casillas que pinta el HTML.
const CAMPO_CONSENTIMIENTO = {
  info: "consiente_info",
  colaborar: "consiente_colaborar",
  edad: "mayor_edad",
};

const CAMPO_DECLARACION = {
  fisica: "declara_fisica",
  sinContrato: "declara_sin_contrato",
  noExtranjero: "declara_no_extranjero",
  privacidad: "acepta_privacidad",
  edadDonante: "declara_mayor_edad",
};

// Una casilla marcada llega como `true` desde el fetch de la web y como "on"
// desde un formulario HTML sin JavaScript. Cualquier otra cosa es un no.
const esAfirmativo = (v) => v === true || v === "true" || v === "on" || v === "1";

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

  // --- Consentimientos -------------------------------------------------------
  //
  // Uno por finalidad, y cada uno por su cuenta. El obligatorio es el de
  // informar: sin él no hay base jurídica y no hay alta. Los otros dos amplían
  // lo que se puede hacer, y no marcarlos no penaliza nada.
  d.consentimientos = {};
  for (const [clave, def] of CONSENTIMIENTOS) {
    const marcada = esAfirmativo(cuerpo[CAMPO_CONSENTIMIENTO[clave]]);
    d.consentimientos[clave] = marcada;
    if (def.obligatorio && !marcada) {
      errores[CAMPO_CONSENTIMIENTO[clave]] =
        clave === "edad"
          ? "El formulario es para mayores de edad. Tienes que declararlo."
          : "Sin tu permiso expreso no podemos guardar nada. Es obligatorio.";
    }
  }

  // El teléfono solo existe si se ha pedido colaborar. Es la minimización del
  // art. 5.1.c RGPD llevada al código: si el dato no hace falta para la
  // finalidad que la persona ha aceptado, no se guarda aunque venga en el
  // envío. Quien mande un teléfono sin marcar la casilla lo verá descartado
  // en silencio, que es lo correcto.
  d.telefono = null;
  if (d.consentimientos.colaborar) {
    const tel = normalizarTelefono(cuerpo.telefono);
    if (tel) {
      if (telefonoValido(tel)) d.telefono = tel;
      else errores.telefono = "Ese teléfono no parece de aquí. Nueve dígitos, sin prefijo.";
    }
  }

  return { datos: d, errores };
}

// --- Validación de la comunicación de donación -------------------------------
//
// Esto NO cobra nada. Es el aviso previo de una transferencia que la persona
// hará por su cuenta desde su banco, y su función es que el ingreso que llegue
// a la cuenta se pueda casar con un nombre y un DNI. Sin este paso, un ingreso
// con el concepto mal escrito es una donación no identificada, y una donación
// no identificada hay que devolverla.
function validarDonacion(cuerpo, hoy = new Date()) {
  const errores = {};
  const d = {};

  d.nombre = limpiar(cuerpo.nombre);
  if (!d.nombre) errores.nombre = "Escribe tu nombre.";
  else if (d.nombre.length > LIMITES.nombre) errores.nombre = `Máximo ${LIMITES.nombre} caracteres.`;
  else if (!/\p{L}/u.test(d.nombre)) errores.nombre = "El nombre tiene que llevar alguna letra.";

  d.apellidos = limpiar(cuerpo.apellidos);
  if (!d.apellidos) errores.apellidos = "Escribe tus apellidos.";
  else if (d.apellidos.length > LIMITES.apellidos)
    errores.apellidos = `Máximo ${LIMITES.apellidos} caracteres.`;
  else if (!/\p{L}/u.test(d.apellidos)) errores.apellidos = "Los apellidos tienen que llevar letras.";

  d.dni = normalizarDni(cuerpo.dni);
  if (!d.dni) errores.dni = "El DNI o NIE es obligatorio: la ley prohíbe las donaciones anónimas.";
  else if (!dniNieValido(d.dni)) {
    errores.dni =
      "Ese DNI o NIE no cuadra con su letra de control. Solo admitimos documentos de " +
      "persona física: las donaciones de empresas están prohibidas por ley.";
  }

  d.email = normalizarEmail(cuerpo.email);
  if (!d.email) errores.email = "Necesitamos un correo para mandarte el certificado.";
  else if (!emailValido(d.email)) errores.email = "Ese correo no parece válido. Revísalo.";

  d.importeCentimos = parsearImporte(cuerpo.importe);
  const minimo = DONACIONES.importeMinimo * 100;
  const maximo = DONACIONES.limiteAnual * 100;
  if (d.importeCentimos === null) errores.importe = "Escribe el importe en euros. Por ejemplo: 50.";
  else if (d.importeCentimos < minimo) {
    errores.importe = `El mínimo son ${DONACIONES.importeMinimo} €.`;
  } else if (d.importeCentimos > maximo) {
    errores.importe =
      `El máximo legal son ${DONACIONES.limiteAnual.toLocaleString("es-ES")} € por donante y ` +
      `año (${DONACIONES.marco}).`;
  }

  d.fechaPrevista = limpiar(cuerpo.fecha_prevista);
  if (!d.fechaPrevista) errores.fecha_prevista = "Dinos qué día prevés hacer la transferencia.";
  else if (!fechaPrevistaValida(d.fechaPrevista, hoy)) {
    errores.fecha_prevista =
      `Tiene que ser una fecha de hoy en adelante y dentro de los próximos ` +
      `${LIMITES.diasFechaPrevista} días.`;
  }

  // Las cinco declaraciones responsables. Todas obligatorias, todas por
  // separado: cada una cubre una prohibición distinta de la LO 8/2007 y
  // agruparlas dejaría sin valor la declaración.
  d.declaraciones = {};
  for (const clave of DECLARACIONES.keys()) {
    const marcada = esAfirmativo(cuerpo[CAMPO_DECLARACION[clave]]);
    d.declaraciones[clave] = marcada;
    if (!marcada) errores[CAMPO_DECLARACION[clave]] = "Esta declaración es obligatoria.";
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
  normalizarDni,
  dniNieValido,
  normalizarTelefono,
  telefonoValido,
  parsearImporte,
  euros,
  fechaPrevistaValida,
  conceptoDonacion,
  sinAcentos,
  ibanValido,
  nuevoToken,
  hashToken,
  tokenConForma,
  igualSeguro,
  hmac,
  escaparHtml,
  ipDe,
  esAfirmativo,
  CAMPO_CONSENTIMIENTO,
  CAMPO_DECLARACION,
  validarAlta,
  validarDonacion,
  pareceRobot,
};
