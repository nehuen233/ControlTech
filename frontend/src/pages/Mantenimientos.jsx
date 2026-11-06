import { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from '../api.js'
import { useAuth } from '../AuthContext.jsx'
import { Alerta, Badge, Cargando, Modal, etiqueta, fecha, fechaHora, hoy, moneda } from '../components/ui.jsx'

// Seccion unificada: equipos con problemas + mantenimientos + historial de intervenciones.
const TIPOS = ['Preventivo', 'Correctivo', 'Actualizacion']
const ESTADOS = ['Pendiente', 'En proceso', 'Completado']
const ESTADOS_EQUIPO = ['Operativo', 'Disponible', 'En uso', 'En mantenimiento', 'Fuera de servicio']
const SEVERIDADES = ['Baja', 'Media', 'Alta', 'Critica']
const CATEGORIAS = ['Fuera de servicio', 'En mantenimiento', 'Necesita reparación']
const VISTAS = [
  { id: 'problemas', titulo: 'Equipos con problemas' },
  { id: 'mantenimientos', titulo: 'Mantenimientos' },
  { id: 'historial', titulo: 'Historial de intervenciones' },
]

export default function Mantenimientos() {
  const { puedeGestionar, puedeReportar } = useAuth()
  const [vista, setVista] = useState('problemas')
  const [labs, setLabs] = useState([])
  const [equipos, setEquipos] = useState([])
  // #/mantenimientos?equipo=5 (desde la campana de alertas) abre filtrado por ese equipo.
  const equipoDesdeHash = () => new URLSearchParams(window.location.hash.split('?')[1] || '').get('equipo') || ''
  const [filtros, setFiltros] = useState(() => ({ laboratorio: '', equipo: equipoDesdeHash(), estado: '', tipo: '', categoria: '' }))
  const [resumen, setResumen] = useState(null)
  const [recarga, setRecarga] = useState(0)
  // Una alerta nueva o resuelta (en esta u otra ventana) recarga los datos de la pagina.
  useEffect(() => {
    const alCambiar = () => setRecarga((n) => n + 1)
    const alNavegar = () => {
      const eq = equipoDesdeHash()
      if (eq) { setVista('problemas'); setFiltros((f) => ({ ...f, laboratorio: '', categoria: '', equipo: eq })) }
    }
    window.addEventListener('controltech:alertas', alCambiar)
    window.addEventListener('hashchange', alNavegar)
    return () => { window.removeEventListener('controltech:alertas', alCambiar); window.removeEventListener('hashchange', alNavegar) }
  }, [])
  const [modal, setModal] = useState(null)
  const [aviso, setAviso] = useState('')

  useEffect(() => {
    Promise.all([api('/laboratorios'), api('/equipos')]).then(([l, e]) => { setLabs(l); setEquipos(e) })
  }, [])

  useEffect(() => {
    api('/mantenimientos/resumen', { params: { laboratorio: filtros.laboratorio, equipo: filtros.equipo } }).then(setResumen)
  }, [filtros.laboratorio, filtros.equipo, recarga])

  const equiposFiltrados = useMemo(
    () => (filtros.laboratorio ? equipos.filter((e) => String(e.id_laboratorio) === filtros.laboratorio) : equipos),
    [equipos, filtros.laboratorio],
  )

  const setFiltro = (k, v) => setFiltros((f) => {
    const n = { ...f, [k]: v }
    if (k === 'laboratorio') n.equipo = ''
    return n
  })

  const irA = (nuevaVista, cambios = {}) => {
    setVista(nuevaVista)
    setFiltros((f) => ({ ...f, estado: '', tipo: '', categoria: '', ...cambios }))
  }

  const terminado = (mensaje) => {
    setModal(null)
    setAviso(mensaje)
    setRecarga((n) => n + 1)
  }

  const verHistorial = (idEquipo) => {
    setFiltros((f) => ({ ...f, equipo: String(idEquipo) }))
    setVista('historial')
  }

  return (
    <>
      {resumen && (
        <div className="tarjetas tarjetas-chicas">
          <Dato titulo="Fuera de servicio" valor={resumen.equipos.fuera_de_servicio} tono="danger" onClick={() => irA('problemas', { categoria: 'Fuera de servicio' })} />
          <Dato titulo="En mantenimiento" valor={resumen.equipos.en_mantenimiento} tono="warn" onClick={() => irA('problemas', { categoria: 'En mantenimiento' })} />
          <Dato titulo="Pendientes" valor={resumen.mantenimientos.pendientes} onClick={() => irA('mantenimientos', { estado: 'Pendiente' })} />
          <Dato titulo="En proceso" valor={resumen.mantenimientos.en_proceso} onClick={() => irA('mantenimientos', { estado: 'En proceso' })} />
          <Dato titulo="Finalizados" valor={resumen.mantenimientos.finalizados} tono="ok" onClick={() => irA('mantenimientos', { estado: 'Completado' })} />
          <Dato titulo="Preventivos" valor={resumen.mantenimientos.preventivos} onClick={() => irA('mantenimientos', { tipo: 'Preventivo' })} />
          <Dato titulo="Correctivos" valor={resumen.mantenimientos.correctivos} onClick={() => irA('mantenimientos', { tipo: 'Correctivo' })} />
        </div>
      )}

      <section className="panel">
        <div className="barra-acciones">
          <div className="pestanas" role="tablist">
            {VISTAS.map((v) => (
              <button key={v.id} type="button" role="tab" aria-selected={vista === v.id} className={vista === v.id ? 'activa' : ''} onClick={() => setVista(v.id)}>
                {v.titulo}
              </button>
            ))}
          </div>
          <div className="acciones">
            {puedeReportar && <button type="button" className="btn btn-secundario" onClick={() => setModal({ tipo: 'problema' })}>Reportar problema</button>}
            {puedeGestionar && <button type="button" className="btn btn-primario" onClick={() => setModal({ tipo: 'mantenimiento' })}>Registrar mantenimiento</button>}
          </div>
        </div>

        <div className="filtros">
          <label>Laboratorio
            <select value={filtros.laboratorio} onChange={(e) => setFiltro('laboratorio', e.target.value)}>
              <option value="">Todos</option>
              {labs.map((l) => <option key={l.id_laboratorio} value={l.id_laboratorio}>{l.nombre}</option>)}
            </select>
          </label>
          <label>Equipo
            <select value={filtros.equipo} onChange={(e) => setFiltro('equipo', e.target.value)}>
              <option value="">{vista === 'historial' ? 'Seleccioná un equipo' : 'Todos'}</option>
              {equiposFiltrados.map((e) => <option key={e.id_equipo} value={e.id_equipo}>{e.identificador}</option>)}
            </select>
          </label>
          {vista === 'problemas' && (
            <label>Situación
              <select value={filtros.categoria} onChange={(e) => setFiltro('categoria', e.target.value)}>
                <option value="">Todas</option>
                {CATEGORIAS.map((c) => <option key={c}>{c}</option>)}
              </select>
            </label>
          )}
          {vista === 'mantenimientos' && (
            <>
              <label>Estado
                <select value={filtros.estado} onChange={(e) => setFiltro('estado', e.target.value)}>
                  <option value="">Todos</option>
                  {ESTADOS.map((s) => <option key={s} value={s}>{s === 'Completado' ? 'Finalizado' : s}</option>)}
                </select>
              </label>
              <label>Tipo de mantenimiento
                <select value={filtros.tipo} onChange={(e) => setFiltro('tipo', e.target.value)}>
                  <option value="">Todos</option>
                  {TIPOS.map((t) => <option key={t} value={t}>{etiqueta(t)}</option>)}
                </select>
              </label>
            </>
          )}
        </div>

        <Alerta tipo="ok" onClose={() => setAviso('')}>{aviso}</Alerta>

        {vista === 'problemas' && (
          <EquiposConProblemas filtros={filtros} recarga={recarga} puedeGestionar={puedeGestionar}
            onHistorial={verHistorial}
            onMantenimiento={(eq) => setModal({ tipo: 'mantenimiento', equipo: eq })}
            onResolver={(p, eq) => setModal({ tipo: 'resolver', problema: p, equipo: eq })} />
        )}
        {vista === 'mantenimientos' && (
          <ListaMantenimientos filtros={filtros} recarga={recarga} puedeGestionar={puedeGestionar}
            onHistorial={verHistorial}
            onEditar={(m) => setModal({ tipo: 'mantenimiento', mantenimiento: m })}
            onEstado={(m) => setModal({ tipo: 'estado', mantenimiento: m })} />
        )}
        {vista === 'historial' && <Historial idEquipo={filtros.equipo} recarga={recarga} />}
      </section>

      {modal?.tipo === 'mantenimiento' && (
        <FormMantenimiento equipos={equipos} inicial={modal.mantenimiento} equipoInicial={modal.equipo}
          onClose={() => setModal(null)} onGuardado={terminado} />
      )}
      {modal?.tipo === 'estado' && (
        <FormEstado mantenimiento={modal.mantenimiento} onClose={() => setModal(null)} onGuardado={terminado} />
      )}
      {modal?.tipo === 'problema' && (
        <FormProblema equipos={equipos} puedeGestionar={puedeGestionar} equipoInicial={filtros.equipo}
          onClose={() => setModal(null)} onGuardado={terminado} />
      )}
      {modal?.tipo === 'resolver' && (
        <FormResolver problema={modal.problema} equipo={modal.equipo} onClose={() => setModal(null)} onGuardado={terminado} />
      )}
    </>
  )
}

function Dato({ titulo, valor, tono, onClick }) {
  return (
    <button type="button" className="tarjeta-dato" onClick={onClick}>
      <span>{titulo}</span>
      <strong className={tono ? `t-${tono}` : ''}>{valor}</strong>
    </button>
  )
}

function useDatos(path, params, recarga) {
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState('')
  const clave = JSON.stringify(params)
  useEffect(() => {
    let vivo = true
    setDatos(null)
    api(path, { params: JSON.parse(clave) })
      .then((d) => { if (vivo) { setDatos(d); setError('') } })
      .catch((e) => vivo && setError(e.message))
    return () => { vivo = false }
  }, [path, clave, recarga])
  return { datos, error }
}

// ---------- Vista: equipos con problemas ----------
function EquiposConProblemas({ filtros, recarga, puedeGestionar, onHistorial, onMantenimiento, onResolver }) {
  const { datos, error } = useDatos('/mantenimientos/equipos-con-problemas',
    { laboratorio: filtros.laboratorio, equipo: filtros.equipo, categoria: filtros.categoria }, recarga)
  if (error) return <Alerta>{error}</Alerta>
  if (!datos) return <Cargando />
  if (!datos.length) return <p className="vacio">No hay equipos con problemas para los filtros seleccionados.</p>

  return (
    <div className="lista-problemas">
      {datos.map((e) => (
        <article key={e.id_equipo} className="tarjeta-problema">
          <header>
            <div>
              <h3>{e.identificador}</h3>
              <p className="texto-suave chico">{e.laboratorio} · {e.marca} {e.modelo}</p>
            </div>
            <div className="badges"><Badge value={e.categoria} />{e.categoria !== e.estado && <Badge value={e.estado} />}</div>
          </header>
          <dl className="datos">
            <div><dt>Responsable</dt><dd>{e.responsable || '—'}</dd></div>
            <div><dt>Próxima revisión</dt><dd>{fecha(e.proxima_revision)}</dd></div>
            <div><dt>Registro del equipo</dt><dd>{fecha(e.fecha_registro)}</dd></div>
          </dl>
          {e.problemas.length > 0 ? (
            <ul className="problemas">
              {e.problemas.map((p) => (
                <li key={p.id_alerta}>
                  <div className="fila-titulo"><strong>{p.titulo}</strong> <Badge value={p.severidad} /></div>
                  <p>{p.descripcion}</p>
                  <p className="texto-suave chico">Reportado {fechaHora(p.fecha_creacion)}{p.fecha_limite ? ` · revisar antes del ${fecha(p.fecha_limite)}` : ''}</p>
                  {puedeGestionar && <button type="button" className="btn-link" onClick={() => onResolver(p, e)}>Marcar como resuelto</button>}
                </li>
              ))}
            </ul>
          ) : <p className="texto-suave chico">Sin problemas reportados activos.</p>}
          {e.mantenimientos_abiertos.length > 0 && (
            <div className="abiertos">
              <span className="chico texto-suave">Mantenimientos abiertos:</span>
              {e.mantenimientos_abiertos.map((m) => (
                <div key={m.id_mantenimiento} className="chico">
                  <Badge value={m.tipo} /> <Badge value={m.estado} /> {m.detalle} — {m.responsable} ({fecha(m.fecha_mantenimiento)})
                </div>
              ))}
            </div>
          )}
          <footer>
            <button type="button" className="btn btn-secundario" onClick={() => onHistorial(e.id_equipo)}>Ver historial</button>
            {puedeGestionar && <button type="button" className="btn btn-primario" onClick={() => onMantenimiento(e)}>Registrar mantenimiento</button>}
          </footer>
        </article>
      ))}
    </div>
  )
}

// ---------- Vista: lista de mantenimientos ----------
function ListaMantenimientos({ filtros, recarga, puedeGestionar, onHistorial, onEditar, onEstado }) {
  const { datos, error } = useDatos('/mantenimientos',
    { laboratorio: filtros.laboratorio, equipo: filtros.equipo, estado: filtros.estado, tipo: filtros.tipo }, recarga)
  if (error) return <Alerta>{error}</Alerta>
  if (!datos) return <Cargando />
  if (!datos.length) return <p className="vacio">No hay mantenimientos para los filtros seleccionados.</p>

  return (
    <div className="tabla-scroll">
      <table>
        <thead>
          <tr>
            <th>Equipo</th><th>Laboratorio</th><th>Tipo</th><th>Estado</th><th>Fecha</th>
            <th>Descripción / observaciones</th><th>Problema detectado</th><th>Responsable</th><th className="num">Costo</th><th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          {datos.map((m) => (
            <tr key={m.id_mantenimiento}>
              <td><strong>{m.equipo}</strong><div className="chico"><Badge value={m.estado_equipo} /></div></td>
              <td>{m.laboratorio}</td>
              <td><Badge value={m.tipo} /></td>
              <td><Badge value={m.estado} /></td>
              <td className="nowrap">{fecha(m.fecha_mantenimiento)}{m.fecha_registro && <div className="texto-suave chico">Reg. {fecha(m.fecha_registro)}</div>}</td>
              <td>{m.detalle}{m.notas_adicionales && <div className="texto-suave chico">{m.notas_adicionales}</div>}</td>
              <td className="chico">{m.problema_detectado || '—'}{m.proxima_revision && <div className="texto-suave">Próx. revisión {fecha(m.proxima_revision)}</div>}</td>
              <td>{m.responsable}</td>
              <td className="num nowrap">{moneda(m.costo)}</td>
              <td className="acciones-fila">
                <button type="button" className="btn-link" onClick={() => onHistorial(m.id_equipo)}>Historial</button>
                {puedeGestionar && <button type="button" className="btn-link" onClick={() => onEditar(m)}>Editar</button>}
                {puedeGestionar && <button type="button" className="btn-link" onClick={() => onEstado(m)}>Cambiar estado</button>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ---------- Vista: historial de intervenciones ----------
function Historial({ idEquipo, recarga }) {
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => {
    if (!idEquipo) return
    let vivo = true
    setDatos(null)
    api(`/mantenimientos/historial/${idEquipo}`)
      .then((d) => { if (vivo) { setDatos(d); setError('') } })
      .catch((e) => vivo && setError(e.message))
    return () => { vivo = false }
  }, [idEquipo, recarga])

  if (!idEquipo) return <p className="vacio">Seleccioná un equipo en el filtro para ver su historial de intervenciones.</p>
  if (error) return <Alerta>{error}</Alerta>
  if (!datos) return <Cargando />
  const { equipo, mantenimientos, problemas, acciones } = datos

  return (
    <div className="historial">
      <div className="historial-cabecera">
        <h3>{equipo.identificador}</h3>
        <span className="texto-suave">{equipo.laboratorio} · {equipo.marca} {equipo.modelo}</span>
        <Badge value={equipo.estado} />
      </div>
      <div className="historial-columnas">
        <div>
          <h4>Mantenimientos ({mantenimientos.length})</h4>
          {mantenimientos.length === 0 ? <p className="vacio">Sin mantenimientos registrados.</p> : (
            <ol className="linea-tiempo">
              {mantenimientos.map((m) => (
                <li key={m.id_mantenimiento}>
                  <div className="fila-titulo"><strong>{fecha(m.fecha_mantenimiento)}</strong> <Badge value={m.tipo} /> <Badge value={m.estado} /></div>
                  <p>{m.detalle}</p>
                  {m.notas_adicionales && <p className="texto-suave chico">Obs.: {m.notas_adicionales}</p>}
                  <p className="texto-suave chico">Responsable: {m.responsable} · Costo: {moneda(m.costo)}</p>
                </li>
              ))}
            </ol>
          )}
          <h4>Problemas reportados ({problemas.length})</h4>
          {problemas.length === 0 ? <p className="vacio">Sin problemas reportados.</p> : (
            <ol className="linea-tiempo">
              {problemas.map((p) => (
                <li key={p.id_alerta}>
                  <div className="fila-titulo"><strong>{p.titulo}</strong> <Badge value={p.severidad} /> <Badge value={p.estado} /></div>
                  <p>{p.descripcion}</p>
                  <p className="texto-suave chico">Reportado {fechaHora(p.fecha_creacion)} · Próxima revisión {fecha(p.fecha_limite)}</p>
                </li>
              ))}
            </ol>
          )}
        </div>
        <div>
          <h4>Acciones registradas ({acciones.length})</h4>
          {acciones.length === 0 ? <p className="vacio">Sin acciones registradas.</p> : (
            <ol className="linea-tiempo">
              {acciones.map((a) => (
                <li key={a.id_accion}>
                  <div className="fila-titulo"><strong>{fechaHora(a.fecha_hora)}</strong> <span className="texto-suave chico">{a.accion} · {a.entidad}</span></div>
                  <p>{a.detalle || '—'}</p>
                  <p className="texto-suave chico">{a.usuario}</p>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </div>
  )
}

// ---------- Formularios ----------
function useEnvio(onGuardado) {
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)
  const enviar = useCallback(async (fn, mensaje) => {
    setError('')
    setEnviando(true)
    try {
      await fn()
      onGuardado(mensaje)
    } catch (e) {
      setError(e.message)
      setEnviando(false)
    }
  }, [onGuardado])
  return { error, enviando, enviar }
}

function SelectEstadoEquipo({ value, onChange, actual }) {
  return (
    <label>Estado del equipo
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Sin cambios{actual ? ` (${actual})` : ''}</option>
        {ESTADOS_EQUIPO.map((s) => <option key={s}>{s}</option>)}
      </select>
    </label>
  )
}

function FormMantenimiento({ equipos, inicial, equipoInicial, onClose, onGuardado }) {
  const editando = Boolean(inicial)
  const [f, setF] = useState(() => ({
    id_equipo: String(inicial?.id_equipo || equipoInicial?.id_equipo || ''),
    fecha_mantenimiento: inicial?.fecha_mantenimiento || hoy(),
    tipo: inicial?.tipo || (equipoInicial ? 'Correctivo' : 'Preventivo'),
    estado: inicial?.estado || 'Pendiente',
    detalle: inicial?.detalle || '',
    costo: inicial?.costo ?? '',
    notas_adicionales: inicial?.notas_adicionales || '',
    estado_equipo: '',
    resolver_problemas: false,
  }))
  const { error, enviando, enviar } = useEnvio(onGuardado)
  const set = (k) => (e) => setF((v) => ({ ...v, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))
  const equipoSel = equipos.find((e) => String(e.id_equipo) === f.id_equipo)

  const submit = (e) => {
    e.preventDefault()
    const body = { ...f, costo: f.costo === '' ? null : f.costo, resolver_problemas: f.estado === 'Completado' && f.resolver_problemas }
    if (editando) delete body.id_equipo
    else body.id_equipo = Number(f.id_equipo)
    enviar(
      () => (editando ? api(`/mantenimientos/${inicial.id_mantenimiento}`, { method: 'PUT', body }) : api('/mantenimientos', { method: 'POST', body })),
      editando ? 'Mantenimiento actualizado.' : 'Mantenimiento registrado.',
    )
  }

  return (
    <Modal titulo={editando ? `Editar mantenimiento · ${inicial.equipo}` : 'Registrar mantenimiento'} onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <Alerta>{error}</Alerta>
        {!editando && (
          <label>Equipo
            <select value={f.id_equipo} onChange={set('id_equipo')} required>
              <option value="">Seleccioná un equipo</option>
              {equipos.map((e) => <option key={e.id_equipo} value={e.id_equipo}>{e.identificador} · {e.laboratorio} ({e.estado})</option>)}
            </select>
          </label>
        )}
        <div className="form-fila">
          <label>Fecha de mantenimiento<input type="date" value={f.fecha_mantenimiento} onChange={set('fecha_mantenimiento')} required /></label>
          <label>Tipo
            <select value={f.tipo} onChange={set('tipo')}>{TIPOS.map((t) => <option key={t} value={t}>{etiqueta(t)}</option>)}</select>
          </label>
          <label>Estado
            <select value={f.estado} onChange={set('estado')}>{ESTADOS.map((s) => <option key={s}>{s}</option>)}</select>
          </label>
        </div>
        <label>Descripción<textarea value={f.detalle} onChange={set('detalle')} required rows={3} /></label>
        <label>Observaciones<textarea value={f.notas_adicionales} onChange={set('notas_adicionales')} rows={2} /></label>
        <div className="form-fila">
          <label>Costo (opcional)<input type="number" min="0" step="0.01" value={f.costo} onChange={set('costo')} /></label>
          <SelectEstadoEquipo value={f.estado_equipo} onChange={(v) => setF((x) => ({ ...x, estado_equipo: v }))} actual={inicial?.estado_equipo || equipoSel?.estado} />
        </div>
        {f.estado === 'Completado' && (
          <label className="check"><input type="checkbox" checked={f.resolver_problemas} onChange={set('resolver_problemas')} /> Marcar como resueltos los problemas activos del equipo</label>
        )}
        <div className="form-acciones">
          <button type="button" className="btn btn-secundario" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primario" disabled={enviando}>{enviando ? 'Guardando…' : 'Guardar'}</button>
        </div>
      </form>
    </Modal>
  )
}

function FormEstado({ mantenimiento, onClose, onGuardado }) {
  const [estado, setEstado] = useState(mantenimiento.estado)
  const [estadoEquipo, setEstadoEquipo] = useState('')
  const [resolver, setResolver] = useState(false)
  const { error, enviando, enviar } = useEnvio(onGuardado)
  const submit = (e) => {
    e.preventDefault()
    enviar(() => api(`/mantenimientos/${mantenimiento.id_mantenimiento}/estado`, {
      method: 'PATCH',
      body: { estado, estado_equipo: estadoEquipo || undefined, resolver_problemas: estado === 'Completado' && resolver },
    }), `Estado actualizado a "${estado}".`)
  }
  return (
    <Modal titulo={`Cambiar estado · ${mantenimiento.equipo}`} onClose={onClose} ancho="460px">
      <form className="form" onSubmit={submit}>
        <Alerta>{error}</Alerta>
        <p className="texto-suave">{mantenimiento.detalle}</p>
        <label>Estado del mantenimiento
          <select value={estado} onChange={(e) => setEstado(e.target.value)}>{ESTADOS.map((s) => <option key={s}>{s}</option>)}</select>
        </label>
        <SelectEstadoEquipo value={estadoEquipo} onChange={setEstadoEquipo} actual={mantenimiento.estado_equipo} />
        {estado === 'Completado' && (
          <label className="check"><input type="checkbox" checked={resolver} onChange={(e) => setResolver(e.target.checked)} /> Marcar como resueltos los problemas activos del equipo</label>
        )}
        <div className="form-acciones">
          <button type="button" className="btn btn-secundario" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primario" disabled={enviando || (estado === mantenimiento.estado && !estadoEquipo && !resolver)}>Guardar</button>
        </div>
      </form>
    </Modal>
  )
}

export function FormProblema({ equipos, puedeGestionar, equipoInicial, onClose, onGuardado }) {
  const [f, setF] = useState({ id_equipo: equipoInicial || '', titulo: '', descripcion: '', severidad: 'Media', fecha_limite: '', estado_equipo: '' })
  const { error, enviando, enviar } = useEnvio(onGuardado)
  const set = (k) => (e) => setF((v) => ({ ...v, [k]: e.target.value }))
  const submit = (e) => {
    e.preventDefault()
    const body = { ...f, id_equipo: Number(f.id_equipo), fecha_limite: f.fecha_limite || null, estado_equipo: f.estado_equipo || undefined }
    enviar(() => api('/mantenimientos/problemas', { method: 'POST', body }), 'Problema reportado.')
  }
  return (
    <Modal titulo="Reportar problema en un equipo" onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <Alerta>{error}</Alerta>
        <label>Equipo
          <select value={f.id_equipo} onChange={set('id_equipo')} required>
            <option value="">Seleccioná un equipo</option>
            {equipos.map((e) => <option key={e.id_equipo} value={e.id_equipo}>{e.identificador} · {e.laboratorio} ({e.estado})</option>)}
          </select>
        </label>
        <label>Problema detectado<input value={f.titulo} onChange={set('titulo')} maxLength={150} required placeholder="Ej.: El equipo no enciende" /></label>
        <label>Descripción<textarea value={f.descripcion} onChange={set('descripcion')} rows={3} required /></label>
        <div className="form-fila">
          <label>Severidad
            <select value={f.severidad} onChange={set('severidad')}>{SEVERIDADES.map((s) => <option key={s} value={s}>{etiqueta(s)}</option>)}</select>
          </label>
          <label>Próxima revisión<input type="date" value={f.fecha_limite} onChange={set('fecha_limite')} /></label>
          {puedeGestionar && <SelectEstadoEquipo value={f.estado_equipo} onChange={(v) => setF((x) => ({ ...x, estado_equipo: v }))} />}
        </div>
        <div className="form-acciones">
          <button type="button" className="btn btn-secundario" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primario" disabled={enviando}>{enviando ? 'Enviando…' : 'Reportar'}</button>
        </div>
      </form>
    </Modal>
  )
}

function FormResolver({ problema, equipo, onClose, onGuardado }) {
  const [estadoEquipo, setEstadoEquipo] = useState('')
  const { error, enviando, enviar } = useEnvio(onGuardado)
  const submit = (e) => {
    e.preventDefault()
    enviar(() => api(`/mantenimientos/problemas/${problema.id_alerta}/resolver`, {
      method: 'PATCH', body: { estado_equipo: estadoEquipo || undefined },
    }), 'Problema marcado como resuelto.')
  }
  return (
    <Modal titulo={`Resolver problema · ${equipo.identificador}`} onClose={onClose} ancho="460px">
      <form className="form" onSubmit={submit}>
        <Alerta>{error}</Alerta>
        <p><strong>{problema.titulo}</strong></p>
        <p className="texto-suave">{problema.descripcion}</p>
        <SelectEstadoEquipo value={estadoEquipo} onChange={setEstadoEquipo} actual={equipo.estado} />
        <div className="form-acciones">
          <button type="button" className="btn btn-secundario" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primario" disabled={enviando}>Marcar como resuelto</button>
        </div>
      </form>
    </Modal>
  )
}
