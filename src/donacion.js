// Comunicación de donación.
//
// Lo primero, porque condiciona todo lo demás: **aquí no se cobra nada**. No
// hay pasarela, ni tarjeta, ni Bizum, ni ningún dato bancario del donante. La
// persona hace la transferencia desde su banco, por su cuenta, y este
// formulario es el aviso previo que permite casar el ingreso que llegue con un
// nombre y un DNI.
//
// Por qué hace falta ese aviso: el art. 5.1.c de la LO 8/2007 prohíbe las
// donaciones anónimas. Un ingreso cuyo concepto no identifique a quien lo hace
// es una donación no identificada, y una donación no identificada hay que
// devolverla. El aviso previo es lo que evita ese trabajo —y ese riesgo—
// cuando alguien escribe el concepto a medias.
//
// Lo que este fichero NO hace, y es deliberado:
//
//   · No manda ningún correo. El nombre, el DNI y el importe no salen de
//     nuestra infraestructura: no pasan ni siquiera por el servidor de correo. La
//     persona ve el concepto en pantalla y el equipo lo lee en el panel. Es la
//     minimización del art. 5.1.c RGPD aplicada al camino del dato, no solo a
//     la lista de campos.
//   · No acepta ni guarda ninguna finalidad ni destino de la donación. Las
//     donaciones finalistas están prohibidas (art. 5.1.d LO 8/2007), así que no
//     existe el campo. No es que esté oculto: no está.
//   · No promete devolución. Las donaciones irrevocables lo son (art. 5.1.d), y
//     la copy no dice lo contrario en ninguna parte.
"use strict";

const { VERSION_POLITICA, DECLARACIONES, DONACIONES } = require("./config.js");
const { consulta } = require("./db.js");
const limites = require("./limites.js");
const { json, jsonYCerrar, leerCuerpo, origenAjeno } = require("./http.js");
const { validarDonacion, conceptoDonacion, pareceRobot, euros, ipDe } = require("./util.js");

async function comunicar(req, res) {
  if (origenAjeno(req)) return json(res, 403, { ok: false, mensaje: "Origen no permitido." });

  const leido = await leerCuerpo(req);
  if (leido.error === "grande") {
    return jsonYCerrar(req, res, 413, { ok: false, mensaje: "El formulario es demasiado largo." });
  }
  if (leido.error) {
    return json(res, 400, { ok: false, mensaje: "No hemos entendido el envío." });
  }
  const cuerpo = leido.datos;

  // Trampa y tiempo de relleno. Se responde con un éxito verosímil y no se
  // guarda nada: un robot al que se le contesta con un error sabe que le han
  // pillado y prueba otra cosa. El concepto que se devuelve aquí es el que
  // saldría de lo que ha escrito, así que la respuesta no se distingue.
  if (pareceRobot(cuerpo)) {
    return json(res, 200, { ok: true, ...instrucciones(conceptoDonacion(cuerpo)) });
  }

  const { datos, errores } = validarDonacion(cuerpo);
  if (Object.keys(errores).length) {
    return json(res, 400, { ok: false, errores, mensaje: "Repasa los campos marcados." });
  }

  const cupo = limites.permitirDonacion(ipDe(req));
  if (!cupo.permitido) {
    return json(res, 429, {
      ok: false,
      mensaje: "Demasiados envíos desde esta conexión. Prueba dentro de un rato.",
      espera: cupo.esperaSegundos,
    });
  }

  const concepto = conceptoDonacion(datos);

  // Prueba de las declaraciones: el literal exacto que la persona tenía delante
  // al marcar cada casilla, no un "sí". Es lo que se puede enseñar si alguna
  // vez hay que acreditar que se preguntó lo que la ley obliga a preguntar.
  const prueba = {};
  for (const clave of Object.keys(datos.declaraciones)) {
    prueba[clave] = DECLARACIONES.get(clave);
  }

  try {
    await guardar(datos, concepto.completo, prueba);
  } catch (err) {
    console.error("[donacion] error guardando:", err?.code || err?.message || "desconocido");
    return json(res, 500, {
      ok: false,
      mensaje: "Algo ha fallado por nuestra parte. Vuelve a intentarlo en un minuto.",
    });
  }

  return json(res, 200, { ok: true, ...instrucciones(concepto, datos) });
}

// Lo que la web pinta después de enviar: los datos de la transferencia y el
// concepto ya montado, listo para copiar. Es la única "confirmación" que hay,
// y por eso tiene que llevar todo lo necesario para completar el ingreso.
function instrucciones(concepto, datos = null) {
  return {
    mensaje:
      "Anotado. Ahora haz la transferencia desde tu banco con este concepto exacto: sin " +
      "él no podemos identificar el ingreso.",
    transferencia: {
      titular: DONACIONES.titular,
      iban: DONACIONES.iban,
      concepto: concepto.completo,
      conceptoCorto: concepto.corto,
      cabeEnElBanco: concepto.cabe,
      importe: datos ? euros(datos.importeCentimos) : null,
    },
  };
}

// Idempotente dentro de una hora: quien pulsa dos veces el botón, o recarga la
// página de vuelta, no genera dos comunicaciones que luego haya que cuadrar
// contra un solo ingreso.
async function guardar(d, concepto, prueba) {
  const previo = await consulta(
    `select id from donaciones
      where dni = $1 and importe_centimos = $2 and fecha_prevista = $3::date
        and estado = 'comunicada' and creado > now() - interval '1 hour'
      limit 1`,
    [d.dni, d.importeCentimos, d.fechaPrevista]
  );

  if (previo.rowCount === 1) {
    await consulta(
      `update donaciones
          set nombre = $2, apellidos = $3, email = $4, concepto = $5,
              version_texto = $6, declaraciones = $7::jsonb, actualizado = now()
        where id = $1`,
      [
        previo.rows[0].id,
        d.nombre,
        d.apellidos,
        d.email,
        concepto,
        VERSION_POLITICA,
        JSON.stringify(prueba),
      ]
    );
    return previo.rows[0].id;
  }

  const ins = await consulta(
    `insert into donaciones (nombre, apellidos, dni, email, importe_centimos,
                             fecha_prevista, concepto, version_texto, declaraciones)
     values ($1,$2,$3,$4,$5,$6::date,$7,$8,$9::jsonb)
     returning id`,
    [
      d.nombre,
      d.apellidos,
      d.dni,
      d.email,
      d.importeCentimos,
      d.fechaPrevista,
      concepto,
      VERSION_POLITICA,
      JSON.stringify(prueba),
    ]
  );
  return ins.rows[0].id;
}

module.exports = { comunicar };
