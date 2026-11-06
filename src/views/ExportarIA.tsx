import { useState } from 'preact/hooks';
import { api } from '../api';
import { Card, Field, inputValue, Toggle } from '../components';
import { useStore } from '../store';

const PERIODS: [number, string][] = [
  [1, 'Último mes'],
  [3, 'Últimos 3 meses'],
  [6, 'Últimos 6 meses'],
  [12, 'Último año'],
  [24, 'Últimos 2 años'],
];

/** Genera un Markdown con los datos del usuario para pegarlo en ChatGPT, Claude, DeepSeek… */
export function ExportarIA() {
  const { boot, toast } = useStore();
  const [months, setMonths] = useState(6);
  const [movements, setMovements] = useState(false);
  const [notes, setNotes] = useState(true);
  const [md, setMd] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const generate = async () => {
    setBusy(true);
    try {
      setMd(await api.get<string>(`/export/ia?months=${months}&movements=${movements ? 1 : 0}&notes=${notes ? 1 : 0}`));
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Error');
    } finally {
      setBusy(false);
    }
  };
  // Cambiar una opción invalida el texto ya generado.
  const change = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setMd(null);
  };

  const copy = () => md && navigator.clipboard.writeText(md).then(() => toast('Copiado: pégalo en tu IA'), () => toast('No se pudo copiar; usa Descargar'));
  const download = () => {
    if (!md) return;
    const url = URL.createObjectURL(new Blob([md], { type: 'text/markdown;charset=utf-8' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: `finanzas-ia-${boot.today}.md` });
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <Card title="Resumen para IA">
      <p class="muted small">
        Genera un texto en Markdown con tus cuentas, ingresos y gastos por mes y categoría, recurrentes, deudas y objetivos. Pégalo en ChatGPT, Claude,
        DeepSeek… y pregúntale lo que quieras («¿en qué puedo recortar?», «¿cuándo termino de pagar el coche?»). No incluye tu correo.
      </p>
      <div class="stack">
        <Field label="Periodo">
          <select value={months} onChange={(e) => change(setMonths)(Number(inputValue(e)))}>
            {PERIODS.map(([m, label]) => (
              <option value={m}>{label}</option>
            ))}
          </select>
        </Field>
        <Toggle label="Incluir todos los movimientos" hint="Más detalle, pero el texto es mucho más largo" checked={movements} onChange={change(setMovements)} />
        <Toggle label="Incluir los conceptos" hint="Lo que escribes en cada movimiento (comercios, personas…)" checked={notes} onChange={change(setNotes)} />
        {md ? (
          <>
            <textarea class="md-preview" readOnly value={md} aria-label="Vista previa del Markdown" />
            <p class="muted small">
              {md.length.toLocaleString('es-ES')} caracteres. Revísalo antes de compartirlo: son tus datos financieros.
            </p>
            <div class="color-actions">
              <button class="btn ghost" onClick={download}>
                Descargar .md
              </button>
              <button class="btn primary" onClick={copy}>
                Copiar
              </button>
            </div>
          </>
        ) : (
          <button class="btn primary" disabled={busy} onClick={generate}>
            {busy ? 'Generando…' : 'Generar'}
          </button>
        )}
      </div>
    </Card>
  );
}
