import { useState } from 'preact/hooks';
import { frenchPayment } from '../../shared/finance';
import { api, type Loan } from '../api';
import { Field, FormActions, inputValue, Sheet, Toggle } from '../components';
import { centsToInput, eur, parseCents } from '../format';
import { useStore } from '../store';
import { useSubmit } from './useSubmit';

export function LoanForm({ loan, onClose }: { loan?: Loan; onClose: () => void }) {
  const { boot, toast } = useStore();
  const accounts = boot.accounts.filter((a) => !a.archived || a.id === loan?.account_id);
  const expenseCats = boot.categories.filter((c) => c.kind === 'gasto' && (!c.archived || c.id === loan?.category_id));
  const defaultCat = expenseCats.find((c) => c.name === 'Financiaciones')?.id ?? expenseCats[0]?.id ?? null;

  const [name, setName] = useState(loan?.name ?? '');
  const [lender, setLender] = useState(loan?.lender ?? '');
  const [principal, setPrincipal] = useState(centsToInput(loan?.principal));
  const [rate, setRate] = useState(loan ? String(loan.annual_rate).replace('.', ',') : '');
  const [term, setTerm] = useState(loan ? String(loan.term_months) : '');
  const [firstPayment, setFirstPayment] = useState(loan?.first_payment ?? boot.today);
  const [payment, setPayment] = useState(centsToInput(loan?.payment));
  const [accountId, setAccountId] = useState<number | null>(loan?.account_id ?? accounts[0]?.id ?? null);
  const [categoryId, setCategoryId] = useState<number | null>(loan?.category_id ?? defaultCat);
  const [auto, setAuto] = useState(loan ? !!loan.auto_register : true);
  const [notes, setNotes] = useState(loan?.notes ?? '');
  const [closed, setClosed] = useState(!!loan?.closed);
  const [saving, run] = useSubmit(onClose);

  const p = parseCents(principal);
  const r = Number(rate.replace(',', '.') || 0);
  const n = Number(term);
  const computed = p && p > 0 && n > 0 && r >= 0 ? frenchPayment(p, r, n) : null;

  const submit = (e: Event) => {
    e.preventDefault();
    if (!p || p <= 0) return toast('Introduce el importe financiado');
    if (!Number.isFinite(r) || r < 0 || r > 100) return toast('El TIN no es válido');
    if (!Number.isInteger(n) || n <= 0) return toast('Introduce el plazo en meses');
    const pay = payment.trim() ? parseCents(payment) : null;
    if (payment.trim() && (!pay || pay <= 0)) return toast('La cuota no es válida');
    if (auto && !accountId) return toast('Elige la cuenta donde se cobra la cuota');
    const body = {
      name,
      lender,
      principal: p,
      annual_rate: r,
      term_months: n,
      first_payment: firstPayment,
      payment: pay,
      account_id: accountId,
      category_id: categoryId,
      auto_register: auto,
      notes,
      closed,
    };
    run(() => (loan ? api.put(`/loans/${loan.id}`, body) : api.post('/loans', body)), loan ? 'Financiación actualizada' : 'Financiación añadida');
  };

  return (
    <Sheet title={loan ? 'Editar financiación' : 'Nueva financiación'} onClose={onClose}>
      <form onSubmit={submit}>
        <Field label="Nombre">
          <input required maxLength={60} placeholder="Coche, móvil, hipoteca…" value={name} onInput={(e) => setName(inputValue(e))} />
        </Field>
        <Field label="Entidad">
          <input maxLength={60} placeholder="Opcional" value={lender} onInput={(e) => setLender(inputValue(e))} />
        </Field>
        <div class="row">
          <Field label="Importe financiado (€)">
            <input inputMode="decimal" required placeholder="12.000" value={principal} onInput={(e) => setPrincipal(inputValue(e))} />
          </Field>
          <Field label="TIN (%)">
            <input inputMode="decimal" placeholder="0" value={rate} onInput={(e) => setRate(inputValue(e))} />
          </Field>
        </div>
        <div class="row">
          <Field label="Plazo (meses)">
            <input inputMode="numeric" required placeholder="48" value={term} onInput={(e) => setTerm(inputValue(e))} />
          </Field>
          <Field label="Primera cuota">
            <input type="date" required value={firstPayment} onInput={(e) => setFirstPayment(inputValue(e))} />
          </Field>
        </div>
        <Field label="Cuota mensual (€)" hint={computed ? `Calculada: ${eur(computed)}. Rellénala solo si tu contrato indica otra.` : 'Se calcula con el importe, TIN y plazo.'}>
          <input inputMode="decimal" placeholder={computed ? centsToInput(computed) : 'Automática'} value={payment} onInput={(e) => setPayment(inputValue(e))} />
        </Field>
        <div class="row">
          <Field label="Se cobra en">
            <select value={accountId ?? ''} onChange={(e) => setAccountId(Number(inputValue(e)) || null)}>
              <option value="">—</option>
              {accounts.map((a) => (
                <option value={a.id}>
                  {a.type === 'tarjeta' ? '💳 ' : ''}
                  {a.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Categoría">
            <select value={categoryId ?? ''} onChange={(e) => setCategoryId(Number(inputValue(e)) || null)}>
              <option value="">—</option>
              {expenseCats.map((c) => (
                <option value={c.id}>
                  {c.icon} {c.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
        {accounts.find((a) => a.id === accountId)?.type === 'tarjeta' && (
          <p class="notes small">
            💳 Pago aplazado con tarjeta: cada cuota se sumará al cargo de la tarjeta. Como fecha de primera cuota pon el <strong>día de corte</strong> del ciclo en que se cargó la primera (por ejemplo, 31/10 si te la cobraron el 5/11).
          </p>
        )}
        <Toggle label="Apuntar la cuota automáticamente" hint="Cada mes se añade como gasto el día de la cuota (desde hoy en adelante)." checked={auto} onChange={setAuto} />
        <Field label="Notas">
          <textarea rows={2} maxLength={500} value={notes} onInput={(e) => setNotes(inputValue(e))} />
        </Field>
        {loan && <Toggle label="Liquidada / cancelada" hint="Márcala si la has terminado de pagar o la has amortizado entera." checked={closed} onChange={setClosed} />}
        <FormActions saving={saving} onDelete={loan ? () => run(() => api.del(`/loans/${loan.id}`), 'Financiación borrada') : undefined} />
      </form>
    </Sheet>
  );
}
