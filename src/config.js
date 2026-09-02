// Configuración y constantes del backend de "Súmate".
//
// Todo lo que tiene efectos legales vive aquí y en un solo sitio: el texto de
// consentimiento, su versión, los plazos de conservación y las listas cerradas
// de valores. Si cambia algo de esto, cambia la versión de la política.
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const RAIZ = path.resolve(__dirname, "..");

// --- Versión del consentimiento ---------------------------------------------
// Tiene que coincidir con el <meta name="pa-version-politica"> de la página de
// privacidad publicada. Si no coinciden, el backend se niega a aceptar altas:
// guardar un consentimiento que apunte a un texto distinto del que la persona
// leyó no vale nada como prueba.
const VERSION_POLITICA = "privacidad-2026-09-03";

// --- Literales de las casillas -----------------------------------------------
//
// Lo que se guarda como prueba no es "aceptó", es el texto que la persona tenía
// delante cuando marcó. Por eso los literales viven aquí, uno por casilla, y no
// dentro del HTML: el HTML se edita a menudo y esto no se puede editar sin
// subir la versión de la política.
//
// Regla del art. 7.2 RGPD y del art. 9.2.a: cada finalidad, su casilla. Nada de
// agrupar "informarme y que me cedáis" en un solo "acepto". Y ninguna marcada
// de salida: no existe `checked` ni en el HTML ni aquí.

const CONSENTIMIENTOS = new Map([
  [
    "info",
    {
      obligatorio: true,
      texto:
        "Consiento expresamente que Izquierda Unida trate mi nombre y mi correo " +
        "electrónico —y con ellos mi afinidad política, que es un dato de categoría " +
        "especial— con la finalidad de informarme sobre la candidatura Por Águilas. " +
        "Puedo retirar este consentimiento cuando quiera desde el enlace de baja de " +
        "cualquier correo. He leído la política de privacidad.",
    },
  ],
  [
    "colaborar",
    {
      obligatorio: false,
      texto:
        "Además, quiero echar una mano. Consiento que se me contacte para organizar esa " +
        "colaboración y que, si lo facilito, se trate también mi teléfono para eso y " +
        "solo para eso.",
    },
  ],
  [
    "cesion",
    {
      obligatorio: false,
      // Ojo con lo que pregunta esta casilla y con lo que NO pregunta. Pasar los
      // datos de la asamblea de Águilas a la federación regional no es una
      // cesión: es el mismo responsable moviéndolos por dentro, y pedir permiso
      // para eso sería fingir una garantía que no existe. La única organización
      // distinta es el PCE, y es lo único que se pregunta aquí.
      texto:
        "Consiento que mis datos se comuniquen al Partido Comunista de España, que " +
        "impulsa la candidatura junto a Izquierda Unida y es una organización distinta. " +
        "Si no marco esta casilla, mis datos no salen de Izquierda Unida.",
    },
  ],
  [
    "edad",
    {
      obligatorio: true,
      texto: "Declaro que soy mayor de edad.",
    },
  ],
]);

// Declaraciones responsables del formulario de comunicación de donación. No son
// consentimientos —el tratamiento de estos datos se apoya en una obligación
// legal, art. 6.1.c RGPD— sino declaraciones que la LO 8/2007 obliga a exigir.
// Las cinco son obligatorias: sin una sola de ellas no hay comunicación válida.
const DECLARACIONES = new Map([
  [
    "fisica",
    "Declaro que dono como persona física, en nombre propio y con fondos propios. " +
      "(Art. 5.1.a LO 8/2007: las donaciones de personas jurídicas y de entes sin " +
      "personalidad jurídica están prohibidas y son nulas.)",
  ],
  [
    "sinContrato",
    "Declaro que no tengo contrato vigente con el sector público de los previstos en " +
      "la legislación de contratos del sector público, ni por mí mismo ni a través de " +
      "una empresa de la que forme parte.",
  ],
  [
    "noExtranjero",
    "Declaro que no soy un gobierno ni una entidad pública extranjera, ni actúo por " +
      "cuenta ni en interés de ninguno.",
  ],
  [
    "privacidad",
    "He leído y acepto la política de privacidad, y entiendo que estos datos se tratan " +
      "para cumplir la obligación legal de identificar a quien dona.",
  ],
  ["edadDonante", "Declaro que soy mayor de edad."],
]);

