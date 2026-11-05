import { useCallback, useEffect, useState } from 'react'
import { api } from '../api.js'
import { useAuth } from '../AuthContext.jsx'
import { Alerta, Badge, Cargando, Modal, etiqueta, fecha, hoy, moneda } from '../components/ui.jsx'
import { EliminarEquipo, FichaEquipo, FormEquipo } from './Equipos.jsx'
import { EliminarLaboratorio } from './Laboratorios.jsx'

// Pagina de un laboratorio con pestañas: Computadoras | Software | Mantenimiento.
const Icono = {
  monitor: <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="12" rx="2" /><path d="M8 20h8M12 16v4" /></svg>,
  caja: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 8 12 3 3 8v8l9 5 9-5V8Z" /><path d="m3 8 9 5 9-5M12 13v8" /></svg>,
  llave: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76Z" /></svg>,
  mas: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>,
  editar: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4Z" /><path d="m14 6 4 4" /></svg>,
  borrar: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></svg>,
}

// Muestra solo los ultimos 4 caracteres de la clave: XXXXX-XXXXX-AB12
// Evita "Versión Version estable" cuando el dato ya incluye la palabra.
const textoVersion = (v) => (/^versi[oó]n\b/i.test(v) ? v : `Versión ${v}`)
const ocultarClave = (c) => (c ? c.slice(0, -4).replace(/[A-Za-z0-9]/g, 'X') + c.slice(-4) : '')

export default function LaboratorioDetalle({ id }) {
  const { puedeGestionar, esAdmin } = useAuth()
  const [eliminando, setEliminando] = useState(false)
  const [lab, setLab] = useState(null)
  const [error, setError] = useState('')
  const [pestana, setPestana] = useState('software')
  const [recarga, setRecarga] = useState(0)

  useEffect(() => {
    api(`/laboratorios/${id}`).then((d) => { setLab(d); setError('') }).catch((e) => setError(e.message))
  }, [id, recarga])

  const refrescar = useCallback(() => setRecarga((n) => n + 1), [])

  if (error) return <><a className="volver" href="#/laboratorios">← Laboratorios</a><Alerta>{error}</Alerta></>
  if (!lab) return <Cargando />

  const PESTANAS = [
    { id: 'computadoras', titulo: 'Computadoras', icono: Icono.monitor, n: lab.total_equipos },
    { id: 'software', titulo: 'Software', icono: Icono.caja, n: lab.total_software },
    { id: 'mantenimiento', titulo: 'Mantenimiento', icono: Icono.llave, n: lab.mantenimientos.total },
  ]

  return (
    <>
      <div className="lab-cabecera">
        <a className="volver" href="#/laboratorios">← Laboratorios</a>
        <div className="lab-titulo">
          <h2>{lab.nombre}</h2>
          <Badge value={lab.estado} />
          {esAdmin && <button type="button" className="btn-link peligro empuja" onClick={() => setEliminando(true)}>Eliminar laboratorio</button>}
        </div>
        <p className="texto-suave">{[lab.edificio, lab.piso, lab.ubicacion].filter(Boolean).join(' · ')}</p>
      </div>
      <div className="pestanas-lab" role="tablist">
        {PESTANAS.map((p) => (
          <button key={p.id} type="button" role="tab" aria-selected={pestana === p.id}
            className={pestana === p.id ? 'activa' : ''} onClick={() => setPestana(p.id)}>
            {p.icono}<span>{p.titulo}</span><span className="contador">{p.n}</span>
          </button>
        ))}
      </div>
      {pestana === 'computadoras' && <Computadoras lab={lab} puedeGestionar={puedeGestionar} onCambio={refrescar} />}
      {pestana === 'software' && <SoftwareLab lab={lab} puedeGestionar={puedeGestionar} onCambio={refrescar} />}
      {pestana === 'mantenimiento' && <MantenimientoLab lab={lab} />}
      {eliminando && (
        <EliminarLaboratorio lab={lab} onClose={() => setEliminando(false)}
          onEliminado={() => { window.location.hash = '#/laboratorios' }} />
      )}
    </>
  )
}

