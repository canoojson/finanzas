// Cifras de un mes para el informe mensual.
import { dateInMonth, loanStatus, todayISO, type Loan } from '../../shared/finance';

export interface CategoryLine {
  id: number | null;
  name: string;
  icon: string;
  color: string;
  total: number;
  prev: number; // mes anterior
  avg3: number; // media de los 3 meses anteriores
  count: number;
  fixed: number; // parte de este mes que son recurrentes o cuotas
}

export interface ReportData {
  month: string;
  name: string | null;
  income: number;
  expense: number;
  prevIncome: number;
  prevExpense: number;
  categories: CategoryLine[];
  incomeCategories: { name: string; icon: string; total: number }[];
  series: { month: string; income: number; expense: number }[];
  topExpenses: { date: string; amount: number; note: string | null; category: string; account: string }[];
  fixed: number; // recurrentes y cuotas
  variable: number;
  cardSpend: number;
  movements: number;
  goals: { name: string; target: number; current: number; deadline: string | null; perMonth: number | null }[];
  savingsTarget: number | null;
  cash: number; // saldo actual en cuentas (sin tarjetas)
  debt: number; // capital pendiente de financiaciones
  generatedAt: string;
}

const shift = (month: string, k: number) => {
  const [y, m] = month.split('-').map(Number);
  const t = y * 12 + m - 1 + k;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
};
const end = (month: string) => {
  const [y, m] = month.split('-').map(Number);
  return dateInMonth(y, m, 31);
};

