// Lo poco que esta web necesita ejecutar en el navegador.
//
// Antes había 210 KB de React más un runtime que compilaba la plantilla con
// new Function() en cada carga. Todo eso pintaba una web cuyo contenido es
// estático: cuatro ejes, cinco notas de prensa y un calendario. Ahora la página
// llega pintada desde el servidor y aquí solo queda lo que de verdad reacciona
// a algo: el menú del móvil, el filtro de la sala de prensa, el contador y los
// dos formularios.
//
// Sin dependencias, sin build, y sin nada que evaluar: la política de seguridad
// de contenidos puede decir script-src 'self' a secas.
//
// La navegación ya no es cosa de JavaScript. Cada ruta es una página de verdad
// y los enlaces son enlaces: funcionan con el botón central, con Ctrl+clic y
// con JavaScript desactivado.
"use strict";

(function () {
  const $ = (sel, raiz) => (raiz || document).querySelector(sel);
  const $$ = (sel, raiz) => [...(raiz || document).querySelectorAll(sel)];

  // Los <template data-pa-if="X"> son las ramas que el compilador no pudo
  // resolver porque dependen de lo que haga la persona. Se clonan cuando toca.
  function plantilla(nombre, raiz) {
    const t = $(`template[data-pa-if="${nombre}"]`, raiz);
    return t ? t.content.cloneNode(true) : null;
  }

  function quitar(nombre, raiz) {
    const t = $(`template[data-pa-if="${nombre}"]`, raiz);
    if (t && t.__pintado) {
      t.__pintado.forEach((n) => n.remove());
      t.__pintado = null;
    }
  }

  // Pinta la rama justo después de su <template>, y recuerda qué nodos puso
  // para poder quitarlos luego sin tocar nada más.
  function mostrar(nombre, raiz, ajustar) {
    const t = $(`template[data-pa-if="${nombre}"]`, raiz);
    if (!t) return null;
    quitar(nombre, raiz);
    const frag = t.content.cloneNode(true);
    const nodos = [...frag.childNodes];
    if (ajustar) ajustar(frag);
    t.parentNode.insertBefore(frag, t.nextSibling);
    t.__pintado = nodos;
    return nodos;
  }

  // --- Aviso de borrador ------------------------------------------------------

  const avisoCerrar = $('[data-pa-click="cerrarAviso"]');
  if (avisoCerrar) {
    avisoCerrar.addEventListener("click", () => avisoCerrar.closest("div").remove());
  }

  // --- Menú del móvil ---------------------------------------------------------
  //
  // El diálogo viene en un <template>. Se clona al abrir y se tira al cerrar,
  // que es más honesto que dejarlo escondido en el DOM: mientras está cerrado
  // no existe, y no se puede tabular hasta él sin querer.

  const abrir = $('[data-pa-click="abrirMenu"]');
  if (abrir) {
    abrir.addEventListener("click", () => {
      const nodos = mostrar("menuAbierto", document);
      if (!nodos) return;
      abrir.setAttribute("aria-expanded", "true");
      document.body.style.overflow = "hidden";

      const dialogo = nodos.find((n) => n.nodeType === 1);
      const cerrar = () => {
        quitar("menuAbierto", document);
        abrir.setAttribute("aria-expanded", "false");
        document.body.style.overflow = "";
        abrir.focus();
      };
      $$('[data-pa-click="cerrarMenu"]', dialogo).forEach((b) =>
        b.addEventListener("click", cerrar)
      );
      // Un enlace del menú a un ancla de ESTA misma página no recarga nada: el
      // navegador salta al sitio y el diálogo se queda encima tapándolo. Pasa
      // con los cuatro ejes cuando ya estás en /programa. Se cierra a mano, y
      // el foco se lleva al destino en vez de devolverlo al botón del menú:
      // quien acaba de pedir «llévame al eje 02» quiere estar en el eje 02.
      $$("a[href]", dialogo).forEach((enlace) =>
        enlace.addEventListener("click", () => {
          const destino = enlace.hash && document.getElementById(enlace.hash.slice(1));
          if (!destino) { cerrar(); return; }
          quitar("menuAbierto", document);
          abrir.setAttribute("aria-expanded", "false");
          document.body.style.overflow = "";
          destino.setAttribute("tabindex", "-1");
          destino.focus({ preventScroll: true });
        })
      );
      // Escape cierra, como en cualquier diálogo.
      document.addEventListener("keydown", function esc(ev) {
        if (ev.key !== "Escape") return;
        document.removeEventListener("keydown", esc);
        cerrar();
      });
      const primero = $("a, button", dialogo);
      if (primero) primero.focus();
    });
  }

  // --- Contador de días -------------------------------------------------------
  //
  // El número se congela al compilar. Aquí se recalcula, que cuesta dos líneas
  // y evita que la portada mienta a partir del día siguiente.

  $$("[data-pa-dias]").forEach((el) => {
    const fecha = new Date(el.getAttribute("data-pa-dias") + "T09:00:00");
    if (!Number.isFinite(fecha.getTime())) return;
    const dias = Math.max(0, Math.ceil((fecha - new Date()) / 86400000));
    el.textContent = dias.toLocaleString("es-ES");
  });

  // --- Filtro de la sala de prensa --------------------------------------------

  const chips = $$("[data-pa-tema][aria-pressed]");
  if (chips.length) {
    const notas = $$("article[data-pa-tema]");
    const vacio = $("[data-pa-sin-notas]");

    chips.forEach((chip) => {
      chip.addEventListener("click", () => {
        const tema = chip.getAttribute("data-pa-tema");
        let visibles = 0;

        notas.forEach((n) => {
          const encaja = tema === "Todas" || n.getAttribute("data-pa-tema") === tema;
          n.hidden = !encaja;
          if (encaja) visibles++;
        });

        // El estado de los chips se lleva en aria-pressed, que es el atributo
        // que un lector de pantalla anuncia. El aspecto lo pone el CSS a partir
        // de él, así que no hay dos fuentes de verdad.
        chips.forEach((c) => c.setAttribute("aria-pressed", String(c === chip)));
        if (vacio) vacio.hidden = visibles > 0;
      });
    });
  }

  // --- Formularios ------------------------------------------------------------

  const config = (() => {
    try {
      return JSON.parse($("#pa-donaciones").textContent);
    } catch {
      return null;
    }
  })();

  const CORREO = "admin@por-aguilas.es";
  const T0 = Date.now();

  const limpia = (v) => String(v == null ? "" : v).replace(/\s+/g, " ").trim();
  const normDni = (v) => limpia(v).toUpperCase().replace(/[\s._\-\/]/g, "");

  const LETRAS = "TRWAGMYFPDXBNJZSQVHLCKE";
  function dniValido(v) {
    const s = normDni(v);
    const m = /^([XYZ]?)(\d{7,8})([A-Z])$/.exec(s);
    if (!m) return false;
    let num = m[2];
    if (m[1]) {
      if (num.length !== 7) return false;
      num = String("XYZ".indexOf(m[1])) + num;
    } else if (num.length !== 8) return false;
    return LETRAS[Number(num) % 23] === m[3];
  }

  const RE_MAIL = /^[^\s@,;:<>()[\]"]{1,64}@(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;
  const mailValido = (v) => {
    const s = limpia(v).toLowerCase();
    return Boolean(s) && s.length <= 254 && !s.includes("..") && RE_MAIL.test(s);
  };
  const telValido = (v) =>
    /^[6789]\d{8}$/.test(limpia(v).replace(/[\s.\-()\/]/g, "").replace(/^(\+34|0034|34)/, ""));

  function centimos(v) {
    let s = limpia(v).replace(/[\s€]/g, "");
    if (!s) return null;
    if (s.includes(",") && s.includes(".")) {
      s = s.lastIndexOf(",") > s.lastIndexOf(".") ? s.replace(/\./g, "") : s.replace(/,/g, "");
    }
    s = s.replace(",", ".");
    if (!/^\d{1,9}(\.\d{1,2})?$/.test(s)) return null;
    return Math.round(Number(s) * 100);
  }

  const DIACRITICOS = new RegExp("[\\u0300-\\u036F]", "g");
  const sinAcentos = (v) =>
    String(v == null ? "" : v)
      .normalize("NFD")
      .replace(DIACRITICOS, "")
      .replace(/[^A-Za-z0-9 ]/g, " ")
      .replace(/ +/g, " ")
      .trim();

  function conceptoDe(nombre, apellidos, dni) {
    const pre = config.conceptoPrefijo;
    const doc = normDni(dni);
    const persona = sinAcentos(limpia(nombre) + " " + limpia(apellidos)).toUpperCase();
    const completo = (pre + " " + persona + " " + doc).replace(/ +/g, " ").trim();
    return { completo, corto: (pre + " " + doc).trim(), largo: completo.length };
  }

  const MENSAJES = {
    enviando: "Enviando…",
    exitoSumate:
      "Te hemos mandado un correo para confirmar. Pincha el enlace y ya estás dentro. Si no llega en unos minutos, mira en la carpeta de spam.",
    red:
      "No hemos podido conectar. Puede ser tu conexión o puede ser nuestro servidor. Vuelve a intentarlo, y si sigue igual escríbenos a " +
      CORREO + ".",
    validacion: "Repasa los campos marcados.",
    servidor: "Algo ha fallado por nuestra parte. Vuelve a intentarlo en un minuto.",
  };

  // Pinta un error debajo de un campo y lo marca para los lectores de pantalla.
  function error(form, campo, texto) {
    const el = form.elements[campo];
    if (!el) return;

    // Dónde va el mensaje depende de la forma del campo, y las dos formas
    // existen en estos formularios:
    //
    //   · Campo de texto: el hueco está dentro de su .pa-c, con id pa-e-*.
    //   · Casilla: el <input> vive dentro de un <label class="pa-chk">, y el
    //     hueco es HERMANO de esa etiqueta, no hijo. Buscar solo hacia dentro
    //     dejaba los errores de consentimiento sin pintar.
    let destino = el.getAttribute("aria-describedby")
      ? document.getElementById(el.getAttribute("aria-describedby"))
      : null;
    if (!destino) destino = el.closest(".pa-c")?.querySelector(".pa-err") || null;
    if (!destino) {
      const etiqueta = el.closest("label");
      let n = etiqueta ? etiqueta.nextElementSibling : null;
      while (n && !n.classList.contains("pa-err")) n = n.nextElementSibling;
      destino = n;
    }

    if (destino) destino.textContent = texto || "";
    if (texto) el.setAttribute("aria-invalid", "true");
    else el.removeAttribute("aria-invalid");
  }

  function limpiarErrores(form) {
    $$(".pa-err", form).forEach((p) => (p.textContent = ""));
    $$("[aria-invalid]", form).forEach((e) => e.removeAttribute("aria-invalid"));
  }

  // El mensaje de estado del formulario: se crea al vuelo porque en reposo no
  // existe, y su <template> guarda el marcado exacto que usaba la plantilla.
  function estado(form, texto, mal) {
    let p = $(".pa-est", form);
    if (!texto) {
      if (p) p.remove();
      return;
    }
    if (!p) {
      p = document.createElement("p");
      p.className = "pa-est";
      p.setAttribute("role", "status");
      p.setAttribute("aria-live", "polite");
      form.appendChild(p);
    }
    p.classList.toggle("pa-est-mal", Boolean(mal));
    p.textContent = texto;
  }

  function leer(form) {
    const d = { t0: T0 };
    for (const el of form.elements) {
      if (!el.name) continue;
      d[el.name] = el.type === "checkbox" ? el.checked : el.value;
    }
    return d;
  }

  function validarSumate(d) {
    const e = {};
    if (!limpia(d.nombre)) e.nombre = "Escribe tu nombre.";
    else if (limpia(d.nombre).length < 2) e.nombre = "Ese nombre se queda corto.";
    if (!limpia(d.email)) e.email = "Necesitamos un correo para escribirte.";
    else if (!mailValido(d.email)) e.email = "Ese correo no parece válido. Revísalo.";
    if (!d.consiente_info)
      e.consiente_info = "Sin tu permiso expreso no podemos guardar nada. Es obligatorio.";
    if (!d.mayor_edad)
      e.mayor_edad = "El formulario es para mayores de edad. Tienes que declararlo.";
    if (d.consiente_colaborar && limpia(d.telefono) && !telValido(d.telefono)) {
      e.telefono = "Ese teléfono no parece de aquí. Nueve dígitos, sin prefijo.";
    }
    return e;
  }

  const DECLARACIONES = [
    "declara_fisica",
    "declara_sin_contrato",
    "declara_no_extranjero",
    "acepta_privacidad",
    "declara_mayor_edad",
  ];

  function validarDonacion(d) {
    const e = {};
    if (!limpia(d.nombre)) e.nombre = "Escribe tu nombre.";
    if (!limpia(d.apellidos)) e.apellidos = "Escribe tus apellidos.";
    if (!limpia(d.dni))
      e.dni = "El DNI o NIE es obligatorio: la ley prohíbe las donaciones anónimas.";
    else if (!dniValido(d.dni))
      e.dni =
        "Ese DNI o NIE no cuadra con su letra de control. Solo admitimos documentos de persona física: las donaciones de empresas están prohibidas por ley.";
    if (!limpia(d.email)) e.email = "Necesitamos un correo para mandarte el certificado.";
    else if (!mailValido(d.email)) e.email = "Ese correo no parece válido. Revísalo.";

    const c = centimos(d.importe);
    if (c === null) e.importe = "Escribe el importe en euros. Por ejemplo: 50.";
    else if (c < config.importeMinimo * 100) e.importe = "El mínimo son " + config.importeMinimo + " €.";
    else if (c > config.limiteAnual * 100)
      e.importe =
        "El máximo legal son " + config.limiteAnual.toLocaleString("es-ES") +
        " € por donante y año (" + config.marco + ").";

    const f = limpia(d.fecha_prevista);
    if (!f) e.fecha_prevista = "Dinos qué día prevés hacer la transferencia.";
    else {
      const hoy = new Date();
      hoy.setHours(0, 0, 0, 0);
      const tope = new Date(hoy);
      tope.setDate(tope.getDate() + config.diasFechaPrevista);
      const elegida = new Date(f + "T12:00:00");
      if (!(elegida >= hoy && elegida <= tope)) {
        e.fecha_prevista =
          "Tiene que ser una fecha de hoy en adelante y dentro de los próximos " +
          config.diasFechaPrevista + " días.";
      }
    }
    DECLARACIONES.forEach((k) => {
      if (!d[k]) e[k] = "Esta declaración es obligatoria.";
    });
    return e;
  }

  async function enviar(form, ruta, validar, alExito) {
    const boton = $('button[type="submit"]', form);
    const datos = leer(form);

    limpiarErrores(form);
    const errores = validar(datos);
    if (Object.keys(errores).length) {
      Object.entries(errores).forEach(([k, v]) => error(form, k, v));
      estado(form, MENSAJES.validacion, true);
      const primero = form.elements[Object.keys(errores)[0]];
      if (primero && primero.focus) primero.focus();
      return;
    }

    const etiqueta = boton.textContent;
    boton.disabled = true;
    boton.textContent = MENSAJES.enviando;
    estado(form, MENSAJES.enviando, false);

    let res, cuerpo;
    try {
      res = await fetch(ruta, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify(datos),
      });
      cuerpo = await res.json().catch(() => null);
    } catch {
      boton.disabled = false;
      boton.textContent = etiqueta;
      estado(form, MENSAJES.red, true);
      return;
    }

    boton.disabled = false;
    boton.textContent = etiqueta;

    if (res.ok && cuerpo && cuerpo.ok) {
      alExito(cuerpo);
      return;
    }
    if (res.status === 400 && cuerpo && cuerpo.errores) {
      Object.entries(cuerpo.errores).forEach(([k, v]) => error(form, k, v));
      estado(form, MENSAJES.validacion, true);
      const primero = form.elements[Object.keys(cuerpo.errores)[0]];
      if (primero && primero.focus) primero.focus();
      return;
    }
    estado(form, (cuerpo && cuerpo.mensaje) || MENSAJES.servidor, true);
  }

  // --- Súmate -----------------------------------------------------------------

  const formSumate = $('form[data-pa-submit="sumEnviar"]');
  if (formSumate) {
    formSumate.setAttribute("novalidate", "");

    const colaborar = formSumate.elements.consiente_colaborar;
    if (colaborar) {
      colaborar.addEventListener("change", () => {
        if (colaborar.checked) mostrar("sumColaborar", formSumate);
        else quitar("sumColaborar", formSumate);
      });
    }

    formSumate.addEventListener("submit", (ev) => {
      ev.preventDefault();
      enviar(formSumate, "/api/sumate", validarSumate, () => {
        formSumate.reset();
        quitar("sumColaborar", formSumate);
        estado(formSumate, MENSAJES.exitoSumate, false);
      });
    });
  }

  // --- Donaciones -------------------------------------------------------------

  const formDon = $('form[data-pa-submit="donEnviar"]');
  if (formDon && config) {
    formDon.setAttribute("novalidate", "");

    const caja = () => $('template[data-pa-if="hayPrevio"]', formDon.closest("div").parentNode)
      || $('template[data-pa-if="hayPrevio"]');

    function refrescarConcepto(datos) {
      const t = caja();
      if (!t) return;
      const c = conceptoDe(datos.nombre, datos.apellidos, datos.dni);
      if (c.completo === config.conceptoPrefijo) {
        quitar("hayPrevio", t.parentNode);
        return;
      }
      mostrar("hayPrevio", t.parentNode, (frag) => {
        const dato = $("#pa-dato-concepto", frag);
        if (dato) dato.textContent = c.completo;
        const aviso = $("template[data-pa-if='conceptoNoCabe']", frag);
        if (aviso && c.largo > config.conceptoMaximoBanco) {
          const p = document.createElement("p");
          p.className = "pa-err-fijo";
          p.textContent =
            "Son " + c.largo + " caracteres y hay bancos que cortan en " +
            config.conceptoMaximoBanco +
            ". Si el tuyo no te deja escribirlo entero, pon esto otro: " + c.corto;
          aviso.parentNode.insertBefore(p, aviso.nextSibling);
        }
        const copiar = $(".pa-bt2", frag);
        if (copiar) copiar.addEventListener("click", () => copiarAlPortapapeles(c.completo, "Concepto", "pa-dato-concepto"));
      });
    }

    $$('[data-pa-input="cambiaConcepto"]', formDon).forEach((el) =>
      el.addEventListener("input", () => refrescarConcepto(leer(formDon)))
    );

    formDon.addEventListener("submit", (ev) => {
      ev.preventDefault();
      enviar(formDon, "/api/donacion", validarDonacion, (cuerpo) => {
        const t = cuerpo.transferencia;
        estado(
          formDon,
          t
            ? "Anotado. Ahora haz la transferencia con este concepto exacto: " + t.concepto
            : "Anotado.",
          false
        );
      });
    });
  }

  // --- Copiar -----------------------------------------------------------------
  //
  // Cuando el navegador deniega el portapapeles —http sin contexto seguro, o el
  // permiso cortado— no se finge que ha ido bien: se selecciona el texto, que
  // deja el Ctrl+C a un dedo.

  async function copiarAlPortapapeles(texto, que, id) {
    const vivo = $(".pa-vivo");
    const decir = (m) => {
      if (vivo) vivo.textContent = m;
    };
    try {
      await navigator.clipboard.writeText(texto);
      decir(que + " copiado.");
      return;
    } catch {}
    try {
      const nodo = document.getElementById(id);
      const rango = document.createRange();
      rango.selectNodeContents(nodo);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(rango);
      decir("Tu navegador no nos deja copiar solos. Ya te lo hemos seleccionado: pulsa Ctrl+C (o Cmd+C).");
    } catch {
      decir("Tu navegador no nos deja copiar. Selecciona el texto de arriba a mano.");
    }
  }

  const botonIban = $('[data-pa-click="copiarIban"]');
  if (botonIban && config) {
    botonIban.addEventListener("click", () =>
      copiarAlPortapapeles(config.iban, "IBAN", "pa-dato-iban")
    );
  }
})();