// Avisos que la web tiene que enseñar sí o sí junto al formulario de donación.
// Están aquí y no sueltos en el HTML porque son contenido legal: si cambian,
// cambia la versión de la política.
const AVISOS_DONACION = {
  limite:
    "Máximo 50.000 € por donante y año natural (art. 5.1.b LO 8/2007). El control del " +
    "acumulado lo lleva la federación con todas las donaciones que reciba, no solo con " +
    "las de Águilas.",
  noFinalista:
    "La donación no es finalista: no se puede destinar a una parte concreta de la " +
    "campaña ni a un eje del programa. Va al sostenimiento general de la actividad.",
  noRevocable:
    "La donación no es revocable. Una vez hecha la transferencia no hay devolución, " +
    "salvo que resulte ser una donación nula de las que la ley obliga a devolver.",
  notificacion:
    "Las donaciones superiores a 25.000 € se notifican al Tribunal de Cuentas dentro de " +
    "los tres meses siguientes (art. 5.4 LO 8/2007).",
  deduccion:
    "Desgrava el 20 % en el IRPF sobre una base máxima de 600 € al año (art. 68.3 de la " +
    "Ley del IRPF). Para aplicarla necesitas el certificado que emite la formación: sin " +
    "certificado no hay deducción.",
};

// --- Listas cerradas ---------------------------------------------------------
// Clave estable en la base de datos, etiqueta para el CSV y el formulario. Las
// claves no se renombran nunca aunque cambie el texto de cara al público.
const COMO = new Map([
  ["info", "Solo quiero recibir información"],
  ["asambleas", "Ir a las asambleas abiertas"],
  ["calle", "Echar horas en la calle y en actos"],
  ["sectorial", "Aportar en una mesa sectorial"],
  ["candidatura", "Estar en la candidatura"],
  ["economico", "Colaborar económicamente"],
]);

// Zonas del municipio. Lista cerrada a propósito: en texto libre la gente
// escribe su dirección completa, y no la queremos.
const ZONAS = new Map([
  ["casco", "Casco urbano"],
  ["molinetas", "Las Molinetas"],
  ["cocon", "El Cocón"],
  ["calarreona", "Calarreona"],
  ["calabardina", "Calabardina"],
  ["tebar", "Tébar"],
  ["marina", "La Marina de Cope"],
  ["garrobillo", "El Garrobillo"],
  ["cuesta", "Cuesta de Gos"],
  ["tovar", "Los Tovares"],
  ["otra", "Otra zona de Águilas"],
  ["nd", "Prefiero no decirlo"],
]);

