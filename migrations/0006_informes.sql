-- Informes mensuales en PDF.
CREATE TABLE reports (
  id         INTEGER PRIMARY KEY,
  owner      TEXT NOT NULL REFERENCES users(email),
  month      TEXT NOT NULL,          -- YYYY-MM del mes resumido
  pdf        BLOB NOT NULL,
  data       TEXT NOT NULL,          -- JSON con las cifras y las recomendaciones
  ai         INTEGER NOT NULL DEFAULT 0,  -- si incluye recomendaciones de Claude
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (owner, month)
);

-- Objetivo de ahorro mensual (céntimos) para orientar las recomendaciones.
ALTER TABLE users ADD COLUMN savings_target INTEGER;
