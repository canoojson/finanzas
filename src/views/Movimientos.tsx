import { useEffect, useMemo, useState } from 'preact/hooks';
import { api, type Transaction } from '../api';
import { Empty, Fab, Header, Icon, inputValue, Money, MonthSwitcher } from '../components';
import { dayLabel, eur } from '../format';
import { TxForm } from '../forms/TxForm';
import { useStore } from '../store';

type Filter = 'todos' | Transaction['kind'];

export function Movimientos({ month, setMonth }: { month: string; setMonth: (m: string) => void }) {
  const { boot, account, category } = useStore();
  const [items, setItems] = useState<Transaction[] | null>(null);
  const [filter, setFilter] = useState<Filter>('todos');
  const [accountId, setAccountId] = useState<number | null>(null);
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<Transaction | 'new' | null>(null);

  useEffect(() => {
    let live = true;
    setItems(null);
    api.get<Transaction[]>(`/transactions?month=${month}`).then((r) => live && setItems(r)).catch(() => live && setItems([]));
    return () => {
      live = false;
    };
  }, [month, boot]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (items ?? []).filter((t) => {
      if (filter !== 'todos' && t.kind !== filter) return false;
      if (accountId && t.account_id !== accountId && t.to_account_id !== accountId) return false;
      if (q) {
        const text = `${t.note ?? ''} ${category(t.category_id)?.name ?? ''} ${account(t.account_id)?.name ?? ''}`.toLowerCase();
        if (!text.includes(q)) return false;
      }
      return true;
    });
  }, [items, filter, accountId, query, boot]);

  const days = useMemo(() => {
    const map = new Map<string, Transaction[]>();
    for (const t of visible) map.set(t.date, [...(map.get(t.date) ?? []), t]);
    return [...map.entries()];
  }, [visible]);

  const net = (list: Transaction[]) => list.reduce((s, t) => s + (t.kind === 'ingreso' ? t.amount : t.kind === 'gasto' ? -t.amount : 0), 0);

  return (
    <>
      <Header title="Movimientos">
        <MonthSwitcher month={month} onChange={setMonth} />
      </Header>

      <div class="filters">
        <label class="search">
          <Icon name="search" size={18} />
          <input type="search" placeholder="Buscar" value={query} onInput={(e) => setQuery(inputValue(e))} />
        </label>
        <div class="chips scroll">
          {(
            [
              ['todos', 'Todos'],
              ['gasto', 'Gastos'],
              ['ingreso', 'Ingresos'],
              ['transferencia', 'Transferencias'],
            ] as [Filter, string][]
          ).map(([k, label]) => (
            <button class={`chip ${filter === k ? 'on' : ''}`} onClick={() => setFilter(k)}>
              {label}
            </button>
          ))}
          <select class="chip-select" value={accountId ?? ''} onChange={(e) => setAccountId(Number(inputValue(e)) || null)} aria-label="Cuenta">
            <option value="">Todas las cuentas</option>
            {boot.accounts.map((a) => (
              <option value={a.id}>{a.name}</option>
            ))}
          </select>
        </div>
      </div>

      {items === null ? (
        <p class="empty">Cargando…</p>
      ) : !days.length ? (
        <Empty>{items.length ? 'Nada coincide con el filtro.' : 'Aún no hay movimientos este mes. Pulsa + para añadir el primero.'}</Empty>
      ) : (
        days.map(([date, list]) => {
          const n = net(list);
          return (
            <section class="day">
              <div class="day-head">
                <span>{dayLabel(date)}</span>
                {n !== 0 && <span class={n < 0 ? 'neg' : 'pos'}>{(n > 0 ? '+' : '') + eur(n)}</span>}
              </div>
              <ul class="rows card">
                {list.map((t) => {
                  const c = category(t.category_id);
                  const a = account(t.account_id);
                  const title = t.kind === 'transferencia' ? t.note || 'Transferencia' : t.note || c?.name || 'Sin categoría';
                  const sub =
                    t.kind === 'transferencia'
                      ? `${a?.name ?? '?'} → ${account(t.to_account_id)?.name ?? '?'}`
                      : [t.note ? c?.name : null, a?.name].filter(Boolean).join(' · ');
                  return (
                    <li>
                      <button class="tx" onClick={() => setEditing(t)}>
                        <span class="tx-icon" style={{ '--chip': c?.color ?? 'var(--muted)' }}>
                          {t.kind === 'transferencia' ? <Icon name="swap" size={18} /> : (c?.icon ?? '•')}
                        </span>
                        <span class="tx-main">
                          <span class="tx-title">
                            {title}
                            {(t.recurring_id || t.loan_id || t.card_cycle) && (
                              <span class="badge" title="Automático">
                                <Icon name="repeat" size={12} />
                              </span>
                            )}
                          </span>
                          <span class="tx-sub">{sub}</span>
                        </span>
                        <Money cents={t.amount} sign={t.kind} />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })
      )}

      <Fab label="Nuevo movimiento" onClick={() => setEditing('new')} />
      {editing && <TxForm tx={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
    </>
  );
}
