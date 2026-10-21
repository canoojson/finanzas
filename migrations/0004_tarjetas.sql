-- Configuración de tarjetas de crédito (solo para cuentas de tipo 'tarjeta').
ALTER TABLE accounts ADD COLUMN card_cutoff_day INTEGER;      -- día de corte del ciclo (31 = fin de mes)
ALTER TABLE accounts ADD COLUMN card_charge_day INTEGER;      -- día del mes siguiente en que se cobra
ALTER TABLE accounts ADD COLUMN card_pay_account_id INTEGER REFERENCES accounts(id); -- cuenta de la que sale el cargo
ALTER TABLE accounts ADD COLUMN card_settle_from TEXT;        -- desde cuándo se apuntan los cargos automáticos

-- Los cargos de tarjeta son transferencias cuenta → tarjeta marcadas con el fin del ciclo que liquidan.
ALTER TABLE transactions ADD COLUMN card_cycle TEXT;
CREATE UNIQUE INDEX transactions_card_cycle_once ON transactions(to_account_id, card_cycle) WHERE card_cycle IS NOT NULL;
