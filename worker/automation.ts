import { addDays, schedule, todayISO, type Loan } from '../shared/finance';
import { doneByRecurring, occurrences, watermark, type Override } from '../shared/recurrence';
import { chargeDates, isConfiguredCard, statementAmount, type CardAccount, type Movement } from '../shared/forecast';

/** Apunta los movimientos recurrentes y las cuotas automáticas vencidas hasta hoy. */
export async function materialize(db: D1Database, owner: string, today = todayISO()) {
  const [recurring, loans, overrides, doneRows] = await Promise.all([
    db.prepare('SELECT * FROM recurring WHERE owner = ? AND active = 1').bind(owner).all<any>(),
    db
      .prepare('SELECT * FROM loans WHERE owner = ? AND auto_register = 1 AND closed = 0 AND account_id IS NOT NULL')
      .bind(owner)
      .all<Loan>(),
    db.prepare('SELECT * FROM recurring_overrides WHERE owner = ?').bind(owner).all<Override>(),
    db
      .prepare('SELECT recurring_id, occurrence FROM transactions WHERE owner = ? AND recurring_id IS NOT NULL AND occurrence >= ?')
      .bind(owner, addDays(today, -120))
      .all<{ recurring_id: number; occurrence: string }>(),
  ]);
  const stmts: D1PreparedStatement[] = [];
  const doneFor = doneByRecurring(doneRows.results);

  // Cada cobro se apunta en su fecha real (puede estar movida); se identifica por su fecha programada.
  for (const r of recurring.results) {
    const occ = occurrences(r, overrides.results, doneFor(r.id), today);
    for (const o of occ) {
      if (o.done || o.skip || o.date > today) continue;
      stmts.push(
        db
          .prepare(
            `INSERT OR IGNORE INTO transactions (owner, kind, amount, date, account_id, category_id, note, recurring_id, occurrence)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(owner, r.kind, o.amount, o.date, r.account_id, r.category_id, r.note, r.id, o.scheduled),
      );
      o.done = true;
    }
    const w = watermark(r, occ);
    if (w !== r.last_run) stmts.push(db.prepare('UPDATE recurring SET last_run = ? WHERE id = ?').bind(w, r.id));
  }

  for (const l of loans.results) {
    const due = schedule(l).filter((row) => row.date <= today && (!l.last_run || row.date > l.last_run));
    if (!due.length) continue;
    for (const row of due) {
      stmts.push(
        db
          .prepare(
            `INSERT OR IGNORE INTO transactions (owner, kind, amount, date, account_id, category_id, note, loan_id)
             VALUES (?, 'gasto', ?, ?, ?, ?, ?, ?)`,
          )
          .bind(owner, row.payment, row.date, l.account_id, l.category_id, `Cuota ${row.n} · ${l.name}`, l.id),
      );
    }
    stmts.push(db.prepare('UPDATE loans SET last_run = ? WHERE id = ?').bind(due.at(-1)!.date, l.id));
  }

  if (stmts.length) await db.batch(stmts);
  await settleCards(db, owner, today);
}

/** Apunta el cargo de cada tarjeta el día que toca: transferencia de la cuenta de cargo a la tarjeta. */
async function settleCards(db: D1Database, owner: string, today: string) {
  const { results: cards } = await db
    .prepare("SELECT * FROM accounts WHERE owner = ? AND type = 'tarjeta' AND archived = 0 AND card_settle_from IS NOT NULL")
    .bind(owner)
    .all<CardAccount>();
  for (const card of cards.filter(isConfiguredCard)) {
    const due = chargeDates(card, addDays(card.card_settle_from!, -1), today);
    if (!due.length) continue;
    const { results: movements } = await db
      .prepare('SELECT kind, amount, date, account_id, to_account_id, card_cycle FROM transactions WHERE owner = ? AND (account_id = ?2 OR to_account_id = ?2)')
      .bind(owner, card.id)
      .all<Movement>();
    for (const c of due) {
      if (movements.some((m) => m.to_account_id === card.id && m.card_cycle === c.cycleEnd)) continue;
      const amount = statementAmount(card, c.cycleEnd, movements);
      if (!amount) continue;
      await db
        .prepare(
          `INSERT OR IGNORE INTO transactions (owner, kind, amount, date, account_id, to_account_id, note, card_cycle)
           VALUES (?, 'transferencia', ?, ?, ?, ?, ?, ?)`,
        )
        .bind(owner, amount, c.date, card.card_pay_account_id, card.id, `Cargo ${card.name}`, c.cycleEnd)
        .run();
      movements.push({ kind: 'transferencia', amount, date: c.date, account_id: card.card_pay_account_id!, to_account_id: card.id, card_cycle: c.cycleEnd });
    }
  }
}

export async function materializeAll(db: D1Database) {
  const { results } = await db
    .prepare(
      `SELECT owner FROM recurring WHERE active = 1
       UNION SELECT owner FROM loans WHERE auto_register = 1 AND closed = 0
       UNION SELECT owner FROM accounts WHERE type = 'tarjeta' AND card_settle_from IS NOT NULL`,
    )
    .all<{ owner: string }>();
  const today = todayISO();
  for (const { owner } of results) await materialize(db, owner, today);
}
