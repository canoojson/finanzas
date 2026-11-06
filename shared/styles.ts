/** Estilos visuales disponibles (el CSS de cada uno está en src/estilos/<id>.css). */
export const STYLES = ['original', 'aurora', 'nitido', 'editorial', 'isla', 'cristal'] as const;
export type Style = (typeof STYLES)[number];
