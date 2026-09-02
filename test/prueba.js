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
// Copias de las páginas legales con los huecos rellenos. Demuestran que los
// ficheros reales pasan todos los controles salvo el de los PENDIENTE, que es
// justo el que queremos que siga fallando mientras falten el domicilio social,
// la inscripción registral y el contacto del delegado.
const RAIZ = path.resolve(__dirname, "..");
const dirLegal = fs.mkdtempSync(path.join(os.tmpdir(), "pa-legal-"));
for (const pagina of ["privacidad.html", "aviso-legal.html", "cookies.html"]) {
  fs.writeFileSync(
    path.join(dirLegal, pagina),
    fs.readFileSync(path.join(RAIZ, "legal", pagina), "utf8").replace(/PENDIENTE:/g, "X:")
  );
}

process.env.RUTA_LEGAL = dirLegal;
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

// Sin ninguna dirección del responsable el backend se declara NO listo, que es
// exactamente lo correcto mientras el repositorio no la tenga. Para poder
// probar todo lo demás se le da una de mentira, igual que se le dan copias de
// las páginas legales con los huecos rellenos. Tiene que ir antes de cargar
// api.js, que evalúa el estado de arranque al importarse.
require("../src/config.js").RESPONSABLE.direccionContacto = "Calle de prueba 1, Águilas (Murcia)";

const api = require("../src/api.js");
const util = require("../src/util.js");
const limites = require("../src/limites.js");
const {
  ANTIABUSO,
  DONACIONES,
  CONSENTIMIENTOS,
  DECLARACIONES,
  VERSION_POLITICA,
  RESPONSABLE,
  cifValido,
  ibanValido,
  donacionesPublicas,
  revisarPuestaEnMarcha,
} = require("../src/config.js");

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
    // El mensaje entero, no solo la primera línea: en las comparaciones de
    // node los valores van en la tercera, y sin ellos hay que ir a averiguar
    // a mano qué esperaba la prueba.
    for (const linea of err.message.split("\n")) if (linea.trim()) console.log(`        ${linea}`);
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
  // El cuerpo se guarda también en crudo. `res.text()` decodifica siguiendo la
  // norma WHATWG, que se come el BOM inicial: con él no hay manera de
  // comprobar que el CSV lo lleva, aunque el servidor lo mande.
  const crudo = Buffer.from(await res.arrayBuffer());
  const texto = crudo.toString("utf8");
  const cuerpo = tipo.includes("json") ? JSON.parse(texto || "null") : texto;
  return { estado: res.status, cabeceras: res.headers, cuerpo, crudo };
}

const enviarAlta = (datos, extra = {}) =>
  pedir("/api/sumate", {
    method: "POST",
    headers: { "content-type": "application/json", ...extra },
    body: JSON.stringify({
      t0: Date.now() - 9000,
      consiente_info: true,
      mayor_edad: true,
      ...datos,
    }),
  });

const enviarDonacion = (datos, extra = {}) =>
  pedir("/api/donacion", {
    method: "POST",
    headers: { "content-type": "application/json", ...extra },
    body: JSON.stringify({
      t0: Date.now() - 9000,
      declara_fisica: true,
      declara_sin_contrato: true,
      declara_no_extranjero: true,
      acepta_privacidad: true,
      declara_mayor_edad: true,
      ...datos,
    }),
  });

// Formulario válido de referencia.
const VALIDO = {
  nombre: "Ana María López",
  email: "ana@ejemplo.es",
  zona: "casco",
  como: "calle",
  mensaje: "Quiero echar una mano con el buzoneo.",
};

// Dentro de la horquilla que admite la fecha prevista del ingreso.
const dentroDe = (dias) => {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
};

const DONACION_VALIDA = {
  nombre: "Ana María",
  apellidos: "López Núñez",
  dni: "12345678Z",
  email: "ana@ejemplo.es",
  importe: "50,00",
  fecha_prevista: dentroDe(3),
};

// --- Pruebas ------------------------------------------------------------------

