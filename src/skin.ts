import type { Skin } from './api';

export const DEFAULT_COLORS = '#f7a8c4,#ffffff,#1a1a1a';

/** Luminancia relativa de un color #rrggbb (0 = negro, 1 = blanco). */
function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Contraste WCAG entre dos colores #rrggbb (1 a 21). */
function contrast(a: string, b: string) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Convierte cualquier color CSS calculado (rgb(), color(srgb …)) a #rrggbb. */
function toHex(css: string) {
  const n = css.match(/[\d.]+/g)?.map(Number) ?? [0, 0, 0];
  const rgb = css.startsWith('color(') ? n.slice(0, 3).map((v) => v * 255) : n.slice(0, 3);
  return '#' + rgb.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('');
}

/** Colores que se están viendo ahora (principal, tarjetas y letra), como «#p,#s,#l»,
 *  para que Personalizada parta del aspecto que había. */
export function currentColors() {
  return ['--accent', '--surface', '--text'].map(tokenHex).join(',');
}

/** Aplica la estética al documento: atributo para el CSS, colores propios y color de la barra del sistema. */
export function applySkin(skin: Skin, colors: string | null) {
  const root = document.documentElement;
  root.dataset.skin = skin;
  const [primary, secondary, text] = (colors ?? DEFAULT_COLORS).split(',');
  if (skin === 'personalizada') {
    root.style.setProperty('--c-primary', primary);
    root.style.setProperty('--c-secondary', secondary);
    root.style.setProperty('--c-text', text);
    // Texto sobre el color principal: la letra elegida si se lee bien; si no, blanco o negro.
    root.style.setProperty('--c-on-primary', contrast(text, primary) >= 4.5 ? text : contrast('#ffffff', primary) >= 3 ? '#ffffff' : '#000000');
    root.dataset.skinTone = luminance(secondary) < 0.3 ? 'dark' : 'light';
  } else {
    ['--c-primary', '--c-secondary', '--c-text', '--c-on-primary'].forEach((p) => root.style.removeProperty(p));
    delete root.dataset.skinTone;
  }
  syncStatusBar();
}

/** Color de un token CSS (p. ej. --bg) tal como se ve ahora, en #rrggbb. */
function tokenHex(name: string) {
  const probe = document.createElement('i');
  probe.style.display = 'none';
  probe.style.color = `var(${name})`;
  document.body.appendChild(probe);
  const hex = toHex(getComputedStyle(probe).color);
  probe.remove();
  return hex;
}

let watchingScheme = false;

/** Pinta la barra de estado del sistema (iPhone, Android) del color de fondo que se está
 *  viendo, sea cual sea la estética, el estilo y el modo claro u oscuro. */
export function syncStatusBar() {
  const bg = tokenHex('--bg');
  document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((m) => (m.content = bg));
  if (!watchingScheme) {
    watchingScheme = true;
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', syncStatusBar);
  }
}
