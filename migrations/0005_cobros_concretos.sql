-- Cambios en un cobro concreto de un recurrente: otra fecha, otro importe o saltarlo.
CREATE TABLE recurring_overrides (
  id             INTEGER PRIMARY KEY,
  owner          TEXT NOT NULL REFERENCES users(email),
  recurring_id   INTEGER NOT NULL REFERENCES recurring(id) ON DELETE CASCADE,
  scheduled_date TEXT NOT NULL,   -- fecha en la que tocaba según el recurrente
  new_date       TEXT,            -- fecha real (si cambia)
  new_amount     INTEGER CHECK (new_amount IS NULL OR new_amount > 0),
  skip           INTEGER NOT NULL DEFAULT 0,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (recurring_id, scheduled_date)
);
CREATE INDEX recurring_overrides_owner ON recurring_overrides(owner);

-- Cada apunte de un recurrente guarda qué cobro programado representa (aunque se apunte otro día).
ALTER TABLE transactions ADD COLUMN occurrence TEXT;
UPDATE transactions SET occurrence = date WHERE recurring_id IS NOT NULL;
DROP INDEX transactions_recurring_once;
CREATE UNIQUE INDEX transactions_recurring_occurrence ON transactions(recurring_id, occurrence) WHERE recurring_id IS NOT NULL;
