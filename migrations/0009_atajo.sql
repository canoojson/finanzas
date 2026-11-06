-- Atajo de iOS: apunta los pagos con Apple Pay a través de /api/atajo/pago.
ALTER TABLE users ADD COLUMN shortcut_token_hash TEXT;    -- SHA-256 del token (el token solo se muestra al crearlo)
ALTER TABLE users ADD COLUMN shortcut_account_id INTEGER REFERENCES accounts(id); -- cuenta por defecto de los pagos
CREATE UNIQUE INDEX users_shortcut_token ON users(shortcut_token_hash) WHERE shortcut_token_hash IS NOT NULL;
-- Nombre de la tarjeta en Cartera (Wallet): los pagos con ella se apuntan en esta cuenta.
ALTER TABLE accounts ADD COLUMN wallet_card TEXT;
