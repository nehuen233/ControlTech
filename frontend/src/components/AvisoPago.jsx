import { useEffect, useState } from 'react'
import { api } from '../api.js'
import { fecha } from './ui.jsx'

// Franja superior para el ADMINISTRADOR del colegio: pago pendiente que vence hoy, pago vencido
// con la fecha exacta de suspensión, o prueba terminada sin plan.
export default function AvisoPago() {
  const [aviso, setAviso] = useState(null)
  useEffect(() => {
    let vivo = true
    api('/institucion/plan').then((p) => { if (vivo) setAviso(p.aviso) }).catch(() => {})
    return () => { vivo = false }
  }, [])
  if (!aviso) return null
  const urgente = aviso.tipo === 'urgente'
  return (
    <div className={`aviso-pago ${urgente ? 'es-urgente' : ''}`} role={urgente ? 'alert' : 'status'}>
      <span>
        <strong>{aviso.texto}</strong>
        {urgente && <> Si no se registra el pago, el acceso del colegio se suspende el <strong>{fecha(aviso.fecha_suspension)}</strong>.</>}
      </span>
      <a className={`btn ${urgente ? 'btn-peligro' : 'btn-secundario'}`} href="#/mi-plan">{aviso.tipo === 'prueba' ? 'Ver mi plan' : 'Ver cómo pagar'}</a>
    </div>
  )
}
