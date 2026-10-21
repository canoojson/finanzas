// Plantilla HTML del informe mensual (se imprime a PDF con Browser Rendering).
import type { Insights } from './insights';
import type { ReportData } from './data';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const fmt = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', useGrouping: 'always' });
const fmt0 = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0, useGrouping: 'always' });
const eur = (c: number) => fmt.format(c / 100);
const eur0 = (c: number) => fmt0.format(Math.round(c / 100));
const monthName = (m: string) => new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${m}-01T00:00:00Z`));
const monthShort = (m: string) => new Intl.DateTimeFormat('es-ES', { month: 'short', timeZone: 'UTC' }).format(new Date(`${m}-01T00:00:00Z`)).replace('.', '');
const day = (d: string) => new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${d}T00:00:00Z`));

/** Variación respecto a una referencia, con color (para gastos, subir es malo). */
function delta(now: number, ref: number, goodWhenUp = false) {
  if (!ref) return '<span class="muted">—</span>';
  const pct = Math.round(((now - ref) / ref) * 100);
  if (pct === 0) return '<span class="muted">=</span>';
  const up = pct > 0;
  const good = up === goodWhenUp;
  return `<span class="${good ? 'good' : 'bad'}">${up ? '▲' : '▼'} ${Math.abs(pct)} %</span>`;
}

function seriesChart(series: ReportData['series']) {
  const max = Math.max(1, ...series.flatMap((s) => [s.income, s.expense]));
  const w = 520;
  const h = 150;
  const col = w / series.length;
  const bw = 22;
  const bars = series
    .map((s, i) => {
      const x = i * col + col / 2;
      const hi = (s.income / max) * (h - 24);
      const he = (s.expense / max) * (h - 24);
      return `
        <rect x="${x - bw - 2}" y="${h - 18 - hi}" width="${bw}" height="${Math.max(hi, 1)}" rx="3" fill="var(--pos)"/>
        <rect x="${x + 2}" y="${h - 18 - he}" width="${bw}" height="${Math.max(he, 1)}" rx="3" fill="var(--neg)"/>
        <text x="${x}" y="${h - 4}" text-anchor="middle" class="axis">${monthShort(s.month)}</text>`;
    })
    .join('');
  return `<svg viewBox="0 0 ${w} ${h}" width="100%" role="img" aria-label="Ingresos y gastos de los últimos 6 meses">
    <line x1="0" x2="${w}" y1="${h - 18}" y2="${h - 18}" stroke="var(--line)"/>${bars}</svg>`;
}

