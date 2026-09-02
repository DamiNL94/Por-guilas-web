// Carga la lógica de index.html en Node para poder renderizar en el build.
//
// El bloque <script data-dc-script> de index.html es JavaScript normal: define
// los datos del sitio (ejes, notas, eventos, hitos) y una clase Component con
// un renderVals() que devuelve el objeto contra el que se pinta la plantilla.
// En el navegador lo compila el runtime con new Function(), y eso es justo lo
// que obliga a abrir 'unsafe-eval' en la política de seguridad.
//
// Aquí se hace lo mismo, pero **en tiempo de compilación**. Evaluar nuestro
// propio código en el build no es un riesgo: el fichero es el que acabamos de
// leer del repositorio, no entra nada de fuera, y el resultado es HTML estático
// que ya no necesita evaluar nada en el navegador. Ese es el cambio entero.
//
// La alternativa era duplicar los datos en un módulo aparte. Se descartó: dos
// copias de las notas de prensa acaban divergiendo, y la gracia de que
// index.html siga siendo la fuente es que el equipo pueda seguir editándolo.
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const RAIZ = path.resolve(__dirname, "..", "..");

// --- Extracción --------------------------------------------------------------

function troceaIndex(html) {
  const iTpl = html.indexOf("<x-dc>");
  const jTpl = html.lastIndexOf("</x-dc>");
  if (iTpl === -1 || jTpl === -1) throw new Error("index.html no tiene bloque <x-dc>");

  const iJs = html.indexOf("data-dc-script");
  if (iJs === -1) throw new Error("index.html no tiene bloque data-dc-script");
  const aJs = html.indexOf(">", iJs) + 1;
  const bJs = html.indexOf("</script>", aJs);

  // Los props declarados en data-props: son los valores por defecto que el
  // editor puede cambiar y que la lógica lee con this.props.
  const attr = /data-props="([^"]*)"/.exec(html.slice(iJs - 200, aJs));
  let props = {};
  if (attr) {
    const crudo = attr[1].replace(/&quot;/g, '"').replace(/&amp;/g, "&");
    try {
      for (const [k, def] of Object.entries(JSON.parse(crudo))) props[k] = def.default;
    } catch {
      /* sin props: la lógica ya usa valores por defecto con ?? */
    }
  }

  return {
    plantilla: html.slice(iTpl + "<x-dc>".length, jTpl),
    logica: html.slice(aJs, bJs),
    props,
  };
}

// --- Entorno mínimo ----------------------------------------------------------
//
// La lógica solo toca el DOM en dos sitios cuando se la evalúa: para leer el
// bloque JSON pa-meta y el pa-donaciones. Los dos son datos, no interfaz, así
// que se sirven directamente. Todo lo demás (addEventListener, ResizeObserver,
// history) solo se usa dentro de componentDidMount, que en el build no corre.

function entorno(html) {
  const bloqueJson = (id) => {
    const marca = `<script type="application/json" id="${id}">`;
    const i = html.indexOf(marca);
    if (i === -1) return null;
    const j = html.indexOf("</script>", i);
    return { textContent: html.slice(i + marca.length, j) };
  };

  const documento = {
    getElementById: (id) => bloqueJson(id),
    querySelector: () => null,
    createElement: () => ({ setAttribute() {} }),
    head: { appendChild() {} },
    addEventListener() {},
    documentElement: { clientWidth: 1280 },
  };

  return {
    document: documento,
    window: { innerWidth: 1280, addEventListener() {}, removeEventListener() {} },
    location: { pathname: "/", origin: "https://por-aguilas.es", href: "https://por-aguilas.es/" },
    history: { pushState() {} },
    navigator: { clipboard: { writeText: async () => {} } },
    console,
    requestAnimationFrame() {},
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    ResizeObserver: undefined,
    fetch: async () => {
      throw new Error("sin red en el build");
    },
  };
}

// --- Carga -------------------------------------------------------------------

// Clase base equivalente a la DCLogic del runtime: solo lo que la lógica usa.
const FUENTE_BASE = `
class DCLogic {
  constructor(props) { this.props = props || {}; this.state = {}; }
  setState(parcial) {
    Object.assign(this.state, typeof parcial === "function" ? parcial(this.state) : parcial);
  }
  renderVals() { return {}; }
}
`;

function cargar(rutaIndex = path.join(RAIZ, "index.html")) {
  const html = fs.readFileSync(rutaIndex, "utf8");
  const { plantilla, logica, props } = troceaIndex(html);

  const contexto = vm.createContext(entorno(html));
  const fuente = `${FUENTE_BASE}\n${logica}\n;globalThis.__Component = Component;`;
  new vm.Script(fuente, { filename: "index.html <data-dc-script>" }).runInContext(contexto);

  const Component = contexto.__Component;
  if (typeof Component !== "function") {
    throw new Error("el bloque data-dc-script no define `class Component`");
  }

  return { html, plantilla, Component, props, contexto };
}

module.exports = { cargar, troceaIndex, RAIZ };
