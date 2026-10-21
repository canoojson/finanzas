import type { ComponentChildren } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { eur, eurShort, monthLabel, monthShort, shiftMonth } from './format';
import { useStore } from './store';

// --- Iconos (trazo, heredan currentColor) ---------------------------------------

const paths: Record<string, string> = {
  home: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  list: 'M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01',
  loan: 'M3 7h18v12H3zM3 11h18M7 15h3',
  piggy: 'M19 10c1 0 2 .5 2 2v2h-2l-1 3h-3v-2H10v2H7l-1-3c-2-1-3-3-3-5a6 6 0 0 1 6-6h5a6 6 0 0 1 5 3zM15.5 9h.01M2 9.5c0 1 .5 1.5 1.3 1.5',
  gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  plus: 'M12 5v14M5 12h14',
  left: 'M15 18l-6-6 6-6',
  right: 'M9 18l6-6-6-6',
  close: 'M18 6 6 18M6 6l12 12',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3',
  repeat: 'M17 2l4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4M21 13v2a3 3 0 0 1-3 3H3',
  swap: 'M7 16V4M3 8l4-4 4 4M17 8v12M21 16l-4 4-4-4',
  hold: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 6v6l4 2',
};

export function Icon({ name, size = 22 }: { name: keyof typeof paths | string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d={paths[name]} />
    </svg>
  );
}

// --- Estética Chiikawa ------------------------------------------------------------

/** Imagen decorativa de la estética Chiikawa (public/chiikawa/<name>.png). Si falta, muestra `fallback`. */
export function Deco({ name, class: cls = '', fallback = null }: { name: string; class?: string; fallback?: ComponentChildren }) {
  const { boot } = useStore();
  const [missing, setMissing] = useState(false);
  if (boot.user.skin !== 'chiikawa' || missing) return <>{fallback}</>;
  return <img class={`deco ${cls}`} src={`/chiikawa/${name}.png`} alt="" aria-hidden="true" onError={() => setMissing(true)} />;
}

// --- Estructura -----------------------------------------------------------------

export function Header({ title, children }: { title: string; children?: ComponentChildren }) {
  return (
    <header class="top">
      <div class="top-row">
        <h1>
          {title}
          <Deco name="cabecera" class="deco-title" />
        </h1>
        {title !== 'Ajustes' && (
          <a class="icon-btn" href="#ajustes" aria-label="Ajustes">
            <Icon name="gear" />
          </a>
        )}
      </div>
      {children}
    </header>
  );
}

export function MonthSwitcher({ month, onChange }: { month: string; onChange: (m: string) => void }) {
  return (
    <div class="month-switch">
      <button class="icon-btn" aria-label="Mes anterior" onClick={() => onChange(shiftMonth(month, -1))}>
        <Icon name="left" />
      </button>
      <span>{monthLabel(month)}</span>
      <button class="icon-btn" aria-label="Mes siguiente" onClick={() => onChange(shiftMonth(month, 1))}>
        <Icon name="right" />
      </button>
    </div>
  );
}

export function Card({
  title,
  action,
  children,
  class: cls = '',
  tour,
}: {
  title?: string;
  action?: ComponentChildren;
  children: ComponentChildren;
  class?: string;
  tour?: string; // marcador para el tour de bienvenida
}) {
  return (
    <section class={`card ${cls}`} data-tour={tour}>
      {(title || action) && (
        <div class="card-head">
          {title && <h2>{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function Empty({ children }: { children: ComponentChildren }) {
  return (
    <div class="empty">
      <Deco name="vacio" class="deco-empty" />
      <p>{children}</p>
    </div>
  );
}

export function Fab({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button class="fab" onClick={onClick} aria-label={label}>
      <Icon name="plus" size={26} />
    </button>
  );
}

export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ComponentChildren }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.classList.add('locked');
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.classList.remove('locked');
    };
  }, []);
  return (
    <div class="sheet-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div class="sheet" role="dialog" aria-modal="true" aria-label={title}>
        <div class="sheet-head">
          <h2>{title}</h2>
          <button class="icon-btn" aria-label="Cerrar" onClick={onClose}>
            <Icon name="close" />
          </button>
        </div>
        <div class="sheet-body">{children}</div>
      </div>
    </div>
  );
}

// --- Datos ----------------------------------------------------------------------

export function Money({ cents, sign, class: cls = '' }: { cents: number; sign?: 'gasto' | 'ingreso' | 'transferencia'; class?: string }) {
  const prefix = sign === 'gasto' ? '−' : sign === 'ingreso' ? '+' : '';
  const tone = sign === 'gasto' ? 'neg' : sign === 'ingreso' ? 'pos' : cents < 0 ? 'neg' : '';
  return <span class={`money ${tone} ${cls}`}>{prefix}{eur(sign ? Math.abs(cents) : cents)}</span>;
}

export function Progress({ value, color }: { value: number; color?: string }) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div class="progress" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
      <div style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}

