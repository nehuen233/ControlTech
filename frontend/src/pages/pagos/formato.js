// Formatos y listas compartidos por las pantallas de pagos.
export const PLANES = [
  { id: 'Basico', etiqueta: 'Básico' },
  { id: 'Estandar', etiqueta: 'Estándar' },
  { id: 'Institucional', etiqueta: 'Institucional' },
]
export const etiquetaPlan = (p) => PLANES.find((x) => x.id === p)?.etiqueta || 'Sin plan'
export const CONCEPTOS = [
  { id: 'Abono', etiqueta: 'Abono mensual' },
  { id: 'Implementacion', etiqueta: 'Implementación' },
  { id: 'Anual', etiqueta: 'Pago anual' },
  { id: 'Otro', etiqueta: 'Otro' },
]
export const etiquetaConcepto = (c) => CONCEPTOS.find((x) => x.id === c)?.etiqueta || c
export const MEDIOS = ['Transferencia', 'Mercado Pago', 'Efectivo', 'Otro']
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
// '2026-11' → 'noviembre 2026'
export const periodoTexto = (p) => {
  if (!p) return '—'
  const [a, m] = String(p).split('-')
  return `${MESES[Number(m) - 1] || m} ${a}`
}
export const pesos = (v) => (v == null ? '—' : Number(v).toLocaleString('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 2 }))
// Fecha de hoy en Argentina, AAAA-MM-DD
export const hoyAR = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
