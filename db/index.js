const { createClient } = require('@libsql/client');
const path = require('path');

// TURSO_DATABASE_URL / TURSO_AUTH_TOKEN come from your Turso database (serverless,
// persists across deploys and restarts). If they're not set, we fall back to a local
// SQLite file so `npm start` still works with zero setup on your own machine.
const usingTurso = !!process.env.TURSO_DATABASE_URL;

const client = createClient({
  url: process.env.TURSO_DATABASE_URL || `file:${path.join(__dirname, 'lumina.db')}`,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('hr','employee')),
  employee_id TEXT
);

CREATE TABLE IF NOT EXISTS employees (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  role TEXT NOT NULL,
  dept TEXT NOT NULL,
  type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Active',
  joined TEXT NOT NULL,
  manager TEXT,
  salary INTEGER NOT NULL DEFAULT 0,
  tax_id TEXT,
  leave_balance INTEGER NOT NULL DEFAULT 14,
  avatar TEXT
);

CREATE TABLE IF NOT EXISTS payroll (
  emp_id TEXT PRIMARY KEY REFERENCES employees(id),
  base REAL NOT NULL,
  tax REAL NOT NULL,
  benefits REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'Processing'
);

CREATE TABLE IF NOT EXISTS leave_requests (
  id TEXT PRIMARY KEY,
  emp_id TEXT NOT NULL REFERENCES employees(id),
  type TEXT NOT NULL,
  from_date TEXT NOT NULL,
  to_date TEXT NOT NULL,
  days INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'Pending'
);

CREATE TABLE IF NOT EXISTS attendance (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  emp_id TEXT NOT NULL REFERENCES employees(id),
  date TEXT NOT NULL,
  clock_in TEXT,
  clock_out TEXT,
  hours REAL DEFAULT 0,
  status TEXT DEFAULT 'On time'
);

CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  dept TEXT NOT NULL,
  openings INTEGER NOT NULL DEFAULT 1,
  posted TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS candidates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  stage TEXT NOT NULL DEFAULT 'Applied',
  applied TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS performance (
  emp_id TEXT PRIMARY KEY REFERENCES employees(id),
  role TEXT NOT NULL,
  cycle TEXT NOT NULL,
  score REAL NOT NULL,
  kpis TEXT NOT NULL,
  feedback TEXT
);

CREATE TABLE IF NOT EXISTS onboarding (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  emp_ref TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('onboarding','offboarding')),
  date_label TEXT,
  tasks TEXT NOT NULL,
  UNIQUE(emp_ref, kind)
);
`;

// No demo data is seeded. The first person to open the app creates the
// HR administrator account through the setup screen (see routes/auth.routes.js).

// ---- Compatibility shim -----------------------------------------------
// The rest of the codebase was written against better-sqlite3's synchronous
// `db.prepare(sql).get(...)/.all(...)/.run(...)` style. Turso's client is
// network-based and therefore async, so this shim keeps the exact same call
// shape at every call site — the only change needed elsewhere is adding
// `await` in front of each call (and `async` on the route handlers).

function rowToObject(row) {
  // libSQL rows already support named property access; spreading strips
  // internal symbols/metadata down to a plain object.
  const obj = {};
  for (const key of Object.keys(row)) obj[key] = row[key];
  return obj;
}

function normalizeArgs(args) {
  // better-sqlite3 accepted bound params as separate arguments; libSQL wants
  // an array. Also convert `undefined` to `null` (libSQL rejects undefined).
  return args.map((a) => (a === undefined ? null : a));
}

function prepare(sql) {
  return {
    async get(...args) {
      const res = await client.execute({ sql, args: normalizeArgs(args) });
      return res.rows[0] ? rowToObject(res.rows[0]) : undefined;
    },
    async all(...args) {
      const res = await client.execute({ sql, args: normalizeArgs(args) });
      return res.rows.map(rowToObject);
    },
    async run(...args) {
      const res = await client.execute({ sql, args: normalizeArgs(args) });
      return {
        changes: Number(res.rowsAffected ?? 0),
        lastInsertRowid:
          res.lastInsertRowid !== undefined && res.lastInsertRowid !== null
            ? Number(res.lastInsertRowid)
            : undefined,
      };
    },
  };
}

let ready = false;
async function init() {
  if (ready) return;
  await client.executeMultiple(SCHEMA);
  ready = true;
  console.log(`Database ready (${usingTurso ? 'Turso — persistent' : 'local SQLite file'}).`);
}

module.exports = { prepare, init, usingTurso };
