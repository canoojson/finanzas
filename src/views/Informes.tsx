import { useEffect, useRef, useState } from 'preact/hooks';
import { api } from '../api';
import { Card, Field, inputValue } from '../components';
import { centsToInput, monthLabel, parseCents, shiftMonth } from '../format';
import { useStore } from '../store';

interface ReportRow {
  month: string;
  created_at: string;
  size: number;
}

/** Abre el PDF: en iPhone con el menú de compartir (guardar, imprimir…); en el resto, en otra pestaña. */
async function openPdf(month: string) {
  const res = await fetch(`/api/reports/${month}/pdf`, { credentials: 'same-origin' });
  if (!res.ok) throw new Error('No se ha podido descargar el informe');
  const blob = await res.blob();
  const file = new File([blob], `finanzas-${month}.pdf`, { type: 'application/pdf' });
  if (navigator.canShare?.({ files: [file] }) && /iPhone|iPad|Android/.test(navigator.userAgent)) {
    await navigator.share({ files: [file], title: `Resumen de ${monthLabel(month)}` }).catch(() => {});
    return;
  }
  const url = URL.createObjectURL(blob);
  if (!window.open(url, '_blank')) location.href = url;
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function Informes() {
  const { boot, reload, toast } = useStore();
  const ref = useRef<HTMLDivElement>(null);
  const [reports, setReports] = useState<ReportRow[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [target, setTarget] = useState(centsToInput(boot.user.savings_target));
  const current = boot.today.slice(0, 7);
  const months = Array.from({ length: 12 }, (_, i) => shiftMonth(current, -i));
  const [month, setMonth] = useState(shiftMonth(current, -1));

  const load = () =>
    api
      .get<{ reports: ReportRow[] }>('/reports')
      .then((r) => setReports(r.reports))
      .catch(() => setReports([]));

  useEffect(() => {
    load();
    if (location.hash === '#informes') setTimeout(() => ref.current?.scrollIntoView({ behavior: 'smooth' }), 700);
  }, []);

  const generate = async (m: string) => {
    setBusy(m);
    try {
      await api.post('/reports', { month: m });
      await load();
      toast('Informe listo');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se ha podido generar');
    } finally {
      setBusy(null);
    }
  };

  const open = async (m: string) => {
    try {
      await openPdf(m);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Error');
    }
  };

  const saveTarget = async (e: Event) => {
    e.preventDefault();
    const cents = target.trim() ? parseCents(target) : null;
    if (target.trim() && (cents === null || cents < 0)) return toast('Importe no válido');
    try {
      await api.put('/me', { savings_target: cents });
      await reload();
      toast('Objetivo guardado');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Error');
    }
  };

  return (
    <div ref={ref} id="informes">
      <Card title="Informes mensuales">
        <p class="muted small">
          El día 1 de cada mes se genera un PDF con el resumen del mes anterior y te llega una notificación.
          {' '}Incluye recomendaciones para gastar menos y llegar a tu objetivo de ahorro, calculadas comparando con tus meses anteriores.
        </p>

        <form class="inline-form" onSubmit={saveTarget}>
          <Field label="Objetivo de ahorro al mes (€)">
            <input inputMode="decimal" placeholder="Por ejemplo, 300" value={target} onInput={(e) => setTarget(inputValue(e))} />
          </Field>
          <button class="btn ghost" type="submit">
            Guardar
          </button>
        </form>

        <div class="inline-form report-gen">
          <Field label="Generar ahora">
            <select value={month} onChange={(e) => setMonth(inputValue(e))}>
              {months.map((m) => (
                <option value={m}>
                  {monthLabel(m)}
                  {m === current ? ' (en curso)' : ''}
                </option>
              ))}
            </select>
          </Field>
          <button class="btn primary" disabled={!!busy} onClick={() => generate(month)}>
            {busy === month ? 'Generando…' : 'Generar'}
          </button>
        </div>
        {busy && <p class="muted small">Tarda unos segundos…</p>}

        {reports === null ? (
          <p class="muted small">Cargando…</p>
        ) : reports.length ? (
          <ul class="rows">
            {reports.map((r) => (
              <li class="tx">
                <span class="tx-icon">📄</span>
                <span class="tx-main">
                  <span class="tx-title">{monthLabel(r.month)}</span>
                  <span class="tx-sub">
                    Generado el {r.created_at.slice(8, 10)}/{r.created_at.slice(5, 7)} · {Math.round(r.size / 1024)} KB
                  </span>
                </span>
                <button class="btn ghost small-btn" disabled={!!busy} onClick={() => generate(r.month)}>
                  {busy === r.month ? '…' : 'Rehacer'}
                </button>
                <button class="btn primary small-btn" onClick={() => open(r.month)}>
                  Abrir
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p class="muted small">Aún no hay informes.</p>
        )}
      </Card>
    </div>
  );
}
