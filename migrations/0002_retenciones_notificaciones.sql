-- Retenciones: importes bloqueados en una cuenta que se cobrarán (o liberarán) más adelante.
CREATE TABLE holds (
  id             INTEGER PRIMARY KEY,
  owner          TEXT NOT NULL REFERENCES users(email),
  account_id     INTEGER NOT NULL REFERENCES accounts(id),
  concept        TEXT NOT NULL,
  amount         INTEGER NOT NULL CHECK (amount > 0),
  date           TEXT NOT NULL,              -- fecha en que se hizo la retención
  charge_date    TEXT,                       -- fecha prevista de cobro (si se sabe)
  status         TEXT NOT NULL DEFAULT 'pendiente' CHECK (status IN ('pendiente','cobrada','liberada')),
  transaction_id INTEGER REFERENCES transactions(id) ON DELETE SET NULL,  -- gasto creado al cobrarse
  note           TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX holds_owner ON holds(owner, status);

-- Dispositivos suscritos a notificaciones (Web Push).
CREATE TABLE push_subscriptions (
  id         INTEGER PRIMARY KEY,
  owner      TEXT NOT NULL REFERENCES users(email),
  endpoint   TEXT NOT NULL UNIQUE,
  p256dh     TEXT NOT NULL,
  auth       TEXT NOT NULL,
  device     TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX push_subscriptions_owner ON push_subscriptions(owner);

-- Preferencias de recordatorio (hora local de Madrid).
ALTER TABLE users ADD COLUMN reminder_days TEXT NOT NULL DEFAULT '0,1,2,3,4,5,6'; -- 0 = domingo
ALTER TABLE users ADD COLUMN reminder_hour INTEGER NOT NULL DEFAULT 21;
ALTER TABLE users ADD COLUMN reminder_skip_if_logged INTEGER NOT NULL DEFAULT 1;     -- no avisar si ya apuntó algo hoy
ALTER TABLE users ADD COLUMN hold_alerts INTEGER NOT NULL DEFAULT 1;                 -- avisar el día antes del cobro de una retención
ALTER TABLE users ADD COLUMN last_reminder TEXT;
ALTER TABLE users ADD COLUMN last_hold_alert TEXT;
