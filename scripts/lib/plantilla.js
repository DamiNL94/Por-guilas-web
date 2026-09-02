// Compilador de la plantilla de index.html a HTML estático.
//
// No es un motor de plantillas de propósito general: entiende exactamente el
// subconjunto del lenguaje que usa esta web y nada más. Si alguien mete una
// construcción nueva en index.html, esto falla en voz alta en el build en vez
// de generar HTML silenciosamente mal.
//
// Lo que entiende:
//
//   {{ ruta.punteada }}        interpolación, en texto y en atributos
//   <sc-if value="{{ x }}">    condicional
//   <sc-for list="{{ xs }}" as="it">   bucle
//   style-hover / style-focus  se convierten en una clase CSS de verdad
//   onClick / onSubmit / …     salen como data-pa-* para que los ate app.js
//   hint-placeholder-*         se descartan: son pistas del editor
//
// Y traduce los atributos en camelCase que el runtime aceptaba (noValidate,
// maxLength, tabIndex…) a los que entiende un navegador sin JavaScript.
"use strict";

// Condiciones que dependen del estado en tiempo de ejecución: el teléfono que
// aparece al marcar una casilla, los mensajes de los formularios, el concepto
// de la transferencia. No se pueden resolver en el build, así que se emiten
// como <template> inerte y app.js los clona cuando toca.
const DINAMICOS = new Set([
  "sumColaborar",
  "sumMsg",
  "donMsg",
  "hayPrevio",
  "conceptoNoCabe",
  "menuAbierto",
]);

// Condiciones que en el navegador dependían de medir la ventana. No se
// resuelven: se pintan LAS DOS ramas y decide una media query. Es la diferencia
// entre una página que ya sabe cómo se ve y otra que tiene que ejecutar
// JavaScript para averiguarlo.
const VIEWPORT = new Map([
  ["escritorio", "pa-solo-escritorio"],
  ["movil", "pa-solo-movil"],
]);

const VACIOS = new Set(["area","base","br","col","embed","hr","img","input","link","meta","source","track","wbr"]);

const ATRIBUTOS = {
  noValidate: "novalidate",
  maxLength: "maxlength",
  minLength: "minlength",
  tabIndex: "tabindex",
  autoComplete: "autocomplete",
  inputMode: "inputmode",
  readOnly: "readonly",
  className: "class",
  htmlFor: "for",
  ariaLabel: "aria-label",
};

const EVENTOS = {
  onClick: "click",
  onSubmit: "submit",
  onChange: "change",
  onInput: "input",
};

const escapar = (v) =>
  String(v == null ? "" : v)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

