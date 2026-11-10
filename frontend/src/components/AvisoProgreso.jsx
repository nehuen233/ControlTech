// Aviso compacto para el administrador que dejó la configuración inicial para más tarde:
// "Configuración 2 de 5" con su barra y el botón Continuar. El progreso sale de los datos reales.
import { useEffect, useState } from 'react'
import { cargarDatos, estadoPasos, contarHechos, PASOS_TAREA, RUTA } from '../pages/PrimerosPasos/progreso.js'

export default function AvisoProgreso() {
  const [hechos, setHechos] = useState(null)
  useEffect(() => {
    let vivo = true
    cargarDatos().then((d) => { if (vivo) setHechos(contarHechos(estadoPasos(d))) }).catch(() => {})
    return () => { vivo = false }
  }, [])
  const total = PASOS_TAREA.length
  return (
    <div className="aviso-progreso" role="status">
      <div className="aviso-progreso-texto">
        <strong>Configuración {hechos ?? '…'} de {total}</strong>
        <span className="aviso-progreso-barra" aria-hidden="true"><span style={{ width: `${((hechos || 0) / total) * 100}%` }} /></span>
        <span className="texto-suave">Terminá de preparar tu colegio en ControlTech.</span>
      </div>
      <a className="btn btn-primario" href={`#/${RUTA}`}>Continuar</a>
    </div>
  )
}
