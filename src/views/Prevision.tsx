import { useState } from 'preact/hooks';
import { addDays, dateInMonth } from '../../shared/finance';
import { effectOn } from '../../shared/forecast';
import type { Boot, ForecastItem } from '../api';
import { Money } from '../components';
import { dateLabel } from '../format';
import { OccurrenceForm } from '../forms/OccurrenceForm';
import { useStore } from '../store';

const SOURCE_LABEL: Record<ForecastItem['source'], string> = {
  recurrente: 'Recurrente',
  cuota: 'Cuota',
  retencion: 'Retención',
  tarjeta: 'Cargo de tarjeta',
  programado: 'Programado',
};

/** Cuentas que cuentan como dinero disponible (todas menos las tarjetas). */
export const liquidIds = (boot: Boot) => boot.accounts.filter((a) => a.type !== 'tarjeta' && !a.archived).map((a) => a.id);

/** Cuánto cambia el dinero disponible con un movimiento previsto (las compras con tarjeta no, hasta que se cobran). */
export const liquidEffect = (ids: number[], i: ForecastItem) => ids.reduce((s, id) => s + effectOn(id, { ...i, account_id: i.account_id ?? -1 }), 0);

export const monthEnd = (month: string) => {
  const [y, m] = month.split('-').map(Number);
  return dateInMonth(y, m, 31);
};

/** Totales previstos de un mes y saldo disponible al empezar y al acabar. */
export function monthForecast(boot: Boot, items: ForecastItem[], month: string) {
  const ids = liquidIds(boot);
  const now = boot.accounts.filter((a) => ids.includes(a.id)).reduce((s, a) => s + a.balance, 0);
  const start = `${month}-01`;
  const end = monthEnd(month);
  let before = 0;
  let income = 0;
  let out = 0;
  const inMonth: ForecastItem[] = [];
  for (const i of items) {
    const e = liquidEffect(ids, i);
    if (i.date < start) before += e;
    else if (i.date <= end) {
      inMonth.push(i);
      if (e > 0) income += e;
      else out -= e;
    }
  }
  const startBalance = now + before;
  return { items: inMonth, income, out, startBalance, endBalance: startBalance + income - out };
}

export function ForecastList({ items, limit }: { items: ForecastItem[]; limit?: string }) {
  const { boot, account, category } = useStore();
  const ids = liquidIds(boot);
  const shown = limit ? items.filter((i) => i.date <= limit) : items;
  const [editing, setEditing] = useState<ForecastItem | null>(null);
  return (
    <>
    <ul class="rows">
      {shown.map((i) => {
        const c = category(i.category_id);
        const onCard = account(i.account_id)?.type === 'tarjeta';
        const icon = i.source === 'tarjeta' ? '💳' : i.source === 'retencion' ? '⏳' : i.source === 'cuota' ? '🏦' : (c?.icon ?? '🔁');
        const title = i.label || c?.name || SOURCE_LABEL[i.source];
        const sub =
          i.source === 'tarjeta'
            ? `Compras hasta el ${dateLabel(i.card_cycle!)} · desde ${account(i.account_id)?.name ?? '?'}`
            : [SOURCE_LABEL[i.source], onCard ? `con ${account(i.account_id)?.name}, se paga al cobrar la tarjeta` : account(i.account_id)?.name].filter(Boolean).join(' · ');
        const sign = i.kind === 'transferencia' ? (liquidEffect(ids, i) < 0 ? 'gasto' : undefined) : i.kind;
        const content = (
          <>
            <span class="tx-icon" style={{ '--chip': c?.color ?? 'var(--accent)' }}>
              {icon}
            </span>
            <span class="tx-main">
              <span class="tx-title">
                {title}
                {i.modified && <span class="tag">cambiado</span>}
              </span>
              <span class="tx-sub">
                {dateLabel(i.date)} · {sub}
              </span>
            </span>
            <Money cents={i.amount} sign={sign} />
          </>
        );
        // Los cobros de recurrentes se pueden cambiar uno a uno.
        return (
          <li class={onCard ? 'on-card' : ''}>
            {i.recurring_id ? (
              <button class="tx forecast" onClick={() => setEditing(i)}>
                {content}
              </button>
            ) : (
              <div class="tx forecast">{content}</div>
            )}
          </li>
        );
      })}
    </ul>
    {editing && <OccurrenceForm item={editing} onClose={() => setEditing(null)} />}
    </>
  );
}

export const plus30 = (today: string) => addDays(today, 30);
