const eurFmt = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', useGrouping: 'always' });
const eurShortFmt = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0, useGrouping: 'always' });

/** Céntimos → "1.234,56 €". */
export const eur = (cents: number) => eurFmt.format(cents / 100);
export const eurShort = (cents: number) => eurShortFmt.format(Math.round(cents / 100));
export const signedEur = (cents: number) => (cents > 0 ? '+' : '') + eur(cents);

/** Texto del usuario ("1.234,5", "12.50", "7") → céntimos, o null si no es válido. */
export function parseCents(text: string): number | null {
  let s = text.replace(/\s|€/g, '');
  if (!s) return null;
  if (s.includes(',') && s.includes('.')) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, ''); // "12.000" = doce mil
  else s = s.replace(',', '.');
  if (!/^-?\d+(\.\d{0,2})?$/.test(s)) return null;
  return Math.round(Number(s) * 100);
}

/** Céntimos → texto editable ("12,5" → "12,50"). */
export const centsToInput = (cents: number | null | undefined) =>
  cents == null ? '' : (cents / 100).toFixed(2).replace('.', ',');

const monthFmt = new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const monthShortFmt = new Intl.DateTimeFormat('es-ES', { month: 'short', timeZone: 'UTC' });
const dayFmt = new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
const dateFmt = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const monthYearFmt = new Intl.DateTimeFormat('es-ES', { month: 'short', year: 'numeric', timeZone: 'UTC' });

const utc = (iso: string) => new Date(`${iso.length === 7 ? iso + '-01' : iso}T00:00:00Z`);
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export const monthLabel = (ym: string) => cap(monthFmt.format(utc(ym)));
export const monthShort = (ym: string) => monthShortFmt.format(utc(ym)).replace('.', '');
export const dayLabel = (iso: string) => cap(dayFmt.format(utc(iso)));
export const dateLabel = (iso: string) => dateFmt.format(utc(iso));
export const monthYear = (iso: string) => monthYearFmt.format(utc(iso));

export function shiftMonth(ym: string, k: number): string {
  const [y, m] = ym.split('-').map(Number);
  const t = y * 12 + m - 1 + k;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
}

/** Meses completos entre hoy y una fecha (mínimo 1). */
export function monthsUntil(today: string, iso: string): number {
  const [y1, m1] = today.split('-').map(Number);
  const [y2, m2] = iso.split('-').map(Number);
  return Math.max(1, (y2 - y1) * 12 + (m2 - m1));
}

export const ACCOUNT_TYPES: Record<string, string> = {
  corriente: 'Cuenta corriente',
  ahorro: 'Ahorro',
  efectivo: 'Efectivo',
  inversion: 'Inversión',
  tarjeta: 'Tarjeta de crédito',
};

export const PALETTE = ['#6c7bd8', '#4f9d69', '#e0a33a', '#3a9fc4', '#d9734e', '#b65fc4', '#d65a8b', '#4bb3a4', '#c45252', '#7e8794'];
