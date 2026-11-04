import { useEffect, useState } from 'react'
import { api } from '../api.js'
import { useAuth } from '../AuthContext.jsx'
import { Alerta, Cargando } from '../components/ui.jsx'

export default function Inicio() {
  const { usuario } = useAuth()
  const [labs, setLabs] = useState(null)
  const [resumen, setResumen] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    Promise.all([api('/laboratorios'), api('/mantenimientos/resumen')])
      .then(([l, r]) => { setLabs(l); setResumen(r) })
      .catch((e) => setError(e.message))
  }, [])

  if (error) return <Alerta>{error}</Alerta>
  if (!labs || !resumen) return <Cargando />

  return (
    <>
      <p className="texto-suave">Hola, {usuario.nombre}. Este es el estado de {labs.length === 1 ? 'tu laboratorio' : 'tus laboratorios'}.</p>
      <div className="tarjetas">
        <a className="tarjeta-dato" href="#/mantenimientos"><span>Equipos fuera de servicio</span><strong className="t-danger">{resumen.equipos.fuera_de_servicio}</strong></a>
        <a className="tarjeta-dato" href="#/mantenimientos"><span>Equipos en mantenimiento</span><strong className="t-warn">{resumen.equipos.en_mantenimiento}</strong></a>
        <a className="tarjeta-dato" href="#/mantenimientos"><span>Mantenimientos pendientes</span><strong>{resumen.mantenimientos.pendientes}</strong></a>
        <a className="tarjeta-dato" href="#/mantenimientos"><span>Mantenimientos en proceso</span><strong>{resumen.mantenimientos.en_proceso}</strong></a>
      </div>
      <section className="panel">
        <h2>Laboratorios</h2>
        {labs.length === 0 ? <p className="vacio">No tenés laboratorios asignados.</p> : (
          <div className="tabla-scroll">
            <table>
              <thead><tr><th>Laboratorio</th><th>Ubicación</th><th>Estado</th><th className="num">Equipos</th><th className="num">Con problemas</th></tr></thead>
              <tbody>
                {labs.map((l) => (
                  <tr key={l.id_laboratorio}>
                    <td><strong>{l.nombre}</strong></td>
                    <td>{[l.piso, l.ubicacion].filter(Boolean).join(' · ')}</td>
                    <td>{l.estado}</td>
                    <td className="num">{l.total_equipos}</td>
                    <td className="num">{l.equipos_con_problemas}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  )
}
