import { useState } from 'preact/hooks';
import { loanStatus, schedule, type Loan } from '../../shared/finance';
import { Card, Empty, Fab, Header, Progress, Sheet, Stat } from '../components';
import { dateLabel, eur, monthYear } from '../format';
import { LoanForm } from '../forms/LoanForm';
import { useStore } from '../store';

function LoanDetail({ loan, onClose, onEdit }: { loan: Loan; onClose: () => void; onEdit: () => void }) {
  const { boot, account } = useStore();
  const s = loanStatus(loan, boot.today);
  const rows = schedule(loan);
  const [showAll, setShowAll] = useState(false);
  const firstPending = rows.findIndex((r) => r.date > boot.today);
  const shown = showAll ? rows : rows.slice(Math.max(0, firstPending - 2), Math.max(0, firstPending - 2) + 8);

  return (
    <Sheet title={loan.name} onClose={onClose}>
      <div class="stat-grid">
        <Stat label="Capital pendiente">{eur(s.outstanding)}</Stat>
        <Stat label="Cuota">{eur(s.payment)}</Stat>
        <Stat label="Cuotas pagadas">
          {s.paidCount} / {rows.length}
        </Stat>
        <Stat label="Termina">{s.endDate ? monthYear(s.endDate) : '—'}</Stat>
        <Stat label="Intereses totales">{eur(s.totalInterest)}</Stat>
        <Stat label="Intereses por pagar">{eur(s.remainingInterest)}</Stat>
      </div>
      <Progress value={s.progress} />
      <p class="muted small">
        {eur(loan.principal)} al {String(loan.annual_rate).replace('.', ',')} % TIN en {loan.term_months} meses
        {loan.lender ? ` · ${loan.lender}` : ''}
        {loan.account_id ? ` · se cobra en ${account(loan.account_id)?.name}` : ''}
        {loan.auto_register ? ' · se apunta sola' : ''}
      </p>
      {loan.notes && <p class="notes">{loan.notes}</p>}

      <h3 class="subhead">Cuadro de amortización</h3>
      <div class="table-wrap">
        <table class="amort">
          <thead>
            <tr>
              <th>#</th>
              <th>Fecha</th>
              <th>Cuota</th>
              <th>Intereses</th>
              <th>Pendiente</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr class={r.date <= boot.today ? 'paid' : r.n === rows[firstPending]?.n ? 'next' : ''}>
                <td>{r.n}</td>
                <td>{dateLabel(r.date)}</td>
                <td>{eur(r.payment)}</td>
                <td>{eur(r.interest)}</td>
                <td>{eur(r.balance)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > shown.length && (
        <button class="btn ghost full" onClick={() => setShowAll(true)}>
          Ver las {rows.length} cuotas
        </button>
      )}
      <div class="form-actions">
        <button class="btn primary" onClick={onEdit}>
          Editar
        </button>
      </div>
    </Sheet>
  );
}

export function Financiaciones() {
  const { boot } = useStore();
  const [detail, setDetail] = useState<Loan | null>(null);
  const [editing, setEditing] = useState<Loan | 'new' | null>(null);

  const items = boot.loans.map((l) => ({ loan: l, s: loanStatus(l, boot.today) }));
  const active = items.filter((i) => !i.loan.closed && i.s.remainingCount > 0);
  const finished = items.filter((i) => i.loan.closed || i.s.remainingCount === 0);
  const debt = active.reduce((sum, i) => sum + i.s.outstanding, 0);
  const monthly = active.reduce((sum, i) => sum + i.s.payment, 0);

  const card = ({ loan, s }: (typeof items)[number]) => (
    <button class="card loan" onClick={() => setDetail(loan)}>
      <div class="loan-head">
        <div>
          <strong>{loan.name}</strong>
          {loan.lender && <span class="muted"> · {loan.lender}</span>}
        </div>
        <span class="money">{eur(s.payment)}/mes</span>
      </div>
      <Progress value={s.progress} />
      <div class="loan-foot">
        <span>
          Quedan <strong>{eur(s.outstanding)}</strong> de {eur(loan.principal)}
        </span>
        <span class="muted">{s.remainingCount ? `${s.remainingCount} cuotas · hasta ${s.endDate ? monthYear(s.endDate) : '—'}` : 'Terminada'}</span>
      </div>
    </button>
  );

  return (
    <>
      <Header title="Financiaciones" />
      <Card class="hero">
        <div class="stat-row">
          <Stat label="Deuda pendiente" tone={debt ? 'neg' : undefined}>
            {eur(debt)}
          </Stat>
          <Stat label="Cuotas al mes">{eur(monthly)}</Stat>
          <Stat label="Activas">{String(active.length)}</Stat>
        </div>
      </Card>

      {active.length ? active.map(card) : <Empty>No tienes financiaciones activas. Pulsa + para añadir una (coche, móvil, préstamo…).</Empty>}

      {finished.length > 0 && (
        <>
          <h3 class="subhead">Terminadas</h3>
          {finished.map(card)}
        </>
      )}

      <Fab label="Nueva financiación" onClick={() => setEditing('new')} />
      {detail && (
        <LoanDetail
          loan={detail}
          onClose={() => setDetail(null)}
          onEdit={() => {
            setEditing(detail);
            setDetail(null);
          }}
        />
      )}
      {editing && <LoanForm loan={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
    </>
  );
}
