import { useEffect, useRef, useState } from 'preact/hooks';
import { api, type Category, type Recurring, type Skin } from '../api';
import { Card, Empty, Field, Header, inputValue, Money } from '../components';
import { CategoryForm, RecurringForm } from '../forms/others';
import { applySkin, DEFAULT_COLORS } from '../skin';
import { useStore } from '../store';
import { Informes } from './Informes';
import { Notificaciones } from './Notificaciones';

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
  const dirty = colors.join(',') !== saved;
  const savedRef = useRef(boot.user);
  savedRef.current = boot.user;

  // Vista previa en vivo; al salir de Ajustes sin guardar, vuelve a lo guardado.
  useEffect(() => {
    if (boot.user.skin === 'personalizada') applySkin('personalizada', colors.join(','));
  }, [colors, boot.user.skin]);
  useEffect(() => () => applySkin(savedRef.current.skin, savedRef.current.skin_colors), []);

  const save = async (data: { skin?: Skin; skin_colors?: string }, msg?: string) => {
    try {
      await api.put('/me', data);
      await reload();
      if (msg) toast(msg);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Error');
    }
  };

  const pick = (skin: Skin) =>
    // La primera vez que se elige Personalizada se guardan también los colores de partida.
    save(skin === 'personalizada' && !boot.user.skin_colors ? { skin, skin_colors: colors.join(',') } : { skin });

  return (
    <Card title="Estética">
      <div class="segmented">
        {SKINS.map(([id, label]) => (
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
          {dirty && (
            <div class="color-actions">
              <button class="btn ghost" onClick={() => setColors(saved.split(','))}>
                Deshacer
              </button>
              <button class="btn primary" onClick={() => save({ skin_colors: colors.join(',') }, 'Colores guardados')}>
                Guardar
              </button>
            </div>
          )}
          <p class="muted small">Principal: botones y fondo. Secundario: tarjetas. Letra: el texto.</p>
        </>
      )}
    </Card>
  );
}
