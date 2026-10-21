import { useState } from 'preact/hooks';
import { addDays } from '../../shared/finance';
import { MAX_SHIFT_DAYS } from '../../shared/recurrence';
import { api, type ForecastItem } from '../api';
import { Field, inputValue, Sheet, Toggle } from '../components';
import { centsToInput, dateLabel, eur, parseCents } from '../format';
import { useStore } from '../store';
import { useSubmit } from './useSubmit';

/** Cambia un cobro concreto de un recurrente: otra fecha, otro importe o saltarlo ese mes. */
export function OccurrenceForm({ item, onClose }: { item: ForecastItem; onClose: () => void }) {
  const { boot, category, toast } = useStore();
  const r = boot.recurring.find((x) => x.id === item.recurring_id);
  const scheduled = item.occurrence!;
  const [date, setDate] = useState(item.date);
  const [amount, setAmount] = useState(centsToInput(item.amount));
  const [skip, setSkip] = useState(false);
  const [saving, run] = useSubmit(onClose);
  const name = r?.note || category(r?.category_id)?.name || 'Recurrente';

  const save = (body: Record<string, unknown>, msg: string) =>
    run(() => api.put(`/recurring/${item.recurring_id}/occurrences/${scheduled}`, body), msg);

  const submit = (e: Event) => {
    e.preventDefault();
    if (skip) return save({ skip: true }, `${name}: este mes no se cobra`);
    const cents = parseCents(amount);
    if (!cents || cents <= 0) return toast('Introduce un importe válido');
    save({ new_date: date, new_amount: cents }, 'Cobro actualizado');
  };

  return (
    <Sheet title={name} onClose={onClose}>
      <form onSubmit={submit}>
        <p class="muted small">
          Cambia solo el cobro que tocaba el <strong>{dateLabel(scheduled)}</strong>. Los demás meses siguen igual
          {r ? ` (día ${r.day}, ${eur(r.amount)})` : ''}.
        </p>
        <Toggle label="Saltar este mes" hint="Este mes no se cobra." checked={skip} onChange={setSkip} />
        {!skip && (
          <div class="row">
            <Field label="Fecha del cobro">
              <input
                type="date"
                required
                min={addDays(scheduled, -MAX_SHIFT_DAYS)}
                max={addDays(scheduled, MAX_SHIFT_DAYS)}
                value={date}
                onInput={(e) => setDate(inputValue(e))}
              />
            </Field>
            <Field label="Importe (€)">
              <input inputMode="decimal" required value={amount} onInput={(e) => setAmount(inputValue(e))} />
            </Field>
          </div>
        )}
        <div class="form-actions">
          {item.modified && (
            <button type="button" class="btn ghost" disabled={saving} onClick={() => save({}, 'Cobro restablecido')}>
              Restablecer
            </button>
          )}
          <button type="submit" class="btn primary" disabled={saving}>
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </form>
    </Sheet>
  );
}
