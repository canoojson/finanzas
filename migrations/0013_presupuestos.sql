-- Presupuesto mensual por categoría de gasto (en céntimos). NULL = sin presupuesto.
ALTER TABLE categories ADD COLUMN budget INTEGER CHECK (budget IS NULL OR budget > 0);
-- Mes (AAAA-MM) en que ya se avisó de que la categoría está a punto de pasarse del presupuesto.
ALTER TABLE categories ADD COLUMN budget_alert TEXT;
-- Avisar con una notificación al llegar al 90 % de un presupuesto.
ALTER TABLE users ADD COLUMN budget_alerts INTEGER NOT NULL DEFAULT 1;
