-- Importes siempre en céntimos (INTEGER). Fechas en texto ISO (YYYY-MM-DD).
-- Cada fila pertenece a un usuario (owner = email de Cloudflare Access).
-- Para compartir en el futuro se añadirá una tabla de "espacios" y una columna
-- space_id; mientras tanto todo se filtra por owner.

CREATE TABLE users (
  email      TEXT PRIMARY KEY,
  name       TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE accounts (
  id              INTEGER PRIMARY KEY,
  owner           TEXT NOT NULL REFERENCES users(email),
  name            TEXT NOT NULL,
  type            TEXT NOT NULL CHECK (type IN ('corriente','ahorro','efectivo','inversion','tarjeta')),
  initial_balance INTEGER NOT NULL DEFAULT 0,
  color           TEXT,
  archived        INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX accounts_owner ON accounts(owner);

CREATE TABLE categories (
  id         INTEGER PRIMARY KEY,
  owner      TEXT NOT NULL REFERENCES users(email),
  name       TEXT NOT NULL,
  kind       TEXT NOT NULL CHECK (kind IN ('gasto','ingreso')),
  icon       TEXT,
  color      TEXT,
  archived   INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX categories_owner ON categories(owner);

CREATE TABLE loans (
  id            INTEGER PRIMARY KEY,
  owner         TEXT NOT NULL REFERENCES users(email),
  name          TEXT NOT NULL,
  lender        TEXT,
  principal     INTEGER NOT NULL CHECK (principal > 0),
  annual_rate   REAL NOT NULL DEFAULT 0,      -- TIN en %
  term_months   INTEGER NOT NULL CHECK (term_months > 0),
  first_payment TEXT NOT NULL,                -- fecha de la primera cuota
  payment       INTEGER,                      -- cuota fija si difiere de la calculada
  account_id    INTEGER REFERENCES accounts(id),
  category_id   INTEGER REFERENCES categories(id),
  auto_register INTEGER NOT NULL DEFAULT 0,   -- apuntar la cuota como gasto automáticamente
  last_run      TEXT,                         -- última cuota apuntada automáticamente
  notes         TEXT,
  closed        INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX loans_owner ON loans(owner);

CREATE TABLE recurring (
  id          INTEGER PRIMARY KEY,
  owner       TEXT NOT NULL REFERENCES users(email),
  kind        TEXT NOT NULL CHECK (kind IN ('gasto','ingreso')),
  amount      INTEGER NOT NULL CHECK (amount > 0),
  account_id  INTEGER NOT NULL REFERENCES accounts(id),
  category_id INTEGER REFERENCES categories(id),
  note        TEXT,
  day         INTEGER NOT NULL CHECK (day BETWEEN 1 AND 31),
  start_date  TEXT NOT NULL,
  end_date    TEXT,
  last_run    TEXT,
  active      INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX recurring_owner ON recurring(owner);

CREATE TABLE transactions (
  id            INTEGER PRIMARY KEY,
  owner         TEXT NOT NULL REFERENCES users(email),
  kind          TEXT NOT NULL CHECK (kind IN ('gasto','ingreso','transferencia')),
  amount        INTEGER NOT NULL CHECK (amount > 0),
  date          TEXT NOT NULL,
  account_id    INTEGER NOT NULL REFERENCES accounts(id),
  to_account_id INTEGER REFERENCES accounts(id),
  category_id   INTEGER REFERENCES categories(id),
  note          TEXT,
  recurring_id  INTEGER REFERENCES recurring(id) ON DELETE SET NULL,
  loan_id       INTEGER REFERENCES loans(id) ON DELETE SET NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX transactions_owner_date ON transactions(owner, date);

CREATE TABLE goals (
  id         INTEGER PRIMARY KEY,
  owner      TEXT NOT NULL REFERENCES users(email),
  name       TEXT NOT NULL,
  target     INTEGER NOT NULL CHECK (target > 0),
  account_id INTEGER REFERENCES accounts(id),  -- si se vincula, el progreso es el saldo de la cuenta
  saved      INTEGER NOT NULL DEFAULT 0,       -- si no, progreso manual
  deadline   TEXT,
  color      TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX goals_owner ON goals(owner);

-- Evita duplicados si la generación automática se ejecuta dos veces a la vez.
CREATE UNIQUE INDEX transactions_recurring_once ON transactions(recurring_id, date) WHERE recurring_id IS NOT NULL;
CREATE UNIQUE INDEX transactions_loan_once ON transactions(loan_id, date) WHERE loan_id IS NOT NULL;
