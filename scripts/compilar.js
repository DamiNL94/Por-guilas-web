// Compila index.html a HTML estático, una página por ruta.
//
//     node scripts/compilar.js
//
// POR QUÉ EXISTE ESTO
//
// index.html se pinta en el navegador con el runtime de Claude Design, que
// compila su bloque de lógica con new Function(). Eso obliga a abrir
// 'unsafe-eval' en la política de seguridad de contenidos, justo en la página
// que contiene los dos formularios: es el riesgo R12.
//
// La salida de este script no necesita evaluar nada. Es HTML ya pintado, con
// una hoja de estilos y un app.js pequeño para lo poco que es interactivo. Con
// eso la política pasa a ser script-src 'self', sin excepciones.
//
// De regalo, y no es menor: hasta ahora el cuerpo de la página lo montaba el
// navegador, así que quien no ejecutara JavaScript —o cualquier rastreador que
// no renderice— recibía una plantilla con {{ }} sin resolver. Ahora recibe la
// página entera.
//
// QUÉ SIGUE SIENDO LA FUENTE
//
// index.html. El equipo lo sigue editando igual, con su editor visual. Lo que
// cambia es que lo que se publica es el resultado de compilarlo, no él mismo.
// Después de tocarlo hay que volver a ejecutar esto, y el arranque del servidor
// avisa si se olvida: guarda la huella del index con el que se compiló.
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const { cargar, RAIZ } = require("./lib/logica.js");
const { compilar } = require("./lib/plantilla.js");

const DESTINO = path.join(RAIZ, "publico");

// Ruta pública -> clave de página en la lógica. Tiene que ir a la par con la
// tabla RUTAS de index.html y con RUTAS_SPA de server.js.
const RUTAS = {
  "/": "inicio",
  "/quienes-somos": "quienes",
  "/programa": "ejes",
  "/prensa": "prensa",
  "/agenda": "agenda",
  "/sumate": "sumate",
};

// Estado inicial: el mismo con el que arranca el componente en el navegador.
const ESTADO = {
  tema: "Todas",
  menu: false,
  ancho: 1280,
  aviso: true,
  sumEstado: "reposo",
  sumErrores: {},
  sumColaborar: false,
  donEstado: "reposo",
  donErrores: {},
  donPrevio: null,
  copiado: "",
};

// --- Cabecera ----------------------------------------------------------------

// Se reutiliza la <head> de index.html quitando lo que solo servía al runtime:
// el mapa de recursos, el propio support.js y el centinela de dependencias.
function cabecera(html) {
  const i = html.indexOf("<head>") + "<head>".length;
  const j = html.indexOf("</head>");
  let head = html.slice(i, j);

  const fuera = [
    /<script>\s*window\.__resources[\s\S]*?<\/script>/,
    /<script src="\.\/support\.js"><\/script>/,
    /<script>\s*\/\/ Centinela[\s\S]*?<\/script>/,
    /<!-- =+\s*\n\s*ATENCIÓN · NO BORRAR ESTE BLOQUE[\s\S]*?=+ -->/,
  ];
  for (const re of fuera) head = head.replace(re, "");

  // Los comentarios del <head> de index.html son notas para quien edita la
  // plantilla: dónde vive cada cosa, por qué las tipografías están aquí, qué
  // sustituye el servidor. El cuerpo ya no publica ninguno —el compilador de
  // plantilla los descarta— y no hay razón para que el <head> sí: en una web de
  // campaña, "ver código fuente" es algo que la gente hace.
  //
  // Los dos únicos que sobreviven son los marcadores metadatos:inicio y
  // metadatos:fin, que no son documentación: server.js los busca literalmente
  // para sustituir el bloque de metadatos por los de la ruta pedida. Sin ellos
  // todas las páginas saldrían con el <title> de la portada.
  head = head.replace(/<!--([\s\S]*?)-->/g, (todo, dentro) =>
    /^\s*metadatos:(inicio|fin)\s*$/.test(dentro) ? todo : ""
  );

  return head.replace(/\n{3,}/g, "\n\n").trim();
}

// --- Compilación -------------------------------------------------------------

