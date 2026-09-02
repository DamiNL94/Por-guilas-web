// Acceso a Postgres. Única dependencia externa del proyecto: `pg`.
//
// El esquema se crea y migra al arrancar, de forma idempotente. Para una lista
// de unos pocos miles de registros no compensa una herramienta de migraciones:
// compensa que el arranque deje siempre la base en el estado que el código
// espera, y que eso se pueda leer de un vistazo.
"use strict";

const { Pool } = require("pg");
const { CONFIG } = require("./config.js");

let pool = null;

function obtenerPool() {
  if (pool) return pool;
  if (!CONFIG.databaseUrl) throw new Error("DATABASE_URL no configurada");

  pool = new Pool({
    connectionString: CONFIG.databaseUrl,
    max: 5, // un solo proceso sirviendo una web pequeña: no hacen falta más
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    // Railway expone Postgres con certificado propio dentro de su red privada.
    ssl: /\bsslmode=disable\b/.test(CONFIG.databaseUrl) || /\.railway\.internal/.test(CONFIG.databaseUrl)
      ? false
      : { rejectUnauthorized: false },
  });

  // Un error en una conexión ociosa no debe tumbar el proceso entero.
  pool.on("error", (err) => {
    console.error("[db] error en conexión ociosa:", err.message);
  });

  return pool;
}

const consulta = (texto, valores) => obtenerPool().query(texto, valores);

// Ejecuta varias sentencias en una transacción con un mismo cliente.
async function enTransaccion(fn) {
  const cliente = await obtenerPool().connect();
  try {
    await cliente.query("begin");
    const r = await fn(cliente);
    await cliente.query("commit");
    return r;
  } catch (err) {
    await cliente.query("rollback").catch(() => {});
    throw err;
  } finally {
    cliente.release();
  }
}

