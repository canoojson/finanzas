import { useEffect, useState } from 'preact/hooks';
import { api, type CloudflareUsage } from '../api';
import { Card, Progress } from '../components';
import { useStore } from '../store';

/** Solo para el administrador: uso de hoy del plan gratuito de Cloudflare y prueba del aviso. */
export function UsoCloudflare() {
  const { toast } = useStore();
  const [usage, setUsage] = useState<CloudflareUsage | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setError(null);
    api
      .get<CloudflareUsage>('/admin/usage')
      .then(setUsage)
      .catch((e) => setError(e instanceof Error ? e.message : 'Error'));
  };
  useEffect(load, []);

  const test = () =>
    api.post('/admin/usage/test', {}).then(
      () => toast('Aviso de prueba enviado'),
      (e) => toast(e instanceof Error ? e.message : 'Error'),
    );

  const levels = usage?.levels.map((l) => `${l} %`).join(' y ') ?? '';
  return (
    <Card title="Uso de Cloudflare" action={<button class="link" onClick={load}>Actualizar</button>}>
      {error ? (
        <p class="muted small">No se ha podido consultar: {error}</p>
      ) : !usage ? (
        <p class="muted small">Cargando…</p>
      ) : !usage.configured ? (
        <p class="muted small">Falta configurar ADMIN_EMAIL, CF_ACCOUNT_ID y el secreto CF_ANALYTICS_TOKEN.</p>
      ) : (
        <div class="stack">
          {Object.values(usage.metrics!).map((m) => (
            <div class="usage-row">
              <div class="usage-head">
                <span>{m.label}</span>
                <span class={m.pct >= usage.levels[usage.levels.length - 1] ? 'neg' : m.pct >= usage.levels[0] ? 'warn' : 'muted'}>
                  {m.used.toLocaleString('es-ES')} / {m.max.toLocaleString('es-ES')} · {m.pct.toLocaleString('es-ES', { maximumFractionDigits: 1 })} %
                </span>
              </div>
              <Progress value={m.pct / 100} color={m.pct >= usage.levels[usage.levels.length - 1] ? 'var(--neg)' : m.pct >= usage.levels[0] ? 'var(--warn)' : undefined} />
            </div>
          ))}
          <p class="muted small">
            Hoy (UTC), sumando todos tus Workers; las analíticas van con unos minutos de retraso. Cada hora se comprueba y, si algo pasa del {levels} del límite, te
            llega una notificación solo a ti.
          </p>
          <button class="btn ghost" onClick={test}>
            Probar el aviso
          </button>
        </div>
      )}
    </Card>
  );
}
