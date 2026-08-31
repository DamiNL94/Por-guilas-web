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
`;

async function migrar() {
  await consulta(ESQUEMA);
}

async function cerrar() {
  if (pool) {
    const p = pool;
    pool = null;
    await p.end().catch(() => {});
  }
}

module.exports = { obtenerPool, consulta, enTransaccion, migrar, cerrar };
