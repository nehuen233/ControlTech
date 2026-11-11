import { useState } from 'react'
import { api } from '../api.js'
import { useAuth } from '../AuthContext.jsx'
import { Alerta } from '../components/ui.jsx'
import DatosDePago from '../components/DatosDePago.jsx'

export default function Login() {
  const [vista, setVista] = useState('ingresar')
  const [email, setEmail] = useState('')
  return (
    <div className="login-fondo">
      {vista === 'ingresar'
        ? <Ingresar email={email} setEmail={setEmail} onOlvido={() => setVista('recuperar')} />
        : <Recuperar emailInicial={email} onVolver={() => setVista('ingresar')} />}
    </div>
  )
}

function Marca() {
  return (
    <div className="marca marca-login">
      <span className="marca-logo" aria-hidden="true">CT</span>
      <span>ControlTech</span>
    </div>
  )
}

function Ingresar({ email, setEmail, onOlvido }) {
  const { login, aviso } = useAuth()
  const [contrasena, setContrasena] = useState('')
  const [error, setError] = useState('')
  const [suspendida, setSuspendida] = useState('')
  const [enviando, setEnviando] = useState(false)

  const enviar = async (e) => {
    e.preventDefault()
    setError('')
    setSuspendida('')
    setEnviando(true)
    try {
      await login(email, contrasena)
    } catch (err) {
      if (err.detalles?.codigo === 'INSTITUCION_SUSPENDIDA') setSuspendida({ mensaje: err.message, ...err.detalles })
      else setError(err.message)
    } finally {
      setEnviando(false)
    }
  }

  return (
    <form className="login-tarjeta" onSubmit={enviar}>
      <Marca />
      <p className="texto-suave">Gestión de laboratorios, equipos y mantenimientos</p>
      <Alerta>{error}</Alerta>
      {suspendida && (
        <div className="alerta alerta-error suspension" role="alert">
          <span><strong>{suspendida.motivo === 'Falta de pago' ? 'Acceso suspendido por falta de pago.' : 'Institución suspendida.'}</strong> {suspendida.mensaje}</span>
          {suspendida.motivo === 'Falta de pago' && (
            <div className="suspension-pago">
              {suspendida.deuda > 0 && <p>Deuda vencida: <strong>{Number(suspendida.deuda).toLocaleString('es-AR', { style: 'currency', currency: 'ARS' })}</strong></p>}
              {suspendida.datos_pago && (suspendida.datos_pago.alias || suspendida.datos_pago.cbu || suspendida.datos_pago.link)
                ? <DatosDePago datos={suspendida.datos_pago} />
                : null}
              <p className="chico">Cuando ControlTech registre el pago, el acceso se habilita en el momento.</p>
            </div>
          )}
        </div>
      )}
      {!error && !suspendida && aviso && <div className="alerta alerta-aviso" role="status">{aviso}</div>}
      <label>
        Email
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="username" />
      </label>
      <label>
        Contraseña
        <input type="password" value={contrasena} onChange={(e) => setContrasena(e.target.value)} required autoComplete="current-password" />
      </label>
      <button className="btn btn-primario" disabled={enviando}>{enviando ? 'Ingresando…' : 'Ingresar'}</button>
      <button type="button" className="btn-link centro" onClick={onOlvido}>¿Olvidaste tu contraseña?</button>
    </form>
  )
}

// "¿Olvidaste tu contraseña?": el usuario pide al administrador que le cambie la contraseña.
function Recuperar({ emailInicial, onVolver }) {
  const [email, setEmail] = useState(emailInicial)
  const [mensaje, setMensaje] = useState('')
  const [error, setError] = useState('')
  const [enviado, setEnviado] = useState('')
  const [enviando, setEnviando] = useState(false)

  const enviar = async (e) => {
    e.preventDefault()
    setError('')
    setEnviando(true)
    try {
      const r = await api('/auth/recuperar', { method: 'POST', body: { email, mensaje } })
      setEnviado(r.mensaje)
    } catch (err) {
      setError(err.message)
    } finally {
      setEnviando(false)
    }
  }

  return (
    <form className="login-tarjeta" onSubmit={enviar}>
      <Marca />
      <h2 className="titulo-recuperar">¿Olvidaste tu contraseña?</h2>
      {enviado ? (
        <>
          <div className="alerta alerta-ok" role="status">{enviado}</div>
          <p className="texto-suave chico">Cuando el administrador cambie tu contraseña, ingresá con la nueva.</p>
        </>
      ) : (
        <>
          <p className="texto-suave chico">Ingresá tu email y enviá una solicitud. El administrador cambiará tu contraseña y te la comunicará para que puedas volver a ingresar.</p>
          <Alerta>{error}</Alerta>
          <label>
            Email
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="username" />
          </label>
          <label>
            Mensaje para el administrador (opcional)
            <textarea value={mensaje} onChange={(e) => setMensaje(e.target.value)} maxLength={300} rows={2} placeholder="Ej.: no recuerdo la contraseña desde las vacaciones" />
          </label>
          <button className="btn btn-primario" disabled={enviando}>{enviando ? 'Enviando…' : 'Enviar solicitud'}</button>
        </>
      )}
      <button type="button" className="btn-link centro" onClick={onVolver}>Volver a iniciar sesión</button>
    </form>
  )
}
