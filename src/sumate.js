// Alta, confirmación, baja y borrado.
//
// Dos reglas gobiernan este fichero:
//
//  1. La respuesta al alta es SIEMPRE la misma. Exista o no el correo, esté
//     pendiente o confirmado. Si variara, cualquiera podría usar el formulario
//     para averiguar si su vecino se ha apuntado a la candidatura, y eso es
//     precisamente el dato del artículo 9 que estamos protegiendo.
//
//  2. Borrar es borrar. No hay marca de "dado de baja" ni lista de excluidos:
//     conservar un registro de quién se fue seguiría siendo tratar datos de
//     opinión política de alguien que ha pedido justo lo contrario.
"use strict";

const crypto = require("node:crypto");

const { CONFIG, CONSERVACION, VERSION_POLITICA, TEXTO_CONSENTIMIENTO } = require("./config.js");
const { consulta, enTransaccion } = require("./db.js");
const correo = require("./correo.js");
const limites = require("./limites.js");
const {
  json,
  jsonYCerrar,
  html,
  redirigir,
  leerCuerpo,
  origenAjeno,
  quiereJson,
  plantilla,
} = require("./http.js");
const {
  validarAlta,
  pareceRobot,
  nuevoToken,
  hashToken,
  tokenConForma,
  normalizarEmail,
  emailValido,
  ipDe,
} = require("./util.js");

// Lo único que se responde a un alta, pase lo que pase.
const RESPUESTA_NEUTRA = {
  ok: true,
  mensaje:
    "Te hemos mandado un correo para confirmar. Pincha el enlace y ya estás dentro.",
};

const HORA_MS = 3600 * 1000;
const ESPERA_ENTRE_CORREOS = HORA_MS;

// --- Token de baja ------------------------------------------------------------
//
// Se deriva de SECRETO_HMAC y del id en vez de guardarse. Así el enlace que va
// en un correo de hace ocho meses sigue funcionando, y a la vez un volcado de
// la base de datos no contiene ningún enlace utilizable: hace falta el secreto,
// que vive en las variables de entorno.
//
// Consecuencia que hay que tener presente: si se cambia SECRETO_HMAC, todos los
// enlaces de baja repartidos hasta entonces dejan de valer.
function tokenBajaDe(id) {
  return crypto
    .createHmac("sha256", CONFIG.secretoHmac)
    .update(`baja:${id}`, "utf8")
    .digest("base64url");
}

// --- POST /api/sumate ---------------------------------------------------------

async function alta(req, res) {
  if (origenAjeno(req)) return json(res, 403, { ok: false, mensaje: "Origen no permitido." });

  const leido = await leerCuerpo(req);
  if (leido.error === "grande") {
    return jsonYCerrar(req, res, 413, { ok: false, mensaje: "El formulario es demasiado largo." });
  }
  if (leido.error) {
    return json(res, 400, { ok: false, mensaje: "No hemos entendido el envío." });
  }
  const cuerpo = leido.datos;

  // Trampa y tiempo de relleno: se responde éxito y no se hace nada. Un robot
  // que reciba un error sabe que le han pillado y prueba otra cosa.
  if (pareceRobot(cuerpo)) return json(res, 200, RESPUESTA_NEUTRA);

  const { datos, errores } = validarAlta(cuerpo);
  if (Object.keys(errores).length) {
    return json(res, 400, { ok: false, errores, mensaje: "Repasa los campos marcados." });
  }

  const ip = ipDe(req);
  const cupo = limites.permitirAlta(ip);
  if (!cupo.permitido) {
    return json(res, 429, {
      ok: false,
      mensaje: "Demasiados envíos desde esta conexión. Prueba dentro de un rato.",
      espera: cupo.esperaSegundos,
    });
  }

  let plan;
  try {
    plan = await guardarAlta(datos, ip);
  } catch (err) {
    // Sin datos personales en el log: solo qué falló.
    console.error("[sumate] error guardando el alta:", err?.code || err?.message || "desconocido");
    return json(res, 500, {
      ok: false,
      mensaje: "Algo ha fallado por nuestra parte. Vuelve a intentarlo en un minuto.",
    });
  }

  // El correo va fuera de la transacción: no se sostiene una conexión a la base
  // de datos abierta esperando a una API de terceros.
  if (plan.enviar === "confirmacion") {
    const r = await correo.confirmacion(datos.email, plan.tokenConf, tokenBajaDe(plan.id));
    if (r.ok) await marcarEnvio(plan.id);
  } else if (plan.enviar === "ya-estabas") {
    const r = await correo.yaEstabas(datos.email, tokenBajaDe(plan.id));
    if (r.ok) await marcarEnvio(plan.id);
  }

  return json(res, 200, RESPUESTA_NEUTRA);
}

