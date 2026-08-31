// Conservación: borrado automático de lo que ya no debe estar.
//
// Los plazos de la política de privacidad no valen nada si dependen de que
// alguien se acuerde de ejecutarlos. Esto corre dentro del propio proceso, al
// arrancar y cada seis horas, sin servicio de cron aparte ni segundo
// despliegue.
"use strict";

const { CONSERVACION } = require("./config.js");
const { consulta } = require("./db.js");

const CADA = 6 * 3600 * 1000;

async function purgar() {
  const resumen = { pendientes: 0, ips: 0, total: 0 };

  // 1. Altas que nunca se confirmaron. Sin confirmar no hay consentimiento
  //    verificado, así que no hay nada que conservar.
  const pendientes = await consulta(
    `delete from altas
      where estado = 'pendiente'
        and creado < now() - ($1 || ' days')::interval`,
    [String(CONSERVACION.diasPendiente)]
  );
  resumen.pendientes = pendientes.rowCount;

  // 2. La IP de la prueba de consentimiento. El resto de la prueba —cuándo y
  //    qué texto— se queda: es lo que acredita el permiso. La IP es el trozo
  //    identificativo y es el que caduca.
  const ips = await consulta(
    `update consentimientos
        set ip = null, ip_borrada_en = now()
      where ip is not null
        and momento < now() - ($1 || ' months')::interval`,
    [String(CONSERVACION.mesesIp)]
  );
  resumen.ips = ips.rowCount;

  // 3. Borrado total de la lista pasada la fecha límite. La finalidad para la
  //    que se recogieron los datos —una campaña municipal concreta— se agota.
  const fin = new Date(CONSERVACION.fechaPurgaTotal + "T00:00:00Z");
  if (Number.isFinite(fin.getTime()) && Date.now() > fin.getTime()) {
    const todo = await consulta(`delete from altas`);
    resumen.total = todo.rowCount;
  }

  return resumen;
}

// En el log solo van cifras: cuántas filas, nunca de quién.
async function ejecutar(motivo = "programada") {
  try {
    const r = await purgar();
    if (r.pendientes || r.ips || r.total) {
      console.log(
        `[purga:${motivo}] sin confirmar borradas: ${r.pendientes} · IP anonimizadas: ${r.ips} · borrado total: ${r.total}`
      );
    }
    return r;
  } catch (err) {
    console.error("[purga] ha fallado:", err?.code || err?.message || "error");
    return null;
  }
}

let temporizador = null;

function arrancar() {
  if (temporizador) return;
  // Un poco después del arranque, para no competir con la migración ni con las
  // primeras peticiones tras un redespliegue.
  setTimeout(() => ejecutar("arranque"), 20_000).unref();
  temporizador = setInterval(() => ejecutar("programada"), CADA);
  temporizador.unref();
}

function parar() {
  if (temporizador) clearInterval(temporizador);
  temporizador = null;
}

module.exports = { purgar, ejecutar, arrancar, parar };
