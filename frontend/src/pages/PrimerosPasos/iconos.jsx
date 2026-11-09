// Iconos SVG inline (sin librerias). Heredan el color del texto.
const base = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true, focusable: false }

export const IconoCheck = (p) => <svg {...base} {...p}><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
export const IconoMas = (p) => <svg {...base} {...p}><path d="M12 5v14M5 12h14" /></svg>
export const IconoLapiz = (p) => <svg {...base} {...p}><path d="M4 20h4L19 9l-4-4L4 16v4z" /><path d="M13.5 6.5l4 4" /></svg>
export const IconoPapelera = (p) => <svg {...base} {...p}><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></svg>
export const IconoCopiar = (p) => <svg {...base} {...p}><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" /></svg>
export const IconoCerrar = (p) => <svg {...base} {...p}><path d="M6 6l12 12M18 6L6 18" /></svg>