async function main() {
  await arrancarServidor();

  // Las tablas, antes de la primera prueba que las toque. Estaban creándose
  // más abajo, ya dentro del bloque del flujo completo, y eso hacía que el
  // banco diera un resultado distinto la primera vez que se ejecutaba contra
  // una base limpia —dos altas devolviendo 500 porque aún no existía dónde
  // guardar— y otro a partir de la segunda, con las tablas ya hechas. Una
  // base recién creada es justo el caso de un despliegue nuevo.
  if (CON_BD) await require("../src/db.js").migrar();

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
  await prueba("el consentimiento de información y la mayoría de edad son obligatorios", () => {
    const { errores } = util.validarAlta({ ...VALIDO });
    assert.ok(errores.consiente_info, "sin la casilla de información no puede haber alta");
    assert.ok(errores.mayor_edad, "sin declarar mayoría de edad tampoco");
  });
  await prueba("los consentimientos van por separado y ninguno arrastra a otro", () => {
    const base = { ...VALIDO, consiente_info: true, mayor_edad: true };
    const solo = util.validarAlta(base);
    assert.equal(Object.keys(solo.errores).length, 0);
    assert.equal(solo.datos.consentimientos.info, true);
    assert.equal(solo.datos.consentimientos.colaborar, false, "colaborar no se marca solo");

    const colabora = util.validarAlta({ ...base, consiente_colaborar: true });
    assert.equal(colabora.datos.consentimientos.colaborar, true);
    assert.equal(colabora.datos.consentimientos.info, true, "marcar colaborar no toca el obligatorio");
  });
  await prueba("el teléfono solo se guarda si se ha pedido colaborar", () => {
    const base = { ...VALIDO, consiente_info: true, mayor_edad: true, telefono: "600 11 22 33" };
    const sin = util.validarAlta(base);
    assert.equal(sin.datos.telefono, null, "sin la casilla de colaborar, el teléfono se descarta");
    const con = util.validarAlta({ ...base, consiente_colaborar: true });
    assert.equal(con.datos.telefono, "600112233");
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
  console.log("\nDonaciones · validación");
  await prueba("el DNI se valida por su letra de control", () => {
    for (const bueno of ["12345678Z", "00000000T", "X1234567L", "Y1234567X", "Z1234567R"]) {
      assert.ok(util.dniNieValido(bueno), `${bueno} debía ser válido`);
    }
    for (const malo of ["12345678A", "1234567Z", "X12345678Z", "", "12345678"]) {
      assert.ok(!util.dniNieValido(malo), `${malo} no debía colar`);
    }
  });
  await prueba("un NIF de persona jurídica no cuela por construcción", () => {
    // Art. 5.1.a LO 8/2007: las donaciones de personas jurídicas son nulas. La
    // primera barrera es que su NIF no encaja en la forma de un DNI ni un NIE.
    for (const cif of ["B12345678", "A58818501", "G28029643", "J12345678", "W1234567E"]) {
      assert.ok(!util.dniNieValido(cif), `${cif} es un CIF y no debía colar`);
    }
  });
  await prueba("el importe se lee en céntimos y aguanta los formatos de aquí", () => {
    assert.equal(util.parsearImporte("50"), 5000);
    assert.equal(util.parsearImporte("50,00"), 5000);
    assert.equal(util.parsearImporte("1.250,50"), 125050);
    assert.equal(util.parsearImporte("1250.50"), 125050);
    assert.equal(util.parsearImporte("-5"), null);
    assert.equal(util.parsearImporte("50.001"), null, "tres decimales no son euros");
    assert.equal(util.parsearImporte("abc"), null);
  });
  await prueba("el concepto sale sin tildes, en mayúsculas y con el DNI al final", () => {
    const c = util.conceptoDonacion({ nombre: "María Ángeles", apellidos: "Núñez Gómez", dni: "12345678z" });
    assert.equal(c.completo, "DONACION AGUILAS MARIA ANGELES NUNEZ GOMEZ 12345678Z");
    assert.equal(c.corto, "DONACION AGUILAS 12345678Z");
    assert.ok(!c.cabe, "este concepto pasa del tope de caracteres del banco");
    assert.ok(c.corto.length <= DONACIONES.conceptoMaximoBanco, "el corto sí tiene que caber");
  });
  await prueba("el IBAN publicado pasa el mod-97 y los dígitos de control españoles", () => {
    assert.ok(ibanValido(DONACIONES.iban), "el IBAN de config.donaciones está mal copiado");
    // Un dígito bailado tiene que caer.
    assert.ok(!ibanValido(DONACIONES.iban.replace("ES11", "ES12")));
    assert.ok(!ibanValido("ES1121008315191300160572"));
  });
  await prueba("la fecha prevista solo admite de hoy a tres meses", () => {
    assert.ok(util.fechaPrevistaValida(dentroDe(0)));
    assert.ok(util.fechaPrevistaValida(dentroDe(89)));
    assert.ok(!util.fechaPrevistaValida(dentroDe(-5)), "el pasado no vale");
    assert.ok(!util.fechaPrevistaValida(dentroDe(200)), "dentro de siete meses tampoco");
    assert.ok(!util.fechaPrevistaValida("2027-13-45"));
  });

  console.log("\nAPI · donación");
  await prueba("una comunicación válida devuelve el concepto ya montado", async () => {
    limites.reiniciar();
    const r = await enviarDonacion(DONACION_VALIDA);
    // Con base de datos responde 200; sin ella, 500 al intentar guardar. En los
    // dos casos ha pasado la validación, que es lo que se comprueba aquí.
    assert.ok(r.estado === 200 || r.estado === 500, `estado inesperado: ${r.estado}`);
    if (r.estado === 200) {
      assert.equal(r.cuerpo.transferencia.iban, DONACIONES.iban);
      assert.equal(r.cuerpo.transferencia.titular, DONACIONES.titular);
      assert.match(r.cuerpo.transferencia.concepto, /^DONACION AGUILAS .*12345678Z$/);
    }
  });
  await prueba("sin una sola declaración, rechazo en servidor", async () => {
    for (const falta of [
      "declara_fisica",
      "declara_sin_contrato",
      "declara_no_extranjero",
      "acepta_privacidad",
      "declara_mayor_edad",
    ]) {
      limites.reiniciar();
      const r = await enviarDonacion({ ...DONACION_VALIDA, [falta]: false });
      assert.equal(r.estado, 400, `faltando ${falta} tenía que rechazar`);
      assert.ok(r.cuerpo.errores[falta], `el error de ${falta} tiene que volver por campo`);
    }
  });
  await prueba("DNI inválido, importe negativo, por encima del tope y correo malo: rechazados", async () => {
    const casos = [
      [{ dni: "12345678A" }, "dni"],
      [{ dni: "B12345678" }, "dni"],
      [{ importe: "-10" }, "importe"],
      [{ importe: "0" }, "importe"],
      [{ importe: "50001" }, "importe"],
      [{ email: "esto-no-es-un-correo" }, "email"],
      [{ fecha_prevista: dentroDe(-10) }, "fecha_prevista"],
      [{ nombre: "" }, "nombre"],
      [{ apellidos: "" }, "apellidos"],
    ];
    for (const [cambio, campo] of casos) {
      limites.reiniciar();
      const r = await enviarDonacion({ ...DONACION_VALIDA, ...cambio });
      assert.equal(r.estado, 400, `${JSON.stringify(cambio)} tenía que dar 400`);
      assert.ok(r.cuerpo.errores[campo], `esperaba un error en ${campo}`);
    }
  });
  await prueba("el tope del importe es exactamente el límite legal", async () => {
    limites.reiniciar();
    const justo = await enviarDonacion({ ...DONACION_VALIDA, importe: String(DONACIONES.limiteAnual) });
    assert.notEqual(justo.estado, 400, "el importe igual al tope sí se admite");
    limites.reiniciar();
    const pasado = await enviarDonacion({ ...DONACION_VALIDA, importe: String(DONACIONES.limiteAnual) + ",01" });
    assert.equal(pasado.estado, 400, "un céntimo por encima del tope, no");
  });
  await prueba("la trampa descarta en silencio y no guarda nada", async () => {
    limites.reiniciar();
    const r = await enviarDonacion({ ...DONACION_VALIDA, [ANTIABUSO.campoTrampa]: "http://spam" });
    assert.equal(r.estado, 200, "a un robot se le responde éxito, no un error");
    assert.ok(r.cuerpo.ok);
  });
  await prueba("rellenar en menos de tres segundos también se descarta", async () => {
    limites.reiniciar();
    const r = await enviarDonacion({ ...DONACION_VALIDA, t0: Date.now() - 200 });
    assert.equal(r.estado, 200);
  });
  await prueba("no se acepta ninguna finalidad ni destino de la donación", async () => {
    limites.reiniciar();
    // Aunque alguien lo mande a mano, no existe el campo y no se guarda: las
    // donaciones finalistas están prohibidas (art. 5.1.d LO 8/2007).
    const { datos } = util.validarDonacion({
      ...DONACION_VALIDA,
      declara_fisica: true, declara_sin_contrato: true, declara_no_extranjero: true,
      acepta_privacidad: true, declara_mayor_edad: true,
      destino: "vivienda", finalidad: "papeletas",
    });
    assert.equal(datos.destino, undefined);
    assert.equal(datos.finalidad, undefined);
  });
  await prueba("el límite por IP acaba cortando también aquí", async () => {
    limites.reiniciar();
    let cortado = false;
    for (let i = 0; i < ANTIABUSO.donacionesPorIpDia + 3; i++) {
      const r = await enviarDonacion({ ...DONACION_VALIDA, email: `a${i}@ejemplo.es` });
      if (r.estado === 429) { cortado = true; break; }
    }
    assert.ok(cortado, "tenía que acabar respondiendo 429");
  });
  await prueba("rechaza peticiones de otro origen", async () => {
    limites.reiniciar();
    const r = await enviarDonacion(DONACION_VALIDA, { origin: "https://otro-sitio.example" });
    assert.equal(r.estado, 403);
  });

  console.log("\nQuién responde");
  await prueba("el CIF del responsable pasa su dígito de control", () => {
    assert.ok(cifValido(RESPONSABLE.cif), `${RESPONSABLE.cif} no es un CIF válido`);
    // Un dígito bailado tiene que caer.
    assert.ok(!cifValido("G78269205"));
    assert.ok(!cifValido("G7826920"));
    // Y un DNI de persona física no es un CIF.
    assert.ok(!cifValido("12345678Z"));
  });
  await prueba("el CIF es de ámbito estatal, no de una provincia", () => {
    // Los dos dígitos que siguen a la letra son el código de provincia, y las
    // provincias van del 01 al 52. Un CIF que empiece por 30 sería de Murcia y
    // señalaría que alguien ha confundido la entidad: la asamblea local y la
    // federación regional NO tienen personalidad jurídica propia.
    const provincia = Number(RESPONSABLE.cif.slice(1, 3));
    assert.ok(provincia > 52, `el bloque ${provincia} es provincial y no estatal`);
  });
  await prueba("las páginas legales declaran al responsable que dice el código", () => {
    for (const pagina of ["aviso-legal.html", "privacidad.html"]) {
      const t = fs.readFileSync(path.join(RAIZ, "legal", pagina), "utf8");
      assert.ok(t.includes(RESPONSABLE.cif), `legal/${pagina} no publica el CIF`);
      const celda = /<th>(?:Responsable|Titular)<\/th>\s*<td>([\s\S]*?)<\/td>/.exec(t);
      assert.ok(celda, `legal/${pagina} no declara responsable ni titular`);
      assert.equal(
        celda[1].replace(/<[^>]*>/g, "").trim(),
        RESPONSABLE.denominacion,
        `legal/${pagina} nombra a otro responsable`
      );
    }
  });
  await prueba("la asamblea local no figura como quien responde", () => {
    // Puede aparecer nombrada —es como se conoce a la gente— pero no puede
    // aparecer respondiendo: no es una persona jurídica y no puede hacerlo.
    for (const pagina of ["aviso-legal.html", "privacidad.html"]) {
      const t = fs.readFileSync(path.join(RAIZ, "legal", pagina), "utf8");
      assert.ok(
        !/responsable del tratamiento es[^.]*de Águilas/i.test(t),
        `legal/${pagina} hace responder a la asamblea local`
      );
    }
  });
  await prueba("no existe ninguna casilla de cesión ni ningún destinatario tercero", () => {
    // Se retiró el 2 de septiembre de 2026. Sin consentimiento no puede haber
    // comunicación, así que lo que esta prueba vigila es que nadie la
    // reintroduzca a medias: una casilla sin literal guardado, o peor, un campo
    // que se guarde sin haber preguntado nada.
    assert.ok(!CONSENTIMIENTOS.has("cesion"), "ha vuelto a aparecer el consentimiento de cesión");
    assert.ok(!util.CAMPO_CONSENTIMIENTO.cesion, "ha vuelto a aparecer el campo de cesión");

    const html = fs.readFileSync(path.join(RAIZ, "index.html"), "utf8");
    assert.ok(!html.includes("consiente_cesion"), "la casilla ha vuelto a index.html");

    // Y aunque alguien la mande a mano, no se guarda en ningún sitio.
    const { datos } = util.validarAlta({ ...VALIDO, consiente_info: true, mayor_edad: true, consiente_cesion: true });
    assert.equal(datos.consentimientos.cesion, undefined, "no puede colarse un consentimiento que no se pregunta");
  });

  console.log("\nCompilación de la web");
  await prueba("la compilación está al día con index.html", () => {
    // Si alguien edita la plantilla y no vuelve a compilar, lo que se publica
    // sigue siendo lo anterior: el equipo cree haber cambiado la web y no ha
    // cambiado nada. Es el fallo silencioso que este build puede introducir, y
    // por eso se comprueba aquí y también al arrancar el servidor.
    const manifiesto = JSON.parse(
      fs.readFileSync(path.join(RAIZ, "publico", "build.json"), "utf8")
    );
    const actual = require("node:crypto")
      .createHash("sha256")
      .update(fs.readFileSync(path.join(RAIZ, "index.html"), "utf8"), "utf8")
      .digest("hex");
    assert.equal(
      actual,
      manifiesto.huellaIndex,
      "index.html ha cambiado: ejecuta node scripts/compilar.js"
    );
  });

  await prueba("ninguna página publicada necesita evaluar código", () => {
    // Es el riesgo R12 convertido en prueba. Lo que se publica no puede volver
    // a cargar el runtime, porque cargarlo obligaría a reabrir 'unsafe-eval'.
    for (const f of fs.readdirSync(path.join(RAIZ, "publico"))) {
      if (!f.endsWith(".html")) continue;
      const t = fs.readFileSync(path.join(RAIZ, "publico", f), "utf8");
      assert.ok(!t.includes("support.js"), `publico/${f} carga el runtime`);
      assert.ok(!t.includes("__resources"), `publico/${f} carga el mapa del CDN`);
      assert.ok(!t.includes("data-dc-script"), `publico/${f} lleva lógica sin compilar`);
      assert.ok(!/\{\{/.test(t), `publico/${f} tiene interpolaciones sin resolver`);
      assert.ok(t.includes('<script src="/app.js">'), `publico/${f} no carga app.js`);
    }
  });

  await prueba("la política de seguridad ya no abre la puerta a eval", () => {
    const s = fs.readFileSync(path.join(RAIZ, "server.js"), "utf8");
    // Se mira que no quede la directiva, no la palabra: los comentarios que
    // explican por qué se quitó sí la nombran, y deben poder hacerlo.
    assert.ok(
      !/["'`][^"'`]*\bscript-src\b[^"'`]*unsafe-eval/.test(s),
      "la CSP vuelve a incluir 'unsafe-eval'"
    );
    assert.ok(
      !/fuentes\.push\(\s*["']'unsafe-eval'["']\s*\)/.test(s),
      "algo vuelve a añadir 'unsafe-eval' a script-src"
    );
  });

  await prueba("index.html no se publica: lo que se sirve es su compilación", () => {
    // index.html es la fuente que edita el equipo. Si volviera a servirse,
    // volvería a hacer falta eval para pintarla.
    const s = fs.readFileSync(path.join(RAIZ, "server.js"), "utf8");
    assert.match(s, /FICHEROS_PRIVADOS[\s\S]{0,400}"index\.html"/, "index.html ya no es privado");
    assert.match(s, /FICHEROS_PRIVADOS[\s\S]{0,400}"support\.js"/, "support.js ya no es privado");
  });

  await prueba("las seis rutas tienen su página compilada", () => {
    const manifiesto = JSON.parse(
      fs.readFileSync(path.join(RAIZ, "publico", "build.json"), "utf8")
    );
    for (const [ruta, pag] of Object.entries(manifiesto.rutas)) {
      const f = path.join(RAIZ, "publico", pag + ".html");
      assert.ok(fs.existsSync(f), `falta la página de ${ruta}`);
      const t = fs.readFileSync(f, "utf8");
      assert.ok(t.includes("<main"), `${pag}.html no tiene contenido`);
    }
  });

  await prueba("app.js no depende de nada externo ni evalúa código", () => {
    // Se quitan los comentarios antes de mirar: la cabecera del fichero explica
    // que antes se compilaba con new Function() y esa frase no puede hacer
    // fallar la prueba que comprueba que ya no se hace.
    const t = fs
      .readFileSync(path.join(RAIZ, "app.js"), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");

    for (const patron of ["http://", "https://", "import ", "require("]) {
      assert.ok(!t.includes(patron), `app.js usa ${patron}`);
    }
    assert.ok(!/\bnew Function\b|\beval\s*\(/.test(t), "app.js evalúa código");
  });

  console.log("\nRevisión estática de la web publicada");
  await prueba("ninguna casilla viene marcada de salida", () => {
    const html = fs.readFileSync(path.join(RAIZ, "index.html"), "utf8");
    // El atributo que marcaría una casilla, buscado como palabra suelta.
    const re = new RegExp("(^|[\\s\"'])checked([\\s=>\"']|$)", "i");
    assert.ok(!re.test(html), "hay una casilla premarcada en index.html");
  });
  await prueba("no hay ni un recurso de terceros", () => {
    let html = fs.readFileSync(path.join(RAIZ, "index.html"), "utf8");

    // El mapa window.__resources es la excepción, y es la excepción que
    // demuestra la regla: sus CLAVES son las URL de CDN que support.js lleva
    // dentro, y están ahí precisamente para que el runtime encuentre una copia
    // local y NO salga a Internet. Sin ese mapa habría dos peticiones a unpkg
    // en cada carga. Se recorta del texto antes de buscar, y se comprueba
    // aparte que todos sus valores apuntan a ficheros de este repositorio.
    const mapa = /window\.__resources\s*=\s*\{([\s\S]*?)\};/.exec(html);
    assert.ok(mapa, "ha desaparecido el mapa window.__resources: la web volvería al CDN");
    for (const m of mapa[1].matchAll(/:\s*"([^"]+)"/g)) {
      assert.match(m[1], /^\//, `__resources apunta fuera del sitio: ${m[1]}`);
      assert.ok(
        fs.existsSync(path.join(RAIZ, m[1].replace(/^\//, ""))),
        `__resources apunta a un fichero que no existe: ${m[1]}`
      );
    }
    html = html.replace(mapa[0], "");

    // Los comentarios tampoco cuentan: dentro de un <!-- --> no hay nada que el
    // navegador pida. Y el comentario que explica por qué existe el mapa de
    // arriba tiene que poder nombrar el CDN del que protege.
    html = html.replace(/<!--[\s\S]*?-->/g, "");

    for (const patron of [
      "googletagmanager", "google-analytics", "googleapis", "gstatic",
      "facebook", "recaptcha", "unpkg.com", "cdn.jsdelivr", "matomo", "hotjar",
    ]) {
      assert.ok(!html.includes(patron), `index.html menciona un tercero: ${patron}`);
    }

    // Y en las páginas legales, que no llevan runtime, no hay excepción alguna.
    for (const f of ["privacidad.html", "aviso-legal.html", "cookies.html"]) {
      const t = fs.readFileSync(path.join(RAIZ, "legal", f), "utf8");
      assert.ok(!/https?:\/\/(?!www\.aepd\.es)/.test(t), `${f} enlaza a un tercero`);
    }
  });
  await prueba("no hay pasarela de pago ni selector de destino en la web", () => {
    const html = fs.readFileSync(path.join(RAIZ, "index.html"), "utf8").toLowerCase();
    for (const patron of ["stripe", "paypal", "bizum", "redsys", "checkout.", "criptomoneda", "tarjeta de crédito"]) {
      assert.ok(!html.includes(patron), `la web menciona un cauce de pago prohibido: ${patron}`);
    }
    assert.ok(!/name="destino"|name="finalidad"/.test(html), "hay un selector de destino de la donación");
  });
  await prueba("el IBAN no está escrito a mano fuera de config.donaciones", () => {
    const suelto = DONACIONES.iban.replace(/\s/g, "");
    for (const f of ["index.html", "server.js", "legal/privacidad.html", "legal/aviso-legal.html", "legal/cookies.html"]) {
      const t = fs.readFileSync(path.join(RAIZ, f), "utf8");
      // En index.html sí aparece, pero SOLO dentro del bloque generado
      // pa-donaciones, que sale de config.donaciones y regenera un script.
      const fuera = f === "index.html"
        ? t.replace(/<script type="application\/json" id="pa-donaciones">[\s\S]*?<\/script>/, "")
        : t;
      assert.ok(!fuera.replace(/\s/g, "").includes(suelto), `IBAN escrito a mano en ${f}`);
    }
  });
  await prueba("el bloque pa-donaciones de index.html está sincronizado", () => {
    const html = fs.readFileSync(path.join(RAIZ, "index.html"), "utf8");
    const m = /<script type="application\/json" id="pa-donaciones">([\s\S]*?)<\/script>/.exec(html);
    assert.ok(m, "falta el bloque pa-donaciones");
    assert.equal(
      JSON.stringify(JSON.parse(m[1])),
      JSON.stringify(donacionesPublicas()),
      "descuadre: ejecuta node scripts/sincronizar-donaciones.js"
    );
  });
  await prueba("los campos del formulario son los declarados en la política", () => {
    const html = fs.readFileSync(path.join(RAIZ, "index.html"), "utf8");
    // Solo los campos de formulario: el name= de un <meta> no recoge nada.
    const nombres = new Set();
    for (const et of html.matchAll(/<(input|select|textarea)\b[^>]*>/g)) {
      const n = /name="([^"]+)"/.exec(et[0]);
      if (n) nombres.add(n[1]);
    }
    assert.ok(nombres.size >= 15, `se han encontrado muy pocos campos (${nombres.size})`);
    // Todo lo que el formulario recoge tiene que estar en el epígrafe "Qué
    // datos recogemos". Si alguien añade un campo y olvida la política, falla.
    const DECLARADOS = new Set([
      "nombre", "email", "zona", "como", "mensaje", "telefono",
      "consiente_info", "consiente_colaborar", "mayor_edad",
      "apellidos", "dni", "importe", "fecha_prevista",
      "declara_fisica", "declara_sin_contrato", "declara_no_extranjero",
      "acepta_privacidad", "declara_mayor_edad",
      ANTIABUSO.campoTrampa, // trampa: no es un dato, no se guarda nunca
    ]);
    for (const n of nombres) {
      assert.ok(DECLARADOS.has(n), `campo "${n}" sin declarar en la política de privacidad`);
    }
    // Y al revés: los campos que el servidor valida tienen que existir en el HTML.
    for (const campo of Object.values(util.CAMPO_CONSENTIMIENTO)) {
      assert.ok(nombres.has(campo), `el HTML no pinta la casilla ${campo}`);
    }
    for (const campo of Object.values(util.CAMPO_DECLARACION)) {
      assert.ok(nombres.has(campo), `el HTML no pinta la declaración ${campo}`);
    }
  });
  await prueba("cada casilla del formulario tiene su literal guardado como prueba", () => {
    for (const [clave, def] of CONSENTIMIENTOS) {
      assert.ok(def.texto && def.texto.length > 20, `el literal de ${clave} está vacío`);
    }
    for (const [clave, texto] of DECLARACIONES) {
      assert.ok(texto && texto.length > 20, `el literal de ${clave} está vacío`);
    }
  });
  await prueba("lo que la casilla enseña es exactamente lo que se guarda como prueba", () => {
    // Es la comprobación de fondo de todo el consentimiento: de nada sirve
    // guardar un literal impecable si en pantalla ponía otra cosa. Se comparan
    // los dos textos con las etiquetas quitadas, así que cambiar un negrita no
    // rompe nada pero cambiar lo que la frase dice, sí.
    const html = fs.readFileSync(path.join(RAIZ, "index.html"), "utf8");
    const limpio = (s) => s.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();

    for (const [clave, def] of CONSENTIMIENTOS) {
      const campo = util.CAMPO_CONSENTIMIENTO[clave];
      // Sin expresiones regulares a propósito: se busca el atributo y se
      // recorta el <span> que viene detrás. Es más largo de leer, pero no
      // depende de escapes que cualquier herramienta que toque el fichero
      // pueda comerse. Es el mismo motivo por el que util.js construye sus
      // expresiones con new RegExp y escapes ASCII.
      const iCampo = html.indexOf(`name="${campo}"`);
      assert.ok(iCampo !== -1, `no encuentro la casilla ${campo} en index.html`);
      const iAbre = html.indexOf("<span>", iCampo);
      const iCierra = html.indexOf("</span>", iAbre);
      assert.ok(iAbre !== -1 && iCierra !== -1, `la casilla ${campo} no tiene texto`);

      // La página añade al final un "Obligatorio." que el literal guardado no
      // lleva: es una indicación de interfaz, no parte de lo que se consiente.
      let enPagina = limpio(html.slice(iAbre + 6, iCierra));
      if (enPagina.endsWith("Obligatorio.")) enPagina = enPagina.slice(0, -12).trim();
      assert.equal(
        enPagina,
        limpio(def.texto),
        `la casilla ${campo} no dice lo mismo que su literal en config.js`
      );
    }
  });
  await prueba("las tres páginas legales se enlazan desde el pie", () => {
    const html = fs.readFileSync(path.join(RAIZ, "index.html"), "utf8");
    for (const ruta of ["/legal/aviso-legal", "/legal/privacidad", "/legal/cookies"]) {
      assert.ok(html.includes(`href="${ruta}"`), `el pie no enlaza ${ruta}`);
    }
  });
  await prueba("la versión de la política publicada coincide con la del backend", () => {
    const p = fs.readFileSync(path.join(RAIZ, "legal", "privacidad.html"), "utf8");
    const m = /name="pa-version-politica"\s+content="([^"]+)"/.exec(p);
    assert.ok(m, "la política no declara su versión");
    assert.equal(m[1], VERSION_POLITICA);
  });
  await prueba("las páginas legales ya no tienen ningún hueco sin rellenar", () => {
    // El 3 de septiembre se completaron los últimos: dirección de contacto,
    // delegado de protección de datos, domicilio social e inscripción. Esta
    // prueba es la que impide que alguien reintroduzca un hueco sin darse
    // cuenta al editar los textos.
    const previo = process.env.RUTA_LEGAL;
    delete process.env.RUTA_LEGAL;
    const estado = revisarPuestaEnMarcha();
    process.env.RUTA_LEGAL = previo;

    const conHuecos = estado.problemas.filter((p) => p.includes("PENDIENTE"));
    assert.deepEqual(conHuecos, [], "han vuelto a aparecer huecos en las páginas legales");
    assert.ok(
      !estado.problemas.some((p) => p.includes("ninguna dirección")),
      "el responsable tiene que tener alguna dirección publicada"
    );
  });

  await prueba("pero el mecanismo que los detecta sigue funcionando", () => {
    // Se mete un hueco de mentira en una copia y se comprueba que lo caza. Sin
    // esto, la prueba de arriba pasaría igual si el detector se rompiera.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pa-hueco-"));
    for (const pagina of ["privacidad.html", "aviso-legal.html"]) {
      let t = fs.readFileSync(path.join(RAIZ, "legal", pagina), "utf8");
      if (pagina === "aviso-legal.html") {
        t = t.replace("<tr><th>Inscripción</th><td>", '<tr><th>Inscripción</th><td>PENDIENTE: ALGO ');
      }
      fs.writeFileSync(path.join(dir, pagina), t);
    }
    const previo = process.env.RUTA_LEGAL;
    process.env.RUTA_LEGAL = dir;
    const estado = revisarPuestaEnMarcha();
    process.env.RUTA_LEGAL = previo;
    fs.rmSync(dir, { recursive: true, force: true });

    assert.ok(
      estado.problemas.some((p) => p.includes("PENDIENTE") && p.includes("ALGO")),
      "un hueco nuevo tiene que bloquear el arranque"
    );
  });

  await prueba("faltar solo el domicilio social avisa, pero no bloquea", () => {
    // El art. 10.1.a de la LSSI admite la dirección de un establecimiento
    // permanente en lugar del domicilio, así que mientras se publique la sede
    // de Águilas esto no puede parar el despliegue.
    const previo = RESPONSABLE.domicilioSocial;
    RESPONSABLE.domicilioSocial = "PENDIENTE: DOMICILIO SOCIAL";
    const estado = revisarPuestaEnMarcha();
    RESPONSABLE.domicilioSocial = previo;

    assert.ok(
      !estado.problemas.some((p) => p.includes("ninguna dirección")),
      "con la dirección de Águilas publicada no debería bloquear"
    );
    assert.ok(
      estado.avisos.some((a) => /domicilio social/i.test(a)),
      "pero sí tiene que avisar de que falta"
    );
  });

  await prueba("quedarse sin ninguna dirección sí bloquea", () => {
    const antesD = RESPONSABLE.domicilioSocial;
    const antesC = RESPONSABLE.direccionContacto;
    RESPONSABLE.domicilioSocial = "PENDIENTE: DOMICILIO SOCIAL";
    RESPONSABLE.direccionContacto = "PENDIENTE: DIRECCIÓN";
    const estado = revisarPuestaEnMarcha();
    RESPONSABLE.domicilioSocial = antesD;
    RESPONSABLE.direccionContacto = antesC;

    assert.ok(
      estado.problemas.some((p) => p.includes("ninguna dirección")),
      "sin ninguna dirección no se puede publicar nada"
    );
  });

  await prueba("la inscripción registral publicada es la de Izquierda Unida", () => {
    // Ni la asamblea de Águilas ni la federación de Murcia están inscritas como
    // entidad propia: por eso el titular es IU y la inscripción es la suya.
    const t = fs.readFileSync(path.join(RAIZ, "legal", "aviso-legal.html"), "utf8");
    assert.ok(/Registro de Partidos Políticos/.test(t), "falta el registro");
    assert.ok(/2 de noviembre de 1992/.test(t), "falta la fecha de inscripción");
    assert.ok(
      RESPONSABLE.inscripcion.includes("1992"),
      "config.responsable tiene que llevar la misma inscripción"
    );
  });
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
      const c = await db.consulta(
        "select finalidad, version_texto, ip from consentimientos where alta_id=$1 order by finalidad",
        [idAna]
      );
      // Una fila por casilla marcada, que es lo que permite responder «pruebe
      // que consintió esto» y no solo «pruebe que aceptó». El alta de prueba
      // marca la de información y la de mayoría de edad; la de colaborar se
      // queda sin marcar y por eso no deja fila. Se comprueban las finalidades
      // y no cuántas hay: un número suelto no dice cuál falta.
      assert.deepEqual(
        c.rows.map((f) => f.finalidad),
        ["edad", "info"]
      );
      // Contra la configuración, no contra un literal: escrito a mano, esto
      // envejece en cuanto alguien sube la versión de la política, que es
      // exactamente lo que hay que hacer al tocar una casilla.
      assert.equal(c.rows[0].version_texto, VERSION_POLITICA);
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
      // Sobre los bytes: es lo que Excel va a leer del fichero descargado.
      assert.deepEqual([...c.crudo.subarray(0, 3)], [0xef, 0xbb, 0xbf], "falta el BOM para Excel");
      assert.ok(c.cuerpo.includes(";"), "el separador debe ser punto y coma");
      assert.match(c.cabeceras.get("content-disposition") || "", /attachment/);
    });

    await db.consulta("delete from altas");
    await db.cerrar();
  }

  // --- Resumen ---------------------------------------------------------------
  servidor.close();
  fs.rmSync(dirLegal, { recursive: true, force: true });

  console.log(`\n${pasadas} pasadas · ${fallos} fallos · ${pendientes.length} sin ejecutar`);
  for (const p of pendientes) console.log(`  sin ejecutar: ${p}`);
  process.exit(fallos ? 1 : 0);
}

main().catch((err) => {
  console.error("\nEl banco de pruebas se ha roto:", err);
  process.exit(1);
});
