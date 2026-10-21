import { useState } from 'preact/hooks';
import { api, type Hold } from '../api';
import { Field, FormActions, inputValue, Sheet } from '../components';
import { centsToInput, dateLabel, eur, parseCents } from '../format';
import { useStore } from '../store';
import { useSubmit } from './useSubmit';

export function HoldForm({ hold, onClose }: { hold?: Hold; onClose: () => void }) {
  const { boot, toast } = useStore();
  const accounts = boot.accounts.filter((a) => !a.archived || a.id === hold?.account_id);
  const [concept, setConcept] = useState(hold?.concept ?? '');
  const [amount, setAmount] = useState(centsToInput(hold?.amount));
  const [accountId, setAccountId] = useState(hold?.account_id ?? accounts[0]?.id);
  const [date, setDate] = useState(hold?.date ?? boot.today);
  const [chargeDate, setChargeDate] = useState(hold?.charge_date ?? '');
  const [note, setNote] = useState(hold?.note ?? '');
  const [saving, run] = useSubmit(onClose);

  const submit = (e: Event) => {
    e.preventDefault();
    const cents = parseCents(amount);
    if (!cents || cents <= 0) return toast('Introduce un importe válido');
    if (chargeDate && chargeDate < date) return toast('El cobro no puede ser anterior a la retención');
    const body = { concept, amount: cents, account_id: accountId, date, charge_date: chargeDate || null, note };
    run(() => (hold ? api.put(`/holds/${hold.id}`, body) : api.post('/holds', body)), hold ? 'Retención actualizada' : 'Retención añadida');
  };

  return (
    <Sheet title={hold ? 'Editar retención' : 'Nueva retención'} onClose={onClose}>
      <form onSubmit={submit}>
        <div class="amount-input gasto">
          <input inputMode="decimal" placeholder="0,00" value={amount} onInput={(e) => setAmount(inputValue(e))} aria-label="Importe retenido" autoFocus={!hold} />
          <span>€</span>
        </div>
        <Field label="Concepto">
          <input required maxLength={80} placeholder="Hotel, gasolinera, alquiler de coche…" value={concept} onInput={(e) => setConcept(inputValue(e))} />
        </Field>
        <Field label="Cuenta">
          <select value={accountId} onChange={(e) => setAccountId(Number(inputValue(e)))}>
            {accounts.map((a) => (
              <option value={a.id}>{a.name}</option>
            ))}
          </select>
        </Field>
        <div class="row">
          <Field label="Retenida el">
            <input type="date" required value={date} onInput={(e) => setDate(inputValue(e))} />
          </Field>
          <Field label="Se cobra el">
            <input type="date" value={chargeDate} onInput={(e) => setChargeDate(inputValue(e))} />
          </Field>
        </div>
        <Field label="Nota">
          <input maxLength={200} placeholder="Opcional" value={note} onInput={(e) => setNote(inputValue(e))} />
        </Field>
        <FormActions saving={saving} onDelete={hold ? () => run(() => api.del(`/holds/${hold.id}`), 'Retención borrada') : undefined} />
      </form>
    </Sheet>
  );
}

/** Detalle de una retención: cobrarla (apunta el gasto), liberarla o editarla. */
export function HoldDetail({ hold, onClose, onEdit }: { hold: Hold; onClose: () => void; onEdit: () => void }) {
  const { boot, account, toast } = useStore();
  const expenseCats = boot.categories.filter((c) => c.kind === 'gasto' && !c.archived);
  const [mode, setMode] = useState<'view' | 'charge'>('view');
  const [amount, setAmount] = useState(centsToInput(hold.amount));
  const [date, setDate] = useState(hold.charge_date && hold.charge_date <= boot.today ? hold.charge_date : boot.today);
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [saving, run] = useSubmit(onClose);
  const pending = hold.status === 'pendiente';

  const charge = (e: Event) => {
    e.preventDefault();
    const cents = parseCents(amount);
    if (!cents || cents <= 0) return toast('Introduce el importe cobrado');
    if (!categoryId) return toast('Elige una categoría para el gasto');
    run(() => api.post(`/holds/${hold.id}/charge`, { amount: cents, date, category_id: categoryId }), 'Cobrada y apuntada como gasto');
  };

  return (
    <Sheet title={hold.concept} onClose={onClose}>
      <div class="stat-grid">
        <div class="stat">
          <span class="stat-label">Importe retenido</span>
          <span class="stat-value">{eur(hold.amount)}</span>
        </div>
        <div class="stat">
          <span class="stat-label">Estado</span>
          <span class={`stat-value status-${hold.status}`}>{hold.status[0].toUpperCase() + hold.status.slice(1)}</span>
        </div>
        <div class="stat">
          <span class="stat-label">Retenida el</span>
          <span class="stat-value">{dateLabel(hold.date)}</span>
        </div>
        <div class="stat">
          <span class="stat-label">Se cobra el</span>
          <span class="stat-value">{hold.charge_date ? dateLabel(hold.charge_date) : 'Sin fecha'}</span>
        </div>
      </div>
      <p class="muted small">
        En {account(hold.account_id)?.name}
        {hold.note ? ` · ${hold.note}` : ''}
      </p>

      {mode === 'charge' ? (
        <form onSubmit={charge}>
          <h3 class="subhead">Apuntar el cobro como gasto</h3>
          <div class="row">
            <Field label="Importe cobrado (€)" hint="Puede ser distinto de lo retenido.">
              <input inputMode="decimal" required value={amount} onInput={(e) => setAmount(inputValue(e))} />
            </Field>
            <Field label="Fecha del cobro">
              <input type="date" required value={date} onInput={(e) => setDate(inputValue(e))} />
            </Field>
          </div>
          <div class="field">
            <span class="field-label">Categoría</span>
            <div class="chips">
              {expenseCats.map((c) => (
                <button type="button" class={`chip ${c.id === categoryId ? 'on' : ''}`} style={{ '--chip': c.color ?? 'var(--accent)' }} onClick={() => setCategoryId(c.id)}>
                  {c.icon} {c.name}
                </button>
              ))}
            </div>
          </div>
          <div class="form-actions">
            <button type="button" class="btn ghost" onClick={() => setMode('view')}>
              Cancelar
            </button>
            <button type="submit" class="btn primary" disabled={saving}>
              {saving ? 'Guardando…' : 'Confirmar cobro'}
            </button>
          </div>
        </form>
      ) : pending ? (
        <div class="stack">
          <button class="btn primary" onClick={() => setMode('charge')}>
            Se ha cobrado
          </button>
          <button class="btn ghost" disabled={saving} onClick={() => run(() => api.put(`/holds/${hold.id}`, { status: 'liberada' }), 'Retención liberada')}>
            Se ha liberado (no se cobra)
          </button>
          <button class="btn ghost" onClick={onEdit}>
            Editar
          </button>
        </div>
      ) : (
        <div class="stack">
          {hold.status === 'cobrada' && <p class="muted small">Se apuntó como gasto en Movimientos. Si la reabres, ese gasto se borrará.</p>}
          <button class="btn ghost" disabled={saving} onClick={() => run(() => api.put(`/holds/${hold.id}`, { status: 'pendiente' }), 'Retención reabierta')}>
            Volver a marcar como pendiente
          </button>
        </div>
      )}
    </Sheet>
  );
}
