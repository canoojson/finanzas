// Resumen en Markdown de las finanzas de un usuario, pensado para pegarlo en un asistente de IA
// (ChatGPT, Claude, DeepSeek…). No incluye el email ni identificadores internos.
import { dateInMonth, loanStatus, todayISO, type Loan } from '../shared/finance';

export interface AiExportOptions {
  months: number; // meses completos analizados (además del mes en curso)
  movements: boolean; // incluir la lista de movimientos
  notes: boolean; // incluir las notas escritas en los movimientos
}

const MAX_MOVEMENTS = 3000;

const eurFmt = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', useGrouping: 'always' });
const eur = (cents: number) => eurFmt.format(cents / 100);
const pct = (x: number) => `${(x * 100).toLocaleString('es-ES', { maximumFractionDigits: 1 })} %`;
const monthFmt = new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const monthName = (ym: string) => monthFmt.format(new Date(`${ym}-01T00:00:00Z`));

const shift = (ym: string, k: number) => {
  const [y, m] = ym.split('-').map(Number);
  const t = y * 12 + m - 1 + k;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
};
const monthEnd = (ym: string) => {
  const [y, m] = ym.split('-').map(Number);
  return dateInMonth(y, m, 31);
};

/** Celda de tabla Markdown: sin saltos de línea ni barras verticales. */
const cell = (v: unknown) => (v == null || v === '' ? '—' : String(v).replace(/\s+/g, ' ').replace(/\|/g, '\\|').trim());
const table = (head: string[], rows: unknown[][]) =>
  [`| ${head.join(' | ')} |`, `| ${head.map(() => '---').join(' | ')} |`, ...rows.map((r) => `| ${r.map(cell).join(' | ')} |`)].join('\n');

const ACCOUNT_TYPES: Record<string, string> = {
  corriente: 'Cuenta corriente',
  ahorro: 'Ahorro',
  efectivo: 'Efectivo',
  inversion: 'Inversión',
  tarjeta: 'Tarjeta de crédito',
};

