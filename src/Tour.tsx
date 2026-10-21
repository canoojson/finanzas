import type { ComponentChildren } from 'preact';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { api } from './api';
import { inputValue } from './components';
import { useStore } from './store';

interface Step {
  tab?: string; // pestaña a la que se navega antes de mostrar el paso
  target?: string; // selector del elemento resaltado (sin él, la tarjeta sale centrada)
  title: string;
  body: ComponentChildren;
}

const STEPS: Step[] = [
  {
    tab: 'resumen',
    title: '¡Bienvenido/a a Finanzas! 👋',
    body: 'En un minuto te enseño dónde está cada cosa y cómo se usa. Puedes saltarlo cuando quieras y repetirlo desde Ajustes.',
  },
  {
    tab: 'resumen',
    target: '.tabbar',
    title: 'Las pestañas',
    body: 'Desde aquí abajo te mueves por la app: Resumen, Movimientos, Retenciones, Deudas y Ahorro.',
  },
  {
    tab: 'resumen',
    target: '.month-switch',
    title: 'El mes que estás viendo',
    body: 'Con las flechas cambias de mes. El Resumen y los Movimientos muestran siempre el mes elegido.',
  },
  {
    tab: 'resumen',
    target: '.hero',
    title: 'Cómo va el mes',
    body: 'Lo que ha entrado, lo que ha salido, el balance y qué porcentaje de tus ingresos estás ahorrando. Más abajo tienes el gasto por categoría, la evolución del año y los cargos de los próximos 30 días.',
  },
  {
    tab: 'movimientos',
    target: '.fab',
    title: 'Apuntar un gasto o ingreso',
    body: 'Pulsa + cada vez que gastes o cobres algo: importe, categoría y listo. También sirve para transferencias entre tus cuentas.',
  },
  {
    tab: 'movimientos',
    target: '.filters',
    title: 'Buscar y corregir',
    body: 'Busca por concepto o filtra por tipo y cuenta. Toca cualquier movimiento para editarlo o borrarlo.',
  },
  {
    tab: 'retenciones',
    target: '.fab',
    title: 'Retenciones',
    body: 'Cuando el banco te bloquee dinero (hotel, gasolinera, fianza…), apúntalo aquí con la fecha de cobro. Al cobrarse, márcala y se convierte en gasto; si te lo devuelven, márcala como liberada.',
  },
  {
    tab: 'financiaciones',
    target: '.fab',
    title: 'Financiaciones',
    body: 'Añade préstamos o compras a plazos con el importe, el interés y los meses. La app calcula la cuota, lo que te queda por pagar y puede apuntar la cuota cada mes ella sola.',
  },
  {
    tab: 'ahorro',
    target: '[data-tour="cuentas"]',
    title: 'Tus cuentas',
    body: 'Toca una cuenta para poner su saldo actual, el que te marca el banco. Puedes ajustarlo siempre que no cuadre.',
  },
  {
    tab: 'ahorro',
    target: '[data-tour="objetivos"]',
    title: 'Objetivos de ahorro',
    body: 'Ponte metas (un viaje, un colchón para imprevistos…) y la app te dice cuánto llevas y cuánto ahorrar al mes para llegar.',
  },
  {
    tab: 'ahorro',
    target: '.top-row .icon-btn',
    title: 'Ajustes',
    body: 'En el engranaje: notificaciones y recordatorios, gastos fijos que se apuntan solos (nómina, alquiler, suscripciones…), categorías y exportar tus datos.',
  },
  {
    tab: 'ahorro',
    title: 'Para empezar 🚀',
    body: (
      <ol class="tour-list">
        <li>
          Pon el <strong>saldo actual</strong> de tus cuentas (estás en Ahorro).
        </li>
        <li>
          Añade tus <strong>gastos e ingresos fijos</strong> en Ajustes → Recurrentes.
        </li>
        <li>
          Activa las <strong>notificaciones</strong> en Ajustes para que te recuerde apuntar los gastos.
        </li>
        <li>
          En iPhone: Safari → Compartir → <strong>Añadir a pantalla de inicio</strong>.
        </li>
      </ol>
    ),
  },
];

