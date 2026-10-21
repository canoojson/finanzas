import { useState } from 'preact/hooks';
import { useStore } from '../store';

/** Ejecuta una acción de guardado: estado de carga, errores como aviso, recarga y cierre. */
export function useSubmit(onDone: () => void) {
  const { reload, toast } = useStore();
  const [saving, setSaving] = useState(false);
  const run = async (action: () => Promise<unknown>, message?: string) => {
    setSaving(true);
    try {
      await action();
      await reload();
      if (message) toast(message);
      onDone();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Algo ha fallado');
    } finally {
      setSaving(false);
    }
  };
  return [saving, run] as const;
}
