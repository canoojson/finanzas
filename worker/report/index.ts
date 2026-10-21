// Genera, guarda y avisa del informe mensual en PDF.
import puppeteer from '@cloudflare/puppeteer';
import type { Env } from '../auth';
import { madridNow, sendPush } from '../notifications';
import { buildReportData } from './data';
import { reportHtml } from './html';
import { computeInsights } from './insights';

async function renderPdf(browserBinding: Fetcher, html: string): Promise<Uint8Array> {
  const browser = await puppeteer.launch(browserBinding);
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' }); // espera a la fuente
    return await page.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true });
  } finally {
    await browser.close();
  }
}

export async function generateReport(env: Env, owner: string, month: string) {
  const data = await buildReportData(env.DB, owner, month);
  const insights = computeInsights(data);
  const pdf = await renderPdf(env.BROWSER, reportHtml(data, insights));
  await env.DB.prepare(
    `INSERT INTO reports (owner, month, pdf, data, ai) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(owner, month) DO UPDATE SET pdf = excluded.pdf, data = excluded.data, ai = excluded.ai, created_at = datetime('now')`,
  )
    .bind(owner, month, pdf, JSON.stringify({ data, insights }), 0)
    .run();
  return { month, size: pdf.byteLength };
}

const prevMonth = (date: string) => {
  const [y, m] = date.split('-').map(Number);
  const t = y * 12 + m - 2;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
};

/** Día 1 a las 8:00 (Madrid): informe del mes anterior para quien tenga movimientos ese mes. */
export async function runMonthlyReports(env: Env, now = new Date()) {
  const m = madridNow(now);
  if (!m.date.endsWith('-01') || m.hour !== 8) return;
  const month = prevMonth(m.date);
  const { results } = await env.DB.prepare(
    `SELECT DISTINCT owner FROM transactions WHERE date BETWEEN ? AND ?
     AND owner NOT IN (SELECT owner FROM reports WHERE month = ?)`,
  )
    .bind(`${month}-01`, `${month}-31`, month)
    .all<{ owner: string }>();
  for (const { owner } of results) {
    try {
      await generateReport(env, owner, month);
      const name = new Intl.DateTimeFormat('es-ES', { month: 'long', timeZone: 'UTC' }).format(new Date(`${month}-01T00:00:00Z`));
      await sendPush(env, owner, {
        title: `Tu resumen de ${name} está listo 📊`,
        body: 'Cómo te fue el mes y dónde puedes ahorrar.',
        url: '/#informes',
        tag: 'report',
      });
    } catch (e) {
      console.error('informe mensual fallido', owner, e);
    }
  }
}
