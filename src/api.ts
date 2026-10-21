import type { Loan } from '../shared/finance';

export interface Account {
  id: number;
  name: string;
  type: 'corriente' | 'ahorro' | 'efectivo' | 'inversion' | 'tarjeta';
  initial_balance: number;
  color: string | null;
  archived: number;
  balance: number;
  card_cutoff_day: number | null;
  card_charge_day: number | null;
  card_pay_account_id: number | null;
  card_settle_from: string | null;
}
export interface Category {
  id: number;
  name: string;
  kind: 'gasto' | 'ingreso';
  icon: string | null;
  color: string | null;
  archived: number;
}
export interface Transaction {
  id: number;
  kind: 'gasto' | 'ingreso' | 'transferencia';
  amount: number;
  date: string;
  account_id: number;
  to_account_id: number | null;
  category_id: number | null;
  note: string | null;
  recurring_id: number | null;
  loan_id: number | null;
  card_cycle: string | null;
}
export interface Recurring {
  id: number;
  kind: 'gasto' | 'ingreso';
  amount: number;
  account_id: number;
  category_id: number | null;
  note: string | null;
  day: number;
  start_date: string;
  end_date: string | null;
  last_run: string | null;
  active: number;
}
export interface Goal {
  id: number;
  name: string;
  target: number;
  account_id: number | null;
  saved: number;
  deadline: string | null;
  color: string | null;
}
export interface Hold {
  id: number;
  account_id: number;
  concept: string;
  amount: number;
  date: string;
  charge_date: string | null;
  status: 'pendiente' | 'cobrada' | 'liberada';
  transaction_id: number | null;
  note: string | null;
}
export type { Loan };

export type Skin = 'clasica' | 'chiikawa' | 'personalizada';

export interface Boot {
  today: string;
  user: {
    email: string;
    name: string | null;
    reminder_days: string;
    reminder_hour: number;
    reminder_skip_if_logged: number;
    hold_alerts: number;
    tour_done: number;
    savings_target: number | null;
    skin: Skin;
    skin_colors: string | null; // «#principal,#secundario,#letra»
  };
  accounts: Account[];
  categories: Category[];
  loans: Loan[];
  recurring: Recurring[];
  goals: Goal[];
  holds: Hold[];
  push: { publicKey: string; endpoints: string[] };
}

export interface Summary {
  month: string;
  byCategory: { category_id: number | null; kind: 'gasto' | 'ingreso'; total: number; count: number }[];
  series: { month: string; kind: 'gasto' | 'ingreso'; total: number }[];
}

export interface Forecast {
  month: string;
  today: string;
  until: string;
  items: ForecastItem[];
  balances: Record<string, number>;
}
export type { ForecastItem } from '../shared/forecast';
import type { ForecastItem } from '../shared/forecast';

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

/** Se dispara cuando la sesión de Cloudflare Access ha caducado. */
export const sessionExpired = new EventTarget();

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      credentials: 'same-origin',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    // Access redirige a su página de login (otro dominio) y fetch falla por CORS.
    if (navigator.onLine) sessionExpired.dispatchEvent(new Event('expired'));
    throw new ApiError(navigator.onLine ? 'Sesión caducada' : 'Sin conexión', 0);
  }
  if (res.status === 401) sessionExpired.dispatchEvent(new Event('expired'));
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError((data as any).error ?? `Error ${res.status}`, res.status);
  return data as T;
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body: unknown) => request<T>('POST', path, body),
  put: <T>(path: string, body: unknown) => request<T>('PUT', path, body),
  del: (path: string) => request<void>('DELETE', path),
};