export function reportHtml(d: ReportData, advice: Insights) {
  const saved = d.income - d.expense;
  const rate = d.income > 0 ? Math.round((saved / d.income) * 100) : null;
  const maxCat = Math.max(1, ...d.categories.map((c) => c.total));
  const target = d.savingsTarget;

  const catRows = d.categories
    .map(
      (c) => `
      <tr>
        <td class="cat"><span class="dot" style="background:${esc(c.color)}"></span>${esc(c.icon)} ${esc(c.name)}</td>
        <td class="barcell"><div class="bar" style="width:${(c.total / maxCat) * 100}%;background:${esc(c.color)}"></div></td>
        <td class="num">${eur(c.total)}</td>
        <td class="num small">${d.expense ? Math.round((c.total / d.expense) * 100) : 0} %</td>
        <td class="num small">${delta(c.total, c.prev)}</td>
        <td class="num small">${delta(c.total, c.avg3)}</td>
      </tr>`,
    )
    .join('');

  const adviceHtml = advice.recomendaciones.length || advice.alerta || advice.puntos_fuertes.length
    ? `
    <section class="advice">
      <h2>Recomendaciones</h2>
      <p class="lead">${esc(advice.resumen)}</p>
      ${advice.alerta ? `<p class="alert">⚠️ ${esc(advice.alerta)}</p>` : ''}
      ${
        advice.puntos_fuertes.length
          ? `<div class="strengths"><strong>Lo que has hecho bien</strong><ul>${advice.puntos_fuertes.map((p) => `<li>${esc(p)}</li>`).join('')}</ul></div>`
          : ''
      }
      ${advice.recomendaciones.length ? '' : '<p class="muted">Este mes no hay nada destacable que recortar. ¡Bien hecho!</p>'}
      <ol class="recs">
        ${advice.recomendaciones
          .map(
            (r) => `<li>
              <div class="rec-head"><strong>${esc(r.titulo)}</strong><span class="chip">${esc(r.categoria)}</span>${
                r.ahorro > 0 ? `<span class="save">≈ ${eur0(r.ahorro)}/mes</span>` : ''
              }</div>
              <p>${esc(r.detalle)}</p>
            </li>`,
          )
          .join('')}
      </ol>
      <div class="plan"><strong>🎯 Plan para tu objetivo de ahorro</strong><p>${esc(advice.plan_objetivo)}</p></div>
      <p class="disclaimer">Recomendaciones calculadas automáticamente a partir de tus movimientos (comparando con tus meses anteriores). Son orientativas.</p>
    </section>`
    : '';

  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8">
<title>Resumen de ${esc(monthName(d.month))}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
  :root { --text:#16181d; --muted:#6b7280; --line:#e3e6ea; --soft:#f4f5f7; --accent:#4f5bd5; --pos:#198754; --neg:#d63c3c; }
  @page { size: A4; margin: 14mm 14mm 16mm; }
  * { box-sizing: border-box; }
  body { margin:0; font-family: Inter, system-ui, sans-serif; color: var(--text); font-size: 10.5pt; line-height: 1.45; font-variant-numeric: tabular-nums; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  h1 { font-size: 22pt; margin: 0; letter-spacing: -0.02em; }
  h2 { font-size: 12.5pt; margin: 0 0 10px; }
  .muted { color: var(--muted); } .small { font-size: 9pt; } .good { color: var(--pos); } .bad { color: var(--neg); }
  header { display:flex; justify-content:space-between; align-items:flex-end; border-bottom: 3px solid var(--accent); padding-bottom: 10px; margin-bottom: 16px; }
  header .who { text-align:right; color: var(--muted); font-size: 9pt; }
  section { margin-bottom: 18px; break-inside: avoid; }
  .kpis { display:grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
  .kpi { background: var(--soft); border-radius: 10px; padding: 10px 12px; }
  .kpi .l { font-size: 8.5pt; color: var(--muted); }
  .kpi .v { font-size: 15pt; font-weight: 700; margin: 2px 0; }
  .kpi .d { font-size: 8.5pt; }
  .two { display:grid; grid-template-columns: 1.15fr 1fr; gap: 18px; }
  table { width:100%; border-collapse: collapse; }
  th { text-align:left; font-size: 8pt; text-transform: uppercase; letter-spacing: .05em; color: var(--muted); font-weight:600; padding: 4px 6px; border-bottom: 1px solid var(--line); }
  td { padding: 5px 6px; border-bottom: 1px solid var(--line); vertical-align: middle; }
  .num { text-align:right; white-space:nowrap; } th.num { text-align:right; }
  .cat { white-space:nowrap; } .dot { display:inline-block; width:8px; height:8px; border-radius:50%; margin-right:6px; }
  .barcell { width: 26%; } .bar { height: 8px; border-radius: 4px; min-width: 2px; }
  .axis { font-size: 12px; fill: var(--muted); font-family: Inter, sans-serif; }
  .legend { font-size: 8.5pt; color: var(--muted); } .legend i { display:inline-block; width:9px; height:9px; border-radius:2px; margin: 0 4px 0 10px; vertical-align: -1px; }
  .split { display:flex; height: 12px; border-radius: 6px; overflow:hidden; margin: 6px 0; }
  .goal { margin-bottom: 8px; } .goal .track { height: 7px; background: var(--soft); border-radius: 4px; overflow:hidden; margin: 3px 0; } .goal .fill { height:100%; background: var(--accent); }
  .advice { background: #f6f7fe; border: 1px solid #e1e4fb; border-radius: 12px; padding: 14px 16px; }
  .lead { font-size: 11pt; margin: 0 0 8px; }
  .alert { background:#fdecec; color:#9b1c1c; border-radius: 8px; padding: 6px 10px; }
  .strengths ul { margin: 4px 0 8px; padding-left: 18px; }
  .recs { padding-left: 18px; margin: 8px 0; } .recs li { margin-bottom: 8px; } .recs p { margin: 2px 0 0; }
  .rec-head { display:flex; gap: 8px; align-items: baseline; flex-wrap: wrap; }
  .chip { font-size: 8pt; background: white; border: 1px solid var(--line); border-radius: 999px; padding: 0 7px; color: var(--muted); }
  .save { font-size: 9pt; color: var(--pos); font-weight: 600; margin-left: auto; }
  .plan { background: white; border-radius: 8px; padding: 8px 12px; margin-top: 6px; } .plan p { margin: 2px 0 0; }
  .disclaimer { font-size: 7.5pt; color: var(--muted); margin: 10px 0 0; }
  footer { font-size: 7.5pt; color: var(--muted); text-align: center; margin-top: 8px; }
</style></head>
<body>
  <header>
    <div><div class="muted small">Informe mensual</div><h1>Resumen de ${esc(monthName(d.month))}</h1></div>
    <div class="who">${d.name ? `${esc(d.name)}<br>` : ''}Generado el ${esc(day(d.generatedAt))}<br>${d.movements} movimientos</div>
  </header>

  <section class="kpis">
    <div class="kpi"><div class="l">Ingresos</div><div class="v good">${eur(d.income)}</div><div class="d">${delta(d.income, d.prevIncome, true)} vs mes anterior</div></div>
    <div class="kpi"><div class="l">Gastos</div><div class="v bad">${eur(d.expense)}</div><div class="d">${delta(d.expense, d.prevExpense)} vs mes anterior</div></div>
    <div class="kpi"><div class="l">Ahorro del mes</div><div class="v ${saved < 0 ? 'bad' : ''}">${eur(saved)}</div><div class="d">${rate !== null ? `${rate} % de los ingresos` : '—'}</div></div>
    <div class="kpi"><div class="l">Objetivo de ahorro</div><div class="v">${target ? eur(target) : '—'}</div><div class="d">${
      target ? (saved >= target ? '<span class="good">✓ Conseguido</span>' : `<span class="bad">Faltan ${eur(target - saved)}</span>`) : 'Sin definir'
    }</div></div>
  </section>

  <section>
    <h2>Gasto por categoría</h2>
    ${
      d.categories.length
        ? `<table><thead><tr><th>Categoría</th><th></th><th class="num">Importe</th><th class="num">% total</th><th class="num">vs mes ant.</th><th class="num">vs media 3m</th></tr></thead><tbody>${catRows}</tbody></table>`
        : '<p class="muted">No hay gastos apuntados este mes.</p>'
    }
  </section>

  <div class="two">
    <section>
      <h2>Últimos 6 meses</h2>
      ${seriesChart(d.series)}
      <div class="legend"><i style="background:var(--pos)"></i>Ingresos<i style="background:var(--neg)"></i>Gastos</div>
    </section>
    <section>
      <h2>Fijos y variables</h2>
      <div class="split">
        <div style="width:${d.expense ? (d.fixed / d.expense) * 100 : 0}%;background:#6c7bd8"></div>
        <div style="flex:1;background:#e0a33a"></div>
      </div>
      <table>
        <tr><td><span class="dot" style="background:#6c7bd8"></span>Fijos (recurrentes y cuotas)</td><td class="num">${eur(d.fixed)}</td></tr>
        <tr><td><span class="dot" style="background:#e0a33a"></span>Variables</td><td class="num">${eur(d.variable)}</td></tr>
        <tr><td>💳 Con tarjeta de crédito</td><td class="num">${eur(d.cardSpend)}</td></tr>
        <tr><td>Saldo actual en cuentas</td><td class="num">${eur(d.cash)}</td></tr>
        <tr><td>Deuda pendiente</td><td class="num">${eur(d.debt)}</td></tr>
      </table>
    </section>
  </div>

  <div class="two">
    <section>
      <h2>Mayores gastos</h2>
      ${
        d.topExpenses.length
          ? `<table>${d.topExpenses
              .map((t) => `<tr><td class="small muted">${esc(day(t.date))}</td><td>${esc(t.note || t.category)}<div class="small muted">${esc(t.note ? t.category : t.account)}</div></td><td class="num">${eur(t.amount)}</td></tr>`)
              .join('')}</table>`
          : '<p class="muted">Sin gastos.</p>'
      }
    </section>
    <section>
      <h2>Metas de ahorro</h2>
      ${
        d.goals.length
          ? d.goals
              .map(
                (g) => `<div class="goal"><div style="display:flex;justify-content:space-between"><strong>${esc(g.name)}</strong><span class="small">${eur(g.current)} de ${eur(g.target)}</span></div>
                <div class="track"><div class="fill" style="width:${Math.min(100, (g.current / g.target) * 100)}%"></div></div>
                <div class="small muted">${g.perMonth ? `${eur(g.perMonth)}/mes para llegar a tiempo` : g.current >= g.target ? '¡Conseguida!' : 'Sin fecha límite'}</div></div>`,
              )
              .join('')
          : '<p class="muted small">No tienes metas creadas. Puedes añadirlas en la pestaña Ahorro.</p>'
      }
    </section>
  </div>

  ${adviceHtml}

</body></html>`;
}
