// Recomendaciones del informe calculadas a partir de las cifras del mes (sin IA).
import type { ReportData } from './data';

export interface Insights {
  resumen: string;
  puntos_fuertes: string[];
  recomendaciones: { titulo: string; categoria: string; detalle: string; ahorro: number }[]; // ahorro en céntimos/mes
  plan_objetivo: string;
  alerta: string | null;
}

const fmt = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0, useGrouping: 'always' });
const eur = (c: number) => fmt.format(Math.round(c / 100));
const pct = (a: number, b: number) => Math.round((a / b) * 100);
/** Redondea un ahorro a importes "humanos" (múltiplos de 5 €). */
const round5 = (c: number) => Math.max(500, Math.round(c / 500) * 500);

/** Categorías en las que normalmente se puede recortar (por nombre, en minúsculas). */
const DISCRETIONARY = /restaurante|ocio|compras|regalo|suscrip|caprich|ropa|viaje|bar|delivery|otros gastos/i;

const MIN_DIFF = 1000; // 10 €: por debajo no merece la pena recomendar nada

export function computeInsights(d: ReportData): Insights {
  const saved = d.income - d.expense;
  const rate = d.income > 0 ? saved / d.income : null;
  const recs: Insights['recomendaciones'] = [];
  const strengths: string[] = [];

  // 1. Categorías que se han disparado respecto a tu media de 3 meses (solo la parte variable).
  for (const c of d.categories) {
    const variable = c.total - c.fixed;
    const ref = c.avg3 || c.prev;
    if (!ref || variable <= 0) continue;
    const diff = c.total - ref;
    if (diff >= MIN_DIFF && c.total > ref * 1.15)
      recs.push({
        titulo: `Vuelve a tu nivel habitual en ${c.name}`,
        categoria: c.name,
        detalle: `Has gastado ${eur(c.total)}, un ${pct(diff, ref)} % más que tu media (${eur(ref)}). Revisa qué ha sido distinto este mes y ponte como tope ${eur(ref)}.`,
        ahorro: Math.min(diff, variable),
      });
    else if (c.total <= ref * 0.85 && ref - c.total >= MIN_DIFF)
      strengths.push(`Has gastado un ${pct(ref - c.total, ref)} % menos en ${c.name} que tu media (${eur(ref - c.total)} menos).`);
  }

  // 2. Gastos prescindibles con más peso: un recorte del 15 %.
  const flagged = new Set(recs.map((r) => r.categoria));
  const discretionary = d.categories
    .filter((c) => DISCRETIONARY.test(c.name) && !flagged.has(c.name) && c.total - c.fixed >= 3000)
    .sort((a, b) => b.total - b.fixed - (a.total - a.fixed));
  for (const c of discretionary.slice(0, 2)) {
    const variable = c.total - c.fixed;
    recs.push({
      titulo: `Recorta un 15 % en ${c.name}`,
      categoria: c.name,
      detalle: `Es de tus gastos más prescindibles: ${eur(variable)} este mes${d.expense ? ` (${pct(c.total, d.expense)} % del total)` : ''}. Fíjate un presupuesto semanal de ${eur((variable * 0.85) / 4.3)}.`,
      ahorro: round5(variable * 0.15),
    });
  }

  // 3. Gastos fijos: muchos fijos dejan poco margen.
  if (d.expense > 0 && d.fixed / d.expense >= 0.5) {
    const subs = d.categories.find((c) => /suscrip/i.test(c.name));
    recs.push({
      titulo: 'Revisa tus gastos fijos',
      categoria: 'Fijos',
      detalle: `Los recurrentes y cuotas son el ${pct(d.fixed, d.expense)} % de tus gastos (${eur(d.fixed)}). Repasa ${
        subs ? `tus suscripciones (${eur(subs.total)}), ` : 'suscripciones, '
      }tarifas de luz, móvil e internet y seguros: cambiar una sola tarifa suele ahorrar entre 5 y 20 € al mes.`,
      ahorro: round5(d.fixed * 0.05),
    });
  }

  // 4. Tarjeta de crédito: lo gastado este mes se cobra el siguiente.
  if (d.expense > 0 && d.cardSpend / d.expense >= 0.3)
    recs.push({
      titulo: 'Vigila lo que pagas con tarjeta',
      categoria: 'Tarjeta de crédito',
      detalle: `Has pagado ${eur(d.cardSpend)} con tarjeta de crédito (${pct(d.cardSpend, d.expense)} % de tus gastos). Ese dinero sale el mes que viene: tenlo en cuenta en la previsión y evita aplazar compras, que añaden intereses.`,
      ahorro: 0,
    });

  recs.sort((a, b) => b.ahorro - a.ahorro);
  const top = recs.slice(0, 5);
  const potential = top.reduce((s, r) => s + r.ahorro, 0);

  // Puntos fuertes generales.
  if (rate !== null && rate >= 0.2) strengths.unshift(`Has ahorrado el ${Math.round(rate * 100)} % de tus ingresos, por encima del 20 % recomendable.`);
  if (d.prevExpense && d.expense < d.prevExpense * 0.95) strengths.push(`Has gastado ${eur(d.prevExpense - d.expense)} menos que el mes anterior.`);

  // Resumen.
  const vsPrev = d.prevExpense
    ? d.expense > d.prevExpense
      ? `, ${eur(d.expense - d.prevExpense)} más que el mes anterior`
      : `, ${eur(d.prevExpense - d.expense)} menos que el mes anterior`
    : '';
  const biggest = d.categories[0];
  const resumen =
    `Has ingresado ${eur(d.income)} y gastado ${eur(d.expense)}${vsPrev}. ` +
    (saved >= 0 ? `Has ahorrado ${eur(saved)}${rate !== null ? ` (${Math.round(rate * 100)} % de tus ingresos)` : ''}.` : `Has gastado ${eur(-saved)} más de lo que has ingresado.`) +
    (biggest && d.expense ? ` Tu mayor gasto ha sido ${biggest.name} (${pct(biggest.total, d.expense)} %).` : '');

  // Plan para el objetivo de ahorro.
  const goalsPerMonth = d.goals.reduce((s, g) => s + (g.perMonth ?? 0), 0);
  const target = d.savingsTarget ?? (goalsPerMonth || (d.income > 0 ? Math.round((d.income * 0.15) / 1000) * 1000 : 0));
  let plan: string;
  if (!target) plan = 'Define un objetivo de ahorro mensual en Ajustes → Informes para que el informe te diga cómo llegar.';
  else {
    const origin = d.savingsTarget ? 'Tu objetivo' : goalsPerMonth ? 'Lo que necesitan tus metas' : 'Un objetivo razonable (15 % de tus ingresos)';
    if (saved >= target) plan = `${origin} es ahorrar ${eur(target)} al mes y este mes lo has conseguido (${eur(saved)}). Si lo mantienes, puedes plantearte subirlo o adelantar tus metas.`;
    else {
      const gap = target - Math.max(saved, 0);
      plan =
        `${origin} es ahorrar ${eur(target)} al mes; este mes te han faltado ${eur(gap)}. ` +
        (potential >= gap
          ? `Aplicando las recomendaciones de arriba (≈${eur(potential)} al mes) llegarías.`
          : potential > 0
            ? `Las recomendaciones de arriba suman ≈${eur(potential)} al mes; para el resto, aparta ${eur(gap - potential)} nada más cobrar la nómina con una transferencia a tu cuenta de ahorro.`
            : `Aparta ${eur(gap)} nada más cobrar la nómina con una transferencia a tu cuenta de ahorro: lo que no ves, no lo gastas.`);
    }
    for (const g of d.goals.filter((g) => g.perMonth))
      plan += ` Para «${g.name}» necesitas ${eur(g.perMonth!)} al mes.`;
  }

  // Alertas.
  const alerts: string[] = [];
  if (saved < 0) alerts.push(`Este mes has gastado ${eur(-saved)} más de lo que has ingresado.`);
  if (d.movements < 10) alerts.push(`Solo hay ${d.movements} movimientos apuntados: si falta alguno, el análisis puede no ser exacto.`);

  return {
    resumen,
    puntos_fuertes: strengths.slice(0, 3),
    recomendaciones: top,
    plan_objetivo: plan,
    alerta: alerts.length ? alerts.join(' ') : null,
  };
}
