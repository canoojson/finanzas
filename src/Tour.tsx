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

const ESTETICA: Step = {
  tab: 'ajustes',
  target: '[data-tour="estetica"]',
  title: 'Ponla a tu gusto 🎨',
  body: (
    <>
      Elige un <strong>estilo</strong> (Original, Aurora, Nítido, Editorial, Isla o Cristal, que imita al iPhone): cambia la forma, las letras y los colores. En <strong>Colores</strong> puedes quedarte con los del estilo o pasar a <strong>Personalizada</strong> y elegir tú el color principal, el de las tarjetas y el de la letra; empiezan con los del estilo que tengas y se guardan solos.
    </>
  ),
};

/** Versión de las novedades. Súbela y cambia NOVEDADES para enseñar algo nuevo a quien
 *  ya usaba la app (los usuarios nuevos ven el tour completo y quedan al día). */
export const NEWS_VERSION = 2;
export type TourMode = 'completo' | 'novedades';

const PRESUPUESTOS: Step = {
  tab: 'resumen',
  target: '[data-tour="presupuestos"]',
  title: 'Presupuestos 🎯',
  body: (
    <>
      Ponte un <strong>límite al mes</strong> en las categorías que quieras controlar (restaurantes, compras…). Verás lo que llevas gastado, lo que ya está previsto (recibos y cuotas) y cuánto te queda. La rayita marca lo que llevas de mes: si la barra la pasa, vas gastando demasiado rápido.
    </>
  ),
};

