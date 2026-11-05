import { useCallback, useEffect, useState } from 'react'
import { api } from '../api.js'
import { useAuth } from '../AuthContext.jsx'
import { Alerta, Badge, Cargando, Modal, etiqueta, fecha, fechaHora, hoy } from '../components/ui.jsx'

const ESTADOS = ['Operativo', 'Disponible', 'En uso', 'En mantenimiento', 'Fuera de servicio']

// Permite abrir la seccion filtrada desde Laboratorios: #/equipos?laboratorio=3
const filtroInicial = () => {
  const params = new URLSearchParams(window.location.hash.split('?')[1] || '')
  return { laboratorio: params.get('laboratorio') || '', estado: '', q: '' }
}

export default function Equipos() {
  const { puedeGestionar, esAdmin } = useAuth()
  const [labs, setLabs] = useState([])
  const [filtros, setFiltros] = useState(filtroInicial)
  const [equipos, setEquipos] = useState(null)
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')
  const [modal, setModal] = useState(null)
  const [recarga, setRecarga] = useState(0)

  useEffect(() => { api('/laboratorios').then(setLabs).catch((e) => setError(e.message)) }, [])
  useEffect(() => {
    const onHash = () => setFiltros(filtroInicial())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  useEffect(() => {
    const t = setTimeout(() => {
      api('/equipos', { params: filtros }).then((d) => { setEquipos(d); setError('') }).catch((e) => setError(e.message))
    }, 200)
    return () => clearTimeout(t)
  }, [filtros, recarga])

  const set = (k) => (e) => setFiltros((f) => ({ ...f, [k]: e.target.value }))
  const guardado = (mensaje, idEquipo) => {
    setAviso(mensaje)
    setRecarga((n) => n + 1)
    setModal(idEquipo ? { tipo: 'ficha', id: idEquipo } : null)
  }

  return (
    <section className="panel">
      <div className="barra-acciones">
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
        {puedeGestionar && (
          <button type="button" className="btn btn-primario" onClick={() => setModal({ tipo: 'form', laboratorio: filtros.laboratorio })}>Nuevo equipo</button>
        )}
      </div>
      <Alerta>{error}</Alerta>
      <Alerta tipo="ok" onClose={() => setAviso('')}>{aviso}</Alerta>
      {!equipos ? <Cargando /> : equipos.length === 0 ? <p className="vacio">No hay equipos que coincidan con los filtros.</p> : (
        <>
          <p className="texto-suave">{equipos.length} equipos · Seleccioná un equipo para ver toda su información.</p>
          <div className="tabla-scroll">
            <table>
              <thead><tr><th>Equipo</th><th>Laboratorio</th><th>Marca / modelo</th><th>Especificaciones</th><th>Estado</th><th>Responsable</th><th>Acciones</th></tr></thead>
              <tbody>
                {equipos.map((e) => (
                  <tr key={e.id_equipo}>
                    <td>
                      <button type="button" className="btn-link" onClick={() => setModal({ tipo: 'ficha', id: e.id_equipo })}>{e.identificador}</button>
                      <div className="texto-suave chico">{e.nro_serie}</div>
                    </td>
                    <td>{e.laboratorio}</td>
                    <td>{e.marca} {e.modelo}</td>
                    <td className="chico">{[e.procesador, e.ram, e.almacenamiento].filter(Boolean).join(' · ') || '—'}</td>
                    <td><Badge value={e.estado} /></td>
                    <td>{e.responsable || '—'}</td>
                    <td className="acciones-fila">
                      <button type="button" className="btn-link" onClick={() => setModal({ tipo: 'ficha', id: e.id_equipo })}>Ver ficha</button>
                      {puedeGestionar && <button type="button" className="btn-link" onClick={() => setModal({ tipo: 'form', id: e.id_equipo })}>Editar</button>}
                      {esAdmin && <button type="button" className="btn-link peligro" onClick={() => setModal({ tipo: 'eliminar', id: e.id_equipo })}>Eliminar</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {modal?.tipo === 'ficha' && (
        <FichaEquipo id={modal.id} puedeGestionar={puedeGestionar} recarga={recarga}
          onEditar={() => setModal({ tipo: 'form', id: modal.id })} onClose={() => setModal(null)}
          onEliminar={() => setModal({ tipo: 'eliminar', id: modal.id })} />
      )}
      {modal?.tipo === 'eliminar' && (
        <EliminarEquipo id={modal.id} onClose={() => setModal(null)}
          onEliminado={(mensaje) => { setModal(null); setAviso(mensaje); setRecarga((n) => n + 1) }} />
      )}
      {modal?.tipo === 'form' && (
        <FormEquipo id={modal.id} labs={modal.id ? labs : labs.filter((l) => l.estado === 'Activo')}
          laboratorioInicial={modal.laboratorio} onClose={() => setModal(null)} onGuardado={guardado} />
      )}
    </section>
  )
}

export function FichaEquipo({ id, puedeGestionar, recarga, onEditar, onClose, onEliminar }) {
  const { esAdmin } = useAuth()
  const [eq, setEq] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => { api(`/equipos/${id}`).then(setEq).catch((e) => setError(e.message)) }, [id, recarga])

  return (
    <Modal titulo={eq ? `Equipo ${eq.identificador}` : 'Equipo'} onClose={onClose} ancho="720px">
      <Alerta>{error}</Alerta>
      {!eq && !error ? <Cargando /> : eq && (
        <div className="ficha">
          <div className="historial-cabecera">
            <Badge value={eq.estado} />
            <span className="texto-suave">{eq.laboratorio} · registrado el {fecha(eq.fecha_registro)}</span>
          </div>
          <h4>Información general</h4>
          <dl className="datos datos-ficha">
            <div><dt>Identificador</dt><dd>{eq.identificador}</dd></div>
            <div><dt>N.º de serie</dt><dd>{eq.nro_serie}</dd></div>
            <div><dt>Tipo</dt><dd>{eq.tipo}</dd></div>
            <div><dt>Marca</dt><dd>{eq.marca}</dd></div>
            <div><dt>Modelo</dt><dd>{eq.modelo || '—'}</dd></div>
            <div><dt>Responsable</dt><dd>{eq.responsable || '—'}</dd></div>
          </dl>
          <h4>Especificaciones</h4>
          <dl className="datos datos-ficha">
            <div><dt>Procesador</dt><dd>{eq.procesador || '—'}</dd></div>
            <div><dt>Memoria RAM</dt><dd>{eq.ram || '—'}</dd></div>
            <div><dt>Almacenamiento</dt><dd>{eq.almacenamiento || '—'}</dd></div>
          </dl>
          <h4>Software instalado ({eq.software.length})</h4>
          {eq.software.length === 0 ? <p className="vacio">Sin software registrado.</p> : (
            <div className="tabla-scroll">
              <table>
                <thead><tr><th>Programa</th><th>Versión</th><th>Instalado</th><th>Licencia</th></tr></thead>
                <tbody>
                  {eq.software.map((s) => (
                    <tr key={s.id_software}>
                      <td><strong>{s.nombre_software}</strong><div className="texto-suave chico">{s.proveedor}</div></td>
                      <td>{s.version || '—'}</td>
                      <td className="nowrap">{fecha(s.fecha_instalacion)}</td>
                      <td>{s.tipo_licencia ? <>{s.tipo_licencia} <Badge value={s.estado_licencia} licencia />{s.fecha_vencimiento && <div className="texto-suave chico">Vence {fecha(s.fecha_vencimiento)}</div>}</> : <span className="texto-suave">Sin licencia</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <h4>Mantenimiento</h4>
          <dl className="datos datos-ficha">
            <div><dt>Mantenimientos</dt><dd>{eq.mantenimientos.total}</dd></div>
            <div><dt>Abiertos</dt><dd>{eq.mantenimientos.abiertos}</dd></div>
            <div><dt>Último</dt><dd>{fecha(eq.mantenimientos.ultimo)}</dd></div>
          </dl>
          {eq.problemas_activos.length > 0 && (
            <ul className="problemas">
              {eq.problemas_activos.map((p) => (
                <li key={p.id_alerta}>
                  <div className="fila-titulo"><strong>{p.titulo}</strong> <Badge value={p.severidad} /></div>
                  <p className="texto-suave chico">Reportado {fechaHora(p.fecha_creacion)}{p.fecha_limite ? ` · próxima revisión ${fecha(p.fecha_limite)}` : ''}</p>
                </li>
              ))}
            </ul>
          )}
          {eq.mantenimientos.recientes.length > 0 && (
            <ol className="linea-tiempo">
              {eq.mantenimientos.recientes.map((m) => (
                <li key={m.id_mantenimiento}>
                  <div className="fila-titulo"><strong>{fecha(m.fecha_mantenimiento)}</strong> <Badge value={m.tipo} /> <Badge value={m.estado} /></div>
                  <p>{m.detalle}</p>
                  <p className="texto-suave chico">{m.responsable}</p>
                </li>
              ))}
            </ol>
          )}
          <div className="form-acciones">
            {esAdmin && onEliminar && <button type="button" className="btn-link peligro empuja-izq" onClick={onEliminar}>Eliminar equipo</button>}
            <a className="btn btn-secundario" href="#/mantenimientos" onClick={onClose}>Ir a Mantenimientos</a>
            {puedeGestionar && <button type="button" className="btn btn-primario" onClick={onEditar}>Editar equipo</button>}
          </div>
        </div>
      )}
    </Modal>
  )
}

export function FormEquipo({ id, labs, laboratorioInicial, onClose, onGuardado }) {
  const editando = Boolean(id)
  const [f, setF] = useState(null)
  const [catalogo, setCatalogo] = useState([])
  const [responsables, setResponsables] = useState([])
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)

  useEffect(() => {
    api('/software').then(setCatalogo).catch((e) => setError(e.message))
    if (!editando) {
      setF({
        identificador: '', nro_serie: '', tipo: 'Computadora', marca: '', modelo: '', procesador: '', ram: '', almacenamiento: '',
        estado: 'Operativo', id_laboratorio: laboratorioInicial || '', id_responsable: '', software: {},
      })
      return
    }
    api(`/equipos/${id}`).then((eq) => setF({
      identificador: eq.identificador, nro_serie: eq.nro_serie, tipo: eq.tipo, marca: eq.marca, modelo: eq.modelo || '',
      procesador: eq.procesador || '', ram: eq.ram || '', almacenamiento: eq.almacenamiento || '', estado: eq.estado,
      id_laboratorio: String(eq.id_laboratorio), id_responsable: eq.id_responsable ? String(eq.id_responsable) : '',
      software: Object.fromEntries(eq.software.map((s) => [s.id_software, s.fecha_instalacion || ''])),
    })).catch((e) => setError(e.message))
  }, [id, editando, laboratorioInicial])

  const cargarResponsables = useCallback((idLab) => {
    if (!idLab) { setResponsables([]); return }
    api(`/laboratorios/${idLab}/responsables`).then(setResponsables).catch(() => setResponsables([]))
  }, [])
  const labActual = f?.id_laboratorio
  useEffect(() => { cargarResponsables(labActual) }, [labActual, cargarResponsables])

  if (!f) {
    return <Modal titulo={editando ? 'Editar equipo' : 'Nuevo equipo'} onClose={onClose}>{error ? <Alerta>{error}</Alerta> : <Cargando />}</Modal>
  }

  const set = (k) => (e) => setF((v) => {
    const n = { ...v, [k]: e.target.value }
    if (k === 'id_laboratorio') n.id_responsable = ''
    return n
  })
  const toggleSoftware = (idS) => setF((v) => {
    const sw = { ...v.software }
    if (idS in sw) delete sw[idS]
    else sw[idS] = hoy()
    return { ...v, software: sw }
  })
  const fechaSoftware = (idS, valor) => setF((v) => ({ ...v, software: { ...v.software, [idS]: valor } }))

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    if (!f.id_laboratorio) return setError('Seleccioná el laboratorio del equipo.')
    setEnviando(true)
    const body = {
      ...f,
      id_laboratorio: Number(f.id_laboratorio),
      id_responsable: f.id_responsable ? Number(f.id_responsable) : null,
      software: Object.entries(f.software).map(([idS, fi]) => ({ id_software: Number(idS), fecha_instalacion: fi || null })),
    }
    try {
      const eq = editando
        ? await api(`/equipos/${id}`, { method: 'PUT', body })
        : await api('/equipos', { method: 'POST', body })
      onGuardado(editando ? `Equipo ${eq.identificador} actualizado.` : `Equipo ${eq.identificador} registrado.`, eq.id_equipo)
    } catch (err) {
      setError(err.message)
      setEnviando(false)
    }
  }

  return (
    <Modal titulo={editando ? `Editar equipo ${f.identificador}` : 'Nuevo equipo'} onClose={onClose} ancho="720px">
      <form className="form" onSubmit={submit}>
        <Alerta>{error}</Alerta>
        <div className="form-fila">
          <label>Identificador<input value={f.identificador} onChange={set('identificador')} maxLength={50} required placeholder="Ej.: PC-4A-13" /></label>
          <label>N.º de serie<input value={f.nro_serie} onChange={set('nro_serie')} maxLength={100} required /></label>
          <label>Tipo<input value={f.tipo} onChange={set('tipo')} maxLength={80} list="tipos-equipo" /></label>
        </div>
        <datalist id="tipos-equipo"><option>Computadora</option><option>Notebook</option><option>Monitor</option><option>Impresora</option><option>Proyector</option></datalist>
        <div className="form-fila">
          <label>Marca<input value={f.marca} onChange={set('marca')} maxLength={80} required /></label>
          <label>Modelo<input value={f.modelo} onChange={set('modelo')} maxLength={100} /></label>
          <label>Estado
            <select value={f.estado} onChange={set('estado')}>{ESTADOS.map((s) => <option key={s}>{s}</option>)}</select>
          </label>
        </div>
        <div className="form-fila">
          <label>Procesador<input value={f.procesador} onChange={set('procesador')} maxLength={100} /></label>
          <label>Memoria RAM<input value={f.ram} onChange={set('ram')} maxLength={50} placeholder="Ej.: 16 GB" /></label>
          <label>Almacenamiento<input value={f.almacenamiento} onChange={set('almacenamiento')} maxLength={100} placeholder="Ej.: 512 GB SSD" /></label>
        </div>
        <div className="form-fila">
          <label>Laboratorio
            <select value={f.id_laboratorio} onChange={set('id_laboratorio')} required>
              <option value="">Seleccioná un laboratorio</option>
              {labs.map((l) => (
                <option key={l.id_laboratorio} value={l.id_laboratorio}>
                  {l.nombre}{l.capacidad_equipos != null ? ` (${l.total_equipos}/${l.capacidad_equipos})` : ''}
                </option>
              ))}
            </select>
          </label>
          <label>Responsable
            <select value={f.id_responsable} onChange={set('id_responsable')} disabled={!f.id_laboratorio}>
              <option value="">Sin responsable</option>
              {responsables.map((u) => <option key={u.id_usuario} value={u.id_usuario}>{u.nombre} ({u.rolEtiqueta})</option>)}
            </select>
          </label>
        </div>
        <fieldset>
          <legend>Software instalado</legend>
          {catalogo.length === 0 ? <p className="texto-suave chico">No hay software en el catálogo.</p> : (
            <div className="lista-software">
              {catalogo.map((s) => {
                const marcado = s.id_software in f.software
                return (
                  <div key={s.id_software} className="fila-software">
                    <label className="check">
                      <input type="checkbox" checked={marcado} onChange={() => toggleSoftware(s.id_software)} />
                      {s.nombre_software} <span className="texto-suave chico">{[s.version, s.tipo_licencia && etiqueta(s.tipo_licencia)].filter(Boolean).join(' · ')}</span>
                    </label>
                    {marcado && (
                      <input type="date" aria-label={`Fecha de instalación de ${s.nombre_software}`} value={f.software[s.id_software]}
                        onChange={(e) => fechaSoftware(s.id_software, e.target.value)} />
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </fieldset>
        <div className="form-acciones">
          <button type="button" className="btn btn-secundario" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primario" disabled={enviando}>{enviando ? 'Guardando…' : 'Guardar'}</button>
        </div>
      </form>
    </Modal>
  )
}

// Confirmacion de baja de una computadora. Sus mantenimientos y problemas registrados se
// eliminan con ella (dependen del equipo en la base): si tiene, se pide confirmarlo.
export function EliminarEquipo({ id, onClose, onEliminado }) {
  const [eq, setEq] = useState(null)
  const [confirmo, setConfirmo] = useState(false)
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)
  useEffect(() => { api(`/equipos/${id}`).then(setEq).catch((e) => setError(e.message)) }, [id])

  const historial = eq ? eq.mantenimientos.total + eq.problemas_total : 0
  const eliminar = async () => {
    setError('')
    setEnviando(true)
    try {
      const r = await api(`/equipos/${id}`, { method: 'DELETE', body: { confirmar_historial: historial > 0 } })
      onEliminado(`Equipo ${r.identificador} eliminado.`)
    } catch (err) {
      setError(err.message)
      setEnviando(false)
    }
  }

  return (
    <Modal titulo={eq ? `Eliminar equipo ${eq.identificador}` : 'Eliminar equipo'} onClose={onClose} ancho="520px">
      <div className="form">
        <Alerta>{error}</Alerta>
        {!eq && !error ? <Cargando /> : eq && (
          <>
            <p>Se va a eliminar <strong>{eq.identificador}</strong> ({eq.marca} {eq.modelo}, serie {eq.nro_serie}) del {eq.laboratorio}. Esta acción no se puede deshacer.</p>
            <ul className="lista-simple chico">
              {eq.mantenimientos.total > 0 && (
                <li><strong>{eq.mantenimientos.total} mantenimiento(s)</strong>{eq.mantenimientos.abiertos ? ` (${eq.mantenimientos.abiertos} sin finalizar)` : ''} se eliminan junto con el equipo.</li>
              )}
              {eq.problemas_total > 0 && <li><strong>{eq.problemas_total} problema(s) reportado(s)</strong> se eliminan junto con el equipo.</li>}
              {eq.software.length > 0 && <li>Se quita el registro de {eq.software.length} programa(s) instalado(s).</li>}
              {historial === 0 && <li>No tiene mantenimientos ni problemas registrados.</li>}
              <li>La baja queda registrada en el historial de acciones.</li>
            </ul>
            {historial > 0 && (
              <p className="texto-suave chico">Si querés conservar su historial, marcá el equipo como <strong>Fuera de servicio</strong> desde Editar en lugar de eliminarlo.</p>
            )}
            <label className="check">
              <input type="checkbox" checked={confirmo} onChange={(e) => setConfirmo(e.target.checked)} />
              {historial > 0 ? 'Entiendo que se eliminan el equipo y su historial' : 'Entiendo que el equipo se elimina definitivamente'}
            </label>
            <div className="form-acciones">
              <button type="button" className="btn btn-secundario" onClick={onClose}>Cancelar</button>
              <button type="button" className="btn btn-peligro" onClick={eliminar} disabled={!confirmo || enviando}>{enviando ? 'Eliminando…' : 'Eliminar equipo'}</button>
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}
