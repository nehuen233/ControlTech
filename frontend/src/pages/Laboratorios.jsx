import { useCallback, useEffect, useState } from 'react'
import { api } from '../api.js'
import { useAuth } from '../AuthContext.jsx'
import { Alerta, Badge, Cargando, Modal } from '../components/ui.jsx'

export default function Laboratorios() {
  const { esAdmin } = useAuth()
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
          {labs.map((l) => {
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
                  <button type="button" className="btn btn-secundario" onClick={() => setModal({ tipo: 'detalle', id: l.id_laboratorio })}>Ver detalle</button>
                  <a className="btn btn-secundario" href={`#/equipos?laboratorio=${l.id_laboratorio}`}>Ver equipos</a>
                  {esAdmin && <button type="button" className="btn-link" onClick={() => setModal({ tipo: 'form', lab: l })}>Editar</button>}
                </footer>
              </article>
            )
          })}
        </div>
      )}
      {modal?.tipo === 'detalle' && <DetalleLaboratorio id={modal.id} onClose={() => setModal(null)} />}
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
            <a className="btn btn-primario" href={`#/equipos?laboratorio=${lab.id_laboratorio}`} onClick={onClose}>Ver equipos del laboratorio</a>
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
    capacidad_equipos: lab?.capacidad_equipos ?? '',
    estado: lab?.estado || 'Activo',
    codigo_acceso: lab?.codigo_acceso || '',
  })
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)
  const set = (k) => (e) => setF((v) => ({ ...v, [k]: e.target.value }))

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    setEnviando(true)
    const body = { ...f, capacidad_equipos: f.capacidad_equipos === '' ? null : Number(f.capacidad_equipos) }
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
      <form className="form" onSubmit={submit}>
        <Alerta>{error}</Alerta>
        <label>Nombre<input value={f.nombre} onChange={set('nombre')} maxLength={100} required placeholder="Ej.: Laboratorio 5-3" /></label>
        <label>Descripción<textarea value={f.descripcion} onChange={set('descripcion')} rows={2} /></label>
        <div className="form-fila">
          <label>Edificio<input value={f.edificio} onChange={set('edificio')} maxLength={100} /></label>
          <label>Piso<input value={f.piso} onChange={set('piso')} maxLength={50} placeholder="Ej.: 5to piso" /></label>
          <label>Ubicación<input value={f.ubicacion} onChange={set('ubicacion')} maxLength={150} /></label>
        </div>
        <div className="form-fila">
          <label>Capacidad de equipos<input type="number" min={editando ? lab.total_equipos : 0} step="1" value={f.capacidad_equipos} onChange={set('capacidad_equipos')} /></label>
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
