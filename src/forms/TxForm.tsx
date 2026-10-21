import { useState } from 'preact/hooks';
import { frenchPayment } from '../../shared/finance';
import { chargeDateFor, cycleEndFor, isConfiguredCard, nextCycleEnd } from '../../shared/forecast';
import { api, type Transaction } from '../api';
import { Field, FormActions, inputValue, Segmented, Sheet, Toggle } from '../components';
import { centsToInput, dateLabel, eur, parseCents } from '../format';
import { useStore } from '../store';
import { useSubmit } from './useSubmit';

type Kind = Transaction['kind'];

export function TxForm({ tx, onClose }: { tx?: Transaction; onClose: () => void }) {
  const { boot, toast, account } = useStore();
  const accounts = boot.accounts.filter((a) => !a.archived || a.id === tx?.account_id || a.id === tx?.to_account_id);
  const [kind, setKind] = useState<Kind>(tx?.kind ?? 'gasto');
  const [amount, setAmount] = useState(centsToInput(tx?.amount));
  const [categoryId, setCategoryId] = useState<number | null>(tx?.category_id ?? null);
  const [accountId, setAccountId] = useState(tx?.account_id ?? accounts[0]?.id);
  const [toAccountId, setToAccountId] = useState(tx?.to_account_id ?? accounts.find((a) => a.id !== accountId)?.id ?? null);
  const [date, setDate] = useState(tx?.date ?? boot.today);
  const [note, setNote] = useState(tx?.note ?? '');
  const [deferred, setDeferred] = useState(false);
  const [term, setTerm] = useState('');
  const [rate, setRate] = useState('');
  const [installment, setInstallment] = useState('');
  const [firstCycle, setFirstCycle] = useState<'este' | 'siguiente'>('este');
  const [saving, run] = useSubmit(onClose);

  // Pago aplazado: solo para compras con tarjeta configurada que no sean apuntes automáticos.
  const card = account(accountId);
  const canDefer = kind === 'gasto' && !!card && isConfiguredCard(card) && !tx?.loan_id && !tx?.recurring_id && !tx?.card_cycle;
  const isDeferred = canDefer && deferred;
  const cycles = canDefer
    ? (() => {
        const este = cycleEndFor(card!, date);
        return { este, siguiente: nextCycleEnd(card!, este) };
      })()
    : null;
  const cents0 = parseCents(amount);
  const n = Number(term);
  const r = Number(rate.replace(',', '.') || 0);
  const computed = isDeferred && cents0 && n > 1 && r >= 0 ? frenchPayment(cents0, r, n) : null;

  const categories = boot.categories.filter((c) => c.kind === kind && (!c.archived || c.id === tx?.category_id));

  const submit = (e: Event) => {
    e.preventDefault();
    const cents = parseCents(amount);
    if (!cents || cents <= 0) return toast('Introduce un importe válido');
    if (kind !== 'transferencia' && !categoryId) return toast('Elige una categoría');
    const body = {
      kind,
      amount: cents,
      date,
      account_id: accountId,
      to_account_id: kind === 'transferencia' ? toAccountId : null,
      category_id: kind === 'transferencia' ? null : categoryId,
      note,
    };
    if (isDeferred) {
      if (!Number.isInteger(n) || n < 2 || n > 120) return toast('Indica en cuántas cuotas lo pagas (2 o más)');
      if (!Number.isFinite(r) || r < 0 || r > 100) return toast('El interés no es válido');
      const pay = installment.trim() ? parseCents(installment) : null;
      if (installment.trim() && (!pay || pay <= 0)) return toast('La cuota no es válida');
      const plan = { term_months: n, annual_rate: r, payment: pay, first_payment: cycles![firstCycle], name: note.trim() || null };
      return run(
        () =>
          tx
            ? api.post(`/transactions/${tx.id}/defer`, plan)
            : api.post('/loans', {
                ...plan,
                name: plan.name || categories.find((c) => c.id === categoryId)?.name || 'Compra aplazada',
                lender: card!.name,
                principal: cents,
                account_id: card!.id,
                category_id: categoryId,
                auto_register: true,
                notes: `Compra aplazada del ${date}`,
              }),
        'Compra aplazada: la tienes en Deudas',
      );
    }
    run(() => (tx ? api.put(`/transactions/${tx.id}`, body) : api.post('/transactions', body)), tx ? 'Movimiento actualizado' : 'Movimiento añadido');
  };

  const changeKind = (k: Kind) => {
    setKind(k);
    if (boot.categories.find((c) => c.id === categoryId)?.kind !== k) setCategoryId(null);
  };

  return (
    <Sheet title={tx ? 'Editar movimiento' : 'Nuevo movimiento'} onClose={onClose}>
      <form onSubmit={submit}>
        <Segmented<Kind>
          value={kind}
          onChange={changeKind}
          options={[
            ['gasto', 'Gasto'],
            ['ingreso', 'Ingreso'],
            ['transferencia', 'Transferencia'],
          ]}
        />
        <div class={`amount-input ${kind}`}>
          <input
            inputMode="decimal"
            placeholder="0,00"
            value={amount}
            onInput={(e) => setAmount(inputValue(e))}
            aria-label="Importe"
            autoFocus={!tx}
          />
          <span>€</span>
        </div>

        {kind !== 'transferencia' && (
          <div class="field">
            <span class="field-label">Categoría</span>
            <div class="chips">
              {categories.map((c) => (
                <button type="button" class={`chip ${c.id === categoryId ? 'on' : ''}`} style={{ '--chip': c.color ?? 'var(--accent)' }} onClick={() => setCategoryId(c.id)}>
                  <span aria-hidden="true">{c.icon}</span> {c.name}
                </button>
              ))}
            </div>
          </div>
        )}

        <div class="row">
          <Field label={kind === 'transferencia' ? 'Desde' : 'Cuenta'}>
            <select
              value={accountId}
              onChange={(e) => {
                const id = Number(inputValue(e));
                setAccountId(id);
                if (id === toAccountId) setToAccountId(accounts.find((a) => a.id !== id)?.id ?? null);
              }}
            >
              {accounts.map((a) => (
                <option value={a.id}>
                  {a.type === 'tarjeta' ? '💳 ' : ''}
                  {a.name}
                </option>
              ))}
            </select>
          </Field>
          {kind === 'transferencia' && (
            <Field label="Hacia">
              <select value={toAccountId ?? ''} onChange={(e) => setToAccountId(Number(inputValue(e)))}>
                {accounts
                  .filter((a) => a.id !== accountId)
                  .map((a) => (
                    <option value={a.id}>{a.name}</option>
                  ))}
              </select>
            </Field>
          )}
        </div>
        <div class="row">
          <Field label="Fecha">
            <input type="date" required value={date} onInput={(e) => setDate(inputValue(e))} />
          </Field>
        </div>
        <Field label="Nota">
          <input value={note} maxLength={200} placeholder="Opcional" onInput={(e) => setNote(inputValue(e))} />
        </Field>
        {canDefer && (
          <Toggle
            label="Pago aplazado"
            hint={isDeferred ? 'Se paga en cuotas que se suman cada mes al cargo de la tarjeta.' : 'Compra con tarjeta: se paga entera cuando se cobre la tarjeta.'}
            checked={deferred}
            onChange={setDeferred}
          />
        )}
        {isDeferred && (
          <>
            <div class="row">
              <Field label="Nº de cuotas">
                <input inputMode="numeric" placeholder="6" value={term} onInput={(e) => setTerm(inputValue(e))} />
              </Field>
              <Field label="Interés TIN (%)">
                <input inputMode="decimal" placeholder="0" value={rate} onInput={(e) => setRate(inputValue(e))} />
              </Field>
            </div>
            <Field label="Cuota mensual (€)" hint={computed ? `Calculada: ${eur(computed)}. Cámbiala si tu banco indica otra.` : 'Se calcula con el importe, las cuotas y el interés.'}>
              <input inputMode="decimal" placeholder={computed ? centsToInput(computed) : 'Automática'} value={installment} onInput={(e) => setInstallment(inputValue(e))} />
            </Field>
            <Field label="Primera cuota">
              <select value={firstCycle} onChange={(e) => setFirstCycle(inputValue(e) as 'este' | 'siguiente')}>
                <option value="este">En el cargo del {dateLabel(chargeDateFor(card!, cycles!.este))}</option>
                <option value="siguiente">En el cargo del {dateLabel(chargeDateFor(card!, cycles!.siguiente))}</option>
              </select>
            </Field>
          </>
        )}
        {(tx?.recurring_id || tx?.loan_id || tx?.card_cycle) && (
          <p class="muted small">
            Apuntado automáticamente ({tx.card_cycle ? 'cargo de la tarjeta' : tx.loan_id ? 'cuota de financiación' : 'movimiento recurrente'}).
          </p>
        )}
        <FormActions saving={saving} onDelete={tx ? () => run(() => api.del(`/transactions/${tx.id}`), 'Movimiento borrado') : undefined} />
      </form>
    </Sheet>
  );
}
