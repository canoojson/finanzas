import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { addDays, dateInMonth, EARLY_DAYS, todayISO } from '../shared/finance';
import { forecast } from '../shared/forecast';
import { doneByRecurring, MAX_SHIFT_DAYS, occurrences, watermark, type Override } from '../shared/recurrence';
import { authenticate, type Env } from './auth';
import { materialize, materializeAll } from './automation';
import { runReminders, sendPush } from './notifications';
import { generateReport, runMonthlyReports } from './report';
import { crud, validate, type AppEnv, type Spec } from './crud';

const DEFAULT_CATEGORIES: [string, 'gasto' | 'ingreso', string, string][] = [
  ['Supermercado', 'gasto', '🛒', '#4f9d69'],
  ['Vivienda', 'gasto', '🏠', '#6c7bd8'],
  ['Suministros', 'gasto', '💡', '#e0a33a'],
  ['Transporte', 'gasto', '🚗', '#3a9fc4'],
  ['Restaurantes', 'gasto', '🍽️', '#d9734e'],
  ['Ocio', 'gasto', '🎉', '#b65fc4'],
  ['Compras', 'gasto', '🛍️', '#d65a8b'],
  ['Salud', 'gasto', '💊', '#4bb3a4'],
  ['Suscripciones', 'gasto', '📱', '#7e8794'],
  ['Financiaciones', 'gasto', '💳', '#c45252'],
  ['Regalos', 'gasto', '🎁', '#c9a227'],
  ['Otros gastos', 'gasto', '📦', '#8a8f98'],
  ['Nómina', 'ingreso', '💼', '#2f9e6b'],
  ['Extras', 'ingreso', '💰', '#5aa83c'],
  ['Reembolsos', 'ingreso', '↩️', '#3a9fc4'],
  ['Intereses', 'ingreso', '📈', '#2b8a8a'],
  ['Otros ingresos', 'ingreso', '📦', '#8a8f98'],
];

const knownUsers = new Set<string>();

/** Crea el usuario y sus datos iniciales la primera vez que entra. */
async function ensureUser(db: D1Database, email: string) {
  if (knownUsers.has(email)) return;
  const res = await db.prepare('INSERT OR IGNORE INTO users (email) VALUES (?)').bind(email).run();
  if (res.meta.changes) {
    await db.batch([
      ...DEFAULT_CATEGORIES.map(([name, kind, icon, color]) =>
        db
          .prepare('INSERT INTO categories (owner, name, kind, icon, color) VALUES (?, ?, ?, ?, ?)')
          .bind(email, name, kind, icon, color),
      ),
      db
        .prepare("INSERT INTO accounts (owner, name, type, color) VALUES (?, 'Cuenta corriente', 'corriente', '#6c7bd8')")
        .bind(email),
    ]);
  }
  knownUsers.add(email);
}

/** Saldo a fecha ?1 de la cuenta referenciada como `ref` (saldo de partida + movimientos). */
const balanceSql = (ref: string) => `${ref}.initial_balance
  + COALESCE((SELECT SUM(CASE kind WHEN 'ingreso' THEN amount ELSE -amount END)
              FROM transactions t WHERE t.account_id = ${ref}.id AND t.date <= ?1), 0)
  + COALESCE((SELECT SUM(amount) FROM transactions t
              WHERE t.to_account_id = ${ref}.id AND t.kind = 'transferencia' AND t.date <= ?1), 0)`;

const accountsWithBalance = (db: D1Database, owner: string, today: string) =>
  db
    .prepare(`SELECT a.*, ${balanceSql('a')} AS balance FROM accounts a WHERE a.owner = ?2 ORDER BY a.archived, a.id`)
    .bind(today, owner)
    .all();

const monthRange = (month: string) => {
  if (!/^\d{4}-\d{2}$/.test(month)) throw new HTTPException(400, { message: 'Mes no válido' });
  return [`${month}-01`, `${month}-31`] as const;
};

