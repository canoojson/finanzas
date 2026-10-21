import { useState } from 'preact/hooks';
import { api, type Account, type Category, type Goal, type Recurring } from '../api';
import { Field, FormActions, inputValue, Segmented, Sheet, Toggle } from '../components';
import { ACCOUNT_TYPES, centsToInput, parseCents, PALETTE } from '../format';
import { useStore } from '../store';
import { useSubmit } from './useSubmit';

function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div class="field">
      <span class="field-label">Color</span>
      <div class="swatches">
        {PALETTE.map((c) => (
          <button type="button" class={`swatch ${c === value ? 'on' : ''}`} style={{ background: c }} aria-label={c} aria-pressed={c === value} onClick={() => onChange(c)} />
        ))}
      </div>
    </div>
  );
}

// --- Cuenta ---------------------------------------------------------------------

export function AccountForm({ account, onClose }: { account?: Account; onClose: () => void }) {
  const { boot, toast } = useStore();
  const [name, setName] = useState(account?.name ?? '');
  const [type, setType] = useState<Account['type']>(account?.type ?? 'corriente');
  // En las tarjetas se escribe la deuda en positivo; internamente el saldo es negativo.
  const sign = (t: string) => (t === 'tarjeta' ? -1 : 1);
  const [current, setCurrent] = useState(centsToInput(account ? account.balance * sign(account.type) : 0));
  const [color, setColor] = useState(account?.color ?? PALETTE[0]);
  const [archived, setArchived] = useState(!!account?.archived);
  const payAccounts = boot.accounts.filter((a) => a.type !== 'tarjeta' && !a.archived && a.id !== account?.id);
  const [cutoff, setCutoff] = useState(account?.card_cutoff_day ?? 31);
  const [chargeDay, setChargeDay] = useState(account?.card_charge_day ?? 1);
  const [payId, setPayId] = useState<number | null>(account?.card_pay_account_id ?? payAccounts[0]?.id ?? null);
  const [saving, run] = useSubmit(onClose);
  const isCard = type === 'tarjeta';

  const submit = (e: Event) => {
    e.preventDefault();
    const typed = current.trim() ? parseCents(current) : 0;
    if (typed === null) return toast('El importe no es válido');
    if (isCard && !payId) return toast('Elige la cuenta en la que se carga la tarjeta');
    const cents = typed * sign(type);
    const body = {
      name,
      type,
      color,
      archived,
      ...(isCard ? { card_cutoff_day: cutoff, card_charge_day: chargeDay, card_pay_account_id: payId } : {}),
    };
    run(async () => {
      if (!account) return api.post('/accounts', { ...body, initial_balance: cents });
      await api.put(`/accounts/${account.id}`, body);
      if (cents !== account.balance) await api.put(`/accounts/${account.id}/balance`, { balance: cents });
    }, account ? 'Cuenta actualizada' : 'Cuenta creada');
  };

  const days = Array.from({ length: 31 }, (_, i) => i + 1);

  return (
    <Sheet title={account ? 'Editar cuenta' : 'Nueva cuenta'} onClose={onClose}>
      <form onSubmit={submit}>
        <Field label="Nombre">
          <input required maxLength={60} placeholder={isCard ? 'Visa Santander…' : 'BBVA, efectivo, Revolut…'} value={name} onInput={(e) => setName(inputValue(e))} />
        </Field>
        <Field label="Tipo">
          <select value={type} onChange={(e) => setType(inputValue(e) as Account['type'])}>
            {Object.entries(ACCOUNT_TYPES).map(([k, v]) => (
              <option value={k}>{v}</option>
            ))}
          </select>
        </Field>
        {isCard ? (
          <>
            <Field label="Pendiente de cobrar (€)" hint="Lo que llevas gastado con la tarjeta y aún no te han cobrado. Pon 0 si te la acaban de cobrar.">
              <input inputMode="decimal" value={current} onInput={(e) => setCurrent(inputValue(e))} />
            </Field>
            <div class="row">
              <Field label="Día de corte" hint="Último día de cada ciclo.">
                <select value={cutoff} onChange={(e) => setCutoff(Number(inputValue(e)))}>
                  {days.map((d) => (
                    <option value={d}>{d === 31 ? 'Fin de mes' : `Día ${d}`}</option>
                  ))}
                </select>
              </Field>
              <Field label="Se cobra el" hint="Del mes siguiente.">
                <select value={chargeDay} onChange={(e) => setChargeDay(Number(inputValue(e)))}>
                  {days.map((d) => (
                    <option value={d}>{d === 31 ? 'Último día' : `Día ${d}`}</option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="Se carga en" hint="El día de cobro, la app apunta sola el cargo desde esta cuenta.">
              <select value={payId ?? ''} onChange={(e) => setPayId(Number(inputValue(e)) || null)}>
                {!payAccounts.length && <option value="">Crea antes una cuenta corriente</option>}
                {payAccounts.map((a) => (
                  <option value={a.id}>{a.name}</option>
                ))}
              </select>
            </Field>
          </>
        ) : (
          <Field
            label="Saldo actual (€)"
            hint={
              account
                ? 'Escribe lo que marca ahora tu banco. La app ajusta la diferencia sin crear movimientos, así que no altera los gastos e ingresos del mes.'
                : 'Lo que tiene ahora la cuenta. A partir de aquí, los movimientos que apuntes lo irán actualizando.'
            }
          >
            <input inputMode="decimal" value={current} onInput={(e) => setCurrent(inputValue(e))} />
          </Field>
        )}
        <ColorPicker value={color} onChange={setColor} />
        {account && <Toggle label="Archivada" hint="Se oculta de los formularios pero conserva su historial." checked={archived} onChange={setArchived} />}
        <FormActions saving={saving} onDelete={account ? () => run(() => api.del(`/accounts/${account.id}`), 'Cuenta borrada') : undefined} />
      </form>
    </Sheet>
  );
}

// --- Categoría ------------------------------------------------------------------

export function CategoryForm({ category, onClose }: { category?: Category; onClose: () => void }) {
  const [name, setName] = useState(category?.name ?? '');
  const [kind, setKind] = useState<Category['kind']>(category?.kind ?? 'gasto');
  const [icon, setIcon] = useState(category?.icon ?? '');
  const [color, setColor] = useState(category?.color ?? PALETTE[0]);
  const [archived, setArchived] = useState(!!category?.archived);
  const [saving, run] = useSubmit(onClose);

  const submit = (e: Event) => {
    e.preventDefault();
    const body = { name, kind, icon, color, archived };
    run(() => (category ? api.put(`/categories/${category.id}`, body) : api.post('/categories', body)), category ? 'Categoría actualizada' : 'Categoría creada');
  };

  return (
    <Sheet title={category ? 'Editar categoría' : 'Nueva categoría'} onClose={onClose}>
      <form onSubmit={submit}>
        <Segmented<Category['kind']>
          value={kind}
          onChange={setKind}
          options={[
            ['gasto', 'Gasto'],
            ['ingreso', 'Ingreso'],
          ]}
        />
        <div class="row">
          <Field label="Emoji">
            <input class="emoji-input" maxLength={8} placeholder="🛒" value={icon} onInput={(e) => setIcon(inputValue(e))} />
          </Field>
          <Field label="Nombre">
            <input required maxLength={40} value={name} onInput={(e) => setName(inputValue(e))} />
          </Field>
        </div>
        <ColorPicker value={color} onChange={setColor} />
        {category && <Toggle label="Archivada" hint="Deja de aparecer al apuntar movimientos." checked={archived} onChange={setArchived} />}
        <FormActions saving={saving} onDelete={category ? () => run(() => api.del(`/categories/${category.id}`), 'Categoría borrada') : undefined} />
      </form>
    </Sheet>
  );
}

// --- Objetivo de ahorro ---------------------------------------------------------

export function GoalForm({ goal, onClose }: { goal?: Goal; onClose: () => void }) {
  const { boot, toast } = useStore();
  const accounts = boot.accounts.filter((a) => !a.archived || a.id === goal?.account_id);
  const [name, setName] = useState(goal?.name ?? '');
  const [target, setTarget] = useState(centsToInput(goal?.target));
  const [accountId, setAccountId] = useState<number | null>(goal?.account_id ?? null);
  const [saved, setSaved] = useState(centsToInput(goal?.saved ?? 0));
  const [add, setAdd] = useState('');
  const [deadline, setDeadline] = useState(goal?.deadline ?? '');
  const [color, setColor] = useState(goal?.color ?? PALETTE[1]);
  const [saving, run] = useSubmit(onClose);

  const submit = (e: Event) => {
    e.preventDefault();
    const t = parseCents(target);
    if (!t || t <= 0) return toast('Introduce el objetivo');
    let s = saved.trim() ? parseCents(saved) : 0;
    const extra = add.trim() ? parseCents(add) : 0;
    if (s === null || extra === null) return toast('El importe ahorrado no es válido');
    s += extra;
    const body = { name, target: t, account_id: accountId, saved: s, deadline: deadline || null, color };
    run(() => (goal ? api.put(`/goals/${goal.id}`, body) : api.post('/goals', body)), goal ? 'Objetivo actualizado' : 'Objetivo creado');
  };

  return (
    <Sheet title={goal ? 'Editar objetivo' : 'Nuevo objetivo'} onClose={onClose}>
      <form onSubmit={submit}>
        <Field label="Nombre">
          <input required maxLength={60} placeholder="Viaje, fondo de emergencia…" value={name} onInput={(e) => setName(inputValue(e))} />
        </Field>
        <div class="row">
          <Field label="Objetivo (€)">
            <input inputMode="decimal" required value={target} onInput={(e) => setTarget(inputValue(e))} />
          </Field>
          <Field label="Fecha límite">
            <input type="date" value={deadline} onInput={(e) => setDeadline(inputValue(e))} />
          </Field>
        </div>
        <Field label="Progreso" hint={accountId ? 'El progreso es el saldo de la cuenta elegida.' : 'Sin cuenta vinculada, apuntas tú lo que vas ahorrando.'}>
          <select value={accountId ?? ''} onChange={(e) => setAccountId(Number(inputValue(e)) || null)}>
            <option value="">Manual</option>
            {accounts.map((a) => (
              <option value={a.id}>Saldo de {a.name}</option>
            ))}
          </select>
        </Field>
        {!accountId && (
          <div class="row">
            <Field label="Ahorrado (€)">
              <input inputMode="decimal" value={saved} onInput={(e) => setSaved(inputValue(e))} />
            </Field>
            {goal && (
              <Field label="Añadir aportación (€)">
                <input inputMode="decimal" placeholder="+0,00" value={add} onInput={(e) => setAdd(inputValue(e))} />
              </Field>
            )}
          </div>
        )}
        <ColorPicker value={color} onChange={setColor} />
        <FormActions saving={saving} onDelete={goal ? () => run(() => api.del(`/goals/${goal.id}`), 'Objetivo borrado') : undefined} />
      </form>
    </Sheet>
  );
}

// --- Recurrente -----------------------------------------------------------------

export function RecurringForm({ item, onClose }: { item?: Recurring; onClose: () => void }) {
  const { boot, toast } = useStore();
  const accounts = boot.accounts.filter((a) => !a.archived || a.id === item?.account_id);
  const [kind, setKind] = useState<Recurring['kind']>(item?.kind ?? 'gasto');
  const [amount, setAmount] = useState(centsToInput(item?.amount));
  const [categoryId, setCategoryId] = useState<number | null>(item?.category_id ?? null);
  const [accountId, setAccountId] = useState(item?.account_id ?? accounts[0]?.id);
  const [note, setNote] = useState(item?.note ?? '');
  const [day, setDay] = useState(String(item?.day ?? Number(boot.today.slice(8))));
  const [start, setStart] = useState(item?.start_date ?? boot.today);
  const [end, setEnd] = useState(item?.end_date ?? '');
  const [active, setActive] = useState(item ? !!item.active : true);
  const [saving, run] = useSubmit(onClose);
  const categories = boot.categories.filter((c) => c.kind === kind && (!c.archived || c.id === item?.category_id));

  const submit = (e: Event) => {
    e.preventDefault();
    const cents = parseCents(amount);
    if (!cents || cents <= 0) return toast('Introduce un importe válido');
    const d = Number(day);
    if (!Number.isInteger(d) || d < 1 || d > 31) return toast('El día debe estar entre 1 y 31');
    const body = { kind, amount: cents, category_id: categoryId, account_id: accountId, note, day: d, start_date: start, end_date: end || null, active };
    run(() => (item ? api.put(`/recurring/${item.id}`, body) : api.post('/recurring', body)), item ? 'Recurrente actualizado' : 'Recurrente creado');
  };

  return (
    <Sheet title={item ? 'Editar recurrente' : 'Nuevo recurrente'} onClose={onClose}>
      <form onSubmit={submit}>
        <Segmented<Recurring['kind']>
          value={kind}
          onChange={(k) => {
            setKind(k);
            setCategoryId(null);
          }}
          options={[
            ['gasto', 'Gasto'],
            ['ingreso', 'Ingreso'],
          ]}
        />
        <div class="row">
          <Field label="Importe (€)">
            <input inputMode="decimal" required value={amount} onInput={(e) => setAmount(inputValue(e))} />
          </Field>
          <Field label="Día del mes">
            <input inputMode="numeric" required value={day} onInput={(e) => setDay(inputValue(e))} />
          </Field>
        </div>
        <Field label="Concepto">
          <input maxLength={120} placeholder="Alquiler, Netflix, nómina…" value={note} onInput={(e) => setNote(inputValue(e))} />
        </Field>
        <div class="row">
          <Field label="Categoría">
            <select value={categoryId ?? ''} onChange={(e) => setCategoryId(Number(inputValue(e)) || null)}>
              <option value="">—</option>
              {categories.map((c) => (
                <option value={c.id}>
                  {c.icon} {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Cuenta">
            <select value={accountId} onChange={(e) => setAccountId(Number(inputValue(e)))}>
              {accounts.map((a) => (
                <option value={a.id}>{a.name}</option>
              ))}
            </select>
          </Field>
        </div>
        <div class="row">
          <Field label="Desde">
            <input type="date" required value={start} onInput={(e) => setStart(inputValue(e))} />
          </Field>
          <Field label="Hasta">
            <input type="date" value={end} onInput={(e) => setEnd(inputValue(e))} />
          </Field>
        </div>
        <p class="muted small">
          Se apunta solo cada mes en el día indicado (si el mes es más corto, el último día). Si la fecha de inicio ya pasó, no se apuntan las veces anteriores a hoy.
        </p>
        {item && <Toggle label="Activo" checked={active} onChange={setActive} />}
        <FormActions saving={saving} onDelete={item ? () => run(() => api.del(`/recurring/${item.id}`), 'Recurrente borrado') : undefined} />
      </form>
    </Sheet>
  );
}