export async function buildAiExport(db: D1Database, owner: string, opt: AiExportOptions): Promise<string> {
  const today = todayISO();
  const current = today.slice(0, 7);
  const first = shift(current, -opt.months); // primer mes completo del periodo
  const last = shift(current, -1); // último mes completo
  const from = `${first}-01`;
  const q = <T>(sql: string, ...args: unknown[]) => db.prepare(sql).bind(...args).all<T>().then((r) => r.results);

  const [user, cats, accounts, byMonth, recurring, loans, goals, holds, top, movs] = await Promise.all([
    db.prepare('SELECT name, savings_target FROM users WHERE email = ?').bind(owner).first<{ name: string | null; savings_target: number | null }>(),
    q<{ id: number; name: string; kind: string }>('SELECT id, name, kind FROM categories WHERE owner = ?', owner),
    q<{ id: number; name: string; type: string; archived: number; card_cutoff_day: number | null; card_charge_day: number | null; balance: number }>(
      `SELECT a.id, a.name, a.type, a.archived, a.card_cutoff_day, a.card_charge_day, a.initial_balance
         + COALESCE((SELECT SUM(CASE kind WHEN 'ingreso' THEN amount ELSE -amount END) FROM transactions t WHERE t.account_id = a.id AND t.date <= ?1), 0)
         + COALESCE((SELECT SUM(amount) FROM transactions t WHERE t.to_account_id = a.id AND t.kind = 'transferencia' AND t.date <= ?1), 0) AS balance
       FROM accounts a WHERE a.owner = ?2 ORDER BY a.archived, a.id`,
      today,
      owner,
    ),
    q<{ m: string; kind: string; category_id: number | null; total: number; n: number; fixed: number }>(
      `SELECT substr(date, 1, 7) AS m, kind, category_id, SUM(amount) AS total, COUNT(*) AS n,
              COALESCE(SUM(CASE WHEN recurring_id IS NOT NULL OR loan_id IS NOT NULL THEN amount END), 0) AS fixed
       FROM transactions WHERE owner = ? AND kind != 'transferencia' AND date BETWEEN ? AND ?
       GROUP BY m, kind, category_id`,
      owner,
      from,
      today,
    ),
    q<{ kind: string; amount: number; note: string | null; day: number; account_id: number; category_id: number | null; end_date: string | null }>(
      'SELECT * FROM recurring WHERE owner = ? AND active = 1 AND (end_date IS NULL OR end_date >= ?) ORDER BY kind DESC, amount DESC',
      owner,
      today,
    ),
    q<Loan>('SELECT * FROM loans WHERE owner = ? AND closed = 0 ORDER BY first_payment', owner),
    q<{ name: string; target: number; account_id: number | null; saved: number; deadline: string | null }>('SELECT * FROM goals WHERE owner = ? ORDER BY id', owner),
    q<{ concept: string; amount: number; account_id: number; charge_date: string | null }>(
      "SELECT concept, amount, account_id, charge_date FROM holds WHERE owner = ? AND status = 'pendiente' ORDER BY coalesce(charge_date, '9999')",
      owner,
    ),
    q<{ date: string; amount: number; note: string | null; category_id: number | null }>(
      `SELECT date, amount, note, category_id FROM transactions
       WHERE owner = ? AND kind = 'gasto' AND date BETWEEN ? AND ? ORDER BY amount DESC LIMIT 15`,
      owner,
      from,
      today,
    ),
    opt.movements
      ? q<{ date: string; kind: string; amount: number; account_id: number; to_account_id: number | null; category_id: number | null; note: string | null; recurring_id: number | null; loan_id: number | null }>(
          `SELECT date, kind, amount, account_id, to_account_id, category_id, note, recurring_id, loan_id FROM transactions
           WHERE owner = ? AND date BETWEEN ? AND ? ORDER BY date DESC, id DESC LIMIT ${MAX_MOVEMENTS + 1}`,
          owner,
          from,
          today,
        )
      : Promise.resolve([]),
  ]);

  const cat = new Map(cats.map((c) => [c.id, c.name]));
  const acc = new Map(accounts.map((a) => [a.id, a]));
  const catName = (id: number | null, kind: string) => (id != null && cat.get(id)) || (kind === 'ingreso' ? 'Otros ingresos' : 'Sin categoría');
  const accName = (id: number | null) => (id != null && acc.get(id)?.name) || '—';

  const periodMonths = Array.from({ length: opt.months }, (_, i) => shift(first, i));
  const complete = byMonth.filter((r) => r.m <= last);
  const sumWhere = (rows: typeof byMonth, f: (r: (typeof byMonth)[number]) => boolean) => rows.filter(f).reduce((s, r) => s + r.total, 0);

  const out: string[] = [];
  const h = (s: string) => out.push('', s, '');

  // --- Cabecera ----------------------------------------------------------------
  out.push('# Mis finanzas personales');
  out.push('');
  out.push(
    `> Resumen generado el ${today} desde mi app de finanzas personales para dárselo como contexto a un asistente de IA.`,
    '> Todos los importes están en euros. Los datos los apunto yo a mano, así que puede faltar algún gasto en efectivo.',
    '> Las transferencias entre mis propias cuentas no cuentan como ingreso ni como gasto.',
    '> Úsalo para responder a mis preguntas sobre presupuesto, ahorro, deudas y hábitos de gasto.',
  );

  h('## Perfil');
  const profile = [
    user?.name && `- Nombre: ${user.name}`,
    `- Periodo analizado: de ${monthName(first)} a ${monthName(last)} (${opt.months} ${opt.months === 1 ? 'mes completo' : 'meses completos'}), más lo que va de ${monthName(current)}.`,
    user?.savings_target ? `- Objetivo de ahorro mensual: ${eur(user.savings_target)}` : null,
  ].filter(Boolean);
  out.push(...(profile as string[]));

  // --- Situación actual ----------------------------------------------------------
  const active = accounts.filter((a) => !a.archived);
  const cash = active.filter((a) => a.type !== 'tarjeta').reduce((s, a) => s + a.balance, 0);
  const cards = active.filter((a) => a.type === 'tarjeta').reduce((s, a) => s + a.balance, 0);
  const debt = loans.reduce((s, l) => s + loanStatus(l, today).outstanding, 0);
  const held = holds.reduce((s, x) => s + x.amount, 0);

  h(`## Situación actual (a ${today})`);
  out.push(
    `- Dinero disponible en cuentas (sin tarjetas de crédito): ${eur(cash)}`,
    cards ? `- Saldo de tarjetas de crédito (lo gastado pendiente de cargar): ${eur(cards)}` : '- Tarjetas de crédito: sin saldo pendiente',
    `- Deuda pendiente en préstamos y financiaciones: ${eur(debt)}`,
    held ? `- Retenciones pendientes (dinero bloqueado que aún no se ha cobrado): ${eur(held)}` : '- Retenciones pendientes: ninguna',
    `- Patrimonio neto aproximado (cuentas + tarjetas − deuda): ${eur(cash + cards - debt)}`,
  );
  if (active.length) {
    h('### Cuentas');
    out.push(
      table(
        ['Cuenta', 'Tipo', 'Saldo actual', 'Detalles'],
        active.map((a) => [
          a.name,
          ACCOUNT_TYPES[a.type] ?? a.type,
          eur(a.balance),
          a.type === 'tarjeta' && a.card_cutoff_day && a.card_charge_day ? `Corte el día ${a.card_cutoff_day}, cargo el día ${a.card_charge_day}` : '',
        ]),
      ),
    );
  }

  // --- Evolución mensual ---------------------------------------------------------
  h('## Ingresos y gastos por mes');
  const monthRows = [...periodMonths, current].map((m) => {
    const inc = sumWhere(byMonth, (r) => r.m === m && r.kind === 'ingreso');
    const exp = sumWhere(byMonth, (r) => r.m === m && r.kind === 'gasto');
    const fixed = byMonth.filter((r) => r.m === m && r.kind === 'gasto').reduce((s, r) => s + r.fixed, 0);
    return { m, inc, exp, fixed };
  });
  const full = monthRows.filter((r) => r.m !== current);
  const avg = (f: (r: (typeof monthRows)[number]) => number) => Math.round(full.reduce((s, r) => s + f(r), 0) / Math.max(1, full.length));
  out.push(
    table(
      ['Mes', 'Ingresos', 'Gastos', 'De ellos fijos', 'Ahorro', 'Tasa de ahorro'],
      [
        ...monthRows.map((r) => [
          r.m === current ? `${monthName(r.m)} (en curso)` : monthName(r.m),
          eur(r.inc),
          eur(r.exp),
          eur(r.fixed),
          eur(r.inc - r.exp),
          r.inc ? pct((r.inc - r.exp) / r.inc) : '—',
        ]),
        ['**Media mensual** (meses completos)', eur(avg((r) => r.inc)), eur(avg((r) => r.exp)), eur(avg((r) => r.fixed)), eur(avg((r) => r.inc - r.exp)), (() => {
          const i = avg((r) => r.inc);
          return i ? pct((i - avg((r) => r.exp)) / i) : '—';
        })()],
      ],
    ),
  );
  out.push('', '«Fijos» son los gastos que se repiten (recibos, suscripciones, cuotas de préstamos).');

  // --- Categorías ------------------------------------------------------------------
  const categoryTable = (kind: 'gasto' | 'ingreso') => {
    const ids = [...new Set(byMonth.filter((r) => r.kind === kind).map((r) => r.category_id))];
    const totalAll = sumWhere(complete, (r) => r.kind === kind);
    return ids
      .map((id) => {
        const total = sumWhere(complete, (r) => r.kind === kind && r.category_id === id);
        return {
          name: catName(id, kind),
          total,
          avg: Math.round(total / opt.months),
          share: totalAll ? total / totalAll : 0,
          count: complete.filter((r) => r.kind === kind && r.category_id === id).reduce((s, r) => s + r.n, 0),
          now: sumWhere(byMonth, (r) => r.m === current && r.kind === kind && r.category_id === id),
        };
      })
      .filter((c) => c.total || c.now)
      .sort((a, b) => b.total - a.total || b.now - a.now);
  };
  const expCats = categoryTable('gasto');
  if (expCats.length) {
    h('## Gastos por categoría');
    out.push(
      table(
        ['Categoría', `Total ${opt.months} ${opt.months === 1 ? 'mes' : 'meses'}`, 'Media mensual', '% del gasto', 'Nº movimientos', `${monthName(current)} (en curso)`],
        expCats.map((c) => [c.name, eur(c.total), eur(c.avg), pct(c.share), c.count, eur(c.now)]),
      ),
    );
  }
  const incCats = categoryTable('ingreso');
  if (incCats.length) {
    h('## Ingresos por categoría');
    out.push(
      table(
        ['Categoría', 'Media mensual', '% de los ingresos', `${monthName(current)} (en curso)`],
        incCats.map((c) => [c.name, eur(c.avg), pct(c.share), eur(c.now)]),
      ),
    );
  }

  // --- Recurrentes -------------------------------------------------------------------
  if (recurring.length) {
    h('## Ingresos y gastos recurrentes activos');
    out.push(
      table(
        ['Concepto', 'Tipo', 'Importe', 'Día del mes', 'Cuenta', 'Hasta'],
        recurring.map((r) => [r.note || catName(r.category_id, r.kind), r.kind === 'ingreso' ? 'Ingreso' : 'Gasto', eur(r.amount), r.day, accName(r.account_id), r.end_date ?? 'Sin fin']),
      ),
    );
    const recIn = recurring.filter((r) => r.kind === 'ingreso').reduce((s, r) => s + r.amount, 0);
    const recOut = recurring.filter((r) => r.kind === 'gasto').reduce((s, r) => s + r.amount, 0);
    out.push('', `Total mensual: ${eur(recIn)} de ingresos y ${eur(recOut)} de gastos recurrentes.`);
  }

  // --- Deudas -------------------------------------------------------------------------
  if (loans.length) {
    h('## Préstamos y financiaciones pendientes');
    out.push(
      table(
        ['Nombre', 'Entidad', 'Importe inicial', 'Pendiente', 'Cuota mensual', 'TIN', 'Cuotas pagadas', 'Cuotas restantes', 'Intereses pendientes', 'Última cuota'],
        loans.map((l) => {
          const s = loanStatus(l, today);
          return [
            l.name,
            l.lender,
            eur(l.principal),
            eur(s.outstanding),
            eur(s.payment),
            `${l.annual_rate.toLocaleString('es-ES')} %`,
            s.paidCount,
            s.remainingCount,
            eur(s.remainingInterest),
            s.endDate,
          ];
        }),
      ),
    );
  }

  // --- Objetivos ------------------------------------------------------------------------
  if (goals.length) {
    h('## Objetivos de ahorro');
    out.push(
      table(
        ['Objetivo', 'Meta', 'Llevo ahorrado', 'Progreso', 'Fecha límite', 'Necesario al mes'],
        goals.map((g) => {
          const current = g.account_id ? (acc.get(g.account_id)?.balance ?? 0) : g.saved;
          const left = Math.max(0, g.target - current);
          let perMonth = '';
          if (g.deadline && left > 0) {
            const [y1, m1] = today.split('-').map(Number);
            const [y2, m2] = g.deadline.split('-').map(Number);
            perMonth = eur(Math.ceil(left / Math.max(1, (y2 - y1) * 12 + (m2 - m1))));
          }
          return [g.name, eur(g.target), eur(current), pct(Math.min(1, current / g.target)), g.deadline, perMonth];
        }),
      ),
    );
  }

  // --- Retenciones -----------------------------------------------------------------------
  if (holds.length) {
    h('## Retenciones pendientes');
    out.push('Cargos bloqueados en una cuenta (fianzas, preautorizaciones…) que aún no se han cobrado o liberado.', '');
    out.push(table(['Concepto', 'Importe', 'Cuenta', 'Cobro previsto'], holds.map((x) => [x.concept, eur(x.amount), accName(x.account_id), x.charge_date ?? 'Sin fecha'])));
  }

  // --- Mayores gastos ----------------------------------------------------------------------
  if (top.length) {
    h('## Mayores gastos del periodo');
    out.push(
      table(
        opt.notes ? ['Fecha', 'Importe', 'Categoría', 'Concepto'] : ['Fecha', 'Importe', 'Categoría'],
        top.map((t) => [t.date, eur(t.amount), catName(t.category_id, 'gasto'), ...(opt.notes ? [t.note] : [])]),
      ),
    );
  }

  // --- Movimientos -------------------------------------------------------------------------
  if (opt.movements) {
    h('## Movimientos');
    const shown = movs.slice(0, MAX_MOVEMENTS).reverse();
    if (movs.length > MAX_MOVEMENTS) out.push(`Se muestran los ${MAX_MOVEMENTS} más recientes; elige un periodo más corto para verlos todos.`, '');
    const kindLabel = (k: string) => (k === 'ingreso' ? 'Ingreso' : k === 'gasto' ? 'Gasto' : 'Transferencia');
    out.push(
      shown.length
        ? table(
            ['Fecha', 'Tipo', 'Importe', 'Categoría', 'Cuenta', ...(opt.notes ? ['Concepto'] : []), 'Origen'],
            shown.map((t) => [
              t.date,
              kindLabel(t.kind),
              eur(t.amount),
              t.kind === 'transferencia' ? '' : catName(t.category_id, t.kind),
              t.kind === 'transferencia' ? `${accName(t.account_id)} → ${accName(t.to_account_id)}` : accName(t.account_id),
              ...(opt.notes ? [t.note] : []),
              t.recurring_id ? 'Recurrente' : t.loan_id ? 'Cuota de préstamo' : 'Manual',
            ]),
          )
        : 'No hay movimientos en el periodo.',
    );
  }

  out.push('');
  return out.join('\n');
}