// --- Recursos ---------------------------------------------------------------

const accounts = crud({
  table: 'accounts',
  order: 'archived, id',
  spec: {
    name: { type: 'text', required: true, max: 60 },
    type: { type: 'enum', values: ['corriente', 'ahorro', 'efectivo', 'inversion', 'tarjeta'], required: true },
    initial_balance: { type: 'int' },
    color: { type: 'text', max: 20 },
    archived: { type: 'bool' },
    card_cutoff_day: { type: 'int', min: 1, max: 31 },
    card_charge_day: { type: 'int', min: 1, max: 31 },
    card_pay_account_id: { type: 'ref', table: 'accounts' },
  },
  async before(data, { db, owner, id }) {
    const cur = id
      ? await db.prepare('SELECT type, card_settle_from FROM accounts WHERE id = ? AND owner = ?').bind(id, owner).first<any>()
      : null;
    const type = data.type ?? cur?.type;
    if (type !== 'tarjeta') {
      Object.assign(data, { card_cutoff_day: null, card_charge_day: null, card_pay_account_id: null, card_settle_from: null });
      return;
    }
    if (data.card_pay_account_id != null) {
      const pay = await db.prepare('SELECT id, type FROM accounts WHERE id = ? AND owner = ?').bind(data.card_pay_account_id, owner).first<any>();
      if (pay.id === id || pay.type === 'tarjeta') throw new HTTPException(400, { message: 'La tarjeta se debe cargar en una cuenta que no sea otra tarjeta' });
    }
    // Los cargos automáticos empiezan a apuntarse desde que la tarjeta queda configurada.
    if (!cur?.card_settle_from && data.card_cutoff_day && data.card_charge_day && data.card_pay_account_id) data.card_settle_from = todayISO();
  },
});
// Fija el saldo actual: ajusta el saldo de partida para que cuadre, sin crear movimientos
// (así no se alteran los ingresos y gastos de ningún mes).
accounts.put('/:id{[0-9]+}/balance', async (c) => {
  const db = c.env.DB;
  const { balance } = await validate(db, c.var.email, await c.req.json(), { balance: { type: 'int', required: true } });
  const row = await db
    .prepare(
      `UPDATE accounts SET initial_balance = initial_balance + (?2 - (${balanceSql('accounts')}))
       WHERE id = ?3 AND owner = ?4 RETURNING id`,
    )
    .bind(todayISO(), balance, Number(c.req.param('id')), c.var.email)
    .first();
  if (!row) throw new HTTPException(404, { message: 'No encontrado' });
  return c.json({ id: row.id, balance });
});

const categories = crud({
  table: 'categories',
  order: 'kind, archived, name',
  spec: {
    name: { type: 'text', required: true, max: 40 },
    kind: { type: 'enum', values: ['gasto', 'ingreso'], required: true },
    icon: { type: 'text', max: 8 },
    color: { type: 'text', max: 20 },
    archived: { type: 'bool' },
  },
});

const loans = crud({
  table: 'loans',
  order: 'closed, first_payment',
  spec: {
    name: { type: 'text', required: true, max: 60 },
    lender: { type: 'text', max: 60 },
    principal: { type: 'int', required: true, min: 1 },
    annual_rate: { type: 'real', min: 0, max: 100 },
    term_months: { type: 'int', required: true, min: 1, max: 600 },
    first_payment: { type: 'date', required: true },
    payment: { type: 'int', min: 1 },
    account_id: { type: 'ref', table: 'accounts' },
    category_id: { type: 'ref', table: 'categories' },
    auto_register: { type: 'bool' },
    notes: { type: 'text', max: 500 },
    closed: { type: 'bool' },
  },
  // Al activar el apunte automático no se rellenan cuotas pasadas: solo desde hoy (incluido).
  async before(data, { db, owner, id }) {
    if (!data.auto_register) return;
    const prev = id
      ? await db.prepare('SELECT last_run FROM loans WHERE id = ? AND owner = ?').bind(id, owner).first<{ last_run: string | null }>()
      : null;
    if (!prev?.last_run) data.last_run = addDays(todayISO(), -1);
  },
});

