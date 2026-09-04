// Correo transaccional por SMTP autenticado contra el buzón del propio dominio
// (IONOS, donde ya está el correo de por-aguilas.es).
//
// POR QUÉ SMTP PROPIO Y NO UN PROVEEDOR DE ENVÍO
//
// Antes esto hablaba con la API de Brevo. Enviar desde el buzón del dominio
// tiene dos ventajas que pesan más: no hay un tercero al que le llegue ni una
// dirección de la lista, y el SPF del dominio ya autoriza a IONOS, así que no
// hace falta añadir ni un registro DNS —ni arriesgarse a romper el SPF que ya
// existe, que se llevaría por delante también el correo de entrada.
//
// El precio es una segunda dependencia, `nodemailer`. Node no trae cliente
// SMTP, y lo que hay que resolver —TLS, AUTH, y sobre todo la codificación
// MIME de los asuntos con acentos y de las cabeceras del RFC 8058— no es sitio
// para escribirlo a mano en un flujo con efectos legales.
//
// Regla de minimización que se aplica aquí: por el servidor de correo solo pasa
// la dirección de destino y el enlace. Ni el nombre, ni la zona, ni el mensaje.
// Los correos se redactan sin nombre propio a propósito.
"use strict";

const nodemailer = require("nodemailer");

const { CONFIG } = require("./config.js");
const { permitirCorreo } = require("./limites.js");

const TIEMPO_MAXIMO = 10_000;

// Un solo transporte para todo el proceso: nodemailer mantiene el pool de
// conexiones y no negocia TLS en cada correo. Se crea la primera vez que hace
// falta, no al cargar el módulo, para que en modo consola —y en las pruebas—
// no se construya nada.
let transporte = null;

function obtenerTransporte() {
  if (transporte) return transporte;
  transporte = nodemailer.createTransport({
    host: CONFIG.smtpHost,
    port: CONFIG.smtpPuerto,
    // 465 es TLS desde el primer byte; 587 empieza en claro y sube con
    // STARTTLS. `requireTLS` impide que un 587 se quede sin cifrar si el
    // servidor no anuncia STARTTLS: antes que mandar credenciales en claro,
    // que falle el envío.
    secure: CONFIG.smtpPuerto === 465,
    requireTLS: CONFIG.smtpPuerto !== 465,
    auth: { user: CONFIG.smtpUsuario, pass: CONFIG.smtpClave },
    pool: true,
    maxConnections: 2,
    connectionTimeout: TIEMPO_MAXIMO,
    greetingTimeout: TIEMPO_MAXIMO,
    socketTimeout: TIEMPO_MAXIMO,
  });
  return transporte;
}

// Para las pruebas: fuerza un transporte ya construido y olvida el anterior.
function _usarTransporte(t) {
  transporte = t;
}

// Envuelve el cuerpo en la misma plantilla sobria de la web: fondo blanco,
// letra negra, verde para señalar. Sin imágenes remotas, que en un correo son
// un chivato de apertura.
function plantilla({ titulo, parrafos, boton, urlBaja }) {
  const cuerpo = parrafos
    .map((p) => `<p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#403B3A">${p}</p>`)
    .join("\n");

  const botonHtml = boton
    ? `<p style="margin:28px 0"><a href="${boton.url}" style="display:inline-block;background:#0E7A5F;color:#ffffff;font-weight:800;font-size:15px;padding:17px 26px;text-decoration:none;border:2px solid #0E7A5F">${boton.texto}</a></p>
       <p style="margin:0 0 16px;font-size:13.5px;line-height:1.6;color:#6F6867">Si el botón no funciona, copia esta dirección en tu navegador:<br><span style="color:#0A5C47;word-break:break-all">${boton.url}</span></p>`
    : "";

  return `<!doctype html>
<html lang="es"><body style="margin:0;padding:0;background:#F6F4F3">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F6F4F3">
<tr><td align="center" style="padding:32px 16px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:2px solid #141414">
    <tr><td style="border-top:8px solid #0E7A5F;padding:28px 28px 0">
      <p style="margin:0;font-family:Georgia,serif;font-size:22px;font-weight:700;letter-spacing:-.03em;color:#141414">
        <span style="color:#8229A7">Por</span> <span style="color:#3FCB9E">Águilas</span>
      </p>
      <p style="margin:6px 0 0;font-size:10px;font-weight:800;letter-spacing:.16em;text-transform:uppercase;color:#6F6867">Municipales 2027</p>
    </td></tr>
    <tr><td style="padding:26px 28px 8px">
      <h1 style="margin:0 0 18px;font-family:Georgia,serif;font-size:25px;font-weight:700;letter-spacing:-.02em;line-height:1.15;color:#141414">${titulo}</h1>
      ${cuerpo}
      ${botonHtml}
    </td></tr>
    <tr><td style="padding:20px 28px 26px;border-top:1px solid #D5D0CE">
      <p style="margin:0;font-size:12.5px;line-height:1.6;color:#6F6867">
        Recibes esto porque alguien pidió apuntarse a Por Águilas con esta dirección.
        <a href="${urlBaja}" style="color:#0A5C47">Bórrame de la lista</a> ·
        <a href="${CONFIG.urlBase}/legal/privacidad" style="color:#0A5C47">Política de privacidad</a>
      </p>
    </td></tr>
  </table>
</td></tr></table>
</body></html>`;
}

