import { useCallback, useEffect, useState } from 'react'
import { api } from '../api.js'
import { Alerta, Badge, Cargando, Modal } from '../components/ui.jsx'

// "Docente, Docente de laboratorio o Técnico", segun los roles que devuelve el backend.
const listar = (roles, conj) => {
  const e = roles.map((r) => r.etiqueta)
  return e.length > 1 ? `${e.slice(0, -1).join(', ')} ${conj} ${e[e.length - 1]}` : e.join('')
}

export default function Usuarios() {
  const [usuarios, setUsuarios] = useState(null)
  const [roles, setRoles] = useState([])
  const [labs, setLabs] = useState([])
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')
  const [modal, setModal] = useState(null)
  const [filtro, setFiltro] = useState('')

  const cargar = useCallback(() => {
    api('/usuarios').then(setUsuarios).catch((e) => setError(e.message))
  }, [])

  useEffect(() => {
    cargar()
    // Solo se reciben los roles asignables (Docente, Docente de laboratorio y Técnico).
    api('/roles/asignables').then(setRoles).catch((e) => setError(e.message))
    api('/laboratorios').then(setLabs).catch((e) => setError(e.message))
  }, [cargar])

  const guardado = (mensaje) => { setModal(null); setAviso(mensaje); cargar() }

  const visibles = (usuarios || []).filter((u) => {
    const t = filtro.trim().toLowerCase()
    return !t || `${u.nombre} ${u.apellido} ${u.email} ${u.rolEtiqueta}`.toLowerCase().includes(t)
  })

  return (
    <section className="panel">
      <div className="barra-acciones">
        <p className="texto-suave">{roles.length ? `Los usuarios nuevos pueden registrarse como ${listar(roles, 'o')}.` : 'Cargando roles…'}</p>
        <button type="button" className="btn btn-primario" onClick={() => setModal({ tipo: 'nuevo' })} disabled={!roles.length}>Registrar usuario</button>
      </div>
      <Alerta>{error}</Alerta>
      <Alerta tipo="ok" onClose={() => setAviso('')}>{aviso}</Alerta>
      {usuarios && usuarios.length > 8 && (
        <label className="campo-busqueda">Buscar usuario
          <input type="search" value={filtro} onChange={(e) => setFiltro(e.target.value)} placeholder="Nombre, email o rol" />
        </label>
      )}
      {!usuarios ? <Cargando /> : (
        <div className="tabla-scroll">
          <table>
            <thead><tr><th>Nombre</th><th>Email</th><th>Rol</th><th>Estado</th><th>Laboratorios</th><th>Acciones</th></tr></thead>
            <tbody>
              {visibles.map((u) => (
                <tr key={u.id_usuario} className={u.bloqueado ? 'fila-bloqueada' : ''}>
                  <td><strong>{u.nombre} {u.apellido}</strong></td>
                  <td>{u.email}</td>
                  <td>{u.rolEtiqueta}</td>
                  <td>{u.bloqueado ? <span className="badge badge-danger">Bloqueado</span> : <Badge value="Activo" />}</td>
                  <td className="chico">{u.laboratorios || '—'}</td>
                  <td className="acciones-fila">
                    {u.protegido ? <span className="texto-suave chico">Cuenta protegida</span> : (
                      <>
                        {u.editable && <button type="button" className="btn-link" onClick={() => setModal({ tipo: 'rol', usuario: u })}>Asignar rol</button>}
                        <button type="button" className="btn-link" onClick={() => setModal({ tipo: 'bloqueo', usuario: u })}>{u.bloqueado ? 'Desbloquear' : 'Bloquear'}</button>
                        <button type="button" className="btn-link peligro" onClick={() => setModal({ tipo: 'eliminar', usuario: u })}>Eliminar</button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {(modal?.tipo === 'nuevo' || modal?.tipo === 'rol') && <FormUsuario roles={roles} labs={labs} usuario={modal.usuario} onClose={() => setModal(null)} onGuardado={guardado} />}
      {modal?.tipo === 'bloqueo' && <ConfirmarBloqueo usuario={modal.usuario} onClose={() => setModal(null)} onListo={guardado} />}
      {modal?.tipo === 'eliminar' && (
        <ConfirmarEliminar usuario={modal.usuario} onClose={() => setModal(null)} onListo={guardado}
          onBloquear={() => setModal({ tipo: 'bloqueo', usuario: modal.usuario })} />
      )}
    </section>
  )
}

function FormUsuario({ roles, labs, usuario, onClose, onGuardado }) {
  const editando = Boolean(usuario)
  const [f, setF] = useState({
    nombre: '', apellido: '', email: '', contrasena: '',
    id_rol: usuario ? String(usuario.id_rol) : '',
    laboratorios: usuario ? usuario.ids_laboratorios : [],
  })
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)
  const set = (k) => (e) => setF((v) => ({ ...v, [k]: e.target.value }))
  const toggleLab = (id) => setF((v) => ({
    ...v, laboratorios: v.laboratorios.includes(id) ? v.laboratorios.filter((x) => x !== id) : [...v.laboratorios, id],
  }))

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    if (!f.id_rol) return setError(`Seleccioná un rol: ${listar(roles, 'o')}.`)
    if (!f.laboratorios.length) return setError('Asigná al menos un laboratorio al usuario.')
    setEnviando(true)
    try {
      if (editando) {
        await api(`/usuarios/${usuario.id_usuario}/rol`, { method: 'PATCH', body: { id_rol: Number(f.id_rol), laboratorios: f.laboratorios } })
        onGuardado(`Rol de ${usuario.email} actualizado.`)
      } else {
        await api('/usuarios', { method: 'POST', body: { ...f, id_rol: Number(f.id_rol) } })
        onGuardado(`Usuario ${f.email} registrado.`)
      }
    } catch (err) {
      setError(err.message)
      setEnviando(false)
    }
  }

  return (
    <Modal titulo={editando ? `Asignar rol · ${usuario.nombre} ${usuario.apellido}` : 'Registrar usuario'} onClose={onClose}>
      <form className="form" onSubmit={submit} noValidate>
        <Alerta>{error}</Alerta>
        {!editando && (
          <>
            <div className="form-fila">
              <label>Nombre<input value={f.nombre} onChange={set('nombre')} maxLength={80} required /></label>
              <label>Apellido<input value={f.apellido} onChange={set('apellido')} maxLength={80} required /></label>
            </div>
            <label>Email<input type="email" value={f.email} onChange={set('email')} maxLength={150} required autoComplete="off" /></label>
            <label>Contraseña (mínimo 8 caracteres)<input type="password" value={f.contrasena} onChange={set('contrasena')} minLength={8} required autoComplete="new-password" /></label>
          </>
        )}
        <fieldset>
          <legend>Rol</legend>
          {roles.map((r) => (
            <label key={r.id_rol} className="check">
              <input type="radio" name="rol" value={r.id_rol} checked={f.id_rol === String(r.id_rol)} onChange={set('id_rol')} /> {r.etiqueta}
            </label>
          ))}
        </fieldset>
        <fieldset>
          <legend>Laboratorios asignados</legend>
          <div className="grilla-checks">
            {labs.map((l) => (
              <label key={l.id_laboratorio} className="check">
                <input type="checkbox" checked={f.laboratorios.includes(l.id_laboratorio)} onChange={() => toggleLab(l.id_laboratorio)} /> {l.nombre}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="form-acciones">
          <button type="button" className="btn btn-secundario" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primario" disabled={enviando}>{enviando ? 'Guardando…' : 'Guardar'}</button>
        </div>
      </form>
    </Modal>
  )
}

function ConfirmarBloqueo({ usuario: u, onClose, onListo }) {
  const bloquear = !u.bloqueado
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)
  const confirmar = async () => {
    setEnviando(true)
    try {
      await api(`/usuarios/${u.id_usuario}/bloqueo`, { method: 'PATCH', body: { bloqueado: bloquear } })
      onListo(bloquear ? `${u.email} bloqueado: ya no puede ingresar al sistema.` : `${u.email} desbloqueado: puede volver a ingresar.`)
    } catch (err) {
      setError(err.message)
      setEnviando(false)
    }
  }
  return (
    <Modal titulo={`${bloquear ? 'Bloquear' : 'Desbloquear'} a ${u.nombre} ${u.apellido}`} onClose={onClose} ancho="480px">
      <div className="form">
        <Alerta>{error}</Alerta>
        {bloquear ? (
          <ul className="lista-simple chico">
            <li>No va a poder iniciar sesión.</li>
            <li>Si tiene una ventana abierta, su sesión se cierra en el momento.</li>
            <li>Se conserva todo su historial y se puede desbloquear cuando quieras.</li>
          </ul>
        ) : <p>{u.nombre} va a poder volver a iniciar sesión con su contraseña actual.</p>}
        <div className="form-acciones">
          <button type="button" className="btn btn-secundario" onClick={onClose}>Cancelar</button>
          <button type="button" className={`btn ${bloquear ? 'btn-peligro' : 'btn-primario'}`} onClick={confirmar} disabled={enviando}>
            {enviando ? 'Guardando…' : bloquear ? 'Bloquear cuenta' : 'Desbloquear cuenta'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

function ConfirmarEliminar({ usuario: u, onClose, onListo, onBloquear }) {
  const [confirmo, setConfirmo] = useState(false)
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)
  const historial = u.mantenimientos + u.acciones + u.reportes
  const eliminar = async () => {
    setEnviando(true)
    try {
      const r = await api(`/usuarios/${u.id_usuario}`, { method: 'DELETE' })
      onListo(`${r.email} eliminado.${r.equipos_sin_responsable ? ` ${r.equipos_sin_responsable} equipo(s) quedaron sin responsable.` : ''}`)
    } catch (err) {
      setError(err.message)
      setEnviando(false)
    }
  }
  return (
    <Modal titulo={`Eliminar a ${u.nombre} ${u.apellido}`} onClose={onClose} ancho="500px">
      <div className="form">
        <Alerta>{error}</Alerta>
        {historial > 0 ? (
          <>
            <p><strong>{u.nombre} tiene historial registrado</strong> y no puede eliminarse sin perderlo:</p>
            <ul className="lista-simple chico">
              {u.mantenimientos > 0 && <li>{u.mantenimientos} mantenimiento(s) a su nombre</li>}
              {u.acciones > 0 && <li>{u.acciones} acción(es) en el historial</li>}
              {u.reportes > 0 && <li>{u.reportes} reporte(s)</li>}
            </ul>
            <p className="texto-suave chico">Para que no pueda ingresar, bloqueá la cuenta: se conserva el historial y se puede revertir.</p>
            <div className="form-acciones">
              <button type="button" className="btn btn-secundario" onClick={onClose}>Cancelar</button>
              {!u.bloqueado && <button type="button" className="btn btn-peligro" onClick={onBloquear}>Bloquear cuenta</button>}
            </div>
          </>
        ) : (
          <>
            <p>Se va a eliminar la cuenta <strong>{u.email}</strong> ({u.rolEtiqueta}). Esta acción no se puede deshacer.</p>
            <ul className="lista-simple chico">
              <li>Pierde el acceso a {u.laboratorios ? `sus laboratorios (${u.laboratorios})` : 'el sistema'}.</li>
              <li>Los equipos que tenga a cargo quedan sin responsable.</li>
              <li>La baja queda registrada en el historial de acciones.</li>
            </ul>
            <label className="check"><input type="checkbox" checked={confirmo} onChange={(e) => setConfirmo(e.target.checked)} /> Entiendo que la cuenta se elimina definitivamente</label>
            <div className="form-acciones">
              <button type="button" className="btn btn-secundario" onClick={onClose}>Cancelar</button>
              <button type="button" className="btn btn-peligro" onClick={eliminar} disabled={!confirmo || enviando}>{enviando ? 'Eliminando…' : 'Eliminar usuario'}</button>
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}
