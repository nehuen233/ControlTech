import { useCallback, useEffect, useState } from 'react'
import { api } from '../api.js'
import { Alerta, Cargando, Modal } from '../components/ui.jsx'

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

  return (
    <section className="panel">
      <div className="barra-acciones">
        <p className="texto-suave">{roles.length ? `Los usuarios nuevos pueden registrarse como ${listar(roles, 'o')}.` : 'Cargando roles…'}</p>
        <button type="button" className="btn btn-primario" onClick={() => setModal({ tipo: 'nuevo' })} disabled={!roles.length}>Registrar usuario</button>
      </div>
      <Alerta>{error}</Alerta>
      <Alerta tipo="ok" onClose={() => setAviso('')}>{aviso}</Alerta>
      {!usuarios ? <Cargando /> : (
        <div className="tabla-scroll">
          <table>
            <thead><tr><th>Nombre</th><th>Email</th><th>Rol</th><th>Laboratorios</th><th>Acciones</th></tr></thead>
            <tbody>
              {usuarios.map((u) => (
                <tr key={u.id_usuario}>
                  <td><strong>{u.nombre} {u.apellido}</strong></td>
                  <td>{u.email}</td>
                  <td>{u.rolEtiqueta}</td>
                  <td className="chico">{u.laboratorios || '—'}</td>
                  <td>
                    {u.editable
                      ? <button type="button" className="btn-link" onClick={() => setModal({ tipo: 'rol', usuario: u })}>Asignar rol</button>
                      : <span className="texto-suave chico">{u.nombre_rol === 'ADMINISTRADOR' ? 'Cuenta protegida' : 'No editable'}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {modal && <FormUsuario roles={roles} labs={labs} usuario={modal.usuario} onClose={() => setModal(null)} onGuardado={guardado} />}
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
