import { useCallback, useEffect, useState } from 'react'
import { api } from '../api.js'
import { Alerta, Cargando, Modal, fecha } from '../components/ui.jsx'

// Seccion del SUPERADMIN: instituciones de la plataforma (alta con su primer administrador
// y cambio de estado). No muestra datos internos de ningun colegio, solo totales.
const TONO_ESTADO = { Prueba: 'info', Activa: 'ok', Suspendida: 'danger' }
const ESTADOS = ['Prueba', 'Activa', 'Suspendida']

export default function Instituciones() {
  const [lista, setLista] = useState(null)
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')
  const [modal, setModal] = useState(null)

  const cargar = useCallback(() => {
    api('/plataforma/instituciones').then(setLista).catch((e) => setError(e.message))
  }, [])
  useEffect(() => { cargar() }, [cargar])

  const listo = (mensaje) => { setModal(null); setAviso(mensaje); cargar() }

  return (
    <section className="panel">
      <div className="barra-acciones">
        <p className="texto-suave">Cada institución es un colegio con sus propios usuarios, laboratorios y equipos. Desde acá se dan de alta y se suspenden.</p>
        <button type="button" className="btn btn-primario" onClick={() => setModal({ tipo: 'nueva' })}>Nueva institución</button>
      </div>
      <Alerta>{error}</Alerta>
      <Alerta tipo="ok" onClose={() => setAviso('')}>{aviso}</Alerta>
      {!lista ? <Cargando /> : lista.length === 0 ? <p className="vacio">Todavía no hay instituciones. Creá la primera con "Nueva institución".</p> : (
        <div className="tabla-scroll">
          <table>
            <thead><tr><th>Institución</th><th>Estado</th><th>Administrador</th><th>Usuarios</th><th>Laboratorios</th><th>Equipos</th><th>Alta</th><th>Acciones</th></tr></thead>
            <tbody>
              {lista.map((i) => (
                <tr key={i.id_institucion} className={i.estado === 'Suspendida' ? 'fila-bloqueada' : ''}>
                  <td>
                    <strong>{i.nombre}</strong>
                    <div className="texto-suave chico">{[i.localidad, i.provincia].filter(Boolean).join(', ') || i.slug}</div>
                  </td>
                  <td>
                    <span className={`badge badge-${TONO_ESTADO[i.estado] || 'neutral'}`}>{i.estado}</span>
                    {i.estado === 'Prueba' && i.fecha_fin_prueba && <div className="texto-suave chico">hasta {fecha(i.fecha_fin_prueba)}</div>}
                    {!i.configurada && <div className="texto-suave chico">Sin configurar</div>}
                  </td>
                  <td className="chico">{i.administradores || '—'}</td>
                  <td>{i.usuarios}</td>
                  <td>{i.laboratorios}</td>
                  <td>{i.equipos}</td>
                  <td className="chico">{fecha(i.fecha_alta)}</td>
                  <td className="acciones-fila">
                    <button type="button" className="btn-link" onClick={() => setModal({ tipo: 'estado', institucion: i })}>Cambiar estado</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {modal?.tipo === 'nueva' && <NuevaInstitucion onClose={() => setModal(null)} onListo={listo} />}
      {modal?.tipo === 'estado' && <CambiarEstado institucion={modal.institucion} onClose={() => setModal(null)} onListo={listo} />}
    </section>
  )
}

function NuevaInstitucion({ onClose, onListo }) {
  const [f, setF] = useState({
    nombre: '', localidad: '', provincia: '', email_contacto: '', fecha_fin_prueba: '',
    adm_nombre: '', adm_apellido: '', adm_email: '', adm_contrasena: '',
  })
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)
  const set = (k) => (e) => setF((v) => ({ ...v, [k]: e.target.value }))

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    setEnviando(true)
    try {
      const r = await api('/plataforma/instituciones', {
        method: 'POST',
        body: {
          nombre: f.nombre, localidad: f.localidad || null, provincia: f.provincia || null,
          email_contacto: f.email_contacto || null, fecha_fin_prueba: f.fecha_fin_prueba || null,
          administrador: { nombre: f.adm_nombre, apellido: f.adm_apellido, email: f.adm_email, contrasena: f.adm_contrasena },
        },
      })
      onListo(`Institución "${r.nombre}" creada en Prueba. Su administrador ingresa con ${r.administrador.email} y la contraseña que indicaste.`)
    } catch (err) {
      setError(err.message)
      setEnviando(false)
    }
  }

  return (
    <Modal titulo="Nueva institución" onClose={onClose} ancho="640px">
      <form className="form" onSubmit={submit} noValidate>
        <Alerta>{error}</Alerta>
        <fieldset>
          <legend>Institución</legend>
          <label>Nombre<input value={f.nombre} onChange={set('nombre')} maxLength={150} required /></label>
          <div className="form-fila">
            <label>Localidad<input value={f.localidad} onChange={set('localidad')} maxLength={100} /></label>
            <label>Provincia<input value={f.provincia} onChange={set('provincia')} maxLength={100} /></label>
          </div>
          <div className="form-fila">
            <label>Email de contacto<input type="email" value={f.email_contacto} onChange={set('email_contacto')} maxLength={150} /></label>
            <label>Fin de la prueba (opcional)<input type="date" value={f.fecha_fin_prueba} onChange={set('fecha_fin_prueba')} /></label>
          </div>
        </fieldset>
        <fieldset>
          <legend>Primer administrador</legend>
          <div className="form-fila">
            <label>Nombre<input value={f.adm_nombre} onChange={set('adm_nombre')} maxLength={80} required /></label>
            <label>Apellido<input value={f.adm_apellido} onChange={set('adm_apellido')} maxLength={80} required /></label>
          </div>
          <label>Email (con este ingresa al sistema)<input type="email" value={f.adm_email} onChange={set('adm_email')} maxLength={150} required autoComplete="off" /></label>
          <label>Contraseña inicial (mínimo 8 caracteres)<input type="password" value={f.adm_contrasena} onChange={set('adm_contrasena')} minLength={8} required autoComplete="new-password" /></label>
        </fieldset>
        <div className="form-acciones">
          <button type="button" className="btn btn-secundario" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primario" disabled={enviando}>{enviando ? 'Creando…' : 'Crear institución'}</button>
        </div>
      </form>
    </Modal>
  )
}

function CambiarEstado({ institucion: i, onClose, onListo }) {
  const [estado, setEstado] = useState(i.estado)
  const [fin, setFin] = useState(i.fecha_fin_prueba ? String(i.fecha_fin_prueba).slice(0, 10) : '')
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setEnviando(true)
    try {
      await api(`/plataforma/instituciones/${i.id_institucion}/estado`, {
        method: 'PATCH',
        body: { estado, ...(estado === 'Prueba' ? { fecha_fin_prueba: fin || null } : {}) },
      })
      onListo(estado === 'Suspendida'
        ? `"${i.nombre}" suspendida: sus usuarios ya no pueden ingresar y las sesiones abiertas se cerraron.`
        : `"${i.nombre}" ahora está en estado ${estado}.`)
    } catch (err) {
      setError(err.message)
      setEnviando(false)
    }
  }

  return (
    <Modal titulo={`Estado de ${i.nombre}`} onClose={onClose} ancho="480px">
      <form className="form" onSubmit={submit}>
        <Alerta>{error}</Alerta>
        <fieldset>
          <legend>Estado</legend>
          {ESTADOS.map((e) => (
            <label key={e} className="check">
              <input type="radio" name="estado" value={e} checked={estado === e} onChange={() => setEstado(e)} /> {e}
            </label>
          ))}
        </fieldset>
        {estado === 'Prueba' && <label>Fin de la prueba (opcional)<input type="date" value={fin} onChange={(e) => setFin(e.target.value)} /></label>}
        {estado === 'Suspendida' && i.estado !== 'Suspendida' && (
          <p className="alerta alerta-aviso">Los usuarios de esta institución no podrán ingresar y se cerrarán sus sesiones abiertas. Sus datos no se borran.</p>
        )}
        <div className="form-acciones">
          <button type="button" className="btn btn-secundario" onClick={onClose}>Cancelar</button>
          <button className={`btn ${estado === 'Suspendida' ? 'btn-peligro' : 'btn-primario'}`} disabled={enviando || (estado === i.estado && estado !== 'Prueba')}>{enviando ? 'Guardando…' : 'Guardar'}</button>
        </div>
      </form>
    </Modal>
  )
}
