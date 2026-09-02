// Panel mínimo para el equipo de campaña: listado y descarga en CSV.
//
// Se protege con un token en cabecera que vive en ADMIN_TOKEN. No aparece en el
// frontend, ni en la URL, ni en ningún fichero del repositorio: una lista de
// afinidad política no puede quedar a un enlace de distancia.
"use strict";

const { CONFIG, COMO, ZONAS, DONACIONES } = require("./config.js");
const { consulta } = require("./db.js");
const { json, texto } = require("./http.js");
const { igualSeguro, ipDe, euros } = require("./util.js");
const limites = require("./limites.js");

// Devuelve true si la petición está autorizada. Nunca dice por qué falla.
function autorizado(req) {
  const cab = String(req.headers.authorization || "");
  const m = /^Bearer\s+(.+)$/i.exec(cab.trim());
  if (!m) return false;
  if (!CONFIG.adminToken) return false;
  // Comparación en tiempo constante: sin esto, medir cuánto tarda la respuesta
  // permite adivinar el token carácter a carácter.
  return igualSeguro(m[1].trim(), CONFIG.adminToken);
}

const ESTADOS = new Set(["confirmado", "pendiente", "todos"]);

async function filas(url) {
  const estado = url.searchParams.get("estado") || "confirmado";
  if (!ESTADOS.has(estado)) return { error: "estado" };

  const donde = estado === "todos" ? "" : "where a.estado = $1";
  const params = estado === "todos" ? [] : [estado];

  const r = await consulta(
    `select a.id, a.email, a.nombre, a.zona, a.como, a.mensaje, a.estado,
            a.telefono, a.consiente_colaborar,
            a.creado, a.confirmado_en,
            c.momento       as consentimiento_momento,
            c.version_texto as consentimiento_version
       from altas a
       left join lateral (
         select momento, version_texto
           from consentimientos
          where alta_id = a.id
          order by momento desc
          limit 1
       ) c on true
       ${donde}
      order by a.creado desc`,
    params
  );

  return { estado, filas: r.rows };
}

async function listado(req, res, url) {
  const { error, estado, filas: datos } = await filas(url);
  if (error) return json(res, 400, { ok: false, mensaje: "Estado no válido." });

  return json(res, 200, {
    ok: true,
    estado,
    total: datos.length,
    altas: datos.map((f) => ({
      id: String(f.id),
      email: f.email,
      nombre: f.nombre,
      zona: f.zona ? ZONAS.get(f.zona) || f.zona : null,
      como: COMO.get(f.como) || f.como,
      mensaje: f.mensaje,
      telefono: f.telefono,
      // Sale al panel para que quien mande un correo sepa a quién puede
      // escribirle de qué, sin tener que abrir la tabla de consentimientos.
      consiente: { colaborar: f.consiente_colaborar },
      estado: f.estado,
      creado: f.creado,
      confirmado: f.confirmado_en,
      consentimiento: {
        momento: f.consentimiento_momento,
        version: f.consentimiento_version,
      },
    })),
  });
}

// --- CSV ----------------------------------------------------------------------

// Excel en español espera punto y coma como separador y necesita el BOM para
// no destrozar los acentos.
const SEPARADOR = ";";