const escaparAttr = (v) => escapar(v).replace(/"/g, "&quot;");

// --- Análisis ----------------------------------------------------------------

function analizar(html) {
  const raiz = { hijos: [] };
  const pila = [raiz];
  const re = /<(\/?)([a-zA-Z][\w-]*)((?:[^>"']|"[^"]*"|'[^']*')*)(\/?)>|<!--([\s\S]*?)-->/g;
  let pos = 0;
  let m;

  const texto = (t) => {
    if (t) pila[pila.length - 1].hijos.push({ tipo: "texto", valor: t });
  };

  while ((m = re.exec(html)) !== null) {
    texto(html.slice(pos, m.index));
    pos = re.lastIndex;

    if (m[5] !== undefined) continue; // comentario: fuera del HTML publicado

    const [, cierre, etiqueta, attrs, autoCierre] = m;

    if (cierre) {
      // Se busca hacia atrás por si el marcado dejó algo sin cerrar.
      for (let i = pila.length - 1; i > 0; i--) {
        if (pila[i].etiqueta === etiqueta) {
          pila.length = i;
          break;
        }
      }
      continue;
    }

    const nodo = { tipo: "elemento", etiqueta, attrs: leerAttrs(attrs), hijos: [] };
    pila[pila.length - 1].hijos.push(nodo);
    if (!autoCierre && !VACIOS.has(etiqueta.toLowerCase())) pila.push(nodo);
  }
  texto(html.slice(pos));
  return raiz;
}

function leerAttrs(cadena) {
  const attrs = [];
  const re = /([a-zA-Z_:][-\w:.]*)(?:\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let m;
  while ((m = re.exec(cadena)) !== null) {
    attrs.push([m[1], m[3] ?? m[4] ?? m[5] ?? ""]);
  }
  return attrs;
}

// --- Resolución de valores ---------------------------------------------------

function resolver(ambito, ruta) {
  const partes = ruta.trim().split(".");
  let v = ambito;
  for (const p of partes) {
    if (v == null) return undefined;
    v = v[p];
  }
  return v;
}

const SOLO_INTERPOLACION = /^\s*\{\{([^}]+)\}\}\s*$/;

// Devuelve el valor crudo si el atributo es una interpolación sola; si no,
// interpola dentro del texto.
function valorAttr(bruto, ambito) {
  const solo = SOLO_INTERPOLACION.exec(bruto);
  if (solo) return resolver(ambito, solo[1]);
  if (!bruto.includes("{{")) return bruto;
  return bruto.replace(/\{\{([^}]+)\}\}/g, (_, r) => {
    const v = resolver(ambito, r);
    return v == null ? "" : String(v);
  });
}

// --- Generación --------------------------------------------------------------

function compilar(plantilla, vals, opciones = {}) {
  const arbol = analizar(plantilla);
  const reglas = [];
  const salida = [];
  let contador = 0;

  const claseAuto = () => `pa-g${(contador++).toString(36)}`;

  function pintarHijos(nodos, ambito, buf) {
    for (const n of nodos) pintar(n, ambito, buf);
  }

  function pintar(nodo, ambito, buf) {
    if (nodo.tipo === "texto") {
      buf.push(
        nodo.valor.replace(/\{\{([^}]+)\}\}/g, (_, r) => escapar(resolver(ambito, r)))
      );
      return;
    }

    const et = nodo.etiqueta.toLowerCase();

    // --- Control de flujo ---
    if (et === "sc-if") {
      const bruto = (nodo.attrs.find(([k]) => k === "value") || [])[1] || "";
      const solo = SOLO_INTERPOLACION.exec(bruto);
      const nombre = solo ? solo[1].trim() : null;

      if (nombre && DINAMICOS.has(nombre)) {
        // Inerte: no se pinta, pero queda en el documento para que app.js lo
        // clone cuando la condición se cumpla.
        const interno = [];
        pintarHijos(nodo.hijos, ambito, interno);
        buf.push(`<template data-pa-if="${escaparAttr(nombre)}">${interno.join("")}</template>`);
        return;
      }
      if (nombre && VIEWPORT.has(nombre)) {
        // Se pinta siempre, y se le cuelga la clase que la media query apaga.
        const clase = VIEWPORT.get(nombre);
        for (const hijo of nodo.hijos) {
          if (hijo.tipo === "elemento") {
            hijo.attrs = [...hijo.attrs, ["class", clase]];
          }
        }
        pintarHijos(nodo.hijos, ambito, buf);
        return;
      }
      if (valorAttr(bruto, ambito)) pintarHijos(nodo.hijos, ambito, buf);
      return;
    }

    if (et === "sc-for") {
      const lista = valorAttr((nodo.attrs.find(([k]) => k === "list") || [])[1] || "", ambito);
      const alias = (nodo.attrs.find(([k]) => k === "as") || [])[1] || "it";
      if (!Array.isArray(lista)) {
        throw new Error(`sc-for sobre algo que no es una lista: ${JSON.stringify(lista)}`);
      }
      for (const elemento of lista) {
        pintarHijos(nodo.hijos, { ...ambito, [alias]: elemento }, buf);
      }
      return;
    }

    // <helmet> lleva los <style> globales: se recogen aparte, para la cabecera.
    if (et === "helmet" || et === "sc-helmet") {
      const interno = [];
      pintarHijos(nodo.hijos, ambito, interno);
      (opciones.helmet || []).push(interno.join(""));
      return;
    }

    // --- Elemento normal ---
    const attrsSalida = [];
    const clases = [];
    let estilo = null;

    for (const [clave, bruto] of nodo.attrs) {
      if (clave.startsWith("hint-") || clave === "data-dc-tpl" || clave === "sc-name") continue;

      // style-hover / style-focus: se convierten en una regla CSS de verdad.
      if (clave.startsWith("style-")) {
        const pseudo = clave.slice(6);
        const cls = claseAuto();
        clases.push(cls);
        reglas.push(`.${cls}:${pseudo}{${bruto}}`);
        continue;
      }

      if (EVENTOS[clave]) {
        const solo = SOLO_INTERPOLACION.exec(bruto);
        if (solo) attrsSalida.push([`data-pa-${EVENTOS[clave]}`, solo[1].trim()]);
        continue;
      }

      const nombre = ATRIBUTOS[clave] || clave;
      const v = valorAttr(bruto, ambito);

      // Los booleanos del HTML: presentes o ausentes, nunca ="false".
      if (v === false || v == null) continue;
      if (v === true) {
        attrsSalida.push([nombre, null]);
        continue;
      }
      if (nombre === "class") clases.push(String(v));
      else if (nombre === "style") estilo = String(v);
      else attrsSalida.push([nombre, String(v)]);
    }

    if (clases.length) attrsSalida.unshift(["class", clases.join(" ")]);
    if (estilo) attrsSalida.push(["style", estilo]);

    const texto = attrsSalida
      .map(([k, v]) => (v === null ? ` ${k}` : ` ${k}="${escaparAttr(v)}"`))
      .join("");

    if (VACIOS.has(et)) {
      buf.push(`<${et}${texto}>`);
      return;
    }
    buf.push(`<${et}${texto}>`);
    pintarHijos(nodo.hijos, ambito, buf);
    buf.push(`</${et}>`);
  }

  pintarHijos(arbol.hijos, vals, salida);
  return { html: salida.join(""), reglas };
}

module.exports = { compilar, analizar, DINAMICOS };
