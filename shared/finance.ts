// Lógica compartida entre el Worker y el cliente.

export type Kind = 'gasto' | 'ingreso' | 'transferencia';

export interface Loan {
  id: number;
  name: string;
  lender: string | null;
  principal: number; // céntimos
  annual_rate: number; // TIN %
  term_months: number;
  first_payment: string;
  payment: number | null;
  account_id: number | null;
  category_id: number | null;
  auto_register: number;
  last_run: string | null;
  notes: string | null;
  closed: number;
}

export interface ScheduleRow {
  n: number;
  date: string;
  payment: number;
  interest: number;
  amortization: number;
  balance: number;
}

const pad = (n: number) => String(n).padStart(2, '0');

export const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

/** Fecha ISO del día `day` del mes (año, mes 1-12), ajustada al último día si no existe. */
export function dateInMonth(y: number, m: number, day: number): string {
  return `${y}-${pad(m)}-${pad(Math.min(day, daysInMonth(y, m)))}`;
}

/** Suma `k` meses a una fecha ISO manteniendo el día (ajustado a fin de mes). */
export function addMonths(iso: string, k: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const t = y * 12 + (m - 1) + k;
  return dateInMonth(Math.floor(t / 12), (t % 12) + 1, d);
}

export function addDays(iso: string, k: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + k);
  return d.toISOString().slice(0, 10);
}

export function todayISO(tz = 'Europe/Madrid'): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date());
}

/** Cuota del sistema francés (céntimos). */
export function frenchPayment(principal: number, annualRate: number, months: number): number {
  const r = annualRate / 100 / 12;
  if (r === 0) return Math.round(principal / months);
  return Math.round((principal * r) / (1 - Math.pow(1 + r, -months)));
}

export function loanPayment(l: Pick<Loan, 'principal' | 'annual_rate' | 'term_months' | 'payment'>): number {
  return l.payment ?? frenchPayment(l.principal, l.annual_rate, l.term_months);
}

/** Cuadro de amortización completo. La última cuota absorbe el redondeo. */
export function schedule(l: Loan): ScheduleRow[] {
  const r = l.annual_rate / 100 / 12;
  const pay = loanPayment(l);
  const rows: ScheduleRow[] = [];
  let balance = l.principal;
  for (let n = 1; n <= l.term_months && balance > 0; n++) {
    const interest = Math.round(balance * r);
    let amortization = pay - interest;
    if (n === l.term_months || amortization >= balance) amortization = balance;
    if (amortization <= 0) break; // cuota insuficiente para cubrir intereses
    balance -= amortization;
    rows.push({ n, date: addMonths(l.first_payment, n - 1), payment: amortization + interest, interest, amortization, balance });
  }
  return rows;
}

export interface LoanStatus {
  payment: number;
  paidCount: number;
  remainingCount: number;
  outstanding: number; // capital pendiente
  paidPrincipal: number;
  totalInterest: number;
  remainingInterest: number;
  nextDate: string | null;
  endDate: string | null;
  progress: number; // 0..1 del capital amortizado
}

export function loanStatus(l: Loan, today: string): LoanStatus {
  const rows = schedule(l);
  const paid = rows.filter((r) => r.date <= today);
  const pending = rows.slice(paid.length);
  const outstanding = l.closed ? 0 : (paid.at(-1)?.balance ?? l.principal);
  return {
    payment: loanPayment(l),
    paidCount: paid.length,
    remainingCount: l.closed ? 0 : pending.length,
    outstanding,
    paidPrincipal: l.principal - outstanding,
    totalInterest: rows.reduce((s, r) => s + r.interest, 0),
    remainingInterest: l.closed ? 0 : pending.reduce((s, r) => s + r.interest, 0),
    nextDate: l.closed ? null : (pending[0]?.date ?? null),
    endDate: rows.at(-1)?.date ?? null,
    progress: l.principal ? (l.principal - outstanding) / l.principal : 1,
  };
}

/** Días de antelación con los que se puede marcar como hecho un recurrente (p. ej. la nómina cobrada antes). */
export const EARLY_DAYS = 15;

/** Fechas de un recurrente en (after, until], respetando inicio y fin. */
export function recurringDates(
  r: { day: number; start_date: string; end_date: string | null },
  after: string | null,
  until: string,
): string[] {
  const out: string[] = [];
  const [sy, sm] = r.start_date.split('-').map(Number);
  const limit = r.end_date && r.end_date < until ? r.end_date : until;
  for (let t = sy * 12 + sm - 1; ; t++) {
    const d = dateInMonth(Math.floor(t / 12), (t % 12) + 1, r.day);
    if (d > limit) break;
    if (d >= r.start_date && (!after || d > after)) out.push(d);
  }
  return out;
}
