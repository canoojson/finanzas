-- Estética personalizada: el CHECK de skin no se puede ampliar, así que se recrea la columna conservando su valor.
ALTER TABLE users ADD COLUMN skin_tmp TEXT;
UPDATE users SET skin_tmp = skin;
ALTER TABLE users DROP COLUMN skin;
ALTER TABLE users ADD COLUMN skin TEXT NOT NULL DEFAULT 'clasica' CHECK (skin IN ('clasica','chiikawa','personalizada'));
UPDATE users SET skin = skin_tmp;
ALTER TABLE users DROP COLUMN skin_tmp;
-- Colores de la estética personalizada: «#principal,#secundario,#letra».
ALTER TABLE users ADD COLUMN skin_colors TEXT;
