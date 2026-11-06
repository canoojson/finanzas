-- Avisos al administrador cuando el uso diario del plan gratuito de Cloudflare se acerca al límite.
-- Guarda el umbral más alto ya avisado por día (UTC) y métrica, para no repetir el aviso.
CREATE TABLE usage_alerts (
  day    TEXT NOT NULL,    -- fecha UTC (los contadores de Cloudflare se reinician a las 00:00 UTC)
  metric TEXT NOT NULL,    -- requests | rowsRead | rowsWritten
  level  INTEGER NOT NULL, -- porcentaje del límite avisado (70, 90…)
  PRIMARY KEY (day, metric)
);
