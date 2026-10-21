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

/** Aplica la estética al documento: atributo para el CSS, colores propios y color de la barra del sistema. */
export function applySkin(skin: Skin, colors: string | null) {
  const root = document.documentElement;
  root.dataset.skin = skin;
  const [primary, secondary, text] = (colors ?? DEFAULT_COLORS).split(',');
  if (skin === 'personalizada') {
    root.style.setProperty('--c-primary', primary);
    root.style.setProperty('--c-secondary', secondary);
    root.style.setProperty('--c-text', text);
    root.dataset.skinTone = luminance(secondary) < 0.3 ? 'dark' : 'light';
  } else {
    ['--c-primary', '--c-secondary', '--c-text'].forEach((p) => root.style.removeProperty(p));
    delete root.dataset.skinTone;
  }
  const bar = skin === 'chiikawa' ? '#fde3ec' : skin === 'personalizada' ? primary : null;
  document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((m) => {
    m.dataset.original ??= m.content;
    m.content = bar ?? m.dataset.original;
  });
}