const recurringSpec: Spec = {
  kind: { type: 'enum', values: ['gasto', 'ingreso'], required: true },
  amount: { type: 'int', required: true, min: 1 },
  account_id: { type: 'ref', table: 'accounts', required: true },
  category_id: { type: 'ref', table: 'categories' },
  note: { type: 'text', max: 120 },
  day: { type: 'int', required: true, min: 1, max: 31 },
  start_date: { type: 'date', required: true },
  end_date: { type: 'date' },
  active: { type: 'bool' },
};
const recurring = crud({
  table: 'recurring',
  order: 'active DESC, day',
  spec: recurringSpec,
  // Al crearlo no se apuntan las veces que ya pasaron (ya están reflejadas en el saldo real).
  before(data, { id }) {
    if (!id && typeof data.start_date === 'string' && data.start_date < todayISO()) data.last_run = addDays(todayISO(), -1);
  },
});

/** Recurrente del usuario con sus cobros pendientes hasta `until` (teniendo en cuenta los cambios puntuales). */
async function loadOccurrences(db: D1Database, owner: string, id: number, until: string) {
  const r = await db.prepare('SELECT * FROM recurring WHERE id = ? AND owner = ?').bind(id, owner).first<any>();
  if (!r) throw new HTTPException(404, { message: 'No encontrado' });
  const [ovs, dn] = await Promise.all([
    db.prepare('SELECT * FROM recurring_overrides WHERE recurring_id = ?').bind(id).all<Override>(),
    db.prepare('SELECT recurring_id, occurrence FROM transactions WHERE recurring_id = ?').bind(id).all<any>(),
  ]);
  return { r, occ: occurrences(r, ovs.results, doneByRecurring(dn.results)(id), until) };
}

