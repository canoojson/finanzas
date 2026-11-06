import { useEffect, useRef, useState } from 'preact/hooks';
import { api, type Category, type Recurring, type Skin, type Style } from '../api';
import { Card, Empty, Field, Header, inputValue, Money } from '../components';
import { CategoryForm, RecurringForm } from '../forms/others';
import { applyStyle, STYLE_INFO, STYLES } from '../estilos';
import { applySkin, currentColors, DEFAULT_COLORS } from '../skin';
import { useStore } from '../store';
import { ExportarIA } from './ExportarIA';
import { Informes } from './Informes';
import { Notificaciones } from './Notificaciones';
import { UsoCloudflare } from './UsoCloudflare';

export function Ajustes() {
  const { boot, reload, toast, category, account, startTour } = useStore();
  const [name, setName] = useState(boot.user.name ?? '');
  const [editRec, setEditRec] = useState<Recurring | 'new' | null>(null);
  const [editCat, setEditCat] = useState<Category | 'new' | null>(null);
  const [catKind, setCatKind] = useState<Category['kind']>('gasto');

  const saveName = async (e: Event) => {
    e.preventDefault();
    try {
      await api.put('/me', { name });
      await reload();
      toast('Nombre guardado');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Error');
    }
  };

  return (
    <>
      <Header title="Ajustes" />

      <Card title="Perfil">
        <form class="inline-form" onSubmit={saveName}>
          <Field label="Nombre">
            <input maxLength={40} placeholder="¿Cómo te llamas?" value={name} onInput={(e) => setName(inputValue(e))} />
          </Field>
          <button class="btn primary" type="submit">
            Guardar
          </button>
        </form>
        <p class="muted small">Sesión iniciada como {boot.user.email}. Tus datos solo los ves tú.</p>
      </Card>

      <Estetica />

      <Notificaciones />

      <Informes />

      <Atajo />

      <Card title="Recurrentes" action={<button class="link" onClick={() => setEditRec('new')}>+ Añadir</button>}>
        {boot.recurring.length ? (
          <ul class="rows">
            {boot.recurring.map((r) => {
              const c = category(r.category_id);
              return (
                <li class={r.active ? '' : 'muted-rows'}>
                  <button class="tx" onClick={() => setEditRec(r)}>
                    <span class="tx-icon" style={{ '--chip': c?.color ?? 'var(--muted)' }}>
                      {c?.icon ?? '🔁'}
                    </span>
                    <span class="tx-main">
                      <span class="tx-title">{r.note || c?.name || 'Recurrente'}</span>
                      <span class="tx-sub">
                        Día {r.day} · {account(r.account_id)?.name}
                        {r.active ? '' : ' · pausado'}
                      </span>
                    </span>
                    <Money cents={r.amount} sign={r.kind} />
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <Empty>Nómina, alquiler, suscripciones… se apuntarán solos cada mes.</Empty>
        )}
      </Card>

      <Card
        title="Categorías"
        action={
          <button class="link" onClick={() => setEditCat('new')}>
            + Añadir
          </button>
        }
      >
        <div class="segmented small">
          <button class={catKind === 'gasto' ? 'on' : ''} onClick={() => setCatKind('gasto')}>
            Gastos
          </button>
          <button class={catKind === 'ingreso' ? 'on' : ''} onClick={() => setCatKind('ingreso')}>
            Ingresos
          </button>
        </div>
        <div class="chips">
          {boot.categories
            .filter((c) => c.kind === catKind)
            .map((c) => (
              <button class={`chip ${c.archived ? 'archived' : ''}`} style={{ '--chip': c.color ?? 'var(--accent)' }} onClick={() => setEditCat(c)}>
                {c.icon} {c.name}
              </button>
            ))}
        </div>
      </Card>

      <ExportarIA />

      {boot.user.is_admin && <UsoCloudflare />}

      <Card title="Datos">
        <div class="stack">
          <button class="btn ghost" onClick={startTour}>
            Ver el tour de la app
          </button>
          <a class="btn ghost" href="/api/export" download>
            Exportar todo (JSON)
          </a>
          <a class="btn ghost danger-text" href="/cdn-cgi/access/logout">
            Cerrar sesión
          </a>
        </div>
      </Card>

      {editRec && <RecurringForm item={editRec === 'new' ? undefined : editRec} onClose={() => setEditRec(null)} />}
      {editCat && <CategoryForm category={editCat === 'new' ? undefined : editCat} onClose={() => setEditCat(null)} />}
    </>
  );
}

const SKINS: [Skin, string][] = [
  ['clasica', 'Clásica'],
  ['chiikawa', 'Chiikawa 🎀'],
  ['personalizada', 'Personalizada'],
];
const COLOR_LABELS = ['Principal', 'Secundario', 'Letra'];

function Estetica() {
  const { boot, reload, toast } = useStore();
  const saved = boot.user.skin_colors ?? DEFAULT_COLORS;
  const [colors, setColors] = useState(saved.split(','));
  const lastSent = useRef(saved); // últimos colores enviados, para no repetir guardados
  const pending = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const save = async (data: { skin?: Skin; skin_colors?: string; style?: Style }, msg?: string) => {
    if (data.skin_colors) lastSent.current = data.skin_colors;
    try {
      await api.put('/me', data);
      await reload();
      if (msg) toast(msg);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Error');
    }
  };

  // Los colores se guardan solos: al dejar de tocarlos, al salir de Ajustes o al cambiar de app.
  const flush = () => {
    clearTimeout(timer.current);
    const c = pending.current;
    pending.current = null;
    if (c && c !== lastSent.current) save({ skin_colors: c });
  };
  const flushRef = useRef(flush);
  flushRef.current = flush;

  useEffect(() => {
    if (boot.user.skin !== 'personalizada') return;
    const c = colors.join(',');
    applySkin('personalizada', c); // vista previa en vivo
    if (c === lastSent.current) return;
    pending.current = c;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => flushRef.current(), 600);
  }, [colors, boot.user.skin]);

  useEffect(() => {
    const onHide = () => document.visibilityState === 'hidden' && flushRef.current();
    document.addEventListener('visibilitychange', onHide);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      flushRef.current();
    };
  }, []);

  const pickStyle = (style: Style) => {
    if (boot.user.skin !== 'personalizada') return save({ style });
    // En Personalizada, los colores pasan a ser los del nuevo estilo: se mira un momento
    // cómo queda en Clásica para leerlos y se vuelve a Personalizada con ellos.
    applyStyle(style);
    applySkin('clasica', null);
    const start = currentColors();
    applySkin('personalizada', start);
    setColors(start.split(','));
    return save({ style, skin_colors: start });
  };

  const pick = (skin: Skin) => {
    if (skin !== 'personalizada' || boot.user.skin === 'personalizada') return save({ skin });
    // Al pasar a Personalizada se parte de los colores que se estaban viendo.
    const start = currentColors();
    setColors(start.split(','));
    return save({ skin, skin_colors: start });
  };

  return (
    <Card title="Estética" tour="estetica">
      <p class="field-label">Estilo</p>
      <div class="chips style-chips">
        {STYLES.map((id) => (
          <button class={`chip${boot.user.style === id ? ' on' : ''}`} onClick={() => pickStyle(id)}>
            {STYLE_INFO[id][0]}
          </button>
        ))}
      </div>
      <p class="muted small style-desc">{STYLE_INFO[boot.user.style]?.[1]}</p>
      <p class="field-label">Colores</p>
      <div class="segmented">
        {SKINS.filter(([id]) => id !== 'chiikawa' || boot.user.chiikawa).map(([id, label]) => (
          <button class={boot.user.skin === id ? 'on' : ''} onClick={() => pick(id)}>
            {label}
          </button>
        ))}
      </div>
      {boot.user.skin === 'personalizada' && (
        <>
          <div class="color-pickers">
            {COLOR_LABELS.map((label, i) => (
              <label>
                <input
                  type="color"
                  value={colors[i]}
                  onInput={(e) => {
                    const v = inputValue(e);
                    setColors((prev) => prev.map((c, j) => (j === i ? v : c)));
                  }}
                  aria-label={`Color ${label.toLowerCase()}`}
                />
                {label}
              </label>
            ))}
          </div>
          <p class="muted small">Principal: botones y detalles. Secundario: tarjetas y fondo. Letra: el texto. Se guardan solos.</p>
        </>
      )}
    </Card>
  );
}

function Atajo() {
  const { boot, reload, toast } = useStore();
  const u = boot.user;
  const [token, setToken] = useState<string | null>(null);
  const url = `${location.origin}/api/atajo/pago`;

  const act = async (fn: () => Promise<unknown>, msg?: string) => {
    try {
      await fn();
      await reload();
      if (msg) toast(msg);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Error');
    }
  };
  const copy = (text: string) => navigator.clipboard.writeText(text).then(() => toast('Copiado'), () => toast('No se pudo copiar'));

  return (
    <Card title="Atajo de iOS (Apple Pay)">
      <p class="muted small">
        Apunta cada pago con Apple Pay como gasto. Va a la cuenta que tenga esa tarjeta en «Nombre en Cartera» (edita la cuenta para ponerlo: la de crédito en
        tu tarjeta, la de débito en tu cuenta corriente); si ninguna coincide, a la cuenta de abajo. La categoría se copia del último gasto con la misma descripción.
      </p>
      <Field label="Cuenta por defecto">
        <select
          value={u.shortcut_account_id ?? ''}
          onChange={(e) => act(() => api.put('/me', { shortcut_account_id: inputValue(e) || null }), 'Guardado')}
        >
          <option value="">— Elige una cuenta —</option>
          {boot.accounts
            .filter((a) => !a.archived)
            .map((a) => (
              <option value={a.id}>{a.name}</option>
            ))}
        </select>
      </Field>
      {token ? (
        <div class="stack">
          <p class="notes">Copia el token ahora: no se volverá a mostrar.</p>
          <button class="btn ghost" onClick={() => copy(token)}>
            Copiar token
          </button>
          <button class="btn ghost" onClick={() => copy(url)}>
            Copiar URL
          </button>
          <ol class="muted small">
            <li>Atajos → Automatización → Nueva → <strong>Transacción</strong> (elige tus tarjetas) → Ejecutar inmediatamente.</li>
            <li>
              Acción <strong>Obtener contenido de URL</strong> con la URL copiada, método POST, cabecera <code>Authorization</code> = <code>Bearer</code> + espacio +
              token, y cuerpo JSON: <code>descripcion</code> = Comerciante, <code>importe</code> = Importe, <code>tarjeta</code> = Tarjeta.
            </li>
            <li>
              Opcional: <strong>Mostrar notificación</strong> con el campo <code>mensaje</code> de la respuesta.
            </li>
          </ol>
        </div>
      ) : (
        <div class="stack">
          <button class="btn ghost" onClick={() => act(async () => setToken((await api.post<{ token: string }>('/me/atajo', {})).token))}>
            {u.shortcut_enabled ? 'Generar un token nuevo' : 'Generar token'}
          </button>
          {!!u.shortcut_enabled && (
            <button class="btn ghost danger-text" onClick={() => act(() => api.del('/me/atajo'), 'Token revocado')}>
              Revocar token
            </button>
          )}
        </div>
      )}
    </Card>
  );
}
