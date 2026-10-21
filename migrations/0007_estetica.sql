-- Estética de la app elegida por cada usuario.
ALTER TABLE users ADD COLUMN skin TEXT NOT NULL DEFAULT 'clasica' CHECK (skin IN ('clasica','chiikawa'));
