import { api } from './api';

const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isStandalone = () => matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true;

/**
 * 'ok': se pueden activar. 'install': en iPhone hay que abrir la app desde la pantalla de inicio.
 * 'unsupported': el navegador no admite notificaciones push.
 */
export function pushSupport(): 'ok' | 'install' | 'unsupported' {
  if (isIOS() && !isStandalone()) return 'install';
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unsupported';
  return 'ok';
}

export async function currentSubscription(): Promise<PushSubscription | null> {
  if (!('serviceWorker' in navigator)) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  return (await reg?.pushManager.getSubscription()) ?? null;
}

const b64ToBytes = (b64: string) => {
  const s = atob((b64 + '='.repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
};

function deviceName() {
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua)) return 'iPhone';
  if (/iPad/.test(ua) || isIOS()) return 'iPad';
  if (/Android/.test(ua)) return 'Android';
  if (/Linux/.test(ua)) return 'Linux';
  if (/Mac/.test(ua)) return 'Mac';
  if (/Windows/.test(ua)) return 'Windows';
  return 'Navegador';
}

/** Pide permiso y suscribe este dispositivo. Debe llamarse desde un toque del usuario. */
export async function enablePush(publicKey: string) {
  // En iOS el permiso solo se puede pedir directamente desde el gesto, antes de cualquier otra espera.
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('No has dado permiso. Puedes activarlo en Ajustes del sistema → Notificaciones.');
  const reg = (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.register('/sw.js'));
  await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  try {
    sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(publicKey) });
  } catch (e) {
    // Brave (y algunos Chromium) traen el servicio push desactivado.
    if (e instanceof DOMException && e.name === 'AbortError')
      throw new Error('Este navegador tiene desactivado el servicio de notificaciones. En Brave: Ajustes → Privacidad → «Usar los servicios de Google para mensajes push».');
    throw e;
  }
  await api.post('/push/subscribe', { ...sub.toJSON(), device: deviceName() });
}

export async function disablePush() {
  const sub = await currentSubscription();
  if (!sub) return;
  await api.post('/push/unsubscribe', { endpoint: sub.endpoint });
  await sub.unsubscribe();
}
