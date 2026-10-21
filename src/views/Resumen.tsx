import { useEffect, useMemo, useState } from 'preact/hooks';
import { loanStatus } from '../../shared/finance';
import { api, type Forecast, type Summary } from '../api';
import { Card, Donut, Empty, Header, Money, MonthBars, MonthSwitcher, Stat } from '../components';
import { eur, monthLabel, shiftMonth } from '../format';
import { useStore } from '../store';
import { CobrosPendientes } from './CobrosPendientes';
import { ForecastList, monthForecast, plus30 } from './Prevision';

export function Resumen({ month, setMonth, go }: { month: string; setMonth: (m: string) => void; go: (tab: string) => void }) {
  const { boot, category } = useStore();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [fc, setFc] = useState<Forecast | null>(null);
  const currentMonth = boot.today.slice(0, 7);
  const isFuture = month > currentMonth;
  const isCurrent = month === currentMonth;
  // Una sola previsión cubre el mes elegido y los próximos 30 días.
  const in30 = plus30(boot.today);
  const fcMonth = month > in30.slice(0, 7) ? month : in30.slice(0, 7);

  useEffect(() => {
    let live = true;
    api.get<Summary>(`/summary?month=${month}`).then((s) => live && setSummary(s)).catch(() => {});
    return () => {
      live = false;
    };
  }, [month, boot]);

  useEffect(() => {
    let live = true;
    api.get<Forecast>(`/forecast?month=${fcMonth}`).then((f) => live && setFc(f)).catch(() => {});
    return () => {
      live = false;
    };
  }, [fcMonth, boot]);

  const plan = fc && month >= currentMonth ? monthForecast(boot, fc.items, month) : null;
  // Mes actual: lo que queda tras pagar todo lo pendiente (sin contar ingresos que aún no han llegado).
  const cashNow = boot.accounts.filter((a) => a.type !== 'tarjeta' && !a.archived).reduce((s, a) => s + a.balance, 0);
  const heldNoDate = boot.holds.filter((h) => h.status === 'pendiente' && !h.charge_date).reduce((s, h) => s + h.amount, 0);
  const pendingOut = (plan?.out ?? 0) + heldNoDate;
  const leftover = cashNow - pendingOut;
  const monthName = monthLabel(month).split(' ')[0].toLowerCase();
  const nextMonthName = monthLabel(shiftMonth(month, 1)).split(' ')[0].toLowerCase();

  const totals = useMemo(() => {
    const t = { ingreso: 0, gasto: 0 };
    summary?.byCategory.forEach((r) => (t[r.kind] += r.total));
    return t;
  }, [summary]);

  const expenses = (summary?.byCategory ?? [])
    .filter((r) => r.kind === 'gasto')
    .map((r) => {
      const c = category(r.category_id);
      return { ...r, name: c?.name ?? 'Sin categoría', icon: c?.icon ?? '•', color: c?.color ?? 'var(--muted)' };
    });

  const series = useMemo(() => {
    const out = Array.from({ length: 12 }, (_, i) => ({ month: shiftMonth(month, i - 11), ingreso: 0, gasto: 0 }));
    summary?.series.forEach((r) => {
      const row = out.find((o) => o.month === r.month);
      if (row) row[r.kind] = r.total;
    });
    return out;
  }, [summary, month]);

  const activeAccounts = boot.accounts.filter((a) => !a.archived);
  const cash = activeAccounts.reduce((s, a) => s + a.balance, 0);
  const loans = boot.loans.filter((l) => !l.closed).map((l) => ({ loan: l, status: loanStatus(l, boot.today) }));
  const debt = loans.reduce((s, l) => s + l.status.outstanding, 0);

  const balance = totals.ingreso - totals.gasto;

  return (
    <>
      <Header title={boot.user.name ? `Hola, ${boot.user.name}` : 'Resumen'}>
        <MonthSwitcher month={month} onChange={setMonth} />
      </Header>

      {isCurrent && fc && <CobrosPendientes items={fc.items} />}

      {isFuture && plan ? (
        <Card class="hero">
          <Stat label={`Empiezas ${monthName} con`} tone={plan.startBalance < 0 ? 'neg' : undefined}>
            {eur(plan.startBalance)}
          </Stat>
          <div class="stat-row">
            <Stat label="Entrará" tone="pos">
              {eur(plan.income)}
            </Stat>
            <Stat label="Saldrá" tone="neg">
              {eur(plan.out)}
            </Stat>
            <Stat label={`Empiezas ${nextMonthName} con`} tone={plan.endBalance < 0 ? 'neg' : undefined}>
              {eur(plan.endBalance)}
            </Stat>
          </div>
          <p class="muted small hero-note">Lo que tendrás en tus cuentas el día 1 (sin contar las tarjetas), con todo lo previsto hasta entonces: nómina y demás recurrentes, cuotas, retenciones, cargos de tarjeta y movimientos con fecha futura.</p>
        </Card>
      ) : isCurrent ? (
        <Card class="hero">
          {plan ? (
            <>
              <Stat label={`Te queda tras los pagos de ${monthName}`} tone={leftover < 0 ? 'neg' : undefined}>
                {eur(leftover)}
              </Stat>
              <p class="muted small hero-note hero-calc">
                Saldo {eur(cashNow)} − {eur(pendingOut)} pendientes de pagar{heldNoDate ? ` (incluye ${eur(heldNoDate)} retenidos)` : ''}. Los ingresos previstos no se suman.
              </p>
            </>
          ) : (
            <Stat label="Saldo en cuentas">{eur(cashNow)}</Stat>
          )}
          <div class="stat-row">
            <Stat label="Ingresos del mes" tone="pos">
              {eur(totals.ingreso)}
            </Stat>
            <Stat label="Gastos del mes" tone="neg">
              {eur(totals.gasto)}
            </Stat>
            <Stat label="Balance" tone={balance < 0 ? 'neg' : undefined}>
              {balance > 0 ? '+' : ''}
              {eur(balance)}
            </Stat>
          </div>
        </Card>
      ) : (
      <Card class="hero">
        <Stat label="Balance del mes" tone={balance < 0 ? 'neg' : 'pos'}>
          {balance > 0 ? '+' : ''}
          {eur(balance)}
        </Stat>
        <div class="stat-row">
          <Stat label="Ingresos" tone="pos">
            {eur(totals.ingreso)}
          </Stat>
          <Stat label="Gastos" tone="neg">
            {eur(totals.gasto)}
          </Stat>
          <Stat label="Ahorro">{totals.ingreso > 0 ? `${Math.round((balance / totals.ingreso) * 100)} %` : '—'}</Stat>
        </div>
        <p class="muted small hero-note">Ingresos menos gastos apuntados en {monthName}.</p>
      </Card>
      )}

      {isCurrent && plan && (
        <Card title={`Lo que queda de ${monthName}`}>
          <div class="stat-row">
            <Stat label="Entrará" tone="pos">
              {eur(plan.income)}
            </Stat>
            <Stat label="Saldrá" tone="neg">
              {eur(plan.out)}
            </Stat>
            <Stat label={`Empiezas ${nextMonthName} con`} tone={plan.endBalance < 0 ? 'neg' : undefined}>
              {eur(plan.endBalance)}
            </Stat>
          </div>
        </Card>
      )}

      {isFuture && plan && (
        <Card title={`Previsto en ${monthName}`}>
          {plan.items.length ? <ForecastList items={plan.items} /> : <Empty>Nada previsto este mes todavía.</Empty>}
        </Card>
      )}

      {(!isFuture || expenses.length > 0) && (
      <Card title="Gasto por categoría">
        {expenses.length ? (
          <div class="breakdown">
            <Donut items={expenses.map((e) => ({ value: e.total, color: e.color }))} center={<><small>Gastos</small><strong>{eur(totals.gasto)}</strong></>} />
            <ul class="legend">
              {expenses.map((e) => (
                <li>
                  <span class="dot" style={{ background: e.color }} />
                  <span class="legend-name">
                    {e.icon} {e.name}
                  </span>
                  <span class="legend-pct">{Math.round((e.total / totals.gasto) * 100)} %</span>
                  <Money cents={e.total} />
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <Empty>Sin gastos este mes.</Empty>
        )}
      </Card>
      )}

      <Card title="Últimos 12 meses">
        <MonthBars data={series} current={month} />
      </Card>

      <Card title="Patrimonio" action={<button class="link" onClick={() => go('ahorro')}>Cuentas</button>}>
        <div class="stat-row">
          <Stat label="En cuentas">{eur(cash)}</Stat>
          <Stat label="Deuda pendiente" tone={debt ? 'neg' : undefined}>
            {eur(debt)}
          </Stat>
          <Stat label="Neto" tone={cash - debt < 0 ? 'neg' : undefined}>
            {eur(cash - debt)}
          </Stat>
        </div>
      </Card>

      {!isFuture && (
        <Card title="Próximos 30 días" action={<button class="link" onClick={() => setMonth(shiftMonth(currentMonth, 1))}>Ver {monthLabel(shiftMonth(currentMonth, 1)).split(' ')[0].toLowerCase()}</button>}>
          {fc && fc.items.some((i) => i.date <= in30) ? (
            <ForecastList items={fc.items} limit={in30} />
          ) : (
            <Empty>{fc ? 'Nada previsto. Añade recurrentes, financiaciones o tarjetas para verlo aquí.' : 'Cargando…'}</Empty>
          )}
        </Card>
      )}
    </>
  );
}
