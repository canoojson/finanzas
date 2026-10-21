// Ciclos de tarjeta de crédito y previsión de movimientos futuros.
import { addDays, dateInMonth, schedule, type Loan } from './finance';
import { doneByRecurring, occurrences, type Override } from './recurrence';

export interface CardAccount {
  id: number;
  name: string;
  type: string;
  initial_balance: number;
  card_cutoff_day: number | null;
  card_charge_day: number | null;
  card_pay_account_id: number | null;
  card_settle_from: string | null;
}

export interface Movement {
  kind: 'gasto' | 'ingreso' | 'transferencia';
  amount: number;
  date: string;
  account_id: number;
  to_account_id: number | null;
  card_cycle: string | null;
}

export const isConfiguredCard = (a: CardAccount) =>
  a.type === 'tarjeta' && !!a.card_cutoff_day && !!a.card_charge_day && !!a.card_pay_account_id;

const ym = (iso: string) => {
  const [y, m] = iso.split('-').map(Number);
  return y * 12 + m - 1;
};
const fromYm = (t: number, day: number) => dateInMonth(Math.floor(t / 12), (t % 12) + 1, day);

/** Fechas de cargo de la tarjeta en (after, until], con el fin del ciclo que liquida cada una. */
export function chargeDates(card: CardAccount, after: string, until: string) {
  const out: { date: string; cycleEnd: string; cycleStart: string }[] = [];
  for (let t = ym(after); t <= ym(until); t++) {
    const date = fromYm(t, card.card_charge_day!);
    if (date <= after || date > until) continue;
    out.push({ date, cycleEnd: fromYm(t - 1, card.card_cutoff_day!), cycleStart: addDays(fromYm(t - 2, card.card_cutoff_day!), 1) });
  }
  return out;
}

/** Fin del ciclo de la tarjeta en el que entra una compra hecha en `date`. */
export function cycleEndFor(card: CardAccount, date: string) {
  const t = ym(date);
  const end = fromYm(t, card.card_cutoff_day!);
  return date <= end ? end : fromYm(t + 1, card.card_cutoff_day!);
}

/** Fin del ciclo siguiente a `cycleEnd`. */
export const nextCycleEnd = (card: CardAccount, cycleEnd: string) => fromYm(ym(cycleEnd) + 1, card.card_cutoff_day!);

/** Día en que se cobra el ciclo que termina en `cycleEnd`. */
export const chargeDateFor = (card: CardAccount, cycleEnd: string) => fromYm(ym(cycleEnd) + 1, card.card_charge_day!);

/** Efecto de un movimiento sobre el saldo de una cuenta. */
export function effectOn(accountId: number, m: Pick<Movement, 'kind' | 'amount' | 'account_id' | 'to_account_id'>) {
  if (m.kind === 'transferencia') return m.account_id === accountId ? -m.amount : m.to_account_id === accountId ? m.amount : 0;
  if (m.account_id !== accountId) return 0;
  return m.kind === 'ingreso' ? m.amount : -m.amount;
}

/**
 * Importe a cobrar por el ciclo que termina en `cycleEnd`: la deuda de la tarjeta a esa fecha,
 * contando los cargos de ciclos anteriores aunque se cobren después del corte.
 */
export function statementAmount(card: CardAccount, cycleEnd: string, movements: Movement[]) {
  let balance = card.initial_balance;
  for (const m of movements) {
    if (m.card_cycle) {
      if (m.to_account_id === card.id && m.card_cycle < cycleEnd) balance += m.amount;
    } else if (m.date <= cycleEnd) {
      balance += effectOn(card.id, m);
    }
  }
  return Math.max(0, -balance);
}

// --- Previsión -------------------------------------------------------------------------

export type ForecastSource = 'recurrente' | 'cuota' | 'retencion' | 'tarjeta' | 'programado';

export interface ForecastItem {
  date: string;
  kind: 'gasto' | 'ingreso' | 'transferencia';
  source: ForecastSource;
  label: string;
  amount: number;
  account_id: number | null;
  to_account_id: number | null;
  category_id: number | null;
  card_cycle: string | null;
  // Solo en cobros de recurrentes: para poder cambiar ese cobro concreto.
  recurring_id?: number;
  occurrence?: string;
  modified?: boolean;
}

