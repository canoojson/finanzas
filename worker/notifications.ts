import { buildPushHTTPRequest } from '@pushforge/builder';
import { addDays, BUDGET_WARN } from '../shared/finance';
import type { Env } from './auth';

export interface PushPayload {
  title: string;
  body: string;
  url?: string; // a dónde lleva al tocar la notificación
  tag?: string; // notificaciones con la misma etiqueta se sustituyen
}

/** Envía una notificación a todos los dispositivos del usuario. Devuelve cuántos la aceptaron. */
export async function sendPush(env: Env, owner: string, payload: PushPayload): Promise<number> {
  const { results } = await env.DB.prepare('SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE owner = ?')
    .bind(owner)
    .all<{ id: number; endpoint: string; p256dh: string; auth: string }>();
  let sent = 0;
  for (const s of results) {
    try {
      const req = await buildPushHTTPRequest({
        privateJWK: env.VAPID_PRIVATE_JWK,
        subscription: { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        message: { payload: { ...payload }, adminContact: env.VAPID_SUBJECT, options: { ttl: 12 * 3600, urgency: 'normal' } },
      });
      const res = await fetch(req.endpoint, { method: 'POST', headers: req.headers, body: req.body });
      console.log('push', payload.tag ?? '-', owner, new URL(s.endpoint).host, res.status);
      if (res.status === 404 || res.status === 410) {
        // El dispositivo ya no existe o retiró el permiso.
        await env.DB.prepare('DELETE FROM push_subscriptions WHERE id = ?').bind(s.id).run();
      } else if (res.ok) {
        sent++;
      } else {
        console.warn('push rechazado', res.status, await res.text());
      }
    } catch (e) {
      console.error('push fallido', e);
    }
  }
  return sent;
}

const WEEKDAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** Fecha, hora y día de la semana en Madrid, y el inicio del día local en UTC (formato SQLite). */
export function madridNow(now = new Date()) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'Europe/Madrid',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      weekday: 'short',
      hourCycle: 'h23',
    })
      .formatToParts(now)
      .map((x) => [x.type, x.value]),
  );
  const hour = Number(p.hour);
  const elapsed = (hour * 3600 + Number(p.minute) * 60 + Number(p.second)) * 1000;
  return {
    date: `${p.year}-${p.month}-${p.day}`,
    hour,
    weekday: WEEKDAYS[p.weekday],
    dayStartUtc: new Date(now.getTime() - elapsed).toISOString().slice(0, 19).replace('T', ' '),
  };
}

const eur = (cents: number) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', useGrouping: 'always' }).format(cents / 100);

interface ReminderUser {
  email: string;
  reminder_days: string;
  reminder_hour: number;
  reminder_skip_if_logged: number;
  hold_alerts: number;
  last_reminder: string | null;
  last_hold_alert: string | null;
}

/** Se ejecuta cada hora: recordatorio de apuntar movimientos y aviso de retenciones que se cobran mañana. */
export async function runReminders(env: Env, now = new Date()) {
  const db = env.DB;
  const m = madridNow(now);
  const { results: users } = await db
    .prepare('SELECT * FROM users u WHERE EXISTS (SELECT 1 FROM push_subscriptions p WHERE p.owner = u.email)')
    .all<ReminderUser>();

  for (const u of users) {
    if (u.hold_alerts && m.hour === 9 && u.last_hold_alert !== m.date) {
      await db.prepare('UPDATE users SET last_hold_alert = ? WHERE email = ?').bind(m.date, u.email).run();
      const { results: holds } = await db
        .prepare("SELECT concept, amount FROM holds WHERE owner = ? AND status = 'pendiente' AND charge_date = ? ORDER BY amount DESC")
        .bind(u.email, addDays(m.date, 1))
        .all<{ concept: string; amount: number }>();
      if (holds.length) {
        const total = holds.reduce((s, h) => s + h.amount, 0);
        await sendPush(env, u.email, {
          title: holds.length === 1 ? 'Mañana se cobra una retención' : `Mañana se cobran ${holds.length} retenciones`,
          body: holds.length === 1 ? `${holds[0].concept}: ${eur(total)}` : `${holds.map((h) => h.concept).join(', ')} · ${eur(total)} en total`,
          url: '/#retenciones',
          tag: 'holds',
        });
      }
    }

    const days = u.reminder_days.split(',').filter(Boolean).map(Number);
    if (m.hour === u.reminder_hour && days.includes(m.weekday) && u.last_reminder !== m.date) {
      // Se marca antes de enviar para no repetir si el cron se reintenta.
      await db.prepare('UPDATE users SET last_reminder = ? WHERE email = ?').bind(m.date, u.email).run();
      if (u.reminder_skip_if_logged) {
        const logged = await db
          .prepare('SELECT 1 FROM transactions WHERE owner = ? AND recurring_id IS NULL AND loan_id IS NULL AND created_at >= ? LIMIT 1')
          .bind(u.email, m.dayStartUtc)
          .first();
        if (logged) continue;
      }
      await sendPush(env, u.email, {
        title: 'Finanzas',
        body: '¿Has apuntado los gastos de hoy? Es un minuto 🙂',
        url: '/#movimientos',
        tag: 'reminder',
      });
    }
  }
}


/**
 * Avisa de las categorías que han llegado al 90 % de su presupuesto este mes (solo lo ya gastado,
 * sin contar lo previsto). Una vez por categoría y mes. Sin `owner`, revisa a todos los usuarios.
 */
export async function checkBudgets(env: Env, owner?: string, now = new Date()) {
  const db = env.DB;
  const { date } = madridNow(now);
  const month = date.slice(0, 7);
  const args: string[] = [`${month}-01`, date, month];
  if (owner) args.push(owner);
  const { results } = await db
    .prepare(
      `SELECT c.id, c.owner, c.name, c.icon, c.budget,
              COALESCE((SELECT SUM(t.amount) FROM transactions t
                        WHERE t.category_id = c.id AND t.kind = 'gasto' AND t.date BETWEEN ?1 AND ?2), 0) AS spent
       FROM categories c JOIN users u ON u.email = c.owner
       WHERE c.kind = 'gasto' AND c.archived = 0 AND c.budget IS NOT NULL AND u.budget_alerts = 1
         AND (c.budget_alert IS NULL OR c.budget_alert < ?3)${owner ? ' AND c.owner = ?4' : ''}`,
    )
    .bind(...args)
    .all<{ id: number; owner: string; name: string; icon: string | null; budget: number; spent: number }>();

  for (const c of results.filter((r) => r.spent >= r.budget * BUDGET_WARN)) {
    // Se marca antes de enviar para no repetir si el cron se reintenta o coinciden dos peticiones.
    const res = await db
      .prepare('UPDATE categories SET budget_alert = ? WHERE id = ? AND (budget_alert IS NULL OR budget_alert < ?)')
      .bind(month, c.id, month)
      .run();
    if (!res.meta.changes) continue;
    const over = c.spent > c.budget;
    await sendPush(env, c.owner, {
      title: over ? `Te has pasado en ${c.name} ${c.icon ?? ''}`.trim() : `Casi sin presupuesto en ${c.name} ${c.icon ?? ''}`.trim(),
      body: over
        ? `Llevas ${eur(c.spent)} de ${eur(c.budget)}: ${eur(c.spent - c.budget)} por encima.`
        : `Llevas ${eur(c.spent)} de ${eur(c.budget)}. Solo te quedan ${eur(c.budget - c.spent)} este mes.`,
      url: '/#resumen',
      tag: `budget-${c.id}`,
    });
  }
}