// --- Quién responde ----------------------------------------------------------
//
// Una sola persona jurídica, y conviene tenerlo claro porque de aquí cuelga
// medio documento legal: **Izquierda Unida**, CIF G78269206. Ni la federación
// regional ni la asamblea de Águilas son entidades distintas; son órganos
// suyos y usan este mismo CIF.
//
// Lo que eso implica, y que estuvo mal escrito hasta el 3 de septiembre de 2026:
//
//   · El responsable del tratamiento es Izquierda Unida, no «Izquierda Unida de
//     Águilas», que no es una persona jurídica y no puede responder de nada.
//   · Que los datos pasen de la asamblea local a la federación regional NO es
//     una cesión: es el mismo responsable moviéndolos por dentro. Por eso ya no
//     hace falta acuerdo de corresponsabilidad del art. 26 RGPD.
//   · La única organización realmente distinta que hay en juego es el **Partido
//     Comunista de España**, que impulsa la candidatura junto a IU. Esa sí es
//     una cesión, y por eso es lo único que pregunta la casilla correspondiente.
//
// El bloque 78 del CIF corresponde a entidades de ámbito estatal: si algún día
// alguien lo sustituye por uno que empiece por 30 (Murcia), es que se ha
// confundido de entidad.
// Las dos direcciones NO son la misma cosa y la ley no pide lo mismo en cada
// documento. Conviene tenerlo separado o se acaba publicando una donde iba la
// otra:
//
//   · domicilioSocial   El de Izquierda Unida en el Registro de Partidos. Es lo
//                       primero que pide el art. 10.1.a de la LSSI para el
//                       aviso legal. Dato público: es una consulta.
//   · direccionContacto La sede de la asamblea de Águilas. Sirve como "datos de
//                       contacto del responsable" del art. 13.1.a del RGPD en la
//                       política de privacidad, y como "establecimiento
//                       permanente en España" del art. 10.1.a de la LSSI, que es
//                       la vía que la propia ley abre cuando no se da el
//                       domicilio. Para publicarla hace falta permiso de la
//                       organización, y lo hay.
//
// Si solo se rellena una, se publica esa. Sin ninguna no se publica nada: sin
// dirección no hay forma de comunicarse con el responsable, que es justo lo que
// los dos artículos persiguen.
const RESPONSABLE = {
  denominacion: "Izquierda Unida",
  cif: "G78269206",
  // Dos direcciones en Madrid, y no son la misma. No es un error: es lo que hay.
  //
  //   · domicilioSocial  El que consta en el Registro de Partidos Políticos
  //                      desde la inscripción de 1992. Es el que pide el
  //                      art. 10.1.a de la LSSI.
  //   · sedeFederal      Donde está hoy la organización, y donde ella misma
  //                      dice que se le escriba. Es la que publica en
  //                      militancia.izquierdaunida.org, y donde atiende el
  //                      delegado de protección de datos.
  //
  // Se publican las dos, cada una con su etiqueta. Publicar solo la registral
  // mandaría a la gente a una dirección de hace treinta años; publicar solo la
  // actual dejaría el aviso legal sin el dato que la LSSI pide. Que el Registro
  // esté desactualizado es asunto de la organización estatal, no de Águilas,
  // pero mientras lo esté lo honesto es enseñar las dos.
  domicilioSocial: "Avenida de la Albufera, 9 · Madrid",
  sedeFederal: "Calle Villablanca, 53-55 · 28032 Madrid",

  // Sede de la asamblea de Águilas, con permiso de la organización para
  // publicarla. Vale en los dos escenarios: sea quien sea la entidad
  // responsable, este es su establecimiento permanente en Águilas y la
  // dirección a la que se le puede escribir.
  direccionContacto: "Calle Echegaray, 3, bajo A · Águilas (Murcia)",

  // Art. 10.1.a LSSI: «los datos de su inscripción en el Registro». Con el
  // registro y la fecha queda identificada la inscripción. El número de
  // asiento la completaría del todo, si algún día se tiene a mano.
  inscripcion:
    "Inscrita en el Registro de Partidos Políticos del Ministerio del Interior " +
    "el 2 de noviembre de 1992",
  email: "hola@poraguilas.es",

  // Delegado de protección de datos de Izquierda Unida, publicado por la propia
  // organización en militancia.izquierdaunida.org/dpd/privacidad_2.html. Es uno
  // solo para toda la estructura, así que vale con independencia de cuál de las
  // entidades territoriales resulte ser la responsable.
  dpd: "dpd@izquierdaunida.org · Calle Villablanca 53-55, 28032 Madrid",

  // Órganos, no entidades. Aparecen de cara al público porque es como la gente
  // los conoce, pero no responden por sí mismos de nada.
  federacionRegional: "Izquierda Unida Región de Murcia",
  asambleaLocal: "Izquierda Unida de Águilas",

  // Organización distinta de la anterior. Cualquier dato que llegue aquí sí es
  // una cesión y necesita el consentimiento de su propia casilla.
  organizacionAliada: "Partido Comunista de España",
};