export async function buildReportData(db: D1Database, owner: string, month: string): Promise<ReportData> {
  const today = todayISO();
  const from6 = `${shift(month, -5)}-01`;
  const from3 = `${shift(month, -3)}-01`;
  const prev = shift(month, -1);
  const q = <T>(sql: string, ...args: unknown[]) => db.prepare(sql).bind(...args).all<T>().then((r) => r.results);

  const [user, cats, accounts, byCat, series, top, fixedRows, goals, loans] = await Promise.all([
    db.prepare('SELECT name, savings_target FROM users WHERE email = ?').bind(owner).first<{ name: string | null; savings_target: number | null }>(),
    q<{ id: number; name: string; icon: string | null; color: string | null }>('SELECT id, name, icon, color FROM categories WHERE owner = ?', owner),
    q<{ id: number; name: string; type: string; archived: number; balance: number }>(
      `SELECT a.id, a.name, a.type, a.archived, a.initial_balance
         + COALESCE((SELECT SUM(CASE kind WHEN 'ingreso' THEN amount ELSE -amount END) FROM transactions t WHERE t.account_id = a.id AND t.date <= ?1), 0)
         + COALESCE((SELECT SUM(amount) FROM transactions t WHERE t.to_account_id = a.id AND t.kind = 'transferencia' AND t.date <= ?1), 0) AS balance
       FROM accounts a WHERE a.owner = ?2`,
      today,
      owner,
    ),
    q<{ category_id: number | null; kind: string; m: string; total: number; n: number; fixed: number }>(
      `SELECT category_id, kind, substr(date, 1, 7) AS m, SUM(amount) AS total, COUNT(*) AS n,
              COALESCE(SUM(CASE WHEN recurring_id IS NOT NULL OR loan_id IS NOT NULL THEN amount END), 0) AS fixed
       FROM transactions
       WHERE owner = ? AND kind != 'transferencia' AND date BETWEEN ? AND ? GROUP BY category_id, kind, m`,
      owner,
      from3,
      end(month),
    ),
    q<{ m: string; kind: string; total: number }>(
      `SELECT substr(date, 1, 7) AS m, kind, SUM(amount) AS total FROM transactions
       WHERE owner = ? AND kind != 'transferencia' AND date BETWEEN ? AND ? GROUP BY m, kind`,
      owner,
      from6,
      end(month),
    ),
    q<{ date: string; amount: number; note: string | null; category_id: number | null; account_id: number }>(
      `SELECT date, amount, note, category_id, account_id FROM transactions
       WHERE owner = ? AND kind = 'gasto' AND date BETWEEN ? AND ? ORDER BY amount DESC LIMIT 10`,
      owner,
      `${month}-01`,
      end(month),
    ),
    q<{ fixed: number; variable: number; card: number; n: number }>(
      `SELECT
         COALESCE(SUM(CASE WHEN t.kind = 'gasto' AND (t.recurring_id IS NOT NULL OR t.loan_id IS NOT NULL) THEN t.amount END), 0) AS fixed,
         COALESCE(SUM(CASE WHEN t.kind = 'gasto' AND t.recurring_id IS NULL AND t.loan_id IS NULL THEN t.amount END), 0) AS variable,
         COALESCE(SUM(CASE WHEN t.kind = 'gasto' AND a.type = 'tarjeta' THEN t.amount END), 0) AS card,
         COUNT(*) AS n
       FROM transactions t JOIN accounts a ON a.id = t.account_id
       WHERE t.owner = ? AND t.date BETWEEN ? AND ?`,
      owner,
      `${month}-01`,
      end(month),
    ),
    q<{ name: string; target: number; account_id: number | null; saved: number; deadline: string | null }>('SELECT * FROM goals WHERE owner = ?', owner),
    q<Loan>('SELECT * FROM loans WHERE owner = ? AND closed = 0', owner),
  ]);

  const cat = new Map(cats.map((c) => [c.id, c]));
  const acc = new Map(accounts.map((a) => [a.id, a]));
  const sum = (kind: string, m: string, id?: number | null) =>
    byCat.filter((r) => r.kind === kind && r.m === m && (id === undefined || r.category_id === id)).reduce((s, r) => s + r.total, 0);

  const ids = [...new Set(byCat.filter((r) => r.kind === 'gasto').map((r) => r.category_id))];
  const prevMonths = [shift(month, -1), shift(month, -2), shift(month, -3)];
  const categories = ids
    .map((id) => {
      const c = id != null ? cat.get(id) : undefined;
      return {
        id,
        name: c?.name ?? 'Sin categoría',
        icon: c?.icon ?? '•',
        color: c?.color ?? '#8a8f98',
        total: sum('gasto', month, id),
        prev: sum('gasto', prev, id),
        avg3: Math.round(prevMonths.reduce((s, m) => s + sum('gasto', m, id), 0) / 3),
        count: byCat.filter((r) => r.kind === 'gasto' && r.m === month && r.category_id === id).reduce((s, r) => s + r.n, 0),
        fixed: byCat.filter((r) => r.kind === 'gasto' && r.m === month && r.category_id === id).reduce((s, r) => s + r.fixed, 0),
      };
    })
    .filter((c) => c.total > 0 || c.prev > 0)
    .sort((a, b) => b.total - a.total);

  const incomeCategories = [...new Set(byCat.filter((r) => r.kind === 'ingreso' && r.m === month).map((r) => r.category_id))]
    .map((id) => ({ name: (id != null && cat.get(id)?.name) || 'Otros', icon: (id != null && cat.get(id)?.icon) || '•', total: sum('ingreso', month, id) }))
    .sort((a, b) => b.total - a.total);

  const seriesOut = Array.from({ length: 6 }, (_, i) => {
    const m = shift(month, i - 5);
    return {
      month: m,
      income: series.filter((r) => r.m === m && r.kind === 'ingreso').reduce((s, r) => s + r.total, 0),
      expense: series.filter((r) => r.m === m && r.kind === 'gasto').reduce((s, r) => s + r.total, 0),
    };
  });

  const goalsOut = goals.map((g) => {
    const current = g.account_id ? (acc.get(g.account_id)?.balance ?? 0) : g.saved;
    const left = Math.max(0, g.target - current);
    let perMonth: number | null = null;
    if (g.deadline && left > 0) {
      const [y1, m1] = today.split('-').map(Number);
      const [y2, m2] = g.deadline.split('-').map(Number);
      perMonth = Math.ceil(left / Math.max(1, (y2 - y1) * 12 + (m2 - m1)));
    }
    return { name: g.name, target: g.target, current, deadline: g.deadline, perMonth };
  });

  const f = fixedRows[0] ?? { fixed: 0, variable: 0, card: 0, n: 0 };
  return {
    month,
    name: user?.name ?? null,
    income: sum('ingreso', month),
    expense: sum('gasto', month),
    prevIncome: sum('ingreso', prev),
    prevExpense: sum('gasto', prev),
    categories,
    incomeCategories,
    series: seriesOut,
    topExpenses: top.map((t) => ({
      date: t.date,
      amount: t.amount,
      note: t.note,
      category: (t.category_id != null && cat.get(t.category_id)?.name) || 'Sin categoría',
      account: acc.get(t.account_id)?.name ?? '',
    })),
    fixed: f.fixed,
    variable: f.variable,
    cardSpend: f.card,
    movements: f.n,
    goals: goalsOut,
    savingsTarget: user?.savings_target ?? null,
    cash: accounts.filter((a) => a.type !== 'tarjeta' && !a.archived).reduce((s, a) => s + a.balance, 0),
    debt: loans.reduce((s, l) => s + loanStatus(l, today).outstanding, 0),
    generatedAt: today,
  };
}
