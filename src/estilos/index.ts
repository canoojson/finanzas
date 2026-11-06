import { STYLES, type Style } from '../../shared/styles';
import { syncStatusBar } from '../skin';

export { STYLES, type Style };

/** Nombre y descripción de cada estilo, para el selector de Ajustes. */
export const STYLE_INFO: Record<Style, [string, string]> = {
  original: ['Original', 'El aspecto de siempre.'],
  aurora: ['Aurora', 'Moderna: violeta, muy redondeada y con un brillo de color.'],
  nitido: ['Nítido', 'Sobria, tipo banca: blanco y negro, bordes finos, sin sombras.'],
  editorial: ['Editorial', 'Cálida, como papel: crema, teja y títulos con serifa.'],
  isla: ['Isla', 'Amable: verde azulado, botones en pastilla y barra flotante.'],
  cristal: ['Cristal', 'Como iOS: vidrio translúcido, colores de Apple y barra en cápsula.'],
};

// Cada estilo se carga como texto y solo se inyecta el activo, así sus reglas
// tienen la misma prioridad que si fuera el único (van después de styles.css).
const CSS = import.meta.glob<string>('./*.css', { query: '?inline', import: 'default', eager: true });

const CACHE_KEY = 'finanzas.style';

/** Aplica un estilo: sustituye la hoja inyectada y lo recuerda para el próximo arranque. */
export function applyStyle(style: Style) {
  let el = document.getElementById('app-style') as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement('style');
    el.id = 'app-style';
    document.head.appendChild(el);
  }
  el.textContent = CSS[`./${style}.css`] ?? '';
  document.documentElement.dataset.style = style;
  syncStatusBar();
  try {
    localStorage.setItem(CACHE_KEY, style);
  } catch {}
}

/** Estilo del último arranque, para pintarlo antes de que llegue /bootstrap. */
export function cachedStyle(): Style {
  try {
    const s = localStorage.getItem(CACHE_KEY);
    if (s && (STYLES as readonly string[]).includes(s)) return s as Style;
  } catch {}
  return 'original';
}