const esPendiente = (v) => /^\s*PENDIENTE/i.test(String(v || ""));

// Huecos que, por sí solos, no impiden publicar: la ley admite otra cosa en su
// lugar y esa otra cosa sí está publicada. El valor es la explicación que sale
// por consola, para que quien la lea sepa por qué no le está bloqueando.
const HUECOS_TOLERADOS = new Map([
  [
    "DOMICILIO SOCIAL",
    "El art. 10.1.a de la LSSI admite en su lugar la dirección de un establecimiento " +
      "permanente en España, y se publica la sede de Águilas. Conviene añadirlo igualmente: " +
      "es un dato público.",
  ],
]);

// Dígito de control del CIF (orden EHA/451/2008). Se comprueba al arrancar: un
// CIF mal copiado en un aviso legal es un incumplimiento del art. 10 de la LSSI
// que nadie detecta a simple vista.
function cifValido(v) {
  const s = String(v || "").toUpperCase().replace(/[\s.-]/g, "");
  const m = /^([ABCDEFGHJNPQRSUVW])(\d{7})([0-9A-J])$/.exec(s);
  if (!m) return false;
  const [, letra, digitos, control] = m;

  let suma = 0;
  for (let i = 0; i < 7; i++) {
    const d = Number(digitos[i]);
    // Las posiciones impares se duplican y se suman sus cifras; las pares van
    // tal cual. Contando desde 1, igual que la norma.
    if (i % 2 === 0) suma += d * 2 > 9 ? d * 2 - 9 : d * 2;
    else suma += d;
  }
  const numero = (10 - (suma % 10)) % 10;
  const letraCtrl = "JABCDEFGHI"[numero];

  if ("KPQRSNW".includes(letra)) return control === letraCtrl; // solo letra
  if ("ABEH".includes(letra)) return control === String(numero); // solo número
  return control === String(numero) || control === letraCtrl; // cualquiera de las dos
}

// --- Donaciones --------------------------------------------------------------
//
// TODO lo que tiene efecto legal en las donaciones vive en este objeto y en
// ningún otro sitio: el IBAN, el titular, el límite por donante y año, el
// formato del concepto y los avisos que se publican. Está así a propósito.
//
// <!-- CAMBIO A RÉGIMEN ELECTORAL -->
//
// Hoy la financiación es ORDINARIA: la rige la LO 8/2007 y no hay convocatoria,
// ni administrador electoral, ni cuenta electoral. Desde el día en que se
// publique el real decreto de convocatoria entra en juego la LOREG y cambian
// tres cosas de golpe:
//
//   · el límite por aportante baja de 50.000 € a 10.000 € (art. 129 LOREG);
//   · el dinero tiene que entrar por la cuenta electoral abierta y comunicada
//     a la Junta Electoral de Zona en 24 horas (arts. 124 y 125 LOREG), que NO
//     es la cuenta que hay aquí abajo;
//   · quien responde ya no es la federación, sino el administrador electoral
//     designado (arts. 121-123 LOREG).
//
// Para conmutar: cambiar REGIMEN a "electoral", rellenar el bloque `electoral`
// con la cuenta y el administrador de verdad, y desplegar. No hay que tocar
// ningún otro fichero: index.html lee esto y el servidor valida contra esto.
// El procedimiento completo, con quién avisa a quién, está en
// README-DESPLIEGUE.md.
const REGIMEN = "ordinario";

