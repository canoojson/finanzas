import { useState } from 'preact/hooks';
import { addDays, EARLY_DAYS } from '../../shared/finance';
import { api, type ForecastItem, type Recurring } from '../api';
import { Card, Field, inputValue, Money, Sheet } from '../components';
import { centsToInput, dateLabel, eur, parseCents } from '../format';
import { useSubmit } from '../forms/useSubmit';
import { useStore } from '../store';

/** Ingresos recurrentes previstos en los próximos días, con botón para apuntarlos ya si se han cobrado antes. */
export function CobrosPendientes({ items }: { items: ForecastItem[] }) {
  const { boot, category } = useStore();
  const [confirming, setConfirming] = useState<{ r: Recurring; next: string; occurrence: string; amount: number } | null>(null);
  const until = addDays(boot.today, EARLY_DAYS);
  // El primer cobro pendiente de cada ingreso recurrente en los próximos días (con sus cambios aplicados).
  const seen = new Set<number>();
  const due = items
    .filter((i) => i.source === 'recurrente' && i.kind === 'ingreso' && i.date <= until)
    .filter((i) => !seen.has(i.recurring_id!) && seen.add(i.recurring_id!))
    .map((i) => ({ r: boot.recurring.find((r) => r.id === i.recurring_id)!, next: i.date, occurrence: i.occurrence!, amount: i.amount }))
    .filter((x) => x.r);
  if (!due.length) return null;

  return (
    <Card title="Pendiente de cobrar">
      <ul class="rows">
        {due.map(({ r, next, occurrence, amount }) => {
          const c = category(r.category_id);
          return (
            <li class="tx">
              <span class="tx-icon" style={{ '--chip': c?.color ?? 'var(--pos)' }}>
                {c?.icon ?? '💼'}
              </span>
              <span class="tx-main">
                <span class="tx-title">{r.note || c?.name || 'Ingreso'}</span>
                <span class="tx-sub">
                  Previsto el {dateLabel(next)} · <Money cents={amount} sign="ingreso" />
                </span>
              </span>
              <button class="btn primary small-btn" onClick={() => setConfirming({ r, next, occurrence, amount })}>
                {/n[oó]mina/i.test(`${r.note} ${c?.name}`) ? "Ya la he cobrado" : "Ya lo he cobrado"}
              </button>
            </li>
          );
        })}
      </ul>
      {confirming && <ConfirmCobro {...confirming} onClose={() => setConfirming(null)} />}
    </Card>
  );
}

function ConfirmCobro({ r, next, occurrence, amount: expected, onClose }: { r: Recurring; next: string; occurrence: string; amount: number; onClose: () => void }) {
  const { boot, account, toast } = useStore();
  const [amount, setAmount] = useState(centsToInput(expected));
  const [date, setDate] = useState(boot.today);
  const [saving, run] = useSubmit(onClose);

  const submit = (e: Event) => {
    e.preventDefault();
    const cents = parseCents(amount);
    if (!cents || cents <= 0) return toast('Introduce el importe cobrado');
    run(() => api.post(`/recurring/${r.id}/now`, { occurrence, amount: cents, date }), `Apuntado: ${eur(cents)}`);
  };

  return (
    <Sheet title={`Cobro de ${r.note || 'ingreso'}`} onClose={onClose}>
      <form onSubmit={submit}>
        <div class="amount-input ingreso">
          <input inputMode="decimal" value={amount} onInput={(e) => setAmount(inputValue(e))} aria-label="Importe cobrado" />
          <span>€</span>
        </div>
        <Field label="Fecha del cobro">
          <input type="date" required value={date} onInput={(e) => setDate(inputValue(e))} />
        </Field>
        <p class="muted small">
          Se apunta en {account(r.account_id)?.name} y ya no se volverá a apuntar el {dateLabel(next)}. Si este mes trae extras, cambia el importe.
        </p>
        <div class="form-actions">
          <button type="button" class="btn ghost" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" class="btn primary" disabled={saving}>
            {saving ? 'Guardando…' : 'Confirmar'}
          </button>
        </div>
      </form>
    </Sheet>
  );
}