const ESQUEMA = `
create table if not exists altas (
  id                bigint generated always as identity primary key,
  email             text        not null,
  nombre            text        not null,
  zona              text,
  como              text        not null default 'info',
  mensaje           text,
  estado            text        not null default 'pendiente'
                                check (estado in ('pendiente','confirmado')),
  creado            timestamptz not null default now(),
  actualizado       timestamptz not null default now(),
  confirmado_en     timestamptz,
  -- Solo hashes: un volcado robado no da enlaces que funcionen.
  token_conf_hash   text,
  token_conf_expira timestamptz,
  -- El enlace de baja no se guarda ni en claro ni se puede reconstruir desde
  -- aquí: se deriva de SECRETO_HMAC y del id (ver sumate.js). Esta columna solo
  -- sirve para buscar la fila a partir del token que llega por la URL. Se
  -- rellena justo después del insert, cuando ya hay id.
  token_baja_hash   text,
  ultimo_envio      timestamptz
);

-- La unicidad por correo es lo que hace idempotente el alta.
create unique index if not exists altas_email_uq on altas (email);
create index        if not exists altas_estado_ix on altas (estado);
create index        if not exists altas_creado_ix on altas (creado);
create unique index if not exists altas_tok_conf_uq on altas (token_conf_hash)
  where token_conf_hash is not null;
create unique index if not exists altas_tok_baja_uq on altas (token_baja_hash);

-- La prueba del consentimiento va aparte para poder purgar la IP en su propio
-- calendario sin tocar el resto. Al borrar el alta cae en cascada: si alguien
-- ejerce la supresión, no tiene sentido conservar la prueba de un dato que ya
-- no existe.
create table if not exists consentimientos (
  id             bigint generated always as identity primary key,
  alta_id        bigint      not null references altas(id) on delete cascade,
  momento        timestamptz not null default now(),
  version_texto  text        not null,
  texto_aceptado text        not null,
  ip             inet,
  ip_borrada_en  timestamptz
);

create index if not exists cons_alta_ix    on consentimientos (alta_id);
create index if not exists cons_momento_ix on consentimientos (momento) where ip is not null;

-- Comunicaciones de donación.
--
-- Esta tabla NO cobra nada ni guarda ningún medio de pago: recoge el aviso
-- previo de una transferencia que la persona hace desde su banco. Existe para
-- cumplir el art. 5.1.c de la LO 8/2007, que prohíbe las donaciones anónimas:
-- sin un nombre y un DNI asociados al concepto del ingreso, ese ingreso hay
-- que devolverlo.
--
-- Tres decisiones que conviene no deshacer sin pensarlo:
--
--  1. NO hay columna de IP. En las altas la IP corrobora un consentimiento que
--     por sí solo no deja rastro; aquí la declaración responsable va casada con
--     un apunte bancario a nombre de la misma persona, que es una prueba
--     incomparablemente mejor. Guardar la IP sería un dato personal de más sin
--     ninguna función.
--  2. NO cae en la purga total de la lista. Los datos de las altas se borran
--     seis meses después de las elecciones porque su finalidad se agota; estos
--     no, porque la obligación contable y fiscal de conservarlos sobrevive a la
--     campaña (mínimo cuatro años). Ver purga.js.
--  3. El DNI se guarda en claro. Es lo que hay que poner en el certificado de
--     donación y lo que se rinde al Tribunal de Cuentas: seudonimizarlo lo
--     dejaría inservible. La protección es de otro orden —cifrado en reposo,
--     acceso con credencial, cifrado en tránsito—, no el disfraz del dato.
create table if not exists donaciones (
  id               bigint generated always as identity primary key,
  creado           timestamptz not null default now(),
  actualizado      timestamptz not null default now(),
  nombre           text        not null,
  apellidos        text        not null,
  dni              text        not null,
  email            text        not null,
  importe_centimos bigint      not null check (importe_centimos > 0),
  fecha_prevista   date        not null,
  -- El concepto exacto que se le dijo a la persona que escribiera. Se guarda
  -- para poder cotejarlo con el extracto sin reconstruirlo a mano.
  concepto         text        not null,
  estado           text        not null default 'comunicada'
                               check (estado in ('comunicada','cobrada','devuelta','anulada')),
  -- Prueba de las declaraciones responsables: qué versión del texto legal
  -- estaba publicada y el literal exacto de cada casilla que se marcó.
  version_texto    text        not null,
  declaraciones    jsonb       not null,
  -- Para el seguimiento manual de cada ingreso por parte del equipo.
  notas            text
);

create index if not exists don_creado_ix on donaciones (creado);
create index if not exists don_estado_ix on donaciones (estado);
-- Control del acumulado por donante y año (art. 5.1.b LO 8/2007). No impide
-- pasarse —el tope se cuenta sobre todo lo que reciba la federación, no solo
-- sobre lo de Águilas— pero sí permite ver lo que ha entrado por aquí.
create index if not exists don_dni_ix    on donaciones (dni, creado);
`;

// Cambios sobre tablas que ya existen en producción. Van aparte del bloque de
// creación porque `create table if not exists` no toca una tabla ya creada: sin
// esto, una base de datos anterior a las donaciones se quedaría sin las
// columnas nuevas y el alta fallaría en caliente.
const MIGRACIONES = `
alter table altas add column if not exists telefono           text;
alter table altas add column if not exists consiente_colaborar boolean not null default false;
alter table altas add column if not exists consiente_cesion    boolean not null default false;

-- Una fila de consentimiento por finalidad marcada, no una por envío: es lo que
-- permite demostrar ante la AEPD que el permiso para ceder a IU y al PCE se dio
-- por separado del permiso para informar.
alter table consentimientos add column if not exists finalidad text not null default 'info';
create index if not exists cons_finalidad_ix on consentimientos (finalidad);
`;

async function migrar() {
  await consulta(ESQUEMA);
  await consulta(MIGRACIONES);
}

async function cerrar() {
  if (pool) {
    const p = pool;
    pool = null;
    await p.end().catch(() => {});
  }
}

module.exports = { obtenerPool, consulta, enTransaccion, migrar, cerrar };
