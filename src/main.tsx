import { render } from 'preact';
import { useCallback, useEffect, useMemo, useState } from 'preact/hooks';
import { api, sessionExpired, type Boot } from './api';
import { Deco, Icon } from './components';
import { applySkin } from './skin';
import { StoreCtx, type Store } from './store';
import { Tour } from './Tour';
import './styles.css';
import { Ahorro } from './views/Ahorro';
import { Ajustes } from './views/Ajustes';
import { Financiaciones } from './views/Financiaciones';
import { Movimientos } from './views/Movimientos';
import { Resumen } from './views/Resumen';
import { Retenciones } from './views/Retenciones';

const TABS = [
  ['resumen', 'Resumen', 'home'],
  ['movimientos', 'Movimientos', 'list'],
  ['retenciones', 'Retenciones', 'hold'],
  ['financiaciones', 'Deudas', 'loan'],
  ['ahorro', 'Ahorro', 'piggy'],
] as const;
// Ajustes se abre desde el engranaje de la cabecera.
type Tab = (typeof TABS)[number][0] | 'ajustes';

const tabFromHash = (): Tab => {
  const h = location.hash.slice(1);
  if (h === 'ajustes' || h === 'informes') return 'ajustes';
  return (TABS.find(([t]) => t === h)?.[0] ?? 'resumen') as Tab;
};

function App() {
  const [boot, setBoot] = useState<Boot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);
  const [tab, setTab] = useState<Tab>(tabFromHash);
  const [month, setMonth] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [touring, setTouring] = useState(false);

  const reload = useCallback(async () => {
    const b = await api.get<Boot>('/bootstrap');
    setBoot((prev) => {
      if (!prev && !b.user.tour_done) setTouring(true); // primer login: tour de bienvenida
      return b;
    });
    setMonth((m) => m ?? b.today.slice(0, 7));
  }, []);

  useEffect(() => {
    reload().catch((e) => setError(e.message));
    const onExpired = () => setExpired(true);
    const onHash = () => {
      setTab(tabFromHash());
      if (location.hash !== '#informes') window.scrollTo({ top: 0 });
    };
    // Al volver a la app tras un rato, refresca (y apunta recurrentes del día).
    const onVisible = () => document.visibilityState === 'visible' && reload().catch(() => {});
    sessionExpired.addEventListener('expired', onExpired);
    window.addEventListener('hashchange', onHash);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      sessionExpired.removeEventListener('expired', onExpired);
      window.removeEventListener('hashchange', onHash);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  useEffect(() => {
    if (!toastMsg) return;
    const t = setTimeout(() => setToastMsg(null), Math.max(2600, toastMsg.length * 60));
    return () => clearTimeout(t);
  }, [toastMsg]);

  // Estética del usuario: tokens de color en CSS y color de la barra del sistema.
  const skin = boot?.user.skin ?? 'clasica';
  const skinColors = boot?.user.skin_colors ?? null;
  useEffect(() => applySkin(skin, skinColors), [skin, skinColors]);

  const store = useMemo<Store | null>(() => {
    if (!boot) return null;
    const accounts = new Map(boot.accounts.map((a) => [a.id, a]));
    const categories = new Map(boot.categories.map((c) => [c.id, c]));
    return {
      boot,
      reload,
      toast: setToastMsg,
      startTour: () => setTouring(true),
      account: (id) => (id == null ? undefined : accounts.get(id)),
      category: (id) => (id == null ? undefined : categories.get(id)),
    };
  }, [boot]);

  const go = (t: string) => {
    location.hash = t;
    window.scrollTo({ top: 0 });
  };

  if (expired)
    return (
      <div class="splash">
        <h1>Sesión caducada</h1>
        <p>Vuelve a entrar con el código que te llegará por email.</p>
        <button class="btn primary" onClick={() => location.reload()}>
          Entrar
        </button>
      </div>
    );
  if (error)
    return (
      <div class="splash">
        <h1>No se ha podido cargar</h1>
        <p>{error}</p>
        <button class="btn primary" onClick={() => location.reload()}>
          Reintentar
        </button>
      </div>
    );
  if (!store || !month)
    return (
      <div class="splash">
        <div class="spinner" aria-label="Cargando" />
      </div>
    );

  return (
    <StoreCtx.Provider value={store}>
      <main class="page">
        {tab === 'resumen' && <Resumen month={month} setMonth={setMonth} go={go} />}
        {tab === 'movimientos' && <Movimientos month={month} setMonth={setMonth} />}
        {tab === 'retenciones' && <Retenciones />}
        {tab === 'financiaciones' && <Financiaciones />}
        {tab === 'ahorro' && <Ahorro />}
        {tab === 'ajustes' && <Ajustes />}
      </main>
      <nav class="tabbar">
        {TABS.map(([id, label, icon]) => (
          <button class={tab === id ? 'on' : ''} aria-current={tab === id ? 'page' : undefined} onClick={() => go(id)}>
            <Deco name={id} class="deco-tab" fallback={<Icon name={icon} />} />
            <span>{label}</span>
          </button>
        ))}
      </nav>
      {touring && <Tour onClose={() => setTouring(false)} />}
      {toastMsg && (
        <div class="toast" role="status">
          {toastMsg}
        </div>
      )}
    </StoreCtx.Provider>
  );
}

render(<App />, document.getElementById('app')!);

if ('serviceWorker' in navigator && import.meta.env.PROD) navigator.serviceWorker.register('/sw.js').catch(() => {});