// Idempotente por correo: un segundo alta con la misma dirección actualiza la
// ficha en vez de duplicarla.
async function guardarAlta(d, ip) {
  return enTransaccion(async (cli) => {
    const previo = await cli.query(
      `select id, estado, ultimo_envio from altas where email = $1 for update`,
      [d.email]
    );

    let id;
    let estado;
    let ultimoEnvio;
    let tokenConf = null;

    if (previo.rowCount === 0) {
      const t = nuevoToken();
      tokenConf = t.claro;
      const ins = await cli.query(
        `insert into altas (email, nombre, zona, como, mensaje, estado,
                            token_conf_hash, token_conf_expira)
         values ($1,$2,$3,$4,$5,'pendiente',$6, now() + ($7 || ' hours')::interval)
         returning id`,
        [d.email, d.nombre, d.zona, d.como, d.mensaje, t.hash, String(CONSERVACION.horasToken)]
      );
      id = ins.rows[0].id;
      estado = "pendiente";
      ultimoEnvio = null;
      // El hash del token de baja necesita el id, así que se rellena ahora.
      await cli.query(`update altas set token_baja_hash = $2 where id = $1`, [
        id,
        hashToken(tokenBajaDe(id)),
      ]);
    } else {
      ({ id, estado, ultimo_envio: ultimoEnvio } = previo.rows[0]);

      // Un mensaje o una zona en blanco no borran lo que ya había: quien
      // rellena el formulario por segunda vez no está pidiendo que olvidemos lo
      // que escribió la primera.
      await cli.query(
        `update altas
            set nombre = $2,
                zona = coalesce($3, zona),
                como = $4,
                mensaje = coalesce($5, mensaje),
                actualizado = now()
          where id = $1`,
        [id, d.nombre, d.zona, d.como, d.mensaje]
      );

      if (estado === "pendiente") {
        // Enlace nuevo y reloj nuevo. El anterior deja de valer.
        const t = nuevoToken();
        tokenConf = t.claro;
        await cli.query(
          `update altas
              set token_conf_hash = $2,
                  token_conf_expira = now() + ($3 || ' hours')::interval
            where id = $1`,
          [id, t.hash, String(CONSERVACION.horasToken)]
        );
      }
    }

    // Cada envío del formulario es un acto de consentimiento, y cada uno deja
    // su propia prueba: cuándo, qué versión del texto y desde qué IP.
    await cli.query(
      `insert into consentimientos (alta_id, version_texto, texto_aceptado, ip)
       values ($1, $2, $3, $4::inet)`,
      [id, VERSION_POLITICA, TEXTO_CONSENTIMIENTO, ip]
    );

    // Freno anti bombardeo: si alguien mete la dirección de un tercero en
    // bucle, esa persona no recibe un correo por cada intento.
    const reciente = ultimoEnvio && Date.now() - new Date(ultimoEnvio).getTime() < ESPERA_ENTRE_CORREOS;
    let enviar = null;
    if (!reciente) enviar = estado === "confirmado" ? "ya-estabas" : "confirmacion";

    return { id, estado, tokenConf, enviar };
  });
}

const marcarEnvio = (id) =>
  consulta(`update altas set ultimo_envio = now() where id = $1`, [id]).catch((err) =>
    console.error("[sumate] no se pudo anotar el envío:", err?.code || "error")
  );

// --- Confirmación -------------------------------------------------------------
//
// El enlace del correo (GET) solo pinta una página con un botón; quien confirma
// de verdad es el POST. Es un clic de más, y se lo pedimos a la gente porque
// hay gestores de correo corporativos que abren automáticamente los enlaces
// que reciben para analizarlos: sin este paso, uno de esos analizadores podría
// dar de alta a alguien que nunca dijo que sí, que es exactamente lo que el
// doble opt-in existe para evitar.

function confirmarPagina(req, res, url) {
  const token = url.searchParams.get("token");
  if (!tokenConForma(token)) return redirigir(res, "/sumate/enlace-caducado", 302);
  return html(res, 200, plantilla("confirmar.html", { TOKEN: token }));
}

