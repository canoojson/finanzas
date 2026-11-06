-- Estilo visual elegido por cada usuario (forma, tipografía y paleta de la Clásica).
-- Sin CHECK para poder añadir estilos sin recrear la columna: lo valida el worker.
ALTER TABLE users ADD COLUMN style TEXT NOT NULL DEFAULT 'original';