async function enviar({ para, asunto, titulo, parrafos, boton, urlBaja, textoPlano }) {
  const cupo = permitirCorreo();
  if (!cupo.permitido) {
    console.warn("[correo] techo horario global alcanzado; envío omitido");
    return { ok: false, motivo: "cupo" };
  }

  const html = plantilla({ titulo, parrafos, boton, urlBaja });

  if (CONFIG.correoEnConsola) {
    // Modo local: nada sale a Internet. Se imprime el enlace para poder seguir
    // el flujo entero sin buzón ni credenciales de ningún tipo.
    console.log("\n--- CORREO (modo consola) ---");
    console.log("Para:", para);
    console.log("Asunto:", asunto);
    if (boton) console.log("Enlace:", boton.url);
    console.log("Baja:", urlBaja);
    console.log("-----------------------------\n");
    return { ok: true, motivo: "consola" };
  }

  const mensaje = {
    from: { name: CONFIG.remitenteNombre, address: CONFIG.remitente },
    to: para, // sin nombre: el servidor de correo no necesita saberlo
    replyTo: { name: CONFIG.remitenteNombre, address: CONFIG.respuestaA },
    subject: asunto,
    html,
    text: textoPlano,
    headers: {
      // RFC 8058: permite darse de baja desde el propio cliente de correo.
      // Ese botón hace un POST a la URL, que el backend atiende igual que el
      // formulario de confirmación.
      "List-Unsubscribe": `<${urlBaja}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  };

  try {
    await obtenerTransporte().sendMail(mensaje);
    return { ok: true };
  } catch (err) {
    // La respuesta del servidor puede traer la dirección de destino, así que
    // se anota el código de SMTP y el nombre del fallo, nunca el texto entero.
    const codigo = err?.responseCode || err?.code || err?.name || "error";
    console.error(`[correo] fallo de envío: ${codigo}`);
    return { ok: false, motivo: String(codigo) };
  }
}

// --- Los tres correos que manda el sistema -----------------------------------

const urlConf = (t) => `${CONFIG.urlBase}/api/sumate/confirmar?token=${t}`;
const urlBajaDe = (t) => `${CONFIG.urlBase}/api/sumate/baja?token=${t}`;

function confirmacion(para, tokenConf, tokenBaja) {
  const url = urlConf(tokenConf);
  return enviar({
    para,
    asunto: "Confirma que quieres apuntarte a Por Águilas",
    titulo: "Un clic y estás dentro",
    urlBaja: urlBajaDe(tokenBaja),
    parrafos: [
      "Alguien ha pedido apuntarse a la candidatura <strong>Por Águilas</strong> con esta dirección de correo. Si has sido tú, confírmalo aquí abajo.",
      "Hasta que no confirmes no guardamos tu alta. Y si no has sido tú, no hagas nada: el enlace caduca en 48 horas y todo se borra solo.",
    ],
    boton: { texto: "Sí, quiero apuntarme", url },
    textoPlano: [
      "Un clic y estás dentro",
      "",
      "Alguien ha pedido apuntarse a la candidatura Por Aguilas con esta direccion.",
      "Si has sido tu, confirmalo abriendo esta direccion:",
      url,
      "",
      "Hasta que no confirmes no guardamos tu alta. Si no has sido tu, no hagas",
      "nada: el enlace caduca en 48 horas y todo se borra solo.",
      "",
      "Para borrarte de la lista: " + urlBajaDe(tokenBaja),
      "Politica de privacidad: " + CONFIG.urlBase + "/legal/privacidad",
    ].join("\n"),
  });
}

// Se manda cuando alguien que ya estaba confirmado vuelve a rellenar el
// formulario. No se le manda otro enlace de confirmación —ya está dentro— pero
// la respuesta que ve en la web es exactamente la misma que la de un alta
// nueva, para que nadie pueda usar el formulario como detector de militancia.
function yaEstabas(para, tokenBaja) {
  const baja = urlBajaDe(tokenBaja);
  return enviar({
    para,
    asunto: "Ya estabas apuntada a Por Águilas",
    titulo: "Ya estabas dentro",
    urlBaja: baja,
    parrafos: [
      "Acabas de rellenar el formulario de Por Águilas, pero esta dirección ya estaba confirmada. No hace falta que hagas nada: sigues en la lista.",
      "Si lo que querías era justo lo contrario, aquí tienes el enlace para borrarte. Se borra todo, sin preguntas.",
    ],
    boton: { texto: "Bórrame de la lista", url: baja },
    textoPlano: [
      "Ya estabas dentro",
      "",
      "Acabas de rellenar el formulario de Por Aguilas, pero esta direccion ya",
      "estaba confirmada. No hace falta que hagas nada.",
      "",
      "Si lo que querias era lo contrario, borrate aqui: " + baja,
      "Politica de privacidad: " + CONFIG.urlBase + "/legal/privacidad",
    ].join("\n"),
  });
}

// Derecho de supresión pedido desde /sumate/borrar.
function enlaceBorrado(para, tokenBaja) {
  const baja = urlBajaDe(tokenBaja);
  return enviar({
    para,
    asunto: "Confirma el borrado de tus datos",
    titulo: "Confirma que quieres borrarte",
    urlBaja: baja,
    parrafos: [
      "Has pedido que borremos tus datos de la lista de Por Águilas. Confírmalo aquí y desaparece todo: el correo, el nombre, lo que nos contaras y la prueba de tu consentimiento.",
      "Te lo pedimos por correo para asegurarnos de que eres tú quien lo pide y no un tercero. <strong>El borrado no se puede deshacer.</strong>",
    ],
    boton: { texto: "Sí, bórralo todo", url: baja },
    textoPlano: [
      "Confirma que quieres borrarte",
      "",
      "Has pedido que borremos tus datos de la lista de Por Aguilas.",
      "Confirmalo abriendo esta direccion y desaparece todo:",
      baja,
      "",
      "Te lo pedimos por correo para asegurarnos de que eres tu quien lo pide.",
      "El borrado no se puede deshacer.",
    ].join("\n"),
  });
}

module.exports = { confirmacion, yaEstabas, enlaceBorrado, urlConf, urlBajaDe };