export interface ForecastInput {
  today: string;
  until: string;
  accounts: (CardAccount & { balance: number })[];
  recurring: { id: number; kind: 'gasto' | 'ingreso'; amount: number; account_id: number; category_id: number | null; note: string | null; day: number; start_date: string; end_date: string | null; last_run: string | null; active: number }[];
  overrides: Override[];
  /** Cobros de recurrentes ya apuntados (por su fecha programada). */
  done: { recurring_id: number; occurrence: string | null }[];
  loans: Loan[];
  holds: { account_id: number; concept: string; amount: number; charge_date: string | null; status: string }[];
  /** Movimientos con fecha futura, y todos los de las tarjetas (para calcular sus extractos). */
  movements: (Movement & { note: string | null; category_id: number | null })[];
}

/** Todo lo que se espera que ocurra en (today, until] y el saldo previsto de cada cuenta en `until`. */
export function forecast({ today, until, accounts, recurring, loans, holds, movements, overrides, done }: ForecastInput) {
  const items: ForecastItem[] = [];
  const tomorrow = addDays(today, 1);

  for (const m of movements)
    if (m.date > today && m.date <= until && !m.card_cycle)
      items.push({ ...m, source: 'programado', label: m.note ?? '', category_id: m.category_id });

  const doneFor = doneByRecurring(done);
  for (const r of recurring) {
    if (!r.active) continue;
    for (const o of occurrences(r, overrides, doneFor(r.id), until))
      if (!o.done && !o.skip && o.date > today && o.date <= until)
        items.push({
          date: o.date,
          kind: r.kind,
          source: 'recurrente',
          label: r.note ?? '',
          amount: o.amount,
          account_id: r.account_id,
          to_account_id: null,
          category_id: r.category_id,
          card_cycle: null,
          recurring_id: r.id,
          occurrence: o.scheduled,
          modified: o.modified,
        });
  }

  for (const l of loans) {
    if (l.closed) continue;
    for (const row of schedule(l))
      if (row.date > today && row.date <= until && (!l.last_run || row.date > l.last_run))
        items.push({ date: row.date, kind: 'gasto', source: 'cuota', label: `Cuota ${row.n} · ${l.name}`, amount: row.payment, account_id: l.account_id, to_account_id: null, category_id: l.category_id, card_cycle: null });
  }

  for (const h of holds) {
    if (h.status !== 'pendiente' || !h.charge_date) continue;
    const date = h.charge_date > today ? h.charge_date : tomorrow; // vencida: se espera en cualquier momento
    if (date <= until)
      items.push({ date, kind: 'gasto', source: 'retencion', label: h.concept, amount: h.amount, account_id: h.account_id, to_account_id: null, category_id: null, card_cycle: null });
  }

  // Cargos de tarjeta: el extracto incluye lo ya gastado y lo previsto en la tarjeta hasta el corte.
  const settlements: ForecastItem[] = [];
  for (const card of accounts.filter(isConfiguredCard)) {
    const past = movements.filter((m) => m.date <= today || m.card_cycle);
    for (const c of chargeDates(card, today, until)) {
      const projected = [...items, ...settlements].map((i) => ({ ...i, account_id: i.account_id ?? -1 }));
      const amount = statementAmount(card, c.cycleEnd, [...past, ...projected]);
      if (amount > 0)
        settlements.push({
          date: c.date,
          kind: 'transferencia',
          source: 'tarjeta',
          label: `Cargo ${card.name}`,
          amount,
          account_id: card.card_pay_account_id,
          to_account_id: card.id,
          category_id: null,
          card_cycle: c.cycleEnd,
        });
    }
  }
  items.push(...settlements);
  items.sort((a, b) => a.date.localeCompare(b.date) || a.source.localeCompare(b.source));

  const balances = new Map(accounts.map((a) => [a.id, a.balance]));
  for (const i of items)
    for (const id of [i.account_id, i.to_account_id])
      if (id != null && balances.has(id)) balances.set(id, balances.get(id)! + effectOn(id, { ...i, account_id: i.account_id ?? -1 }));

  return { items, balances };
}