function construir() {
  const { html, plantilla, Component, props } = cargar();
  const head = cabecera(html);

  fs.mkdirSync(DESTINO, { recursive: true });

  const paginas = [];
  const todasLasReglas = new Set();
  let helmetCss = "";

  for (const [ruta, pag] of Object.entries(RUTAS)) {
    const componente = new Component(props);
    componente.state = { ...ESTADO, pag };

    const helmet = [];
    const { html: cuerpo, reglas } = compilar(plantilla, componente.renderVals(), { helmet });
    for (const r of reglas) todasLasReglas.add(r);

    // El <helmet> es el mismo en todas las rutas; se coge de la primera.
    if (!helmetCss) helmetCss = helmet.join("\n");

    paginas.push({ ruta, pag, cuerpo });
  }

  // Una sola hoja para todo el sitio: las reglas generadas por style-hover y
  // style-focus más lo que venía en el <helmet>. Se sirve como fichero aparte
  // para que el navegador la cachee entre rutas.
  const css = [
    "/* Generado por scripts/compilar.js. No editar a mano:",
    "   los estilos viven en index.html y se regeneran al compilar. */",
    helmetCss.replace(/<\/?style>/g, "").trim(),
    "",
    "/* Reglas de style-hover y style-focus de la plantilla. */",
    [...todasLasReglas].join("\n"),
    "",
    "/* La cabecera decide con media queries lo que antes decidía JavaScript",
    "   midiendo la ventana. Así la página correcta llega ya pintada. */",
    "@media (max-width:899px){ .pa-solo-escritorio{display:none!important} }",
    "@media (min-width:900px){ .pa-solo-movil{display:none!important} }",
    "",
    "/* Los chips del filtro de prensa. Antes el aspecto del activo venía",
    "   horneado en el marcado, porque quien decidía cuál lo estaba era la",
    "   plantilla al pintarse. Ahora lo decide el usuario, así que el estilo",
    "   cuelga de aria-pressed: un solo sitio, y además el atributo que un",
    "   lector de pantalla ya anuncia. */",
    "[data-pa-tema][aria-pressed]{background:transparent;border:2px solid #D5D0CE;color:#403B3A}",
    "[data-pa-tema][aria-pressed=\"true\"]{background:#0E7A5F;border-color:#0E7A5F;color:#fff}",
  ].join("\n");

  fs.writeFileSync(path.join(DESTINO, "estilos.css"), css + "\n");

  for (const { ruta, pag, cuerpo } of paginas) {
    const nombre = (pag === "inicio" ? "inicio" : pag) + ".html";
    const doc = [
      "<!DOCTYPE html>",
      '<html lang="es">',
      "<head>",
      head,
      '<link rel="stylesheet" href="/publico/estilos.css">',
      "</head>",
      "<body>",
      cuerpo.trim(),
      '<script src="/app.js"></script>',
      "</body>",
      "</html>",
      "",
    ].join("\n");
    fs.writeFileSync(path.join(DESTINO, nombre), doc);
  }

  // Huella del index con el que se compiló: el servidor la compara al arrancar
  // y avisa si alguien editó la plantilla y olvidó regenerar.
  const huella = crypto.createHash("sha256").update(html, "utf8").digest("hex");
  fs.writeFileSync(
    path.join(DESTINO, "build.json"),
    JSON.stringify(
      { huellaIndex: huella, rutas: RUTAS, paginas: paginas.length },
      null,
      2
    ) + "\n"
  );

  return { paginas, css, huella };
}

if (require.main === module) {
  const { paginas, css } = construir();
  for (const p of paginas) {
    console.log(`  ${p.ruta.padEnd(16)} → publico/${p.pag}.html  ${(p.cuerpo.length / 1024).toFixed(1)} KB`);
  }
  console.log(`  ${"estilos".padEnd(16)} → publico/estilos.css  ${(css.length / 1024).toFixed(1)} KB`);
  console.log(`\n  ${paginas.length} páginas compiladas. Sin runtime, sin React, sin eval.`);
}

module.exports = { construir, RUTAS, DESTINO };
