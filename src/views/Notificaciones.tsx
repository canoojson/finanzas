import { useEffect, useState } from 'preact/hooks';
import { api } from '../api';
import { Card, Field, inputValue, Toggle } from '../components';
import { currentSubscription, disablePush, enablePush, pushSupport } from '../push';
import { useStore } from '../store';

const DAYS: [number, string][] = [
  [1, 'L'],
  [2, 'M'],
  [3, 'X'],
  [4, 'J'],
  [5, 'V'],
  [6, 'S'],
  [0, 'D'],
];

export function Notificaciones() {
  const { boot, reload, toast } = useStore();
  const u = boot.user;
  const support = pushSupport();
  const [subscribed, setSubscribed] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    currentSubscription()
      .then((s) => setSubscribed(!!s && boot.push.endpoints.includes(s.endpoint)))
      .catch(() => setSubscribed(false));
  }, [boot]);

  const act = async (fn: () => Promise<unknown>, msg: string) => {
    setBusy(true);
    try {
      await fn();
      await reload();
      toast(msg);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Algo ha fallado');
    } finally {
      setBusy(false);
    }
  };

  const save = (patch: Record<string, unknown>) => act(() => api.put('/me', patch), 'Guardado');

  const days = u.reminder_days.split(',').filter(Boolean).map(Number);
  const toggleDay = (d: number) => save({ reminder_days: (days.includes(d) ? days.filter((x) => x !== d) : [...days, d]).sort().join(',') });

  return (
    <Card title="Notificaciones">
      {support === 'install' ? (
        <p class="notes">
          En iPhone, las notificaciones solo funcionan con la app instalada: en Safari pulsa <strong>Compartir → Añadir a pantalla de inicio</strong>, ábrela desde el icono y vuelve aquí.
        </p>
      ) : support === 'unsupported' ? (
        <p class="muted small">Este navegador no admite notificaciones.</p>
      ) : (
        <div class="stack">
          <p class="muted small">
            {subscribed === null
              ? 'Comprobando…'
              : subscribed
                ? '✅ Activadas en este dispositivo.'
                : 'No están activadas en este dispositivo.'}
            {boot.push.endpoints.length > 0 && ` Dispositivos con avisos: ${boot.push.endpoints.length}.`}
          </p>
          {subscribed ? (
            <div class="row">
              <button class="btn ghost" disabled={busy} onClick={() => act(() => api.post('/push/test', {}), 'Notificación enviada')}>
                Enviar prueba
              </button>
              <button class="btn ghost danger-text" disabled={busy} onClick={() => act(disablePush, 'Desactivadas en este dispositivo')}>
                Desactivar
              </button>
            </div>
          ) : (
            <button class="btn primary" disabled={busy || subscribed === null} onClick={() => act(() => enablePush(boot.push.publicKey), 'Notificaciones activadas')}>
              Activar notificaciones
            </button>
          )}
        </div>
      )}

      <h3 class="subhead">Recordatorio para apuntar gastos</h3>
      <div class="day-chips" role="group" aria-label="Días del recordatorio">
        {DAYS.map(([d, label]) => (
          <button class={days.includes(d) ? 'on' : ''} aria-pressed={days.includes(d)} disabled={busy} onClick={() => toggleDay(d)}>
            {label}
          </button>
        ))}
      </div>
      <div class="stack">
        <Field label="Hora">
          <select value={u.reminder_hour} disabled={busy} onChange={(e) => save({ reminder_hour: Number(inputValue(e)) })}>
            {Array.from({ length: 24 }, (_, h) => (
              <option value={h}>{String(h).padStart(2, '0')}:00</option>
            ))}
          </select>
        </Field>
        <Toggle
          label="No recordar si ya he apuntado algo ese día"
          checked={!!u.reminder_skip_if_logged}
          onChange={(v) => save({ reminder_skip_if_logged: v })}
        />
        <Toggle
          label="Avisar de retenciones"
          hint="A las 9:00 del día anterior a que se cobre una retención."
          checked={!!u.hold_alerts}
          onChange={(v) => save({ hold_alerts: v })}
        />
      </div>
      {!days.length && <p class="muted small">Sin días marcados, el recordatorio está desactivado.</p>}
    </Card>
  );
}
