import { useEffect, useState } from 'preact/hooks';
import { BUDGET_WARN } from '../../shared/finance';
import { api, type Category, type ForecastItem, type Summary } from '../api';
import { Card, Empty, Field, FormActions, inputValue, Sheet } from '../components';
import { centsToInput, eur, parseCents, shiftMonth } from '../format';
import { useSubmit } from '../forms/useSubmit';
import { useStore } from '../store';

const daysInMonth = (month: string) => {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
};

/** Gastado en una categoría según el resumen del mes. */
const spentIn = (summary: Summary | null, id: number) => summary?.byCategory.find((r) => r.kind === 'gasto' && r.category_id === id)?.total ?? 0;

/** Aviso en el mes en curso de las categorías que han llegado al 90 % de su presupuesto. */
export function BudgetAlert({ summary, go }: { summary: Summary | null; go: () => void }) {
  const { boot } = useStore();
  if (!summary || summary.month !== boot.today.slice(0, 7)) return null;
  const hot = boot.categories
    .filter((c) => c.kind === 'gasto' && !c.archived && c.budget)
    .map((c) => ({ c, budget: c.budget!, spent: spentIn(summary, c.id) }))
    .filter((r) => r.spent >= r.budget * BUDGET_WARN)
    .sort((a, b) => b.spent / b.budget - a.spent / a.budget);
  if (!hot.length) return null;
  return (
    <div role="alert">
    <button class="budget-alert" onClick={go}>
      <span class="budget-alert-icon" aria-hidden="true">⚠️</span>
      <span>
        <strong>{hot.length === 1 ? 'Estás a punto de pasarte de un presupuesto' : `Estás a punto de pasarte en ${hot.length} presupuestos`}</strong>
        {hot.map(({ c, budget, spent }) => (
          <span class="budget-alert-line">
            {c.icon} {c.name}: {spent > budget ? `te has pasado ${eur(spent - budget)}` : `solo te quedan ${eur(budget - spent)}`} ({Math.round((spent / budget) * 100)} %)
          </span>
        ))}
      </span>
    </button>
    </div>
  );
}

/**
 * Presupuestos del mes: lo gastado en cada categoría frente a su presupuesto mensual.
 * En el mes en curso y los futuros se suma aparte lo que ya está previsto (recurrentes y cuotas).
 */
