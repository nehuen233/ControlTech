import { useCallback, useEffect, useState } from 'react'
import { api } from '../api.js'
import { useAuth } from '../AuthContext.jsx'
import { Alerta, Badge, Cargando, Modal } from '../components/ui.jsx'
import LaboratorioDetalle from './LaboratorioDetalle.jsx'

// Capacidad permitida por laboratorio (la misma regla valida el backend).
export const CAPACIDAD_MIN = 10
export const CAPACIDAD_MAX = 15
const capacidadEfectiva = (c) => (c == null ? CAPACIDAD_MAX : c)

// #/laboratorios/3 abre la pagina del laboratorio 3.
const idDesdeHash = () => window.location.hash.match(/^#\/laboratorios\/(\d+)/)?.[1] || null

export default function Laboratorios() {
  const [idLab, setIdLab] = useState(idDesdeHash)
  useEffect(() => {
    const onHash = () => setIdLab(idDesdeHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  return idLab ? <LaboratorioDetalle key={idLab} id={idLab} /> : <ListaLaboratorios />
}

function ListaLaboratorios() {
  const { esAdmin } = useAuth()
  const [verInactivos, setVerInactivos] = useState(false)
  const [labs, setLabs] = useState(null)
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')
  const [modal, setModal] = useState(null)

  const cargar = useCallback(() => {
    api('/laboratorios').then((d) => { setLabs(d); setError('') }).catch((e) => setError(e.message))
  }, [])
  useEffect(() => { cargar() }, [cargar])

  const guardado = (mensaje) => { setModal(null); setAviso(mensaje); cargar() }

  return (
    <section className="panel">
      <div className="barra-acciones">
        <p className="texto-suave">
          {esAdmin ? 'Todos los laboratorios de la institución.' : 'Laboratorios que tenés asignados.'}
        </p>
        {esAdmin && <button type="button" className="btn btn-primario" onClick={() => setModal({ tipo: 'form' })}>Nuevo laboratorio</button>}
      </div>
      <Alerta>{error}</Alerta>
      <Alerta tipo="ok" onClose={() => setAviso('')}>{aviso}</Alerta>
      {!labs ? <Cargando /> : labs.length === 0 ? <p className="vacio">No hay laboratorios para mostrar.</p> : (
        <div className="lista-labs">
          {labs.filter((l) => verInactivos || l.estado === 'Activo').map((l) => {
            const ocupacion = l.capacidad_equipos ? Math.min(100, Math.round((l.total_equipos / l.capacidad_equipos) * 100)) : null
            return (
              <article key={l.id_laboratorio} className="tarjeta-lab">
                <header>
                  <div>
                    <h3>{l.nombre}</h3>
                    <p className="texto-suave chico">{[l.edificio, l.piso, l.ubicacion].filter(Boolean).join(' · ') || 'Sin ubicación cargada'}</p>
                  </div>
                  <Badge value={l.estado} />
                </header>
                {l.descripcion && <p className="chico">{l.descripcion}</p>}
                <dl className="datos">
                  <div><dt>Equipos</dt><dd>{l.total_equipos}{l.capacidad_equipos != null ? ` / ${l.capacidad_equipos}` : ''}</dd></div>
                  <div><dt>Con problemas</dt><dd className={l.equipos_con_problemas ? 't-warn' : ''}>{l.equipos_con_problemas}</dd></div>
                  {esAdmin && <div><dt>Código de acceso</dt><dd>{l.codigo_acceso || '—'}</dd></div>}
                </dl>
                {ocupacion != null && (
                  <div className="barra-ocupacion" role="meter" aria-valuenow={ocupacion} aria-valuemin={0} aria-valuemax={100} aria-label={`Ocupación ${ocupacion}%`}>
                    <span style={{ width: `${ocupacion}%` }} />
                  </div>
                )}
                <footer>
                  <a className="btn btn-primario" href={`#/laboratorios/${l.id_laboratorio}`}>Abrir</a>
                  <button type="button" className="btn btn-secundario" onClick={() => setModal({ tipo: 'detalle', id: l.id_laboratorio })}>Detalle</button>
                  {esAdmin && <button type="button" className="btn-link" onClick={() => setModal({ tipo: 'form', lab: l })}>Editar</button>}
                  {esAdmin && <button type="button" className="btn-link peligro" onClick={() => setModal({ tipo: 'eliminar', lab: l })}>Eliminar</button>}
                </footer>
              </article>
            )
          })}
        </div>
      )}
      {labs && labs.some((l) => l.estado !== 'Activo') && (
        <button type="button" className="btn-link" onClick={() => setVerInactivos((v) => !v)}>
          {verInactivos ? 'Ocultar laboratorios inactivos' : `Mostrar laboratorios inactivos (${labs.filter((l) => l.estado !== 'Activo').length})`}
        </button>
      )}
      {modal?.tipo === 'detalle' && <DetalleLaboratorio id={modal.id} onClose={() => setModal(null)} />}
      {modal?.tipo === 'eliminar' && <EliminarLaboratorio lab={modal.lab} onClose={() => setModal(null)} onEliminado={guardado} />}
      {modal?.tipo === 'form' && <FormLaboratorio lab={modal.lab} onClose={() => setModal(null)} onGuardado={guardado} />}
    </section>
  )
}

function DetalleLaboratorio({ id, onClose }) {
  const [lab, setLab] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => { api(`/laboratorios/${id}`).then(setLab).catch((e) => setError(e.message)) }, [id])
  return (
    <Modal titulo={lab ? lab.nombre : 'Laboratorio'} onClose={onClose}>
      <Alerta>{error}</Alerta>
      {!lab && !error ? <Cargando /> : lab && (
        <div className="ficha">
          <p>{lab.descripcion || <span className="texto-suave">Sin descripción.</span>}</p>
          <dl className="datos datos-ficha">
            <div><dt>Edificio</dt><dd>{lab.edificio || '—'}</dd></div>
            <div><dt>Piso</dt><dd>{lab.piso || '—'}</dd></div>
            <div><dt>Ubicación</dt><dd>{lab.ubicacion || '—'}</dd></div>
            <div><dt>Estado</dt><dd><Badge value={lab.estado} /></dd></div>
            <div><dt>Capacidad</dt><dd>{lab.capacidad_equipos ?? '—'}</dd></div>
            <div><dt>Equipos registrados</dt><dd>{lab.total_equipos}</dd></div>
            <div><dt>Mantenimientos abiertos</dt><dd>{lab.mantenimientos.abiertos} de {lab.mantenimientos.total}</dd></div>
            {'codigo_acceso' in lab && <div><dt>Código de acceso</dt><dd>{lab.codigo_acceso || '—'}</dd></div>}
          </dl>
          <h4>Equipos por estado</h4>
          {lab.equipos_por_estado.length === 0 ? <p className="vacio">Sin equipos registrados.</p> : (
            <div className="chips">
              {lab.equipos_por_estado.map((e) => <span key={e.estado}><Badge value={e.estado} /> {e.cantidad}</span>)}
            </div>
          )}
          <h4>Usuarios asignados ({lab.usuarios.length})</h4>
          {lab.usuarios.length === 0 ? <p className="vacio">Sin usuarios asignados.</p> : (
            <ul className="lista-simple">
              {lab.usuarios.map((u) => <li key={u.id_usuario}><strong>{u.nombre} {u.apellido}</strong> <span className="texto-suave chico">{u.rolEtiqueta}</span></li>)}
            </ul>
          )}
          <div className="form-acciones">
            <a className="btn btn-primario" href={`#/laboratorios/${lab.id_laboratorio}`} onClick={onClose}>Abrir laboratorio</a>
          </div>
        </div>
      )}
    </Modal>
  )
}

function FormLaboratorio({ lab, onClose, onGuardado }) {
  const editando = Boolean(lab)
  const [f, setF] = useState({
    nombre: lab?.nombre || '',
    descripcion: lab?.descripcion || '',
    edificio: lab?.edificio || '',
    piso: lab?.piso || '',
    ubicacion: lab?.ubicacion || '',
    capacidad_equipos: lab ? (lab.capacidad_equipos ?? '') : String(CAPACIDAD_MAX),
    estado: lab?.estado || 'Activo',
    codigo_acceso: lab?.codigo_acceso || '',
  })
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)
  const set = (k) => (e) => setF((v) => ({ ...v, [k]: e.target.value }))

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    const capacidad = Number(f.capacidad_equipos)
    const cambiaCapacidad = !editando || String(f.capacidad_equipos) !== String(lab.capacidad_equipos ?? '')
    if (cambiaCapacidad) {
      if (f.capacidad_equipos === '' || !Number.isInteger(capacidad) || capacidad < CAPACIDAD_MIN || capacidad > CAPACIDAD_MAX) {
        return setError(`La capacidad del laboratorio debe ser un número entero entre ${CAPACIDAD_MIN} y ${CAPACIDAD_MAX} equipos.`)
      }
      if (editando && capacidad < lab.total_equipos) {
        return setError(`La capacidad no puede ser menor a los ${lab.total_equipos} equipos registrados en el laboratorio.`)
      }
    }
    setEnviando(true)
    const body = { ...f, capacidad_equipos: capacidad }
    // Al editar se envia la capacidad solo si cambio (los laboratorios antiguos pueden tener otra).
    if (!cambiaCapacidad) delete body.capacidad_equipos
    try {
      if (editando) await api(`/laboratorios/${lab.id_laboratorio}`, { method: 'PUT', body })
      else await api('/laboratorios', { method: 'POST', body })
      onGuardado(editando ? `${f.nombre} actualizado.` : `${f.nombre} registrado.`)
    } catch (err) {
      setError(err.message)
      setEnviando(false)
    }
  }

  return (
    <Modal titulo={editando ? `Editar ${lab.nombre}` : 'Nuevo laboratorio'} onClose={onClose}>
      <form className="form" onSubmit={submit} noValidate>
        <Alerta>{error}</Alerta>
        <label>Nombre<input value={f.nombre} onChange={set('nombre')} maxLength={100} required placeholder="Ej.: Laboratorio 5-3" /></label>
        <label>Descripción<textarea value={f.descripcion} onChange={set('descripcion')} rows={2} /></label>
        <div className="form-fila">
          <label>Edificio<input value={f.edificio} onChange={set('edificio')} maxLength={100} /></label>
          <label>Piso<input value={f.piso} onChange={set('piso')} maxLength={50} placeholder="Ej.: 5to piso" /></label>
          <label>Ubicación<input value={f.ubicacion} onChange={set('ubicacion')} maxLength={150} /></label>
        </div>
        <div className="form-fila">
          <label>Capacidad de equipos
            <input type="number" min={Math.max(CAPACIDAD_MIN, editando ? lab.total_equipos : 0)} max={CAPACIDAD_MAX} step="1" required
              value={f.capacidad_equipos} onChange={set('capacidad_equipos')} aria-describedby="ayuda-capacidad" />
            <span id="ayuda-capacidad" className="ayuda">Entre {CAPACIDAD_MIN} y {CAPACIDAD_MAX} equipos{editando && lab.total_equipos > CAPACIDAD_MIN ? ` · tiene ${lab.total_equipos} registrados` : ''}</span>
          </label>
          <label>Estado
            <select value={f.estado} onChange={set('estado')}><option>Activo</option><option>Inactivo</option></select>
          </label>
          <label>Código de acceso<input value={f.codigo_acceso} onChange={set('codigo_acceso')} maxLength={100} placeholder="Opcional" /></label>
        </div>
        <div className="form-acciones">
          <button type="button" className="btn btn-secundario" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primario" disabled={enviando}>{enviando ? 'Guardando…' : 'Guardar'}</button>
        </div>
      </form>
    </Modal>
  )
}

// Confirmacion de baja. Si el laboratorio tiene computadoras hay que elegir a donde moverlas:
// no se borran, para conservar sus mantenimientos e historial.
export function EliminarLaboratorio({ lab, onClose, onEliminado }) {
  const [detalle, setDetalle] = useState(null)
  const [destinos, setDestinos] = useState([])
  const [destino, setDestino] = useState('')
  const [confirmo, setConfirmo] = useState(false)
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)

  useEffect(() => {
    Promise.all([api(`/laboratorios/${lab.id_laboratorio}`), api('/laboratorios')])
      .then(([d, todos]) => {
        setDetalle(d)
        setDestinos(todos.filter((l) => l.id_laboratorio !== lab.id_laboratorio && l.estado === 'Activo'))
      })
      .catch((e) => setError(e.message))
  }, [lab.id_laboratorio])

  const libres = (l) => capacidadEfectiva(l.capacidad_equipos) - l.total_equipos
  const equipos = detalle?.total_equipos || 0
  const usuarios = detalle ? detalle.usuarios.filter((u) => u.nombre_rol !== 'ADMINISTRADOR') : []

  const eliminar = async () => {
    setError('')
    if (equipos && !destino) return setError('Elegí a qué laboratorio mover las computadoras.')
    setEnviando(true)
    try {
      const r = await api(`/laboratorios/${lab.id_laboratorio}`, { method: 'DELETE', body: equipos ? { destino: Number(destino) } : {} })
      onEliminado(`${r.nombre} eliminado.${r.equipos_movidos ? ` ${r.equipos_movidos} computadora(s) trasladadas al ${r.destino}.` : ''}`)
    } catch (err) {
      setError(err.message)
      setEnviando(false)
    }
  }

  return (
    <Modal titulo={`Eliminar ${lab.nombre}`} onClose={onClose} ancho="520px">
      <div className="form">
        <Alerta>{error}</Alerta>
        {!detalle && !error ? <Cargando /> : detalle && (
          <>
            <p>Se va a eliminar el <strong>{lab.nombre}</strong>. Esta acción no se puede deshacer.</p>
            <ul className="lista-simple chico">
              <li>{equipos ? <><strong>{equipos} computadora(s)</strong> se trasladan al laboratorio que elijas, con sus mantenimientos e historial.</> : 'No tiene computadoras.'}</li>
              <li>{usuarios.length ? <><strong>{usuarios.length} usuario(s)</strong> pierden el acceso a este laboratorio: {usuarios.map((u) => `${u.nombre} ${u.apellido}`).join(', ')}.</> : 'No tiene usuarios asignados (además del administrador).'}</li>
              <li>Si es uno de los laboratorios iniciales, no se vuelve a crear al reiniciar el sistema.</li>
            </ul>
            {equipos > 0 && (
              <label>Mover las computadoras a
                <select value={destino} onChange={(e) => setDestino(e.target.value)}>
                  <option value="">Elegí un laboratorio</option>
                  {destinos.map((l) => (
                    <option key={l.id_laboratorio} value={l.id_laboratorio} disabled={libres(l) < equipos}>
                      {l.nombre} ({l.total_equipos}/{capacidadEfectiva(l.capacidad_equipos)}{libres(l) < equipos ? ' · sin lugar' : ''})
                    </option>
                  ))}
                </select>
              </label>
            )}
            {equipos > 0 && destinos.every((l) => libres(l) < equipos) && (
              <p className="texto-suave chico">Ningún laboratorio activo tiene lugar para {equipos} computadoras (cada laboratorio admite hasta {CAPACIDAD_MAX}). Trasladá o eliminá computadoras de este laboratorio antes de eliminarlo.</p>
            )}
            <label className="check"><input type="checkbox" checked={confirmo} onChange={(e) => setConfirmo(e.target.checked)} /> Entiendo que el laboratorio se elimina definitivamente</label>
            <div className="form-acciones">
              <button type="button" className="btn btn-secundario" onClick={onClose}>Cancelar</button>
              <button type="button" className="btn btn-peligro" onClick={eliminar} disabled={!confirmo || enviando || (equipos > 0 && !destino)}>
                {enviando ? 'Eliminando…' : 'Eliminar laboratorio'}
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}
