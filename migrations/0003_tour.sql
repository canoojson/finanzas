-- Si el usuario ya ha visto el tour de bienvenida.
ALTER TABLE users ADD COLUMN tour_done INTEGER NOT NULL DEFAULT 0;