async function confirmar(req, res) {
  if (origenAjeno(req)) return redirigir(res, "/sumate/enlace-caducado");

  const leido = await leerCuerpo(req);
  const token = leido.datos?.token;
  if (!tokenConForma(token)) return redirigir(res, "/sumate/enlace-caducado");

  try {
    const r = await consulta(
      `update altas
          set estado = 'confirmado',
              confirmado_en = now(),
              actualizado = now(),
              token_conf_hash = null,
              token_conf_expira = null
        where token_conf_hash = $1
          and token_conf_expira > now()
          and estado = 'pendiente'
        returning id`,
      [hashToken(token)]
    );
    // Cero filas: el enlace ya se usó, caducó, o la ficha se borró. No se
    // distingue entre los tres casos, ni en la respuesta ni en la página.
    if (r.rowCount === 0) return redirigir(res, "/sumate/enlace-caducado");
  } catch (err) {
    console.error("[sumate] error confirmando:", err?.code || "error");
    return redirigir(res, "/sumate/enlace-caducado");
  }

  return redirigir(res, "/sumate/gracias");
}

// --- Baja ---------------------------------------------------------------------

function bajaPagina(req, res, url) {
  const token = url.searchParams.get("token");
  if (!tokenConForma(token)) return redirigir(res, "/sumate/enlace-caducado", 302);
  return html(res, 200, plantilla("baja.html", { TOKEN: token }));
}

async function baja(req, res, url) {
  // El token puede venir del formulario o de la URL: el botón "cancelar
  // suscripción" del cliente de correo (RFC 8058) hace POST a la misma
  // dirección del enlace, sin pasar por la página intermedia.
  const leido = await leerCuerpo(req);
  const token = leido.datos?.token || url.searchParams.get("token");
  const unClic = /List-Unsubscribe=One-Click/i.test(String(leido.datos?.["List-Unsubscribe"] || ""));

  if (!tokenConForma(token)) {
    return unClic ? json(res, 400, { ok: false }) : redirigir(res, "/sumate/enlace-caducado");
  }

  try {
    // Borrado real. La prueba del consentimiento cae en cascada.
    await consulta(`delete from altas where token_baja_hash = $1`, [hashToken(token)]);
  } catch (err) {
    console.error("[sumate] error dando de baja:", err?.code || "error");
    return unClic ? json(res, 500, { ok: false }) : redirigir(res, "/sumate/enlace-caducado");
  }

  // Se responde igual haya borrado una fila o ninguna: quien ya no está no
  // tiene que enterarse de que no estaba.
  return unClic ? json(res, 200, { ok: true }) : redirigir(res, "/sumate/baja");
}

// --- Derecho de supresión (POST /api/sumate/borrar) ---------------------------
//
// No borra al vuelo: manda por correo un enlace de borrado. Si borrase con solo
// recibir una dirección, cualquiera podría eliminar los datos de otra persona
// escribiendo su correo. El enlace que se manda es el mismo de la baja.

async function borrar(req, res) {
  if (origenAjeno(req)) return redirigir(res, "/sumate/borrar");

  const leido = await leerCuerpo(req);
  if (leido.error) {
    return leido.formulario === false && quiereJson(req)
      ? json(res, 400, { ok: false, mensaje: "No hemos entendido el envío." })
      : redirigir(res, "/sumate/borrar");
  }

  const porFormulario = leido.formulario && !quiereJson(req);
  const responder = () =>
    porFormulario
      ? redirigir(res, "/sumate/revisa-tu-correo")
      : json(res, 200, {
          ok: true,
          mensaje:
            "Si esa dirección estaba en la lista, le hemos mandado un enlace para completar el borrado.",
        });

  const cuerpo = leido.datos;
  const { ANTIABUSO } = require("./config.js");
  if (String(cuerpo[ANTIABUSO.campoTrampa] || "").trim()) return responder();

  const email = normalizarEmail(cuerpo.email);
  if (!emailValido(email)) return responder();

  const cupo = limites.permitirBorrado(ipDe(req));
  if (!cupo.permitido) return responder();

  try {
    const r = await consulta(`select id from altas where email = $1`, [email]);
    if (r.rowCount === 1) {
      await correo.enlaceBorrado(email, tokenBajaDe(r.rows[0].id));
    }
  } catch (err) {
    console.error("[sumate] error preparando el borrado:", err?.code || "error");
  }

  // Misma respuesta exista o no la dirección.
  return responder();
}

module.exports = { alta, confirmarPagina, confirmar, bajaPagina, baja, borrar, tokenBajaDe };