const REGIMENES = {
  ordinario: {
    // Cuenta de donaciones de la federación regional. La respuesta textual de
    // quien la facilitó: «cada donación debe ir identificada, indicando en el
    // concepto nombre, apellidos y DNI e indicar que es para Águilas».
    titular: "Izquierda Unida Región de Murcia",
    iban: "ES11 2100 8315 1913 0016 0571",
    // Prefijo del concepto. Lleva AGUILAS —sin tilde, porque hay bancos que se
    // comen los acentos del concepto— para que la federación sepa que ese
    // ingreso es de esta candidatura y no de otra del mismo partido.
    conceptoPrefijo: "DONACION AGUILAS",
    // Art. 5.1.b LO 8/2007.
    limiteAnual: 50000,
    // Art. 5.4 LO 8/2007: por encima de esto hay tres meses para notificarlo
    // al Tribunal de Cuentas.
    umbralNotificacion: 25000,
    marco: "LO 8/2007",
  },

  // Sin rellenar a propósito. Mientras REGIMEN sea "ordinario" este bloque no
  // lo lee nadie; el día que se conmute, el arranque se niega a aceptar
  // comunicaciones de donación hasta que no queden PENDIENTE aquí dentro.
  electoral: {
    titular: "PENDIENTE: denominación registral de la coalición",
    iban: "PENDIENTE: IBAN de la cuenta electoral",
    conceptoPrefijo: "DONACION AGUILAS",
    // Art. 129 LOREG: 10.000 € por aportante al conjunto de cuentas de una
    // misma candidatura.
    limiteAnual: 10000,
    umbralNotificacion: 10000,
    marco: "LOREG",
    administradorElectoral: "PENDIENTE: nombre del administrador electoral",
  },
};

const DONACIONES = {
  regimen: REGIMEN,
  ...REGIMENES[REGIMEN],

  // Art. 68.3 de la Ley del IRPF. Se publica para informar, con la advertencia
  // de que sin certificado emitido por la formación no hay deducción posible.
  deduccion: { porcentaje: 20, baseMaxima: 600 },

  // Muchos bancos recortan el concepto de una transferencia nacional en torno a
  // los 35 caracteres. Por encima de esta cifra la web ofrece además una
  // versión corta, porque un concepto cortado por la mitad es exactamente el
  // riesgo R2: un ingreso que no se puede identificar.
  conceptoMaximoBanco: 35,

  // Importe mínimo aceptado en el formulario de comunicación. No es una regla
  // legal: es que una comunicación de 0,01 € es ruido.
  importeMinimo: 1,
};

// --- Límites de los campos ---------------------------------------------------
const LIMITES = {
  nombre: 80,
  apellidos: 100,
  telefono: 24,
  dni: 12,
  email: 254,
  mensaje: 1000,
  cuerpo: 16 * 1024, // tamaño máximo del cuerpo de una petición
  // Cuántos días hacia adelante se admite en "fecha prevista" de la donación.
  // Más allá de tres meses la comunicación deja de servir para cuadrar el
  // ingreso con la persona.
  diasFechaPrevista: 90,
};

// --- Conservación ------------------------------------------------------------
const CONSERVACION = {
  diasPendiente: 30, // altas sin confirmar
  mesesIp: 12, // IP de la prueba de consentimiento
  horasToken: 48, // validez del enlace de confirmación
  // Borrado total de la lista. Seis meses después de la jornada electoral.
  fechaPurgaTotal: process.env.FECHA_PURGA_TOTAL || "2027-11-30",
};

// --- Antiabuso ---------------------------------------------------------------
const ANTIABUSO = {
  altasPorIpHora: 5,
  altasPorIpDia: 20,
  // Comunicar una donación es un acto mucho menos frecuente que apuntarse.
  // Un cupo estrecho aquí no molesta a nadie de verdad y corta en seco el
  // relleno automático del formulario con DNI inventados.
  donacionesPorIpHora: 3,
  donacionesPorIpDia: 10,
  borradosPorIpHora: 3,
  adminPorIpMinuto: 20,
  correosGlobalesHora: 200, // techo duro: que esto no sea un cañón de correo
  segundosMinimoRelleno: 3,
  horasMaximoRelleno: 6,
  campoTrampa: "pa_web",
};