// Apunta ya un cobro de un recurrente (p. ej. la nómina cobrada antes) y lo marca como hecho
// para que no se vuelva a apuntar en su fecha.
recurring.post('/:id{[0-9]+}/now', async (c) => {
  const db = c.env.DB;
  const owner = c.var.email;
  const today = todayISO();
  const data = await validate(db, owner, await c.req.json(), {
    occurrence: { type: 'date' },
    amount: { type: 'int', min: 1 },
    date: { type: 'date' },
  });
  const { r, occ } = await loadOccurrences(db, owner, Number(c.req.param('id')), addDays(today, EARLY_DAYS));
  if (!r.active) throw new HTTPException(409, { message: 'El recurrente está pausado' });
  const next = occ.find((o) => !o.done && !o.skip && (data.occurrence ? o.scheduled === data.occurrence : o.date <= addDays(today, EARLY_DAYS)));
  if (!next) throw new HTTPException(409, { message: `No hay ninguno pendiente en los próximos ${EARLY_DAYS} días` });
  next.done = true;
  const w = watermark(r, occ);
  await db.batch([
    db
      .prepare(
        `INSERT INTO transactions (owner, kind, amount, date, account_id, category_id, note, recurring_id, occurrence)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(owner, r.kind, data.amount ?? next.amount, data.date ?? today, r.account_id, r.category_id, r.note, r.id, next.scheduled),
    db.prepare('UPDATE recurring SET last_run = ? WHERE id = ?').bind(w, r.id),
  ]);
  return c.json({ ok: true, scheduled: next.scheduled });
});

// Cambia un cobro concreto: otra fecha, otro importe o saltarlo. Sin cambios, vuelve a ser el normal.
recurring.put('/:id{[0-9]+}/occurrences/:date{[0-9]{4}-[0-9]{2}-[0-9]{2}}', async (c) => {
  const db = c.env.DB;
  const owner = c.var.email;
  const scheduled = c.req.param('date');
  const { r, occ } = await loadOccurrences(db, owner, Number(c.req.param('id')), scheduled);
  const o = occ.find((x) => x.scheduled === scheduled);
  if (!o) throw new HTTPException(404, { message: 'Ese cobro no existe o ya pasó' });
  if (o.done) throw new HTTPException(409, { message: 'Ese cobro ya está apuntado; edítalo en Movimientos' });
  const data = await validate(db, owner, await c.req.json(), {
    new_date: { type: 'date' },
    new_amount: { type: 'int', min: 1 },
    skip: { type: 'bool' },
  });
  const newDate = data.new_date && data.new_date !== scheduled ? (data.new_date as string) : null;
  if (newDate && Math.abs(Date.parse(newDate) - Date.parse(scheduled)) > MAX_SHIFT_DAYS * 86400000)
    throw new HTTPException(400, { message: `Solo se puede mover hasta ${MAX_SHIFT_DAYS} días` });
  const newAmount = data.new_amount && data.new_amount !== r.amount ? data.new_amount : null;
  if (!newDate && !newAmount && !data.skip) {
    await db.prepare('DELETE FROM recurring_overrides WHERE recurring_id = ? AND scheduled_date = ?').bind(r.id, scheduled).run();
  } else {
    await db
      .prepare(
        `INSERT INTO recurring_overrides (owner, recurring_id, scheduled_date, new_date, new_amount, skip) VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(recurring_id, scheduled_date) DO UPDATE SET new_date = excluded.new_date, new_amount = excluded.new_amount, skip = excluded.skip`,
      )
      .bind(owner, r.id, scheduled, newDate, newAmount, data.skip ?? 0)
      .run();
  }
  // Si queda en el pasado, se apunta ya.
  await materialize(db, owner);
  return c.json({ ok: true });
});

const goals = crud({
  table: 'goals',
  order: 'id',
  spec: {
    name: { type: 'text', required: true, max: 60 },
    target: { type: 'int', required: true, min: 1 },
    account_id: { type: 'ref', table: 'accounts' },
    saved: { type: 'int' },
    deadline: { type: 'date' },
    color: { type: 'text', max: 20 },
  },
});

const txSpec: Spec = {
  kind: { type: 'enum', values: ['gasto', 'ingreso', 'transferencia'], required: true },
  amount: { type: 'int', required: true, min: 1 },
  date: { type: 'date', required: true },
  account_id: { type: 'ref', table: 'accounts', required: true },
  to_account_id: { type: 'ref', table: 'accounts' },
  category_id: { type: 'ref', table: 'categories' },
  note: { type: 'text', max: 200 },
};
const transactions = crud({
  table: 'transactions',
  order: 'date DESC, id DESC',
  list: false,
  spec: txSpec,
  async before(data, { db, owner, id }) {
    const cur = id
      ? await db.prepare('SELECT kind, account_id, to_account_id FROM transactions WHERE id = ? AND owner = ?').bind(id, owner).first<any>()
      : null;
    const kind = data.kind ?? cur?.kind;
    if (kind === 'transferencia') {
      const from = data.account_id ?? cur?.account_id;
      const to = 'to_account_id' in data ? data.to_account_id : cur?.to_account_id;
      if (!to) throw new HTTPException(400, { message: 'Elige la cuenta de destino' });
      if (to === from) throw new HTTPException(400, { message: 'Origen y destino deben ser distintos' });
      data.category_id = null;
    } else if (kind) {
      data.to_account_id = null;
    }
  },
});
// Aplaza una compra ya apuntada: la convierte en una financiación cuyas cuotas se cargan en la tarjeta.
transactions.post('/:id{[0-9]+}/defer', async (c) => {
  const db = c.env.DB;
  const owner = c.var.email;
  const tx = await db
    .prepare(
      `SELECT t.*, a.name AS account_name FROM transactions t JOIN accounts a ON a.id = t.account_id
       WHERE t.id = ? AND t.owner = ? AND t.kind = 'gasto' AND a.type = 'tarjeta'`,
    )
    .bind(Number(c.req.param('id')), owner)
    .first<any>();
  if (!tx) throw new HTTPException(404, { message: 'Solo se pueden aplazar compras hechas con tarjeta' });
  const plan = await validate(db, owner, await c.req.json(), {
    term_months: { type: 'int', required: true, min: 2, max: 120 },
    annual_rate: { type: 'real', min: 0, max: 100 },
    payment: { type: 'int', min: 1 },
    first_payment: { type: 'date', required: true },
    name: { type: 'text', max: 60 },
  });
  await db.batch([
    db
      .prepare(
        `INSERT INTO loans (owner, name, lender, principal, annual_rate, term_months, first_payment, payment,
                            account_id, category_id, auto_register, last_run, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      )
      .bind(
        owner,
        plan.name || tx.note || 'Compra aplazada',
        tx.account_name,
        tx.amount,
        plan.annual_rate ?? 0,
        plan.term_months,
        plan.first_payment,
        plan.payment ?? null,
        tx.account_id,
        tx.category_id,
        addDays(todayISO(), -1),
        `Compra aplazada del ${tx.date}`,
      ),
    db.prepare('DELETE FROM transactions WHERE id = ? AND owner = ?').bind(tx.id, owner),
  ]);
  return c.json({ ok: true });
});

// Listado por mes (sustituye al listado completo del CRUD genérico).
transactions.get('/', async (c) => {
  const [from, to] = monthRange(c.req.query('month') ?? todayISO().slice(0, 7));
  const { results } = await c.env.DB.prepare(
    'SELECT * FROM transactions WHERE owner = ? AND date BETWEEN ? AND ? ORDER BY date DESC, id DESC',
  )
    .bind(c.var.email, from, to)
    .all();
  return c.json(results);
});

const holds = crud({
  table: 'holds',
  order: 'id DESC',
  spec: {
    account_id: { type: 'ref', table: 'accounts', required: true },
    concept: { type: 'text', required: true, max: 80 },
    amount: { type: 'int', required: true, min: 1 },
    date: { type: 'date', required: true },
    charge_date: { type: 'date' },
    note: { type: 'text', max: 200 },
    // 'cobrada' solo se alcanza con /charge, que además crea el gasto.
    status: { type: 'enum', values: ['pendiente', 'liberada'] },
  },
  // Si se reabre una retención cobrada, se borra el gasto que generó.
  async before(data, { db, owner, id }) {
    if (!id || data.status !== 'pendiente') return;
    const cur = await db.prepare('SELECT status, transaction_id FROM holds WHERE id = ? AND owner = ?').bind(id, owner).first<any>();
    if (cur?.status === 'cobrada' && cur.transaction_id) {
      await db.prepare('DELETE FROM transactions WHERE id = ? AND owner = ?').bind(cur.transaction_id, owner).run();
      data.transaction_id = null;
    }
  },
});
// Marca la retención como cobrada y apunta el gasto correspondiente (el importe final puede diferir).
holds.post('/:id{[0-9]+}/charge', async (c) => {
  const db = c.env.DB;
  const owner = c.var.email;
  const id = Number(c.req.param('id'));
  const hold = await db.prepare('SELECT * FROM holds WHERE id = ? AND owner = ?').bind(id, owner).first<any>();
  if (!hold) throw new HTTPException(404, { message: 'No encontrada' });
  if (hold.status !== 'pendiente') throw new HTTPException(409, { message: 'La retención ya no está pendiente' });
  const data = await validate(db, owner, await c.req.json(), {
    amount: { type: 'int', required: true, min: 1 },
    date: { type: 'date', required: true },
    category_id: { type: 'ref', table: 'categories' },
    note: { type: 'text', max: 200 },
  });
  await db.batch([
    db
      .prepare("INSERT INTO transactions (owner, kind, amount, date, account_id, category_id, note) VALUES (?, 'gasto', ?, ?, ?, ?, ?)")
      .bind(owner, data.amount, data.date, hold.account_id, data.category_id ?? null, data.note ?? hold.concept),
    db.prepare("UPDATE holds SET status = 'cobrada', transaction_id = last_insert_rowid() WHERE id = ? AND owner = ?").bind(id, owner),
  ]);
  return c.json({ ok: true });
});

// --- App ----------------------------------------------------------------------

const app = new Hono<AppEnv>().basePath('/api');

app.use(async (c, next) => {
  const email = await authenticate(c.req.raw, c.env);
  if (!email) throw new HTTPException(401, { message: 'No autorizado' });
  await ensureUser(c.env.DB, email);
  c.set('email', email);
  await next();
});

app.get('/bootstrap', async (c) => {
  const db = c.env.DB;
  const owner = c.var.email;
  const today = todayISO();
  await materialize(db, owner, today);
  const q = (sql: string) => db.prepare(sql).bind(owner).all();
  const [user, acc, cats, lns, rec, gls, hlds, devices] = await Promise.all([
    db
      .prepare('SELECT email, name, reminder_days, reminder_hour, reminder_skip_if_logged, hold_alerts, tour_done, savings_target, skin, skin_colors FROM users WHERE email = ?')
      .bind(owner)
      .first(),
    accountsWithBalance(db, owner, today),
    q('SELECT * FROM categories WHERE owner = ? ORDER BY kind, archived, name'),
    q('SELECT * FROM loans WHERE owner = ? ORDER BY closed, first_payment'),
    q('SELECT * FROM recurring WHERE owner = ? ORDER BY active DESC, day'),
    q('SELECT * FROM goals WHERE owner = ? ORDER BY id'),
    q(`SELECT * FROM holds WHERE owner = ?
       ORDER BY status = 'pendiente' DESC, CASE WHEN status = 'pendiente' THEN coalesce(charge_date, '9999') END, date DESC
       LIMIT 200`),
    db.prepare('SELECT endpoint FROM push_subscriptions WHERE owner = ?').bind(owner).all<{ endpoint: string }>(),
  ]);
  return c.json({
    today,
    user,
    accounts: acc.results,
    categories: cats.results,
    loans: lns.results,
    recurring: rec.results,
    goals: gls.results,
    holds: hlds.results,
    push: { publicKey: c.env.VAPID_PUBLIC_KEY, endpoints: devices.results.map((d) => d.endpoint) },
  });
});

app.put('/me', async (c) => {
  const body = await c.req.json();
  if ('reminder_days' in body && !/^([0-6](,[0-6])*)?$/.test(String(body.reminder_days)))
    throw new HTTPException(400, { message: 'Días no válidos' });
  if (body.skin_colors != null && !/^#[0-9a-f]{6}(,#[0-9a-f]{6}){2}$/i.test(String(body.skin_colors)))
    throw new HTTPException(400, { message: 'Colores no válidos' });
  const data = await validate(
    c.env.DB,
    c.var.email,
    body,
    {
      name: { type: 'text', max: 40 },
      reminder_days: { type: 'text', max: 13 },
      reminder_hour: { type: 'int', min: 0, max: 23 },
      reminder_skip_if_logged: { type: 'bool' },
      hold_alerts: { type: 'bool' },
      tour_done: { type: 'bool' },
      savings_target: { type: 'int', min: 0 },
      skin: { type: 'enum', values: ['clasica', 'chiikawa', 'personalizada'] },
      skin_colors: { type: 'text', max: 23 },
    },
    true,
  );
  if ('reminder_days' in data) data.reminder_days ??= ''; // NOT NULL: sin días = desactivado
  const cols = Object.keys(data);
  if (cols.length)
    await c.env.DB.prepare(`UPDATE users SET ${cols.map((k) => `${k} = ?`).join(', ')} WHERE email = ?`)
      .bind(...Object.values(data), c.var.email)
      .run();
  return c.json({ ok: true });
});

// --- Notificaciones -------------------------------------------------------------

app.post('/push/subscribe', async (c) => {
  const body = await c.req.json<{ endpoint?: string; keys?: { p256dh?: string; auth?: string }; device?: string }>();
  const { endpoint, keys } = body;
  if (!endpoint?.startsWith('https://') || !keys?.p256dh || !keys?.auth) throw new HTTPException(400, { message: 'Suscripción no válida' });
  await c.env.DB.prepare(
    `INSERT INTO push_subscriptions (owner, endpoint, p256dh, auth, device) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(endpoint) DO UPDATE SET owner = excluded.owner, p256dh = excluded.p256dh, auth = excluded.auth, device = excluded.device`,
  )
    .bind(c.var.email, endpoint, keys.p256dh, keys.auth, String(body.device ?? '').slice(0, 120))
    .run();
  return c.json({ ok: true }, 201);
});

app.post('/push/unsubscribe', async (c) => {
  const { endpoint } = await c.req.json<{ endpoint?: string }>();
  await c.env.DB.prepare('DELETE FROM push_subscriptions WHERE owner = ? AND endpoint = ?').bind(c.var.email, endpoint ?? '').run();
  return c.body(null, 204);
});

app.post('/push/test', async (c) => {
  const sent = await sendPush(c.env, c.var.email, {
    title: 'Finanzas',
    body: 'Las notificaciones funcionan ✅',
    url: '/#ajustes',
    tag: 'test',
  });
  if (!sent) throw new HTTPException(409, { message: 'No hay ningún dispositivo que haya aceptado la notificación' });
  return c.json({ sent });
});

app.get('/summary', async (c) => {
  const db = c.env.DB;
  const owner = c.var.email;
  const month = c.req.query('month') ?? todayISO().slice(0, 7);
  const [from, to] = monthRange(month);
  const [y, m] = month.split('-').map(Number);
  const t0 = y * 12 + m - 1 - 11;
  const seriesFrom = `${Math.floor(t0 / 12)}-${String((t0 % 12) + 1).padStart(2, '0')}-01`;
  const [byCategory, series] = await Promise.all([
    db
      .prepare(
        `SELECT category_id, kind, SUM(amount) AS total, COUNT(*) AS count FROM transactions
         WHERE owner = ? AND date BETWEEN ? AND ? AND kind != 'transferencia'
         GROUP BY category_id, kind ORDER BY total DESC`,
      )
      .bind(owner, from, to)
      .all(),
    db
      .prepare(
        `SELECT substr(date, 1, 7) AS month, kind, SUM(amount) AS total FROM transactions
         WHERE owner = ? AND date BETWEEN ? AND ? AND kind != 'transferencia'
         GROUP BY month, kind ORDER BY month`,
      )
      .bind(owner, seriesFrom, to)
      .all(),
  ]);
  return c.json({ month, byCategory: byCategory.results, series: series.results });
});

// Previsión: todo lo que se espera desde mañana hasta el final del mes indicado.
app.get('/forecast', async (c) => {
  const db = c.env.DB;
  const owner = c.var.email;
  const today = todayISO();
  const month = c.req.query('month') ?? today.slice(0, 7);
  monthRange(month);
  const [y, m] = month.split('-').map(Number);
  const until = dateInMonth(y, m, 31);
  if (until <= today) return c.json({ month, today, until, items: [], balances: {} });
  const q = (sql: string) => db.prepare(sql).bind(owner).all<any>();
  const [acc, rec, lns, hlds, movs, ovs, dn] = await Promise.all([
    accountsWithBalance(db, owner, today),
    q('SELECT * FROM recurring WHERE owner = ? AND active = 1'),
    q('SELECT * FROM loans WHERE owner = ? AND closed = 0'),
    q("SELECT * FROM holds WHERE owner = ? AND status = 'pendiente'"),
    db
      .prepare(
        `SELECT kind, amount, date, account_id, to_account_id, card_cycle, note, category_id FROM transactions
         WHERE owner = ?2 AND (date > ?1
           OR account_id IN (SELECT id FROM accounts WHERE owner = ?2 AND type = 'tarjeta')
           OR to_account_id IN (SELECT id FROM accounts WHERE owner = ?2 AND type = 'tarjeta'))`,
      )
      .bind(today, owner)
      .all<any>(),
    q('SELECT * FROM recurring_overrides WHERE owner = ?'),
    db
      .prepare('SELECT recurring_id, occurrence FROM transactions WHERE owner = ? AND recurring_id IS NOT NULL AND occurrence >= ?')
      .bind(owner, addDays(today, -120))
      .all<any>(),
  ]);
  const { items, balances } = forecast({
    today,
    until,
    accounts: acc.results as any,
    recurring: rec.results,
    loans: lns.results,
    holds: hlds.results,
    movements: movs.results,
    overrides: ovs.results,
    done: dn.results,
  });
  return c.json({ month, today, until, items, balances: Object.fromEntries(balances) });
});

// --- Informes mensuales ---------------------------------------------------------

app.get('/reports', async (c) => {
  const { results } = await c.env.DB.prepare('SELECT month, created_at, length(pdf) AS size FROM reports WHERE owner = ? ORDER BY month DESC')
    .bind(c.var.email)
    .all();
  return c.json({ reports: results });
});

app.post('/reports', async (c) => {
  const { month } = await c.req.json<{ month?: string }>();
  if (!month || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || month > todayISO().slice(0, 7))
    throw new HTTPException(400, { message: 'Mes no válido' });
  return c.json(await generateReport(c.env, c.var.email, month), 201);
});

app.get('/reports/:month{[0-9]{4}-[0-9]{2}}/pdf', async (c) => {
  const month = c.req.param('month');
  const row = await c.env.DB.prepare('SELECT pdf FROM reports WHERE owner = ? AND month = ?').bind(c.var.email, month).first<{ pdf: ArrayBuffer }>();
  if (!row) throw new HTTPException(404, { message: 'Informe no encontrado' });
  return new Response(new Uint8Array(row.pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="finanzas-${month}.pdf"`,
      'Cache-Control': 'private, no-store',
    },
  });
});

app.get('/export', async (c) => {
  const db = c.env.DB;
  const owner = c.var.email;
  const tables = ['accounts', 'categories', 'loans', 'recurring', 'goals', 'transactions'];
  const rows = await db.batch(tables.map((t) => db.prepare(`SELECT * FROM ${t} WHERE owner = ? ORDER BY id`).bind(owner)));
  const data = Object.fromEntries(tables.map((t, i) => [t, rows[i].results]));
  return c.json(
    { exported_at: new Date().toISOString(), owner, ...data },
    200,
    { 'Content-Disposition': `attachment; filename="finanzas-${todayISO()}.json"` },
  );
});

app.route('/accounts', accounts);
app.route('/categories', categories);
app.route('/loans', loans);
app.route('/recurring', recurring);
app.route('/goals', goals);
app.route('/transactions', transactions);
app.route('/holds', holds);

app.notFound((c) => c.json({ error: 'No encontrado' }, 404));
app.onError((err, c) => {
  if (err instanceof HTTPException) return c.json({ error: err.message }, err.status);
  if (err instanceof SyntaxError) return c.json({ error: 'JSON no válido' }, 400);
  console.error(err);
  return c.json({ error: 'Error interno' }, 500);
});

export default {
  fetch: app.fetch,
  async scheduled(_event, env, ctx) {
    // allSettled: si una tarea falla, las demás terminan igual y el fallo queda en los logs.
    const tasks = { materializeAll: materializeAll(env.DB), runReminders: runReminders(env), runMonthlyReports: runMonthlyReports(env) };
    ctx.waitUntil(
      Promise.allSettled(Object.values(tasks)).then((res) =>
        res.forEach((r, i) => r.status === 'rejected' && console.error('cron fallido', Object.keys(tasks)[i], r.reason)),
      ),
    );
  },
} satisfies ExportedHandler<Env>;
