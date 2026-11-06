-- Última versión de «novedades» (mini tour) que ha visto cada usuario. Los usuarios
-- nuevos ven el tour completo y quedan al día; los demás solo ven las novedades.
ALTER TABLE users ADD COLUMN news_seen INTEGER NOT NULL DEFAULT 0;
