import { useEffect, useState } from 'react'
import { api } from '../api.js'
import { Alerta, Badge, Cargando } from '../components/ui.jsx'

const ESTADOS = ['Operativo', 'Disponible', 'En uso', 'En mantenimiento', 'Fuera de servicio']

export default function Equipos() {
  const [labs, setLabs] = useState([])
  const [filtros, setFiltros] = useState({ laboratorio: '', estado: '', q: '' })
  const [equipos, setEquipos] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => { api('/laboratorios').then(setLabs).catch((e) => setError(e.message)) }, [])
  useEffect(() => {
    const t = setTimeout(() => {
      api('/equipos', { params: filtros }).then((d) => { setEquipos(d); setError('') }).catch((e) => setError(e.message))
    }, 200)
    return () => clearTimeout(t)
  }, [filtros])

  const set = (k) => (e) => setFiltros((f) => ({ ...f, [k]: e.target.value }))

  return (
    <section className="panel">
      <div className="filtros">
        <label>Laboratorio
          <select value={filtros.laboratorio} onChange={set('laboratorio')}>
            <option value="">Todos</option>
            {labs.map((l) => <option key={l.id_laboratorio} value={l.id_laboratorio}>{l.nombre}</option>)}
          </select>
        </label>
        <label>Estado
          <select value={filtros.estado} onChange={set('estado')}>
            <option value="">Todos</option>
            {ESTADOS.map((s) => <option key={s}>{s}</option>)}
          </select>
        </label>
        <label className="crece">Buscar
          <input type="search" placeholder="Identificador, serie, marca o modelo" value={filtros.q} onChange={set('q')} />
        </label>
      </div>
      <Alerta>{error}</Alerta>
      {!equipos ? <Cargando /> : equipos.length === 0 ? <p className="vacio">No hay equipos que coincidan con los filtros.</p> : (
        <>
          <p className="texto-suave">{equipos.length} equipos · Para reportar un problema o registrar un mantenimiento, usá la sección <a href="#/mantenimientos">Mantenimientos</a>.</p>
          <div className="tabla-scroll">
            <table>
              <thead><tr><th>Equipo</th><th>Laboratorio</th><th>Marca / modelo</th><th>Especificaciones</th><th>Estado</th><th>Responsable</th></tr></thead>
              <tbody>
                {equipos.map((e) => (
                  <tr key={e.id_equipo}>
                    <td><strong>{e.identificador}</strong><div className="texto-suave chico">{e.nro_serie}</div></td>
                    <td>{e.laboratorio}</td>
                    <td>{e.marca} {e.modelo}</td>
                    <td className="chico">{[e.procesador, e.ram, e.almacenamiento].filter(Boolean).join(' · ')}</td>
                    <td><Badge value={e.estado} /></td>
                    <td>{e.responsable || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  )
}