const PAD = 6;

export function Tour({ onClose }: { onClose: () => void }) {
  const { boot, reload } = useStore();
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [name, setName] = useState(boot.user.name ?? '');
  const cardRef = useRef<HTMLDivElement>(null);
  const [cardH, setCardH] = useState(0);
  const step = STEPS[i];
  const last = i === STEPS.length - 1;

  // Navega a la pestaña del paso y localiza el elemento a resaltar.
  useEffect(() => {
    let cancelled = false;
    setRect(null);
    if (step.tab && location.hash.slice(1) !== step.tab) location.hash = step.tab;
    if (!step.target) return;
    const locate = (tries: number) => {
      if (cancelled) return;
      const el = document.querySelector(step.target!);
      if (!el) return tries > 0 ? setTimeout(() => locate(tries - 1), 100) : undefined;
      el.scrollIntoView({ block: 'center', behavior: 'instant' as ScrollBehavior });
      requestAnimationFrame(() => !cancelled && setRect(el.getBoundingClientRect()));
    };
    const t = setTimeout(() => locate(10), 120);
    const onResize = () => {
      const el = step.target && document.querySelector(step.target);
      if (el) setRect(el.getBoundingClientRect());
    };
    window.addEventListener('resize', onResize);
    return () => {
      cancelled = true;
      clearTimeout(t);
      window.removeEventListener('resize', onResize);
    };
  }, [i]);

  useLayoutEffect(() => setCardH(cardRef.current?.offsetHeight ?? 0));

  const finish = async () => {
    onClose();
    try {
      await api.put('/me', { tour_done: true, ...(name.trim() && name !== boot.user.name ? { name: name.trim() } : {}) });
      await reload();
    } catch {
      /* si falla, volverá a salir la próxima vez */
    }
  };

  // Tarjeta debajo del elemento si cabe; si no, encima; sin elemento, centrada.
  const vh = window.innerHeight;
  const margin = 14;
  let cardStyle: Record<string, string> = {};
  if (rect) {
    const below = rect.bottom + PAD + margin;
    const fitsBelow = below + cardH < vh - 16;
    cardStyle = fitsBelow ? { top: `${below}px` } : { top: `${Math.max(16, rect.top - PAD - margin - cardH)}px` };
  }

  return (
    <div class="tour" role="dialog" aria-modal="true" aria-label="Tour de la app">
      {rect ? (
        <div
          class="tour-spot"
          style={{ top: `${rect.top - PAD}px`, left: `${rect.left - PAD}px`, width: `${rect.width + PAD * 2}px`, height: `${rect.height + PAD * 2}px` }}
        />
      ) : (
        <div class="tour-dim" />
      )}
      <div ref={cardRef} class={`tour-card ${rect ? '' : 'center'}`} style={cardStyle}>
        <div class="tour-progress" aria-hidden="true">
          {STEPS.map((_, k) => (
            <i class={k === i ? 'on' : k < i ? 'done' : ''} />
          ))}
        </div>
        <h2>{step.title}</h2>
        <div class="tour-body">{step.body}</div>
        {i === 0 && (
          <label class="field">
            <span class="field-label">¿Cómo te llamas? (opcional)</span>
            <input maxLength={40} value={name} onInput={(e) => setName(inputValue(e))} placeholder="Tu nombre" />
          </label>
        )}
        <div class="tour-actions">
          {!last && (
            <button class="link muted-link" onClick={finish}>
              Saltar
            </button>
          )}
          <span class="spacer" />
          {i > 0 && (
            <button class="btn ghost" onClick={() => setI(i - 1)}>
              Atrás
            </button>
          )}
          <button class="btn primary" onClick={() => (last ? finish() : setI(i + 1))} autoFocus>
            {last ? '¡Empezar!' : i === 0 ? 'Vamos' : 'Siguiente'}
          </button>
        </div>
      </div>
    </div>
  );
}