// --- Entorno -----------------------------------------------------------------
const env = (nombre, porDefecto = "") => (process.env[nombre] || porDefecto).trim();

const CONFIG = {
  urlBase: env("URL_BASE", "http://localhost:3000").replace(/\/+$/, ""),
  databaseUrl: env("DATABASE_URL"),
  adminToken: env("ADMIN_TOKEN"),
  brevoApiKey: env("BREVO_API_KEY"),
  remitente: env("REMITENTE", "no-responder@poraguilas.es"),
  remitenteNombre: env("REMITENTE_NOMBRE", "Por Águilas"),
  respuestaA: env("RESPUESTA_A", "hola@poraguilas.es"),
  secretoHmac: env("SECRETO_HMAC"),
  // Permite arrancar en local sin Brevo: los correos se escriben en consola.
  correoEnConsola: env("CORREO_EN_CONSOLA") === "1",
};

// --- Lo que se publica de las donaciones -------------------------------------
//
// El subconjunto de DONACIONES que viaja al navegador. Es el mismo objeto que
// el servidor inyecta en index.html y el mismo contra el que se compara el
// literal que el fichero lleva escrito, para que no puedan divergir sin que el
// arranque lo diga. Nada de esto es secreto: un IBAN de donaciones existe para
// publicarse.
function donacionesPublicas() {
  return {
    regimen: DONACIONES.regimen,
    marco: DONACIONES.marco,
    titular: DONACIONES.titular,
    iban: DONACIONES.iban,
    conceptoPrefijo: DONACIONES.conceptoPrefijo,
    limiteAnual: DONACIONES.limiteAnual,
    umbralNotificacion: DONACIONES.umbralNotificacion,
    conceptoMaximoBanco: DONACIONES.conceptoMaximoBanco,
    importeMinimo: DONACIONES.importeMinimo,
    diasFechaPrevista: LIMITES.diasFechaPrevista,
    deduccion: DONACIONES.deduccion,
    avisos: AVISOS_DONACION,
  };
}

// Mod-97 del ISO 13616 más los dos dígitos de control del CCC español. Vive
// aquí, y no en util.js, porque util.js ya depende de este fichero y una
// dependencia circular dejaría media configuración sin cargar. util.js lo
// reexporta para que quien valide un IBAN tenga un solo sitio al que ir.
function ibanValido(v) {
  const s = String(v || "").toUpperCase().replace(/[\s-]/g, "");
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(s)) return false;
  const reordenado = (s.slice(4) + s.slice(0, 4)).replace(/[A-Z]/g, (c) =>
    String(c.charCodeAt(0) - 55)
  );
  let resto = 0;
  for (const d of reordenado) resto = (resto * 10 + Number(d)) % 97;
  if (resto !== 1) return false;

  // Un IBAN español con el mod-97 bueno todavía puede llevar mal los dos
  // dígitos de control internos del número de cuenta de toda la vida. Se
  // comprueban también: un dígito bailado en el IBAN publicado es dinero que
  // no llega y un donante que no se puede identificar.
  if (!s.startsWith("ES")) return true;
  const ccc = s.slice(4);
  const pesos = [1, 2, 4, 8, 5, 10, 9, 7, 3, 6];
  const control = (digitos) => {
    const suma = [...digitos].reduce((a, c, i) => a + Number(c) * pesos[i], 0);
    const d = 11 - (suma % 11);
    return d === 11 ? 0 : d === 10 ? 1 : d;
  };
  const esperado = `${control("00" + ccc.slice(0, 8))}${control(ccc.slice(10))}`;
  return esperado === ccc.slice(8, 10);
}

