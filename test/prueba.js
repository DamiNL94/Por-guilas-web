// Banco de pruebas del backend de "Súmate".
//
//   node test/prueba.js                  → todo lo que no necesita base de datos
//   DATABASE_URL=postgres://… node test/prueba.js   → además, el flujo completo
//
// La base de datos que se le pase se usa de verdad: crea las tablas y las
// vacía al terminar. No apuntar nunca a la de producción.
"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const assert = require("node:assert/strict");

// --- Entorno de pruebas -------------------------------------------------------
// Copia de la política con los huecos rellenos: demuestra que el fichero real
// pasa todos los controles salvo el de los PENDIENTE, que es el que queremos
// que siga fallando mientras falten el NIF y el domicilio.
const RAIZ = path.resolve(__dirname, "..");
const copia = path.join(os.tmpdir(), `pa-politica-${process.pid}.html`);
fs.writeFileSync(
  copia,
  fs.readFileSync(path.join(RAIZ, "legal", "privacidad.html"), "utf8").replace(/PENDIENTE:/g, "X:")
);

process.env.RUTA_POLITICA = copia;
process.env.ADMIN_TOKEN = process.env.ADMIN_TOKEN || "t".repeat(40);
process.env.SECRETO_HMAC = process.env.SECRETO_HMAC || "s".repeat(40);
process.env.CORREO_EN_CONSOLA = "1";
process.env.URL_BASE = "http://localhost:9977";

const CON_BD = Boolean(process.env.DATABASE_URL);
// Sin base de datos real se pone una que no existe: así el guardián de arranque
// da el visto bueno y se puede comprobar todo lo que ocurre ANTES de tocar la
// base —validación, trampa, origen, límites—, que es la mayor parte. Las
// consultas fallan al conectar y devuelven 500, que es justo lo que se espera.
if (!CON_BD) process.env.DATABASE_URL = "postgres://nadie@127.0.0.1:1/nada?sslmode=disable";

const api = require("../src/api.js");
const util = require("../src/util.js");
const limites = require("../src/limites.js");
const { ANTIABUSO } = require("../src/config.js");

// --- Andamiaje ----------------------------------------------------------------

let fallos = 0;
let pasadas = 0;
const pendientes = [];

async function prueba(nombre, fn) {
  try {
    await fn();
    pasadas++;
    console.log(`  ok   ${nombre}`);
  } catch (err) {
    fallos++;
    console.log(`  FALLA ${nombre}`);
    console.log(`        ${err.message.split("\n")[0]}`);
  }
}

const saltar = (nombre, motivo) => pendientes.push(`${nombre} (${motivo})`);

let servidor;
let base;

function arrancarServidor() {
  return new Promise((resolve) => {
    servidor = http.createServer((req, res) => api.manejar(req, res));
    servidor.listen(0, "127.0.0.1", () => {
      base = `http://127.0.0.1:${servidor.address().port}`;
      resolve();
    });
  });
}

async function pedir(ruta, opciones = {}) {
  const res = await fetch(base + ruta, { redirect: "manual", ...opciones });
  const tipo = res.headers.get("content-type") || "";
  const cuerpo = tipo.includes("json") ? await res.json() : await res.text();
  return { estado: res.status, cabeceras: res.headers, cuerpo };
}

const enviarAlta = (datos, extra = {}) =>
  pedir("/api/sumate", {
    method: "POST",
    headers: { "content-type": "application/json", ...extra },
    body: JSON.stringify({ t0: Date.now() - 9000, consentimiento: true, ...datos }),
  });

// Formulario válido de referencia.
const VALIDO = {
  nombre: "Ana María López",
  email: "ana@ejemplo.es",
  zona: "casco",
  como: "calle",
  mensaje: "Quiero echar una mano con el buzoneo.",
};

// --- Pruebas ------------------------------------------------------------------

