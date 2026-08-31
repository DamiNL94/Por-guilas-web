// Limitación de peticiones por IP, en memoria.
//
// Una sola réplica sirviendo la web, así que un Map basta y evita meter Redis
// para esto. La contrapartida, dicha claramente: los contadores se reinician en
// cada redespliegue. Es asumible porque el freno de verdad contra las altas
// basura no es este, sino el doble opt-in.
//
// Se guardan HMAC de la IP, no la IP: para contar peticiones no hace falta
// saber de quién son, y así un volcado de memoria no es una lista de visitantes.
"use strict";

const { ANTIABUSO } = require("./config.js");
const { hmac } = require("./util.js");

const ventanas = new Map(); // clave -> number[] (marcas de tiempo en ms)

// Limpieza periódica: sin esto, el Map crece con cada IP nueva que pase por
// aquí y no baja nunca.
const MAX_EDAD = 25 * 3600 * 1000;
const limpieza = setInterval(() => {
  const corte = Date.now() - MAX_EDAD;
  for (const [clave, marcas] of ventanas) {
    const vivas = marcas.filter((t) => t > corte);
    if (vivas.length) ventanas.set(clave, vivas);
    else ventanas.delete(clave);
  }
}, 30 * 60 * 1000);
limpieza.unref();

// Ventana deslizante. Registra el intento y dice si se pasa del cupo.
function consumir(cubo, identificador, cupo, ventanaMs, ahora = Date.now()) {
  const clave = `${cubo}:${hmac(identificador)}`;
  const desde = ahora - ventanaMs;
  const marcas = (ventanas.get(clave) || []).filter((t) => t > desde);

  if (marcas.length >= cupo) {
    ventanas.set(clave, marcas);
    const esperaMs = marcas[0] + ventanaMs - ahora;
    return { permitido: false, esperaSegundos: Math.max(1, Math.ceil(esperaMs / 1000)) };
  }

  marcas.push(ahora);
  ventanas.set(clave, marcas);
  return { permitido: true, restantes: cupo - marcas.length };
}

const HORA = 3600 * 1000;
const DIA = 24 * HORA;
const MINUTO = 60 * 1000;

// Un alta consume dos cupos a la vez: el de la hora y el del día. Se comprueba
// primero el diario para no gastar el horario si ya está agotado el otro.
function permitirAlta(ip) {
  const dia = consumir("alta-dia", ip, ANTIABUSO.altasPorIpDia, DIA);
  if (!dia.permitido) return dia;
  return consumir("alta-hora", ip, ANTIABUSO.altasPorIpHora, HORA);
}

const permitirBorrado = (ip) => consumir("borrar", ip, ANTIABUSO.borradosPorIpHora, HORA);
const permitirAdmin = (ip) => consumir("admin", ip, ANTIABUSO.adminPorIpMinuto, MINUTO);

// Techo global de correos salientes. Es el seguro contra convertir esto en un
// cañón de correo si algo se descontrola: no depende de la IP de nadie.
const permitirCorreo = () => consumir("correo", "global", ANTIABUSO.correosGlobalesHora, HORA);

// Para las pruebas.
function reiniciar() {
  ventanas.clear();
}

module.exports = {
  consumir,
  permitirAlta,
  permitirBorrado,
  permitirAdmin,
  permitirCorreo,
  reiniciar,
};