// ---------- Computadoras ----------
function Computadoras({ lab, puedeGestionar, onCambio }) {
  const [equipos, setEquipos] = useState(null)
  const [modal, setModal] = useState(null)
  const [aviso, setAviso] = useState('')
  const [recarga, setRecarga] = useState(0)
  useEffect(() => { api('/equipos', { params: { laboratorio: lab.id_laboratorio } }).then(setEquipos) }, [lab.id_laboratorio, recarga])

  const guardado = (mensaje, idEquipo) => {
    setAviso(mensaje); setRecarga((n) => n + 1); onCambio()
    setModal(idEquipo ? { tipo: 'ficha', id: idEquipo } : null)
  }

  return (
    <section className="panel">
      <div className="barra-acciones">
        <h2>Computadoras del laboratorio</h2>
        {puedeGestionar && lab.estado === 'Activo' && (
          <button type="button" className="btn btn-primario btn-icono" onClick={() => setModal({ tipo: 'form' })}>{Icono.mas} Agregar equipo</button>
        )}
      </div>
      <Alerta tipo="ok" onClose={() => setAviso('')}>{aviso}</Alerta>
      {!equipos ? <Cargando /> : equipos.length === 0 ? <p className="vacio">Este laboratorio todavía no tiene equipos registrados.</p> : (
        <div className="tabla-scroll">
          <table>
            <thead><tr><th>Equipo</th><th>Marca / modelo</th><th>Especificaciones</th><th>Estado</th><th>Responsable</th></tr></thead>
            <tbody>
              {equipos.map((e) => (
                <tr key={e.id_equipo}>
                  <td><button type="button" className="btn-link" onClick={() => setModal({ tipo: 'ficha', id: e.id_equipo })}>{e.identificador}</button><div className="texto-suave chico">{e.nro_serie}</div></td>
                  <td>{e.marca} {e.modelo}</td>
                  <td className="chico">{[e.procesador, e.ram, e.almacenamiento].filter(Boolean).join(' · ') || '—'}</td>
                  <td><Badge value={e.estado} /></td>
                  <td>{e.responsable || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {modal?.tipo === 'ficha' && (
        <FichaEquipo id={modal.id} puedeGestionar={puedeGestionar} recarga={recarga}
          onEditar={() => setModal({ tipo: 'form', id: modal.id })} onClose={() => setModal(null)}
          onEliminar={() => setModal({ tipo: 'eliminar', id: modal.id })} />
      )}
      {modal?.tipo === 'eliminar' && (
        <EliminarEquipo id={modal.id} onClose={() => setModal(null)}
          onEliminado={(mensaje) => { setModal(null); setAviso(mensaje); setRecarga((n) => n + 1); onCambio() }} />
      )}
      {modal?.tipo === 'form' && (
        <FormEquipo id={modal.id} labs={[lab]} laboratorioInicial={String(lab.id_laboratorio)}
          onClose={() => setModal(null)} onGuardado={guardado} />
      )}
    </section>
  )
}

// ---------- Software ----------
function SoftwareLab({ lab, puedeGestionar, onCambio }) {
  const { esAdmin } = useAuth()
  const [lista, setLista] = useState(null)
  const [equipos, setEquipos] = useState([])
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')
  const [modal, setModal] = useState(null)
  const [recarga, setRecarga] = useState(0)

  useEffect(() => {
    api(`/laboratorios/${lab.id_laboratorio}/software`).then((d) => { setLista(d); setError('') }).catch((e) => setError(e.message))
  }, [lab.id_laboratorio, recarga])
  useEffect(() => { api('/equipos', { params: { laboratorio: lab.id_laboratorio } }).then(setEquipos).catch(() => {}) }, [lab.id_laboratorio])

  const listo = (mensaje) => { setModal(null); setAviso(mensaje); setRecarga((n) => n + 1); onCambio() }

  return (
    <section className="panel">
      <div className="barra-acciones">
        <h2 className="titulo-seccion">Gestión de Software</h2>
        {puedeGestionar && (
          <button type="button" className="btn btn-primario btn-icono" onClick={() => setModal({ tipo: 'agregar' })} disabled={!equipos.length}
            title={equipos.length ? undefined : 'El laboratorio no tiene equipos'}>
            {Icono.mas} Agregar Software
          </button>
        )}
      </div>
      <Alerta>{error}</Alerta>
      <Alerta tipo="ok" onClose={() => setAviso('')}>{aviso}</Alerta>
      {!lista ? <Cargando /> : lista.length === 0 ? (
        <p className="vacio">No hay software instalado en las computadoras de este laboratorio.</p>
      ) : (
        <div className="tabla-scroll">
          <table className="tabla-software">
            <thead><tr><th>Software</th><th>Proveedor</th><th>Licencia</th><th>Instalaciones</th>{puedeGestionar && <th className="centro">Acciones</th>}</tr></thead>
            <tbody>
              {lista.map((s) => (
                <tr key={s.id_software}>
                  <td>
                    <strong className="nombre-sw">{s.nombre_software}</strong>
                    {s.version && <div className="texto-suave">{textoVersion(s.version)}</div>}
                    {s.licencia?.numero_licencia && <div className="clave">Clave: {ocultarClave(s.licencia.numero_licencia)}</div>}
                  </td>
                  <td>{s.proveedor || '—'}</td>
                  <td>
                    {s.licencia ? (
                      <>
                        <span className={`badge badge-licencia-${s.licencia.tipo_licencia}`}>{s.licencia.tipo_licencia === 'Gratuita' ? 'Gratuito' : s.licencia.tipo_licencia}</span>
                        {s.licencia.estado !== 'Activa' && <> <Badge value={s.licencia.estado} licencia /></>}
                        {s.licencia.fecha_vencimiento && <div className="texto-suave chico">Expira: {fecha(s.licencia.fecha_vencimiento)}</div>}
                      </>
                    ) : <span className="texto-suave">Sin licencia</span>}
                  </td>
                  <td><strong>{s.instalaciones} {s.instalaciones === 1 ? 'equipo' : 'equipos'}</strong></td>
                  {puedeGestionar && (
                    <td className="centro">
                      <div className="acciones-icono">
                        <button type="button" className="icono-btn editar" aria-label={`Editar ${s.nombre_software}`} title="Editar" onClick={() => setModal({ tipo: 'editar', sw: s })}>{Icono.editar}</button>
                        <button type="button" className="icono-btn borrar" aria-label={`Quitar ${s.nombre_software} del laboratorio`} title="Quitar del laboratorio" onClick={() => setModal({ tipo: 'borrar', sw: s })}>{Icono.borrar}</button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {modal?.tipo === 'agregar' && <FormAgregarSoftware lab={lab} equipos={equipos} instalados={lista || []} onClose={() => setModal(null)} onListo={listo} />}
      {modal?.tipo === 'editar' && <FormEditarSoftware lab={lab} equipos={equipos} sw={modal.sw} esAdmin={esAdmin} onClose={() => setModal(null)} onListo={listo} />}
      {modal?.tipo === 'borrar' && <ConfirmarQuitar lab={lab} sw={modal.sw} onClose={() => setModal(null)} onListo={listo} />}
    </section>
  )
}

function SelectorEquipos({ equipos, seleccion, onChange }) {
  const todos = equipos.length > 0 && seleccion.length === equipos.length
  const toggle = (id) => onChange(seleccion.includes(id) ? seleccion.filter((x) => x !== id) : [...seleccion, id])
  return (
    <fieldset>
      <legend>Instalar en ({seleccion.length} de {equipos.length})</legend>
      <label className="check check-todos">
        <input type="checkbox" checked={todos} onChange={() => onChange(todos ? [] : equipos.map((e) => e.id_equipo))} /> Todas las computadoras del laboratorio
      </label>
      <div className="grilla-checks">
        {equipos.map((e) => (
          <label key={e.id_equipo} className="check">
            <input type="checkbox" checked={seleccion.includes(e.id_equipo)} onChange={() => toggle(e.id_equipo)} /> {e.identificador}
          </label>
        ))}
      </div>
    </fieldset>
  )
}

function CamposLicencia({ lic, setLic }) {
  const set = (k) => (e) => setLic((v) => ({ ...v, [k]: e.target.value }))
  return (
    <fieldset>
      <legend>Licencia</legend>
      <div className="form-fila">
        <label>Tipo
          <select value={lic.tipo_licencia} onChange={set('tipo_licencia')}>
            <option value="">Sin licencia</option>
            <option value="Gratuita">Gratuito</option><option value="Pago">Pago</option><option value="Prueba">Prueba</option>
          </select>
        </label>
        <label>Vencimiento<input type="date" value={lic.fecha_vencimiento} onChange={set('fecha_vencimiento')} disabled={!lic.tipo_licencia} /></label>
        <label>Estado
          <select value={lic.estado} onChange={set('estado')} disabled={!lic.tipo_licencia}>
            <option>Activa</option><option>Vencida</option><option>Suspendida</option>
          </select>
        </label>
      </div>
      <label>Clave de licencia<input value={lic.numero_licencia} onChange={set('numero_licencia')} maxLength={150} disabled={!lic.tipo_licencia} placeholder="Opcional (ej.: XXXXX-XXXXX-XXXXX)" /></label>
    </fieldset>
  )
}

const licenciaBody = (lic) => (lic.tipo_licencia ? {
  tipo_licencia: lic.tipo_licencia, numero_licencia: lic.numero_licencia || null,
  fecha_vencimiento: lic.fecha_vencimiento || null, estado: lic.estado || 'Activa',
} : undefined)

function FormAgregarSoftware({ lab, equipos, instalados, onClose, onListo }) {
  const [catalogo, setCatalogo] = useState([])
  const [modo, setModo] = useState('catalogo')
  const [idSoftware, setIdSoftware] = useState('')
  const [datos, setDatos] = useState({ nombre_software: '', version: '', proveedor: '', descripcion: '' })
  const [lic, setLic] = useState({ tipo_licencia: '', numero_licencia: '', fecha_vencimiento: '', estado: 'Activa' })
  const [seleccion, setSeleccion] = useState(() => equipos.map((e) => e.id_equipo))
  const [fechaInst, setFechaInst] = useState(hoy())
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)
  useEffect(() => { api('/software').then(setCatalogo).catch((e) => setError(e.message)) }, [])

  const completos = new Set(instalados.filter((s) => s.instalaciones >= equipos.length).map((s) => s.id_software))
  const set = (k) => (e) => setDatos((v) => ({ ...v, [k]: e.target.value }))

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    if (modo === 'catalogo' && !idSoftware) return setError('Elegí un software del catálogo.')
    if (!seleccion.length) return setError('Elegí al menos una computadora.')
    setEnviando(true)
    const body = modo === 'catalogo'
      ? { id_software: Number(idSoftware), equipos: seleccion, fecha_instalacion: fechaInst || null }
      : { software: datos, licencia: licenciaBody(lic), equipos: seleccion, fecha_instalacion: fechaInst || null }
    try {
      const r = await api(`/laboratorios/${lab.id_laboratorio}/software`, { method: 'POST', body })
      onListo(`${r.nombre_software} instalado en ${r.instalados_ahora} ${r.instalados_ahora === 1 ? 'equipo' : 'equipos'}.`)
    } catch (err) {
      setError(err.message)
      setEnviando(false)
    }
  }

  return (
    <Modal titulo={`Agregar software · ${lab.nombre}`} onClose={onClose} ancho="680px">
      <form className="form" onSubmit={submit}>
        <Alerta>{error}</Alerta>
        <div className="pestanas" role="tablist">
          <button type="button" role="tab" aria-selected={modo === 'catalogo'} className={modo === 'catalogo' ? 'activa' : ''} onClick={() => setModo('catalogo')}>Elegir del catálogo</button>
          <button type="button" role="tab" aria-selected={modo === 'nuevo'} className={modo === 'nuevo' ? 'activa' : ''} onClick={() => setModo('nuevo')}>Software nuevo</button>
        </div>
        {modo === 'catalogo' ? (
          <div className="lista-catalogo" role="radiogroup" aria-label="Software del catálogo">
            {catalogo.length === 0 && <p className="texto-suave chico">Cargando catálogo…</p>}
            {catalogo.map((s) => (
              <label key={s.id_software} className={`opcion-sw ${String(s.id_software) === idSoftware ? 'elegida' : ''}`}>
                <input type="radio" name="software" value={s.id_software} checked={String(s.id_software) === idSoftware} onChange={(e) => setIdSoftware(e.target.value)} />
                <span className="opcion-sw-texto">
                  <strong>{s.nombre_software}</strong>
                  <span className="texto-suave chico">{[s.version, s.proveedor].filter(Boolean).join(' · ')}</span>
                </span>
                <span className="opcion-sw-lic">
                  {s.licencia ? <span className={`badge badge-licencia-${s.licencia.tipo_licencia}`}>{s.licencia.tipo_licencia === 'Gratuita' ? 'Gratuito' : s.licencia.tipo_licencia}</span> : <span className="texto-suave chico">Sin licencia</span>}
                  {completos.has(s.id_software) && <span className="texto-suave chico">Ya en todos</span>}
                </span>
              </label>
            ))}
          </div>
        ) : (
          <>
            <div className="form-fila">
              <label>Nombre<input value={datos.nombre_software} onChange={set('nombre_software')} maxLength={100} required placeholder="Ej.: GIMP" /></label>
              <label>Versión<input value={datos.version} onChange={set('version')} maxLength={50} placeholder="Ej.: 2.10" /></label>
              <label>Proveedor<input value={datos.proveedor} onChange={set('proveedor')} maxLength={100} /></label>
            </div>
            <label>Descripción<textarea value={datos.descripcion} onChange={set('descripcion')} rows={2} /></label>
            <CamposLicencia lic={lic} setLic={setLic} />
          </>
        )}
        <SelectorEquipos equipos={equipos} seleccion={seleccion} onChange={setSeleccion} />
        <label className="campo-corto">Fecha de instalación<input type="date" value={fechaInst} onChange={(e) => setFechaInst(e.target.value)} /></label>
        <div className="form-acciones">
          <button type="button" className="btn btn-secundario" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primario" disabled={enviando}>{enviando ? 'Guardando…' : 'Agregar'}</button>
        </div>
      </form>
    </Modal>
  )
}

function FormEditarSoftware({ lab, equipos, sw, esAdmin, onClose, onListo }) {
  const [datos, setDatos] = useState({ nombre_software: sw.nombre_software, version: sw.version || '', proveedor: sw.proveedor || '', descripcion: sw.descripcion || '' })
  const [lic, setLic] = useState({
    tipo_licencia: sw.licencia?.tipo_licencia || '', numero_licencia: sw.licencia?.numero_licencia || '',
    fecha_vencimiento: sw.licencia?.fecha_vencimiento || '', estado: sw.licencia?.estado || 'Activa',
  })
  const [seleccion, setSeleccion] = useState(sw.equipos)
  const [fechaInst, setFechaInst] = useState(hoy())
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)
  const set = (k) => (e) => setDatos((v) => ({ ...v, [k]: e.target.value }))

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    if (!seleccion.length) return setError('Para quitarlo de todas las computadoras usá el botón de eliminar.')
    setEnviando(true)
    const body = { equipos: seleccion, fecha_instalacion: fechaInst || null }
    if (esAdmin) {
      body.software = datos
      const l = licenciaBody(lic)
      if (l) body.licencia = l
    }
    try {
      await api(`/laboratorios/${lab.id_laboratorio}/software/${sw.id_software}`, { method: 'PUT', body })
      onListo(`${datos.nombre_software} actualizado.`)
    } catch (err) {
      setError(err.message)
      setEnviando(false)
    }
  }

  return (
    <Modal titulo={`Editar ${sw.nombre_software}`} onClose={onClose} ancho="680px">
      <form className="form" onSubmit={submit}>
        <Alerta>{error}</Alerta>
        {esAdmin ? (
          <>
            <div className="form-fila">
              <label>Nombre<input value={datos.nombre_software} onChange={set('nombre_software')} maxLength={100} required /></label>
              <label>Versión<input value={datos.version} onChange={set('version')} maxLength={50} /></label>
              <label>Proveedor<input value={datos.proveedor} onChange={set('proveedor')} maxLength={100} /></label>
            </div>
            <label>Descripción<textarea value={datos.descripcion} onChange={set('descripcion')} rows={2} /></label>
            <CamposLicencia lic={lic} setLic={setLic} />
            <p className="texto-suave chico">Los datos y la licencia del software son los mismos en todos los laboratorios.</p>
          </>
        ) : (
          <p className="texto-suave">{[sw.version && textoVersion(sw.version), sw.proveedor, sw.licencia && `Licencia ${etiqueta(sw.licencia.tipo_licencia)}`].filter(Boolean).join(' · ')}. Los datos y la licencia solo los modifica el administrador.</p>
        )}
        <SelectorEquipos equipos={equipos} seleccion={seleccion} onChange={setSeleccion} />
        <label className="campo-corto">Fecha para nuevas instalaciones<input type="date" value={fechaInst} onChange={(e) => setFechaInst(e.target.value)} /></label>
        <div className="form-acciones">
          <button type="button" className="btn btn-secundario" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primario" disabled={enviando}>{enviando ? 'Guardando…' : 'Guardar'}</button>
        </div>
      </form>
    </Modal>
  )
}

function ConfirmarQuitar({ lab, sw, onClose, onListo }) {
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)
  const confirmar = async () => {
    setEnviando(true)
    try {
      const r = await api(`/laboratorios/${lab.id_laboratorio}/software/${sw.id_software}`, { method: 'DELETE' })
      onListo(`${sw.nombre_software} se quitó de ${r.desinstalado_de} ${r.desinstalado_de === 1 ? 'equipo' : 'equipos'}.`)
    } catch (err) {
      setError(err.message)
      setEnviando(false)
    }
  }
  return (
    <Modal titulo="Quitar software del laboratorio" onClose={onClose} ancho="460px">
      <div className="form">
        <Alerta>{error}</Alerta>
        <p>¿Quitar <strong>{sw.nombre_software}</strong> de las {sw.instalaciones} computadoras del {lab.nombre}?</p>
        <p className="texto-suave chico">El software sigue en el catálogo y en los demás laboratorios. Esta acción queda registrada en el historial.</p>
        <div className="form-acciones">
          <button type="button" className="btn btn-secundario" onClick={onClose}>Cancelar</button>
          <button type="button" className="btn btn-peligro" onClick={confirmar} disabled={enviando}>{enviando ? 'Quitando…' : 'Quitar'}</button>
        </div>
      </div>
    </Modal>
  )
}

// ---------- Mantenimiento ----------
function MantenimientoLab({ lab }) {
  const [lista, setLista] = useState(null)
  useEffect(() => { api('/mantenimientos', { params: { laboratorio: lab.id_laboratorio } }).then(setLista) }, [lab.id_laboratorio])
  return (
    <section className="panel">
      <div className="barra-acciones">
        <h2>Mantenimientos del laboratorio</h2>
        <a className="btn btn-secundario" href="#/mantenimientos">Ir a Mantenimientos</a>
      </div>
      {!lista ? <Cargando /> : lista.length === 0 ? <p className="vacio">No hay mantenimientos registrados en este laboratorio.</p> : (
        <div className="tabla-scroll">
          <table>
            <thead><tr><th>Equipo</th><th>Tipo</th><th>Estado</th><th>Fecha</th><th>Descripción</th><th>Responsable</th><th className="num">Costo</th></tr></thead>
            <tbody>
              {lista.map((m) => (
                <tr key={m.id_mantenimiento}>
                  <td><strong>{m.equipo}</strong></td>
                  <td><Badge value={m.tipo} /></td>
                  <td><Badge value={m.estado} /></td>
                  <td className="nowrap">{fecha(m.fecha_mantenimiento)}</td>
                  <td>{m.detalle}</td>
                  <td>{m.responsable}</td>
                  <td className="num nowrap">{moneda(m.costo)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