// Una celda que empieza por = + - @ la interpreta la hoja de cálculo como
// fórmula, y eso permite meter una fórmula por un campo de texto de la web.
// Se antepone una comilla simple, que Excel y LibreOffice tratan como "esto es
// texto". El tabulador y el retorno de carro cuentan igual: sirven de relleno
// antes del signo para colarse.
function celda(valor) {
  if (valor === null || valor === undefined) return '""';
  let s = String(valor);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return '"' + s.replace(/"/g, '""') + '"';
}

const fecha = (v) => (v ? new Date(v).toISOString().replace("T", " ").slice(0, 19) : "");

const CABECERAS = [
  "id",
  "estado",
  "nombre",
  "email",
  "zona",
  "como_colabora",
  "mensaje",
  "telefono",
  "consiente_colaborar",
  "alta",
  "confirmado",
  "consentimiento_momento",
  "consentimiento_version",
];

async function csv(req, res, url) {
  const { error, estado, filas: datos } = await filas(url);
  if (error) return json(res, 400, { ok: false, mensaje: "Estado no válido." });

  const lineas = [CABECERAS.map(celda).join(SEPARADOR)];
  for (const f of datos) {
    lineas.push(
      [
        f.id,
        f.estado,
        f.nombre,
        f.email,
        f.zona ? ZONAS.get(f.zona) || f.zona : "",
        COMO.get(f.como) || f.como,
        f.mensaje || "",
        f.telefono || "",
        f.consiente_colaborar ? "sí" : "no",
        fecha(f.creado),
        fecha(f.confirmado_en),
        fecha(f.consentimiento_momento),
        f.consentimiento_version || "",
      ]
        .map(celda)
        .join(SEPARADOR)
    );
  }

  // BOM UTF-8 y saltos CRLF: es lo que Excel espera.
  const cuerpo = "﻿" + lineas.join("\r\n") + "\r\n";
  const nombre = `por-aguilas-altas-${estado}.csv`;

  return texto(res, 200, cuerpo, {
    "content-type": "text/csv; charset=utf-8",
    "content-disposition": `attachment; filename="${nombre}"`,
  });
}

// --- Donaciones ---------------------------------------------------------------
//
// El listado que el equipo cuadra contra el extracto del banco. Es la mitad
// manual del riesgo R1 y del R2: cada ingreso se mira uno a uno antes de darlo
// por bueno, porque ninguna casilla marcada en una web impide de verdad que una
// empresa haga una transferencia.
const ESTADOS_DON = new Set(["comunicada", "cobrada", "devuelta", "anulada", "todos"]);

async function filasDonaciones(url) {
  const estado = url.searchParams.get("estado") || "todos";
  if (!ESTADOS_DON.has(estado)) return { error: "estado" };

  const donde = estado === "todos" ? "" : "where estado = $1";
  const params = estado === "todos" ? [] : [estado];

  const r = await consulta(
    `select id, creado, nombre, apellidos, dni, email, importe_centimos,
            fecha_prevista, concepto, estado, version_texto, notas
       from donaciones ${donde}
      order by creado desc`,
    params
  );
  return { estado, filas: r.rows };
}

// Acumulado por donante y año natural. Es el aviso temprano del riesgo R5: no
// sustituye al control de la federación —el tope de la LO 8/2007 se cuenta
// sobre todo lo que reciba el partido, no solo sobre lo que entre por Águilas—
// pero enseña lo que sí podemos ver desde aquí.
async function acumuladoPorDonante() {
  const r = await consulta(
    `select dni,
            extract(year from creado)::int      as anio,
            sum(importe_centimos)::bigint       as total,
            count(*)::int                       as veces
       from donaciones
      where estado in ('comunicada','cobrada')
      group by dni, anio
      having sum(importe_centimos) > $1
      order by total desc`,
    [Math.round(DONACIONES.limiteAnual * 100 * 0.5)] // desde la mitad del tope
  );
  return r.rows;
}

async function listadoDonaciones(req, res, url) {
  const { error, estado, filas: datos } = await filasDonaciones(url);
  if (error) return json(res, 400, { ok: false, mensaje: "Estado no válido." });

  const vigilar = await acumuladoPorDonante();

  return json(res, 200, {
    ok: true,
    estado,
    total: datos.length,
    sumaCentimos: datos.reduce((a, f) => a + Number(f.importe_centimos), 0),
    regimen: DONACIONES.regimen,
    limiteAnual: DONACIONES.limiteAnual,
    umbralNotificacion: DONACIONES.umbralNotificacion,
    donaciones: datos.map((f) => ({
      id: String(f.id),
      creado: f.creado,
      nombre: f.nombre,
      apellidos: f.apellidos,
      dni: f.dni,
      email: f.email,
      importe: euros(Number(f.importe_centimos)),
      superaUmbralNotificacion:
        Number(f.importe_centimos) > DONACIONES.umbralNotificacion * 100,
      fechaPrevista: f.fecha_prevista,
      concepto: f.concepto,
      estado: f.estado,
      versionTexto: f.version_texto,
      notas: f.notas,
    })),
    // Quien esté cerca del tope. Mirar antes de aceptar el siguiente ingreso.
    vigilar: vigilar.map((v) => ({
      dni: v.dni,
      anio: v.anio,
      total: euros(Number(v.total)),
      veces: v.veces,
      superaLimite: Number(v.total) > DONACIONES.limiteAnual * 100,
    })),
  });
}

const CABECERAS_DON = [
  "id",
  "comunicada",
  "nombre",
  "apellidos",
  "dni",
  "email",
  "importe_eur",
  "fecha_prevista",
  "concepto",
  "estado",
  "version_texto",
  "notas",
];

async function csvDonaciones(req, res, url) {
  const { error, estado, filas: datos } = await filasDonaciones(url);
  if (error) return json(res, 400, { ok: false, mensaje: "Estado no válido." });

  const lineas = [CABECERAS_DON.map(celda).join(SEPARADOR)];
  for (const f of datos) {
    lineas.push(
      [
        f.id,
        fecha(f.creado),
        f.nombre,
        f.apellidos,
        f.dni,
        f.email,
        euros(Number(f.importe_centimos)),
        f.fecha_prevista ? new Date(f.fecha_prevista).toISOString().slice(0, 10) : "",
        f.concepto,
        f.estado,
        f.version_texto,
        f.notas || "",
      ]
        .map(celda)
        .join(SEPARADOR)
    );
  }

  const cuerpo = "\ufeff" + lineas.join("\r\n") + "\r\n";

  return texto(res, 200, cuerpo, {
    "content-type": "text/csv; charset=utf-8",
    "content-disposition": `attachment; filename="por-aguilas-donaciones-${estado}.csv"`,
  });
}

// --- Entrada ------------------------------------------------------------------

async function manejar(req, res, url) {
  const cupo = limites.permitirAdmin(ipDe(req));
  if (!cupo.permitido) {
    return json(res, 429, { ok: false, mensaje: "Demasiadas peticiones." });
  }

  if (!autorizado(req)) {
    // Sin pistas sobre si el token existe, si es corto o si ha caducado.
    return json(res, 401, { ok: false, mensaje: "No autorizado." }, {
      "www-authenticate": 'Bearer realm="Por Aguilas"',
    });
  }

  if (req.method !== "GET" && req.method !== "HEAD") {
    return json(res, 405, { ok: false, mensaje: "Solo GET." }, { allow: "GET, HEAD" });
  }

  if (url.pathname === "/api/admin/altas") return listado(req, res, url);
  if (url.pathname === "/api/admin/altas.csv") return csv(req, res, url);
  if (url.pathname === "/api/admin/donaciones") return listadoDonaciones(req, res, url);
  if (url.pathname === "/api/admin/donaciones.csv") return csvDonaciones(req, res, url);

  return json(res, 404, { ok: false, mensaje: "No existe." });
}

module.exports = { manejar, autorizado, celda };
