const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

const DB_PATH = path.join(__dirname, 'lumina.db');
const isNew = !fs.existsSync(DB_PATH);
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
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
`);

// No demo data is seeded. The first person to open the app creates the
// HR administrator account through the setup screen (see routes/auth.routes.js).

module.exports = db;