async function main() {
  await arrancarServidor();

  console.log("\nValidación y saneado");
  await prueba("recorta espacios y normaliza el correo", () => {
    const { datos } = util.validarAlta({ ...VALIDO, nombre: "  Ana   López ", email: " ANA@X.ES " });
    assert.equal(datos.nombre, "Ana López");
    assert.equal(datos.email, "ana@x.es");
  });
  await prueba("rechaza zona y motivo fuera de la lista cerrada", () => {
    const { errores } = util.validarAlta({ ...VALIDO, zona: "marte", como: "; drop table" });
    assert.ok(errores.zona && errores.como);
  });
  await prueba("el consentimiento es obligatorio", () => {
    const { errores } = util.validarAlta({ ...VALIDO, consentimiento: false });
    assert.ok(errores.consentimiento);
  });
  await prueba("tokens con la forma esperada y comparación segura", () => {
    const t = util.nuevoToken();
    assert.ok(util.tokenConForma(t.claro));
    assert.equal(t.hash.length, 64);
    assert.ok(!util.tokenConForma("../../etc/passwd"));
    assert.ok(util.igualSeguro("a", "a") && !util.igualSeguro("a", "b"));
  });

  console.log("\nAPI · alta");
  await prueba("un alta válida responde 200 con el mensaje neutro", async () => {
    const r = await enviarAlta(VALIDO);
    if (!CON_BD) return assert.equal(r.estado, 500); // sin base de datos falla al guardar
    assert.equal(r.estado, 200);
    assert.equal(r.cuerpo.ok, true);
  });
  await prueba("los errores de validación vuelven por campo", async () => {
    const r = await enviarAlta({ ...VALIDO, email: "esto-no-es-un-correo" });
    assert.equal(r.estado, 400);
    assert.ok(r.cuerpo.errores.email);
  });
  await prueba("la trampa responde éxito sin guardar nada", async () => {
    const r = await enviarAlta({ ...VALIDO, [ANTIABUSO.campoTrampa]: "soy un robot" });
    assert.equal(r.estado, 200);
    assert.equal(r.cuerpo.ok, true);
  });
  await prueba("rellenar en menos de tres segundos se descarta", async () => {
    const r = await enviarAlta({ ...VALIDO, t0: Date.now() - 200 });
    assert.equal(r.estado, 200);
    assert.equal(r.cuerpo.ok, true);
  });
  await prueba("rechaza cuerpos que no son JSON ni formulario", async () => {
    const r = await pedir("/api/sumate", {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: "hola",
    });
    assert.equal(r.estado, 400);
  });
  await prueba("rechaza cuerpos desmesurados", async () => {
    const r = await pedir("/api/sumate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ nombre: "x".repeat(200000) }),
    });
    assert.ok(r.estado === 413 || r.estado === 400);
  });
  await prueba("rechaza peticiones de otro origen", async () => {
    const r = await enviarAlta(VALIDO, { origin: "https://sitio-ajeno.example" });
    assert.equal(r.estado, 403);
  });
  await prueba("el límite por IP acaba cortando", async () => {
    limites.reiniciar();
    let visto429 = false;
    for (let i = 0; i < ANTIABUSO.altasPorIpHora + 3; i++) {
      const r = await enviarAlta({ ...VALIDO, email: `tope${i}@ejemplo.es` });
      if (r.estado === 429) visto429 = true;
    }
    assert.ok(visto429, "nunca llegó a devolver 429");
    limites.reiniciar();
  });

  console.log("\nAPI · enlaces");
  await prueba("un token con mala forma no llega a la base de datos", async () => {
    const r = await pedir("/api/sumate/confirmar?token=" + encodeURIComponent("<script>"));
    assert.equal(r.estado, 302);
    assert.equal(r.cabeceras.get("location"), "/sumate/enlace-caducado");
  });
  await prueba("el enlace de confirmación pinta la página con el botón", async () => {
    const t = util.nuevoToken().claro;
    const r = await pedir(`/api/sumate/confirmar?token=${t}`);
    assert.equal(r.estado, 200);
    assert.ok(r.cuerpo.includes(t), "el token no llegó a la plantilla");
    assert.ok(r.cuerpo.includes('method="post"'), "la confirmación real debe ser un POST");
  });
  await prueba("el enlace de baja también pide confirmación", async () => {
    const t = util.nuevoToken().claro;
    const r = await pedir(`/api/sumate/baja?token=${t}`);
    assert.equal(r.estado, 200);
    assert.ok(r.cuerpo.includes("Sí, bórrame"));
  });
  await prueba("las respuestas de la API no se cachean ni se indexan", async () => {
    const r = await pedir("/api/salud");
    assert.match(r.cabeceras.get("cache-control") || "", /no-store/);
    assert.match(r.cabeceras.get("x-robots-tag") || "", /noindex/);
  });

  console.log("\nAPI · panel del equipo");
  await prueba("sin token, 401", async () => {
    const r = await pedir("/api/admin/altas");
    assert.equal(r.estado, 401);
  });
  await prueba("con token equivocado, 401", async () => {
    const r = await pedir("/api/admin/altas", { headers: { authorization: "Bearer noes" } });
    assert.equal(r.estado, 401);
  });
  await prueba("con el token bueno, entra", async () => {
    limites.reiniciar();
    const r = await pedir("/api/admin/altas", {
      headers: { authorization: `Bearer ${process.env.ADMIN_TOKEN}` },
    });
    if (!CON_BD) return assert.equal(r.estado, 500);
    assert.equal(r.estado, 200);
    assert.equal(r.cuerpo.ok, true);
  });

  console.log("\nCSV");
  const { celda } = require("../src/admin.js");
  await prueba("neutraliza las celdas que Excel tomaría por fórmula", () => {
    // El valor sale siempre entrecomillado; lo que se comprueba es la comilla
    // simple que Excel usa para decir "esto es texto, no una fórmula".
    assert.equal(celda("=1+1"), `"'=1+1"`);
    assert.equal(celda("+34600"), `"'+34600"`);
    assert.equal(celda("-5"), `"'-5"`);
    assert.equal(celda("@usuario"), `"'@usuario"`);
    assert.equal(celda("\t=cmd"), `"'\t=cmd"`);
  });
  await prueba("entrecomilla y escapa", () => {
    assert.equal(celda('di "hola"'), '"di ""hola"""');
    assert.equal(celda("con;punto"), '"con;punto"');
  });

  // --- Flujo completo, solo con base de datos --------------------------------
  console.log("\nFlujo completo");
  if (!CON_BD) {
    saltar("alta → confirmación → baja", "sin DATABASE_URL");
    saltar("idempotencia por correo", "sin DATABASE_URL");
    saltar("neutralidad de la respuesta", "sin DATABASE_URL");
    saltar("purga de altas sin confirmar", "sin DATABASE_URL");
    console.log("  (saltadas: hace falta DATABASE_URL)");
  } else {
    const db = require("../src/db.js");
    const sumate = require("../src/sumate.js");
    const purga = require("../src/purga.js");
    await db.migrar();
    await db.consulta("delete from altas");
    limites.reiniciar();

    let idAna;

    await prueba("el alta guarda pendiente y deja prueba de consentimiento", async () => {
      const r = await enviarAlta(VALIDO);
      assert.equal(r.estado, 200);
      const f = await db.consulta("select id, estado, token_baja_hash from altas where email=$1", [
        VALIDO.email,
      ]);
      assert.equal(f.rowCount, 1);
      assert.equal(f.rows[0].estado, "pendiente");
      assert.ok(f.rows[0].token_baja_hash, "falta el hash del token de baja");
      idAna = f.rows[0].id;
      const c = await db.consulta("select version_texto, ip from consentimientos where alta_id=$1", [
        idAna,
      ]);
      assert.equal(c.rowCount, 1);
      assert.equal(c.rows[0].version_texto, "privacidad-2026-09-01");
      assert.ok(c.rows[0].ip, "no se guardó la IP como prueba");
    });

    await prueba("repetir el alta actualiza y no duplica", async () => {
      const r = await enviarAlta({ ...VALIDO, nombre: "Ana M. López", zona: "tebar" });
      assert.equal(r.estado, 200);
      const f = await db.consulta("select nombre, zona from altas where email=$1", [VALIDO.email]);
      assert.equal(f.rowCount, 1);
      assert.equal(f.rows[0].nombre, "Ana M. López");
      assert.equal(f.rows[0].zona, "tebar");
    });

    await prueba("un mensaje vacío no borra el que ya había", async () => {
      await enviarAlta({ ...VALIDO, mensaje: "" });
      const f = await db.consulta("select mensaje from altas where email=$1", [VALIDO.email]);
      assert.ok(f.rows[0].mensaje, "se perdió el mensaje original");
    });

    await prueba("la respuesta es idéntica para un correo nuevo y uno existente", async () => {
      limites.reiniciar();
      const a = await enviarAlta({ ...VALIDO, email: "nadie-nuevo@ejemplo.es" });
      const b = await enviarAlta(VALIDO);
      assert.equal(a.estado, b.estado);
      assert.deepEqual(a.cuerpo, b.cuerpo);
    });

    await prueba("confirmar exige POST y marca la ficha", async () => {
      const t = util.nuevoToken();
      await db.consulta(
        "update altas set token_conf_hash=$2, token_conf_expira=now()+interval '48 hours' where id=$1",
        [idAna, t.hash]
      );
      const r = await pedir("/api/sumate/confirmar", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token: t.claro }).toString(),
      });
      assert.equal(r.estado, 303);
      assert.equal(r.cabeceras.get("location"), "/sumate/gracias");
      const f = await db.consulta("select estado, token_conf_hash from altas where id=$1", [idAna]);
      assert.equal(f.rows[0].estado, "confirmado");
      assert.equal(f.rows[0].token_conf_hash, null, "el token debe quemarse");
    });

    await prueba("el mismo enlace no vale dos veces", async () => {
      const t = util.nuevoToken();
      const r = await pedir("/api/sumate/confirmar", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token: t.claro }).toString(),
      });
      assert.equal(r.cabeceras.get("location"), "/sumate/enlace-caducado");
    });

    await prueba("un enlace caducado no confirma", async () => {
      const t = util.nuevoToken();
      const ins = await db.consulta(
        `insert into altas (email,nombre,token_conf_hash,token_conf_expira)
         values ('caducada@ejemplo.es','Caducada',$1, now() - interval '1 hour') returning id`,
        [t.hash]
      );
      const r = await pedir("/api/sumate/confirmar", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token: t.claro }).toString(),
      });
      assert.equal(r.cabeceras.get("location"), "/sumate/enlace-caducado");
      await db.consulta("delete from altas where id=$1", [ins.rows[0].id]);
    });

    await prueba("el token de baja se deriva del secreto y encaja con el guardado", async () => {
      const t = sumate.tokenBajaDe(idAna);
      assert.ok(util.tokenConForma(t));
      const f = await db.consulta("select token_baja_hash from altas where id=$1", [idAna]);
      assert.equal(f.rows[0].token_baja_hash, util.hashToken(t));
    });

    await prueba("la baja borra de verdad, también la prueba de consentimiento", async () => {
      const t = sumate.tokenBajaDe(idAna);
      const r = await pedir("/api/sumate/baja", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token: t }).toString(),
      });
      assert.equal(r.cabeceras.get("location"), "/sumate/baja");
      const f = await db.consulta("select 1 from altas where id=$1", [idAna]);
      assert.equal(f.rowCount, 0, "la fila sigue ahí");
      const c = await db.consulta("select 1 from consentimientos where alta_id=$1", [idAna]);
      assert.equal(c.rowCount, 0, "quedó la prueba de consentimiento huérfana");
    });

    await prueba("un clic desde el cliente de correo (RFC 8058) también borra", async () => {
      limites.reiniciar();
      await enviarAlta({ ...VALIDO, email: "unclic@ejemplo.es" });
      const f = await db.consulta("select id from altas where email=$1", ["unclic@ejemplo.es"]);
      const t = sumate.tokenBajaDe(f.rows[0].id);
      const r = await pedir(`/api/sumate/baja?token=${t}`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: "List-Unsubscribe=One-Click",
      });
      assert.equal(r.estado, 200);
      const g = await db.consulta("select 1 from altas where email=$1", ["unclic@ejemplo.es"]);
      assert.equal(g.rowCount, 0);
    });

    await prueba("borrar responde igual exista o no la dirección", async () => {
      limites.reiniciar();
      const a = await pedir("/api/sumate/borrar", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ email: "nadie-de-nada@ejemplo.es" }),
      });
      const b = await pedir("/api/sumate/borrar", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ email: "nadie-nuevo@ejemplo.es" }),
      });
      assert.equal(a.estado, b.estado);
      assert.deepEqual(a.cuerpo, b.cuerpo);
    });

    await prueba("la purga se lleva las altas sin confirmar caducadas", async () => {
      await db.consulta(
        `insert into altas (email,nombre,estado,creado)
         values ('vieja@ejemplo.es','Vieja','pendiente', now() - interval '40 days')`
      );
      const r = await purga.purgar();
      assert.ok(r.pendientes >= 1);
      const f = await db.consulta("select 1 from altas where email='vieja@ejemplo.es'");
      assert.equal(f.rowCount, 0);
    });

    await prueba("la purga anonimiza las IP viejas y conserva el resto de la prueba", async () => {
      const ins = await db.consulta(
        `insert into altas (email,nombre,estado) values ('ip@ejemplo.es','IP','confirmado') returning id`
      );
      await db.consulta(
        `insert into consentimientos (alta_id,version_texto,texto_aceptado,ip,momento)
         values ($1,'v','texto','203.0.113.9'::inet, now() - interval '13 months')`,
        [ins.rows[0].id]
      );
      const r = await purga.purgar();
      assert.ok(r.ips >= 1);
      const c = await db.consulta(
        "select ip, version_texto, ip_borrada_en from consentimientos where alta_id=$1",
        [ins.rows[0].id]
      );
      assert.equal(c.rows[0].ip, null, "la IP debía borrarse");
      assert.equal(c.rows[0].version_texto, "v", "el resto de la prueba debía quedarse");
      assert.ok(c.rows[0].ip_borrada_en);
    });

    await prueba("el listado y el CSV salen con los datos", async () => {
      limites.reiniciar();
      const cab = { authorization: `Bearer ${process.env.ADMIN_TOKEN}` };
      const j = await pedir("/api/admin/altas?estado=todos", { headers: cab });
      assert.equal(j.estado, 200);
      assert.ok(j.cuerpo.total >= 1);
      const c = await pedir("/api/admin/altas.csv?estado=todos", { headers: cab });
      assert.equal(c.estado, 200);
      assert.ok(c.cuerpo.startsWith("﻿"), "falta el BOM para Excel");
      assert.ok(c.cuerpo.includes(";"), "el separador debe ser punto y coma");
      assert.match(c.cabeceras.get("content-disposition") || "", /attachment/);
    });

    await db.consulta("delete from altas");
    await db.cerrar();
  }

  // --- Resumen ---------------------------------------------------------------
  servidor.close();
  fs.unlinkSync(copia);

  console.log(`\n${pasadas} pasadas · ${fallos} fallos · ${pendientes.length} sin ejecutar`);
  for (const p of pendientes) console.log(`  sin ejecutar: ${p}`);
  process.exit(fallos ? 1 : 0);
}

main().catch((err) => {
  console.error("\nEl banco de pruebas se ha roto:", err);
  process.exit(1);
});