export function Stat({ label, children, tone }: { label: string; children: ComponentChildren; tone?: 'pos' | 'neg' }) {
  return (
    <div class="stat">
      <span class="stat-label">{label}</span>
      <span class={`stat-value ${tone ?? ''}`}>{children}</span>
    </div>
  );
}

/** Donut de reparto. `items` en céntimos. */
export function Donut({ items, center }: { items: { value: number; color: string }[]; center: ComponentChildren }) {
  const total = items.reduce((s, i) => s + i.value, 0);
  const r = 42;
  const c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div class="donut">
      <svg viewBox="0 0 100 100" role="img" aria-label="Reparto por categoría">
        <circle cx="50" cy="50" r={r} fill="none" stroke="var(--line)" stroke-width="12" />
        {total > 0 &&
          items.map((i) => {
            const len = (i.value / total) * c;
            const el = (
              <circle cx="50" cy="50" r={r} fill="none" stroke={i.color} stroke-width="12" stroke-dasharray={`${Math.max(len - 0.8, 0.01)} ${c}`} stroke-dashoffset={-offset} transform="rotate(-90 50 50)" />
            );
            offset += len;
            return el;
          })}
      </svg>
      <div class="donut-center">{center}</div>
    </div>
  );
}

/** Barras de ingresos y gastos por mes. */
export function MonthBars({ data, current }: { data: { month: string; ingreso: number; gasto: number }[]; current: string }) {
  const [active, setActive] = useState<string | null>(null);
  const max = Math.max(1, ...data.flatMap((d) => [d.ingreso, d.gasto]));
  const shown = data.find((d) => d.month === (active ?? current));
  return (
    <div class="bars">
      <div class="bars-legend">
        {shown ? (
          <>
            <span>{monthLabel(shown.month)}</span>
            <span class="pos">+{eurShort(shown.ingreso)}</span>
            <span class="neg">−{eurShort(shown.gasto)}</span>
          </>
        ) : (
          <span>&nbsp;</span>
        )}
      </div>
      <div class="bars-plot">
        {data.map((d) => (
          <button
            class={`bars-col ${d.month === (active ?? current) ? 'on' : ''}`}
            onClick={() => setActive(d.month)}
            aria-label={`${monthLabel(d.month)}: ingresos ${eur(d.ingreso)}, gastos ${eur(d.gasto)}`}
          >
            <div class="bars-pair">
              <i class="in" style={{ height: `${(d.ingreso / max) * 100}%` }} />
              <i class="out" style={{ height: `${(d.gasto / max) * 100}%` }} />
            </div>
            <span>{monthShort(d.month)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// --- Formularios ----------------------------------------------------------------

export function Field({ label, children, hint }: { label: string; children: ComponentChildren; hint?: ComponentChildren }) {
  return (
    <label class="field">
      <span class="field-label">{label}</span>
      {children}
      {hint && <span class="field-hint">{hint}</span>}
    </label>
  );
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div class="segmented" role="radiogroup">
      {options.map(([v, label]) => (
        <button type="button" role="radio" aria-checked={v === value} class={v === value ? 'on' : ''} onClick={() => onChange(v)}>
          {label}
        </button>
      ))}
    </div>
  );
}

export function Toggle({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <label class="toggle">
      <span>
        {label}
        {hint && <small>{hint}</small>}
      </span>
      <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.currentTarget.checked)} />
    </label>
  );
}

export function FormActions({ saving, onDelete, deleteLabel = 'Borrar' }: { saving: boolean; onDelete?: () => void; deleteLabel?: string }) {
  const [confirm, setConfirm] = useState(false);
  return (
    <div class="form-actions">
      {onDelete &&
        (confirm ? (
          <button type="button" class="btn danger" onClick={onDelete} disabled={saving}>
            ¿Seguro? Borrar
          </button>
        ) : (
          <button type="button" class="btn ghost danger-text" onClick={() => setConfirm(true)}>
            {deleteLabel}
          </button>
        ))}
      <button type="submit" class="btn primary" disabled={saving}>
        {saving ? 'Guardando…' : 'Guardar'}
      </button>
    </div>
  );
}

export const inputValue = (e: { currentTarget: { value: string } }) => e.currentTarget.value;