const NOVEDADES: Step[] = [
  {
    title: 'Novedad: presupuestos ✨',
    body: 'Ahora puedes ponerte un presupuesto mensual por categoría. Te enseño dónde.',
  },
  PRESUPUESTOS,
];

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
    body: 'Desde esta barra te mueves por la app: Resumen, Movimientos, Retenciones, Deudas y Ahorro.',
  },
  {
    tab: 'resumen',
    target: '.month-switch',
    title: 'El mes que estás viendo',
    body: 'Con las flechas cambias de mes. Los meses pasados muestran lo que gastaste y ahorraste; los futuros, una previsión con todo lo que ya está programado.',
  },
  {
    tab: 'resumen',
    target: '.hero',
    title: 'Cómo va el mes',
    body: 'Arriba, lo que te quedará cuando se paguen los cargos pendientes del mes, y lo que ha entrado y salido. Más abajo: lo que queda por entrar y salir, el gasto por categoría, la evolución del año, tu patrimonio y los cargos de los próximos 30 días.',
  },
  PRESUPUESTOS,
  {
    tab: 'resumen',
    title: 'Pendiente de cobrar',
    body: 'Cuando se acerque la fecha de un ingreso fijo (la nómina, por ejemplo), te saldrá en el Resumen para que confirmes que ya lo has cobrado y con qué importe; así no se suma antes de tiempo.',
  },
  {
    tab: 'movimientos',
    target: '.fab',
    title: 'Apuntar un gasto o ingreso',
    body: 'Pulsa + cada vez que gastes o cobres algo: importe, categoría y listo. También sirve para transferencias entre tus cuentas y para movimientos con fecha futura.',
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
    title: 'Deudas',
    body: 'Añade préstamos o compras a plazos con el importe, el interés y los meses. La app calcula la cuota, lo que te queda por pagar y puede apuntar la cuota cada mes ella sola.',
  },
  {
    tab: 'ahorro',
    target: '[data-tour="cuentas"]',
    title: 'Tus cuentas',
    body: 'Toca una cuenta para poner su saldo actual, el que te marca el banco. Puedes añadir también tus tarjetas de crédito: apunta lo que llevas gastado y la cuenta donde se cargan, y la app lo tendrá en cuenta en la previsión.',
  },
  {
    tab: 'ahorro',
    target: '[data-tour="objetivos"]',
    title: 'Objetivos de ahorro',
    body: 'Ponte metas (un viaje, un colchón para imprevistos…) y la app te dice cuánto llevas y cuánto ahorrar al mes para llegar.',
  },
  {
    tab: 'ahorro',
    target: '.top-row a.icon-btn[href="#ajustes"], .side-settings',
    title: 'Ajustes',
    body: 'En el engranaje tienes los ajustes. Vamos a echarles un vistazo.',
  },
  ESTETICA,
  {
    tab: 'ajustes',
    title: 'Y además, en Ajustes',
    body: (
      <ul class="tour-list">
        <li>
          <strong>Notificaciones</strong>: recordatorio para apuntar gastos y aviso antes de que se cobre una retención.
        </li>
        <li>
          <strong>Informes mensuales</strong> en PDF con consejos para llegar a tu objetivo de ahorro.
        </li>
        <li>
          <strong>Atajo de iOS</strong>: los pagos con Apple Pay se apuntan solos.
        </li>
        <li>
          <strong>Recurrentes</strong> (nómina, alquiler, suscripciones…) y <strong>categorías</strong>.
        </li>
        <li>
          <strong>Resumen para IA</strong> y exportar tus datos, y repetir este tour.
        </li>
      </ul>
    ),
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

/** Primer elemento visible que encaje con el selector (en escritorio el engranaje está oculto). */
const findVisible = (sel: string) => [...document.querySelectorAll(sel)].find((el) => el.getClientRects().length > 0);

const PAD = 6;

export function Tour({ mode, onClose }: { mode: TourMode; onClose: () => void }) {
  const { boot, reload } = useStore();
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [glide, setGlide] = useState(true); // animar el recuadro (al cambiar de paso, no al hacer scroll)
  const [name, setName] = useState(boot.user.name ?? '');
  const cardRef = useRef<HTMLDivElement>(null);
  const [cardH, setCardH] = useState(0);
  const steps = mode === 'novedades' ? NOVEDADES : STEPS;
  const step = steps[i];
  const last = i === steps.length - 1;

  // Navega a la pestaña del paso y localiza el elemento a resaltar. El recuadro no
  // desaparece entre pasos: se queda donde estaba y se desliza hasta el nuevo elemento.
  useEffect(() => {
    let cancelled = false;
    let el: Element | undefined;
    let frame = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let quietUntil = 0; // ignora el scroll que provoca la propia app al cambiar de paso
    if (step.tab && location.hash.slice(1) !== step.tab) location.hash = step.tab;
    setGlide(true);
    if (!step.target) {
      setRect(null);
      return;
    }
    const measure = () => !cancelled && el && setRect(el.getBoundingClientRect());
    const follow = () => {
      if (performance.now() < quietUntil) return;
      setGlide(false);
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    const locate = (tries: number) => {
      if (cancelled) return;
      el = findVisible(step.target!);
      if (!el) {
        if (tries > 0) timer = setTimeout(() => locate(tries - 1), 100);
        else setRect(null); // no está en pantalla: tarjeta centrada
        return;
      }
      // Scroll instantáneo (queda bajo el oscurecido) y el recuadro se desliza hasta el elemento.
      quietUntil = performance.now() + 150;
      el.scrollIntoView({ block: 'center', behavior: 'instant' as ScrollBehavior });
      setGlide(true);
      measure();
    };
    timer = setTimeout(() => locate(10), 60);
    window.addEventListener('scroll', follow, { passive: true });
    window.addEventListener('resize', follow);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', follow);
      window.removeEventListener('resize', follow);
    };
  }, [i]);

  useLayoutEffect(() => setCardH(cardRef.current?.offsetHeight ?? 0));

  const finish = async () => {
    onClose();
    try {
      const rename = mode === 'completo' && name.trim() && name !== boot.user.name ? { name: name.trim() } : {};
      await api.put('/me', { tour_done: true, news_seen: NEWS_VERSION, ...rename });
      await reload();
    } catch {
      /* si falla, volverá a salir la próxima vez */
    }
  };

  // Tarjeta debajo del elemento si cabe; si no, encima; sin elemento, centrada.
  const vh = window.innerHeight;
  const margin = 14;
  let top = Math.max(16, (vh - cardH) / 2);
  if (rect) {
    const below = rect.bottom + PAD + margin;
    top = below + cardH < vh - 16 ? below : Math.max(16, rect.top - PAD - margin - cardH);
  }
  // Sin elemento, el hueco se encoge hasta un punto en el centro y todo queda oscurecido.
  const hole = rect
    ? { top: rect.top - PAD, left: rect.left - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2 }
    : { top: vh / 2, left: window.innerWidth / 2, width: 0, height: 0 };

  return (
    <div class="tour" role="dialog" aria-modal="true" aria-label="Tour de la app">
      <div
        class={`tour-spot${rect ? '' : ' centered'}${glide ? '' : ' still'}`}
        style={{ top: `${hole.top}px`, left: `${hole.left}px`, width: `${hole.width}px`, height: `${hole.height}px` }}
      />
      <div ref={cardRef} class={`tour-card${glide ? '' : ' still'}`} style={{ top: `${top}px` }}>
        <div class="tour-progress" aria-hidden="true">
          {steps.map((_, k) => (
            <i class={k === i ? 'on' : k < i ? 'done' : ''} />
          ))}
        </div>
        <h2>{step.title}</h2>
        <div class="tour-body">{step.body}</div>
        {i === 0 && mode === 'completo' && (
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
            {last ? (mode === 'novedades' ? '¡Entendido!' : '¡Empezar!') : i === 0 ? 'Vamos' : 'Siguiente'}
          </button>
        </div>
      </div>
    </div>
  );
}
