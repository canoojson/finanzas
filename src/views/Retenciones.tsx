import { useState } from 'preact/hooks';
import type { Hold } from '../api';
import { Card, Empty, Fab, Header, Money, Stat } from '../components';
import { dateLabel, eur } from '../format';
import { HoldDetail, HoldForm } from '../forms/HoldForm';
import { useStore } from '../store';

export function Retenciones() {
  const { boot, account } = useStore();
  const [detail, setDetail] = useState<Hold | null>(null);
  const [editing, setEditing] = useState<Hold | 'new' | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  const pending = boot.holds.filter((h) => h.status === 'pendiente');
  const history = boot.holds.filter((h) => h.status !== 'pendiente');
  const total = pending.reduce((s, h) => s + h.amount, 0);
  const next = pending.find((h) => h.charge_date && h.charge_date >= boot.today);

  // Lo retenido por cuenta y lo que queda disponible.
  const byAccount = boot.accounts
    .map((a) => ({ a, held: pending.filter((h) => h.account_id === a.id).reduce((s, h) => s + h.amount, 0) }))
    .filter((x) => x.held > 0);

  const when = (h: Hold) => {
    if (!h.charge_date) return 'Sin fecha de cobro';
    if (h.status !== 'pendiente') return dateLabel(h.charge_date);
    if (h.charge_date < boot.today) return `Debía cobrarse el ${dateLabel(h.charge_date)} · ¿se cobró?`;
    if (h.charge_date === boot.today) return 'Se cobra hoy';
    return `Se cobra el ${dateLabel(h.charge_date)}`;
  };

  const row = (h: Hold) => (
    <li>
      <button class="tx" onClick={() => setDetail(h)}>
        <span class="tx-icon" style={{ '--chip': h.status === 'pendiente' ? 'var(--warn)' : 'var(--muted)' }}>
          {h.status === 'pendiente' ? '⏳' : h.status === 'cobrada' ? '✓' : '↺'}
        </span>
        <span class="tx-main">
          <span class="tx-title">{h.concept}</span>
          <span class={`tx-sub ${h.status === 'pendiente' && h.charge_date && h.charge_date < boot.today ? 'warn' : ''}`}>
            {when(h)} · {account(h.account_id)?.name}
          </span>
        </span>
        <span class="tx-end">
          <Money cents={h.amount} />
          {h.status !== 'pendiente' && <small class="muted">{h.status}</small>}
        </span>
      </button>
    </li>
  );

  return (
    <>
      <Header title="Retenciones" />
      <Card class="hero">
        <div class="stat-row">
          <Stat label="Retenido ahora">{eur(total)}</Stat>
          <Stat label="Pendientes">{String(pending.length)}</Stat>
          <Stat label="Próximo cobro">{next ? dateLabel(next.charge_date!) : '—'}</Stat>
        </div>
        {byAccount.length > 0 && (
          <ul class="held-accounts">
            {byAccount.map(({ a, held }) => (
              <li>
                <span>{a.name}</span>
                <span class="muted">
                  saldo {eur(a.balance)} · <strong>disponible {eur(a.balance - held)}</strong>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Pendientes">
        {pending.length ? (
          <ul class="rows">{pending.map(row)}</ul>
        ) : (
          <Empty>No tienes retenciones pendientes. Cuando el banco te bloquee un importe (hotel, gasolinera, fianza…), apúntalo con +.</Empty>
        )}
      </Card>

      {history.length > 0 && (
        <Card title="Historial" action={<button class="link" onClick={() => setShowHistory(!showHistory)}>{showHistory ? 'Ocultar' : `Ver (${history.length})`}</button>}>
          {showHistory && <ul class="rows">{history.map(row)}</ul>}
        </Card>
      )}

      <Fab label="Nueva retención" onClick={() => setEditing('new')} />
      {detail && (
        <HoldDetail
          hold={detail}
          onClose={() => setDetail(null)}
          onEdit={() => {
            setEditing(detail);
            setDetail(null);
          }}
        />
      )}
      {editing && <HoldForm hold={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
    </>
  );
}