// --- Comprobaciones de arranque ----------------------------------------------
// La regla es la del prompt: sin política de privacidad publicada no se recoge
// ni un dato. Aquí se convierte en código, no en una nota en un documento.
function revisarPuestaEnMarcha() {
  const problemas = [];
  const avisos = [];

  // --- Las páginas legales ---------------------------------------------------
  //
  // Las dos que tienen efectos jurídicos se revisan igual y con el mismo rasero:
  // la política de privacidad, que es la que sostiene el consentimiento, y el
  // aviso legal, que es lo que exige el art. 10 de la LSSI. Publicar cualquiera
  // de las dos a medias es un incumplimiento, así que las dos bloquean.
  //
  // RUTA_LEGAL solo lo usa el banco de pruebas, para apuntar a una carpeta con
  // copias de los ficheros y los huecos rellenos. No relaja nada: lo que haya
  // ahí pasa exactamente los mismos controles.
  const dirLegal = env("RUTA_LEGAL") || path.join(RAIZ, "legal");

  if (!cifValido(RESPONSABLE.cif)) {
    problemas.push(`El CIF del responsable no pasa el dígito de control: ${RESPONSABLE.cif}.`);
  }

  // Direcciones. Lo que de verdad exigen los dos artículos es que se pueda
  // llegar al responsable, así que lo que bloquea es quedarse sin ninguna
  // dirección, no que falte una en concreto.
  const sinDomicilio = esPendiente(RESPONSABLE.domicilioSocial);
  const sinContacto = esPendiente(RESPONSABLE.direccionContacto);
  if (sinDomicilio && sinContacto) {
    problemas.push(
      "No hay ninguna dirección del responsable. El art. 13.1.a RGPD exige datos de contacto y " +
        "el art. 10.1.a LSSI, domicilio o establecimiento permanente: sin una dirección no se " +
        "puede publicar ni recoger nada."
    );
  } else if (sinDomicilio) {
    avisos.push(
      "Falta el domicilio social de Izquierda Unida. No bloquea, porque el art. 10.1.a de la LSSI " +
        "admite en su lugar la dirección de un establecimiento permanente en España y se publica " +
        "la sede de Águilas, pero es un dato público y conviene añadirlo."
    );
  }

  for (const pagina of ["privacidad.html", "aviso-legal.html"]) {
    let t = null;
    try {
      t = fs.readFileSync(path.join(dirLegal, pagina), "utf8");
    } catch {
      problemas.push(`No existe legal/${pagina}: no se puede publicar ni recoger nada sin ella.`);
      continue;
    }

    // Huecos por rellenar. Se mira solo el texto visible: el bloque de
    // documentación que encabeza cada fichero nombra la palabra para explicar
    // la regla, y no debe contar como un hueco.
    //
    // Se enumeran los que quedan en vez de dar una lista fija, para que el
    // mensaje no envejezca según se van rellenando: es lo que pasó con el NIF.
    const cuerpo = t.replace(/<!--[\s\S]*?-->/g, "");
    const huecos = [
      ...new Set(
        [...cuerpo.matchAll(/PENDIENTE:\s*([^<]{0,60})/g)].map((m) =>
          m[1].trim().replace(/\s+/g, " ")
        )
      ),
    ];
    // Un hueco tolerado es el que la ley permite dejar vacío porque hay otra
    // cosa publicada que cumple lo mismo. Sale como aviso, no como bloqueo,
    // para no obligar a esperar por un dato que no hace falta esperar.
    const bloqueantes = huecos.filter((h) => !HUECOS_TOLERADOS.has(h.toUpperCase()));
    const tolerados = huecos.filter((h) => HUECOS_TOLERADOS.has(h.toUpperCase()));

    if (bloqueantes.length) {
      problemas.push(
        `legal/${pagina} tiene ${bloqueantes.length} hueco(s) PENDIENTE sin rellenar: ` +
          `${bloqueantes.join(" · ")}. Hay que completarlos antes de publicar.`
      );
    }
    for (const h of tolerados) {
      avisos.push(`legal/${pagina}: falta "${h}". ${HUECOS_TOLERADOS.get(h.toUpperCase())}`);
    }

    // El CIF publicado tiene que ser el del código. Un aviso legal con el NIF de
    // otra entidad incumple el art. 10 de la LSSI y no se ve a simple vista.
    if (!t.includes(RESPONSABLE.cif)) {
      problemas.push(`legal/${pagina} no publica el NIF ${RESPONSABLE.cif} del responsable.`);
    }

    // Y quien figure respondiendo tiene que ser la persona jurídica, no uno de
    // sus órganos. Que la asamblea local aparezca nombrada está bien; que
    // aparezca respondiendo, no: no puede hacerlo.
    //
    // Se compara el contenido de la celda con las etiquetas quitadas, porque el
    // nombre va dentro de un <strong> y una expresión que mirase el texto en
    // bruto justo detrás de <td> no encontraría nada.
    const celda = /<th>(?:Responsable|Titular)<\/th>\s*<td>([\s\S]*?)<\/td>/.exec(t);
    if (!celda) {
      problemas.push(`legal/${pagina} no declara quién es el responsable o el titular.`);
    } else {
      const nombre = celda[1].replace(/<[^>]*>/g, "").trim();
      if (nombre !== RESPONSABLE.denominacion) {
        problemas.push(
          `legal/${pagina} declara como responsable a "${nombre}" y no a ` +
            `"${RESPONSABLE.denominacion}", que es la persona jurídica que responde.`
        );
      }
    }

    // La versión solo la declara la política, que es la que se acepta.
    if (pagina === "privacidad.html") {
      const meta = /name="pa-version-politica"\s+content="([^"]+)"/.exec(t);
      if (!meta) {
        problemas.push('legal/privacidad.html no declara <meta name="pa-version-politica">.');
      } else if (meta[1] !== VERSION_POLITICA) {
        problemas.push(
          `Descuadre de versión: la política publicada dice "${meta[1]}" y el backend ` +
            `espera "${VERSION_POLITICA}".`
        );
      }
    }
  }

  for (const [clave, nombre] of [
    ["databaseUrl", "DATABASE_URL"],
    ["adminToken", "ADMIN_TOKEN"],
    ["secretoHmac", "SECRETO_HMAC"],
  ]) {
    if (!CONFIG[clave]) problemas.push(`Falta la variable de entorno ${nombre}.`);
  }

  if (CONFIG.adminToken && CONFIG.adminToken.length < 32) {
    problemas.push("ADMIN_TOKEN es demasiado corto: mínimo 32 caracteres aleatorios.");
  }
  if (CONFIG.secretoHmac && CONFIG.secretoHmac.length < 32) {
    problemas.push("SECRETO_HMAC es demasiado corto: mínimo 32 caracteres aleatorios.");
  }

  if (!CONFIG.brevoApiKey && !CONFIG.correoEnConsola) {
    problemas.push("Falta BREVO_API_KEY (o CORREO_EN_CONSOLA=1 para desarrollo local).");
  }
  if (CONFIG.correoEnConsola) {
    avisos.push("CORREO_EN_CONSOLA=1: los correos se imprimen, no se envían. Solo para local.");
  }
  if (!/^https:\/\//.test(CONFIG.urlBase) && !/localhost/.test(CONFIG.urlBase)) {
    problemas.push(`URL_BASE debería ser https:// en producción (ahora: ${CONFIG.urlBase}).`);
  }

  return { listo: problemas.length === 0, problemas, avisos };
}

module.exports = {
  RAIZ,
  VERSION_POLITICA,
  RESPONSABLE,
  cifValido,
  CONSENTIMIENTOS,
  DECLARACIONES,
  AVISOS_DONACION,
  DONACIONES,
  donacionesPublicas,
  ibanValido,
  COMO,
  ZONAS,
  LIMITES,
  CONSERVACION,
  ANTIABUSO,
  CONFIG,
  revisarPuestaEnMarcha,
};
