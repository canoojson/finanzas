// Vigilancia del uso diario del plan gratuito de Cloudflare. Cada hora consulta la API GraphQL de
// analíticas y, si alguna métrica pasa de un umbral, avisa solo al administrador (ADMIN_EMAIL)
// con una notificación push. Los contadores se reinician a las 00:00 UTC.
import type { Env } from './auth';
import { sendPush } from './notifications';

/** Límites diarios del plan gratuito (suman todos los Workers de la cuenta). */
export const LIMITS = {
  requests: { label: 'Peticiones a Workers', max: 100_000 },
  rowsRead: { label: 'Filas leídas en D1', max: 5_000_000 },
  rowsWritten: { label: 'Filas escritas en D1', max: 100_000 },
} as const;
export type Metric = keyof typeof LIMITS;

/** Porcentajes del límite a partir de los que se avisa (una vez por umbral y día). */
export const LEVELS = [70, 90];

export interface Usage {
  day: string; // fecha UTC
  metrics: Record<Metric, { used: number; max: number; label: string; pct: number }>;
}

const QUERY = `query ($account: String!, $day: Date!) {
  viewer { accounts(filter: { accountTag: $account }) {
    workersInvocationsAdaptive(limit: 1000, filter: { date: $day }) { sum { requests } }
    d1AnalyticsAdaptiveGroups(limit: 1000, filter: { date: $day }) { sum { rowsRead rowsWritten } }
  } }
}`;

export const usageConfigured = (env: Env) => Boolean(env.ADMIN_EMAIL && env.CF_ACCOUNT_ID && env.CF_ANALYTICS_TOKEN);

export const isAdmin = (env: Env, email: string) => Boolean(env.ADMIN_EMAIL) && env.ADMIN_EMAIL.trim().toLowerCase() === email;

/** Uso del día (UTC) según las analíticas de Cloudflare (llevan unos minutos de retraso). */
export async function fetchUsage(env: Env, now = new Date()): Promise<Usage> {
  const day = now.toISOString().slice(0, 10);
  const res = await fetch('https://api.cloudflare.com/client/v4/graphql', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.CF_ANALYTICS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: QUERY, variables: { account: env.CF_ACCOUNT_ID, day } }),
  });
  const json = await res.json<any>().catch(() => null);
  if (!res.ok || !json?.data || json.errors?.length)
    throw new Error(`Analíticas de Cloudflare: ${res.status} ${JSON.stringify(json?.errors ?? json)?.slice(0, 300)}`);
  const a = json.data.viewer.accounts[0] ?? {};
  const sum = (groups: any[] | undefined, k: string) => (groups ?? []).reduce((s, g) => s + (g.sum?.[k] ?? 0), 0);
  const used: Record<Metric, number> = {
    requests: sum(a.workersInvocationsAdaptive, 'requests'),
    rowsRead: sum(a.d1AnalyticsAdaptiveGroups, 'rowsRead'),
    rowsWritten: sum(a.d1AnalyticsAdaptiveGroups, 'rowsWritten'),
  };
  const metrics = Object.fromEntries(
    (Object.keys(LIMITS) as Metric[]).map((k) => [k, { used: used[k], max: LIMITS[k].max, label: LIMITS[k].label, pct: (used[k] / LIMITS[k].max) * 100 }]),
  ) as Usage['metrics'];
  return { day, metrics };
}

const fmt = (n: number) => n.toLocaleString('es-ES', { useGrouping: 'always' } as Intl.NumberFormatOptions);

/** Se ejecuta cada hora desde el cron. Sin ADMIN_EMAIL, CF_ACCOUNT_ID o CF_ANALYTICS_TOKEN no hace nada. */
export async function checkUsage(env: Env, now = new Date()) {
  if (!usageConfigured(env)) return;
  const usage = await fetchUsage(env, now);
  const admin = env.ADMIN_EMAIL.trim().toLowerCase();
  for (const [metric, m] of Object.entries(usage.metrics)) {
    const level = [...LEVELS].reverse().find((l) => m.pct >= l);
    if (!level) continue;
    // Solo avisa si es un umbral más alto que el último avisado hoy para esta métrica.
    const res = await env.DB.prepare(
      `INSERT INTO usage_alerts (day, metric, level) VALUES (?, ?, ?)
       ON CONFLICT(day, metric) DO UPDATE SET level = excluded.level WHERE excluded.level > usage_alerts.level`,
    )
      .bind(usage.day, metric, level)
      .run();
    if (!res.meta.changes) continue;
    const sent = await sendPush(env, admin, {
      title: `⚠️ Cloudflare: ${Math.floor(m.pct)} % del límite diario`,
      body: `${m.label}: ${fmt(m.used)} de ${fmt(m.max)}. Se reinicia a las 00:00 UTC (las ${resetHourMadrid(now)} en España).`,
      url: '/#ajustes',
      tag: `usage-${metric}`,
    });
    if (!sent) console.warn('aviso de uso sin dispositivos', metric, Math.floor(m.pct));
  }
}

/** Hora de Madrid a la que se reinician los contadores (00:00 UTC). */
function resetHourMadrid(now: Date) {
  const midnight = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  return new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit' }).format(midnight);
}
