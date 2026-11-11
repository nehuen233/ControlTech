import { useEffect } from 'react'

const TONOS = {
  Operativo: 'ok', Disponible: 'ok', 'En uso': 'info', 'En mantenimiento': 'warn', 'Fuera de servicio': 'danger',
  Pendiente: 'warn', 'En proceso': 'info', Completado: 'ok',
  Preventivo: 'info', Correctivo: 'danger', Actualizacion: 'neutral',
  Baja: 'neutral', Media: 'info', Alta: 'warn', Critica: 'danger',
  Activa: 'warn', Resuelta: 'ok',
  'Necesita reparación': 'warn', 'Con problemas': 'warn',
  // Pagos y estado de cuenta
  Pagado: 'ok', Vencido: 'danger', Anulado: 'neutral', 'Al día': 'ok', Suspendida: 'danger', 'En prueba': 'info', 'Sin plan': 'neutral',
}

export const ETIQUETA_TIPO = { Actualizacion: 'Actualización', Critica: 'Crítica' }
export const etiqueta = (v) => ETIQUETA_TIPO[v] || v

const TONOS_LICENCIA = { Activa: 'ok', Vencida: 'danger', Suspendida: 'neutral' }

export function Badge({ value, licencia = false }) {
  if (!value) return null
  const tono = (licencia ? TONOS_LICENCIA[value] : TONOS[value]) || 'neutral'
  return <span className={`badge badge-${tono}`}>{etiqueta(value)}</span>
}

export function Alerta({ tipo = 'error', children, onClose }) {
  if (!children) return null
  return (
    <div className={`alerta alerta-${tipo}`} role={tipo === 'error' ? 'alert' : 'status'}>
      <span>{children}</span>
      {onClose && <button type="button" className="btn-link" onClick={onClose} aria-label="Cerrar">×</button>}
    </div>
  )
}

export function Modal({ titulo, onClose, children, ancho }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="modal-fondo" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={titulo} style={ancho ? { maxWidth: ancho } : undefined}>
        <header className="modal-cabecera">
          <h2>{titulo}</h2>
          <button type="button" className="btn-link cerrar" onClick={onClose} aria-label="Cerrar">×</button>
        </header>
        <div className="modal-cuerpo">{children}</div>
      </div>
    </div>
  )
}

export function Cargando({ texto = 'Cargando…' }) {
  return <p className="vacio">{texto}</p>
}

export const fecha = (v) => {
  if (!v) return '—'
  const [d] = String(v).split(' ')
  const [y, m, dd] = d.split('-')
  return `${dd}/${m}/${y}`
}
export const fechaHora = (v) => (v ? `${fecha(v)} ${String(v).split(' ')[1]?.slice(0, 5) || ''}`.trim() : '—')
export const moneda = (v) => (v == null ? '—' : Number(v).toLocaleString('es-AR', { style: 'currency', currency: 'ARS' }))
export const hoy = () => {
  const d = new Date()
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
}
