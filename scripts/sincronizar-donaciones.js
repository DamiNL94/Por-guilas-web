// Escribe en index.html el bloque pa-donaciones a partir de src/config.js.
//
//     node scripts/sincronizar-donaciones.js
//
// Por qué existe: index.html tiene que poder abrirse con doble clic, sin
// servidor, y seguir enseñando el IBAN bueno. Eso obliga a que el dato esté
// escrito dentro del fichero. Para que esa copia no se separe nunca de la
// configuración del backend se genera desde ella con este script, y el arranque
// del servidor aborta si las dos dejan de coincidir.
//
// Se ejecuta cada vez que se toque config.donaciones. También lo comprueba el
// banco de pruebas, así que un olvido sale en `npm test` y no en producción.
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { donacionesPublicas } = require("../src/config.js");

const INDICE = path.resolve(__dirname, "..", "index.html");
const APERTURA = '<script type="application/json" id="pa-donaciones">';
const CIERRE = "</script>";
const MARCA_FIN = "<!-- metadatos:fin -->";

// El "<" se escapa para que ningún texto de la configuración pueda cerrar el
// <script> antes de tiempo. Se escribe con fromCharCode y no con una barra
// invertida literal para que el fichero no dependa de cómo lo trate el editor.
const BARRA = String.fromCharCode(92);
const json = JSON.stringify(donacionesPublicas()).replace(/</g, BARRA + "u003c");
const bloque = APERTURA + json + CIERRE;

const html = fs.readFileSync(INDICE, "utf8");
let salida;

const i = html.indexOf(APERTURA);
if (i !== -1) {
  const j = html.indexOf(CIERRE, i + APERTURA.length);
  if (j === -1) {
    console.error("El bloque pa-donaciones de index.html está sin cerrar.");
    process.exit(1);
  }
  salida = html.slice(0, i) + bloque + html.slice(j + CIERRE.length);
} else {
  const k = html.indexOf(MARCA_FIN);
  if (k === -1) {
    console.error(`index.html no tiene el marcador ${MARCA_FIN}. No sé dónde poner el bloque.`);
    process.exit(1);
  }
  salida = html.slice(0, k) + bloque + "\n" + html.slice(k);
}

if (salida === html) {
  console.log("pa-donaciones ya estaba al día.");
} else {
  fs.writeFileSync(INDICE, salida);
  console.log("pa-donaciones actualizado en index.html.");
}