export function Presupuestos({ month, summary, forecast }: { month: string; summary: Summary | null; forecast: ForecastItem[] | null }) {
  const { boot } = useStore();
  const [editing, setEditing] = useState(false);
  const currentMonth = boot.today.slice(0, 7);
  const isCurrent = month === currentMonth;

  const budgeted = boot.categories.filter((c) => c.kind === 'gasto' && c.budget);
  const spentOf = (id: number) => spentIn(summary, id);
  // Lo programado con fecha futura ya está en los movimientos del mes; aquí solo recurrentes y cuotas.
  const plannedOf = (id: number) =>
    month < currentMonth || !forecast
      ? 0
      : forecast
          .filter((i) => i.kind === 'gasto' && i.category_id === id && i.date.startsWith(month) && (i.source === 'recurrente' || i.source === 'cuota'))
          .reduce((s, i) => s + i.amount, 0);

  const rows = budgeted
    .map((c) => ({ c, budget: c.budget!, spent: spentOf(c.id), planned: plannedOf(c.id) }))
    .sort((a, b) => (b.spent + b.planned) / b.budget - (a.spent + a.planned) / a.budget);

  // En el mes en curso, una marca indica hasta dónde «tocaría» haber gastado a estas alturas.
  const pace = isCurrent ? Number(boot.today.slice(8, 10)) / daysInMonth(month) : null;

  const total = rows.reduce((s, r) => s + r.budget, 0);
  const totalUsed = rows.reduce((s, r) => s + r.spent + r.planned, 0);

  if (!rows.length && month < currentMonth) return null;

  return (
    <>
    <Card title="Presupuestos" tour="presupuestos" action={<button class="link" onClick={() => setEditing(true)}>{rows.length ? 'Editar' : '+ Crear'}</button>}>
      {rows.length ? (
        <>
          <div class="budget-total">
            <span>
              <strong>{eur(totalUsed)}</strong> de {eur(total)}
            </span>
            <span class={totalUsed > total ? 'neg' : 'muted'}>{totalUsed > total ? `Te pasas ${eur(totalUsed - total)}` : `Quedan ${eur(total - totalUsed)}`}</span>
          </div>
          <ul class="goals budgets">
            {rows.map(({ c, budget, spent, planned }) => {
              const used = spent + planned;
              const over = used > budget;
              // Rojo al pasarse o al haber gastado ya el 90 % (a un 10 % de pasarse).
              const danger = over || spent >= budget * BUDGET_WARN;
              const scale = Math.max(budget, used);
              const ahead = pace != null && !danger && spent > budget * pace * 1.1;
              return (
                <li>
                  <button class="goal" onClick={() => setEditing(true)}>
                    <div class="loan-head">
                      <strong>
                        {c.icon} {c.name}
                      </strong>
                      <span class={danger ? 'neg' : 'muted'}>{Math.round((used / budget) * 100)} %</span>
                    </div>
                    <div class={`budget-bar ${danger ? 'over' : ahead ? 'ahead' : ''}`} role="progressbar" aria-valuenow={Math.round((used / budget) * 100)} aria-valuemin={0} aria-valuemax={100}>
                      <div class="budget-spent" style={{ width: `${(spent / scale) * 100}%`, background: danger || ahead ? undefined : (c.color ?? undefined) }} />
                      {planned > 0 && <div class="budget-planned" style={{ width: `${(planned / scale) * 100}%`, '--seg': c.color ?? 'var(--accent)' }} />}
                      {over && <i class="budget-limit" style={{ left: `${(budget / scale) * 100}%` }} />}
                      {pace != null && !danger && <i class="budget-pace" style={{ left: `${pace * 100}%` }} title="Lo que llevas de mes" />}
                    </div>
                    <div class="loan-foot">
                      <span>
                        <strong>{eur(spent)}</strong> de {eur(budget)}
                        {planned > 0 && <span class="muted"> · {eur(planned)} previstos</span>}
                      </span>
                      <span class={danger ? 'neg' : 'muted'}>{over ? `Te pasas ${eur(used - budget)}` : danger ? `¡Solo quedan ${eur(budget - used)}!` : `Quedan ${eur(budget - used)}`}</span>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
          {pace != null && <p class="muted small">La rayita marca lo que llevas de mes: si la barra la pasa, vas gastando más rápido de lo previsto (naranja). En rojo, ya has gastado el 90 % o más.</p>}
        </>
      ) : (
        <Empty>Ponte un límite al mes en las categorías que quieras controlar (restaurantes, compras…) y verás aquí cuánto te queda.</Empty>
      )}
    </Card>
    {editing && <BudgetsForm month={month} onClose={() => setEditing(false)} />}
    </>
  );
}

/** Edita a la vez el presupuesto de todas las categorías de gasto, con la media de los últimos meses como guía. */
function BudgetsForm({ month, onClose }: { month: string; onClose: () => void }) {
  const { boot, toast } = useStore();
  const cats = boot.categories.filter((c) => c.kind === 'gasto' && (!c.archived || c.budget));
  const [values, setValues] = useState<Record<number, string>>(() => Object.fromEntries(cats.map((c) => [c.id, centsToInput(c.budget)])));
  const [avg, setAvg] = useState<Record<number, number> | null>(null);
  const [saving, run] = useSubmit(onClose);
  const MONTHS = 3;

  // Media de los últimos meses completos (sin contar el que se está viendo si es el actual).
  useEffect(() => {
    const last = month >= boot.today.slice(0, 7) ? shiftMonth(boot.today.slice(0, 7), -1) : month;
    const months = Array.from({ length: MONTHS }, (_, i) => shiftMonth(last, -i));
    Promise.all(months.map((m) => api.get<Summary>(`/summary?month=${m}`)))
      .then((list) => {
        const sum: Record<number, number> = {};
        for (const s of list) for (const r of s.byCategory) if (r.kind === 'gasto' && r.category_id != null) sum[r.category_id] = (sum[r.category_id] ?? 0) + r.total;
        setAvg(Object.fromEntries(Object.entries(sum).map(([k, v]) => [k, Math.round(v / MONTHS)])));
      })
      .catch(() => setAvg({}));
  }, []);

  const submit = (e: Event) => {
    e.preventDefault();
    const changes: { c: Category; budget: number | null }[] = [];
    for (const c of cats) {
      const raw = (values[c.id] ?? '').trim();
      const budget = raw ? parseCents(raw) : null;
      if (raw && (!budget || budget <= 0)) return toast(`El presupuesto de ${c.name} no es válido`);
      if (budget !== (c.budget ?? null)) changes.push({ c, budget });
    }
    if (!changes.length) return onClose();
    run(() => Promise.all(changes.map(({ c, budget }) => api.put(`/categories/${c.id}`, { budget }))), 'Presupuestos guardados');
  };

  return (
    <Sheet title="Presupuestos mensuales" onClose={onClose}>
      <form onSubmit={submit}>
        <p class="muted small">Lo máximo que quieres gastar al mes en cada categoría. Déjalo vacío en las que no quieras controlar. Debajo tienes lo que gastas de media ({MONTHS} últimos meses).</p>
        {cats.map((c) => (
          <Field
            label={`${c.icon ?? ''} ${c.name}`.trim()}
            hint={avg ? (avg[c.id] ? `Media: ${eur(avg[c.id])}/mes` : 'Sin gastos estos meses') : 'Calculando la media…'}
          >
            <input
              inputMode="decimal"
              placeholder="Sin presupuesto"
              value={values[c.id] ?? ''}
              onInput={(e) => {
                const v = inputValue(e);
                setValues((prev) => ({ ...prev, [c.id]: v }));
              }}
            />
          </Field>
        ))}
        <FormActions saving={saving} />
      </form>
    </Sheet>
  );
}
