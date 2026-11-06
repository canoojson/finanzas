import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { parseCents, todayISO } from '../shared/finance';
import type { AppEnv } from './crud';

// Atajo de iOS (automatización «Transacción» de Wallet): apunta cada pago con Apple Pay.
// Va fuera de Cloudflare Access (aplicación «bypass» solo para /api/atajo/*), así que se
// autentica con un token propio por usuario, del que solo se guarda el hash.

const eurFmt = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });

export async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Genera un token nuevo para el usuario (invalida el anterior) y lo devuelve en claro. */
export async function issueToken(db: D1Database, owner: string): Promise<string> {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const token = 'fz_' + btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  await db.prepare('UPDATE users SET shortcut_token_hash = ? WHERE email = ?').bind(await hashToken(token), owner).run();
  return token;
}

const text = (v: unknown, max: number) => (v == null ? '' : String(v).trim().slice(0, max));

export const shortcut = new Hono<AppEnv>();

shortcut.use(async (c, next) => {
  const token = c.req.header('Authorization')?.match(/^Bearer\s+(\S+)$/i)?.[1];
  const user = token
    ? await c.env.DB.prepare('SELECT email FROM users WHERE shortcut_token_hash = ?').bind(await hashToken(token)).first<{ email: string }>()
    : null;
  if (!user) throw new HTTPException(401, { message: 'Token no válido' });
  c.set('email', user.email);
  await next();
});

shortcut.post('/pago', async (c) => {
  const db = c.env.DB;
  const owner = c.var.email;
  const body = await c.req.json<Record<string, unknown>>();

  // Wallet da el importe como texto con moneda («12,34 €», «€1,234.50»…); con los dos
  // separadores, el último es el decimal.
  let amount = text(body.importe, 40).replace(/[^\d,.-]/g, '');
  if (/,\d*\.\d{1,2}$/.test(amount)) amount = amount.replace(/,/g, '');
  const cents = parseCents(amount);
  if (!cents) throw new HTTPException(400, { message: 'Importe no válido' });
  const note = text(body.descripcion, 200) || 'Apple Pay';
  const card = text(body.tarjeta, 80).toLowerCase();
  const date = /^\d{4}-\d{2}-\d{2}$/.test(text(body.fecha, 10)) ? text(body.fecha, 10) : todayISO();
  const kind = cents > 0 ? 'gasto' : 'ingreso'; // importe negativo = devolución

  // Cuenta: la que tenga esa tarjeta de Cartera (o se llame como ella); si no, la elegida en Ajustes.
  const { results: accounts } = await db
    .prepare('SELECT id, name, wallet_card FROM accounts WHERE owner = ? AND archived = 0')
    .bind(owner)
    .all<{ id: number; name: string; wallet_card: string | null }>();
  const user = await db.prepare('SELECT shortcut_account_id FROM users WHERE email = ?').bind(owner).first<{ shortcut_account_id: number | null }>();
  const norm = (s: string | null) => (s ?? '').trim().toLowerCase();
  // La coincidencia aproximada solo vale si es única: con débito y crédito del mismo banco
  // («BBVA» y «BBVA Crédito») no se adivina, para no apuntar el pago en la cuenta equivocada.
  const fuzzy = accounts.filter((a) => !a.wallet_card && (card.includes(norm(a.name)) || norm(a.name).includes(card)));
  const byCard = card
    ? accounts.find((a) => norm(a.wallet_card) === card) ??
      accounts.find((a) => norm(a.name) === card) ??
      (fuzzy.length === 1 ? fuzzy[0] : undefined)
    : undefined;
  const account = byCard ?? accounts.find((a) => a.id === user?.shortcut_account_id);
  if (!account) throw new HTTPException(400, { message: 'Elige en Ajustes → Atajo de iOS la cuenta donde apuntar los pagos' });

  // Categoría: la del último movimiento con la misma descripción.
  const prev = await db
    .prepare(
      `SELECT category_id FROM transactions
       WHERE owner = ? AND kind = ? AND lower(note) = lower(?) AND category_id IS NOT NULL
       ORDER BY date DESC, id DESC LIMIT 1`,
    )
    .bind(owner, kind, note)
    .first<{ category_id: number }>();

  const row = await db
    .prepare('INSERT INTO transactions (owner, kind, amount, date, account_id, category_id, note) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id')
    .bind(owner, kind, Math.abs(cents), date, account.id, prev?.category_id ?? null, note)
    .first<{ id: number }>();

  return c.json(
    { ok: true, id: row!.id, mensaje: `Apuntado: ${eurFmt.format(Math.abs(cents) / 100)} · ${note} · ${account.name}` },
    201,
  );
});
