// Cobros de un recurrente teniendo en cuenta los cambios puntuales (otra fecha, otro importe, saltar).
import { addDays, recurringDates } from './finance';

/** Cuántos días se puede mover un cobro respecto a su fecha programada. */
export const MAX_SHIFT_DAYS = 45;

export interface RecurringLike {
  id: number;
  amount: number;
  day: number;
  start_date: string;
  end_date: string | null;
  last_run: string | null;
}

export interface Override {
  recurring_id: number;
  scheduled_date: string;
  new_date: string | null;
  new_amount: number | null;
  skip: number;
}

export interface Occurrence {
  scheduled: string; // fecha programada (identifica el cobro)
  date: string; // fecha real
  amount: number;
  skip: boolean;
  done: boolean; // ya apuntado
  modified: boolean;
}

/**
 * Cobros pendientes de procesar (programados después de `last_run`) cuya fecha programada llega
 * hasta `until` + el margen de movimiento, para no perder los adelantados.
 * `done` contiene las fechas programadas ya apuntadas de este recurrente.
 */
export function occurrences(r: RecurringLike, overrides: Override[], done: Set<string>, until: string): Occurrence[] {
  const byDate = new Map(overrides.filter((o) => o.recurring_id === r.id).map((o) => [o.scheduled_date, o]));
  return recurringDates(r, r.last_run, addDays(until, MAX_SHIFT_DAYS)).map((scheduled) => {
    const o = byDate.get(scheduled);
    return {
      scheduled,
      date: o?.new_date ?? scheduled,
      amount: o?.new_amount ?? r.amount,
      skip: !!o?.skip,
      done: done.has(scheduled),
      modified: !!o,
    };
  });
}

/** Nuevo `last_run`: la última fecha programada hasta la que todo está apuntado o saltado. */
export function watermark(r: RecurringLike, occ: Occurrence[]): string | null {
  let w = r.last_run;
  for (const o of occ) {
    if (!o.done && !o.skip) break;
    w = o.scheduled;
  }
  return w;
}

/** Agrupa las fechas programadas ya apuntadas por recurrente. */
export function doneByRecurring(rows: { recurring_id: number; occurrence: string | null }[]) {
  const map = new Map<number, Set<string>>();
  for (const r of rows) {
    if (!r.occurrence) continue;
    if (!map.has(r.recurring_id)) map.set(r.recurring_id, new Set());
    map.get(r.recurring_id)!.add(r.occurrence);
  }
  return (id: number) => map.get(id) ?? new Set<string>();
}
