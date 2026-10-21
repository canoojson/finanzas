import { useState } from 'preact/hooks';
import type { Account, Goal } from '../api';
import { Card, Empty, Header, Money, Progress } from '../components';
import { ACCOUNT_TYPES, dateLabel, eur, monthsUntil } from '../format';
import { AccountForm, GoalForm } from '../forms/others';
import { useStore } from '../store';

export function Ahorro() {
  const { boot, account } = useStore();
  const [editAccount, setEditAccount] = useState<Account | 'new' | null>(null);
  const [editGoal, setEditGoal] = useState<Goal | 'new' | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const active = boot.accounts.filter((a) => !a.archived);
  const archived = boot.accounts.filter((a) => a.archived);
  const total = active.filter((a) => a.type !== 'tarjeta').reduce((s, a) => s + a.balance, 0);
  const cardDebt = -active.filter((a) => a.type === 'tarjeta').reduce((s, a) => s + a.balance, 0);
  const savings = active.filter((a) => a.type === 'ahorro' || a.type === 'inversion').reduce((s, a) => s + a.balance, 0);

  const held = (id: number) => boot.holds.filter((h) => h.status === 'pendiente' && h.account_id === id).reduce((s, h) => s + h.amount, 0);
  const accountRow = (a: Account) => (
    <li>
      <button class="tx" onClick={() => setEditAccount(a)}>
        <span class="tx-icon" style={{ '--chip': a.color ?? 'var(--accent)' }}>
          <span class="dot big" style={{ background: a.color ?? 'var(--accent)' }} />
        </span>
        <span class="tx-main">
          <span class="tx-title">{a.name}</span>
          <span class="tx-sub">
            {a.type === 'tarjeta' && a.card_charge_day
              ? `Tarjeta · corte ${a.card_cutoff_day === 31 ? 'fin de mes' : `día ${a.card_cutoff_day}`}, cobro día ${a.card_charge_day}`
              : ACCOUNT_TYPES[a.type]}
            {held(a.id) > 0 && ` · disponible ${eur(a.balance - held(a.id))}`}
          </span>
        </span>
        <Money cents={a.balance} />
      </button>
    </li>
  );

  return (
    <>
      <Header title="Cuentas y ahorro" />
      <Card class="hero">
        <div class="stat-row">
          <div class="stat">
            <span class="stat-label">Total en cuentas</span>
            <span class="stat-value">{eur(total)}</span>
          </div>
          <div class="stat">
            <span class="stat-label">Ahorro e inversión</span>
            <span class="stat-value">{eur(savings)}</span>
          </div>
          {cardDebt > 0 && (
            <div class="stat">
              <span class="stat-label">Tarjetas por pagar</span>
              <span class="stat-value neg">{eur(cardDebt)}</span>
            </div>
          )}
        </div>
      </Card>

      <Card title="Cuentas" tour="cuentas" action={<button class="link" onClick={() => setEditAccount('new')}>+ Añadir</button>}>
        <ul class="rows">{active.map(accountRow)}</ul>
        {archived.length > 0 && (
          <>
            <button class="link small" onClick={() => setShowArchived(!showArchived)}>
              {showArchived ? 'Ocultar' : 'Ver'} archivadas ({archived.length})
            </button>
            {showArchived && <ul class="rows muted-rows">{archived.map(accountRow)}</ul>}
          </>
        )}
      </Card>

      <Card title="Objetivos de ahorro" tour="objetivos" action={<button class="link" onClick={() => setEditGoal('new')}>+ Añadir</button>}>
        {boot.goals.length ? (
          <ul class="goals">
            {boot.goals.map((g) => {
              const current = g.account_id ? (account(g.account_id)?.balance ?? 0) : g.saved;
              const left = Math.max(0, g.target - current);
              const perMonth = g.deadline && left > 0 ? Math.ceil(left / monthsUntil(boot.today, g.deadline)) : null;
              return (
                <li>
                  <button class="goal" onClick={() => setEditGoal(g)}>
                    <div class="loan-head">
                      <strong>{g.name}</strong>
                      <span class="muted">{Math.min(100, Math.round((current / g.target) * 100))} %</span>
                    </div>
                    <Progress value={current / g.target} color={g.color ?? undefined} />
                    <div class="loan-foot">
                      <span>
                        <strong>{eur(current)}</strong> de {eur(g.target)}
                      </span>
                      <span class="muted">
                        {left === 0
                          ? '¡Conseguido! 🎉'
                          : perMonth
                            ? `${eur(perMonth)}/mes hasta ${dateLabel(g.deadline!)}`
                            : `Faltan ${eur(left)}`}
                      </span>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <Empty>Crea un objetivo (viaje, colchón de emergencia…) para seguir tu progreso.</Empty>
        )}
      </Card>

      {editAccount && <AccountForm account={editAccount === 'new' ? undefined : editAccount} onClose={() => setEditAccount(null)} />}
      {editGoal && <GoalForm goal={editGoal === 'new' ? undefined : editGoal} onClose={() => setEditGoal(null)} />}
    </>
  );
}
