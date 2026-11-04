import { useState } from 'react'
import { useAuth } from '../AuthContext.jsx'
import { Alerta } from '../components/ui.jsx'

export default function Login() {
  const { login } = useAuth()
  const [email, setEmail] = useState('')
  const [contrasena, setContrasena] = useState('')
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)

  const enviar = async (e) => {
    e.preventDefault()
    setError('')
    setEnviando(true)
    try {
      await login(email, contrasena)
    } catch (err) {
      setError(err.message)
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="login-fondo">
      <form className="login-tarjeta" onSubmit={enviar}>
        <div className="marca marca-login">
          <span className="marca-logo" aria-hidden="true">CT</span>
          <span>ControlTech</span>
        </div>
        <p className="texto-suave">Gestión de laboratorios, equipos y mantenimientos</p>
        <Alerta>{error}</Alerta>
        <label>
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="username" />
        </label>
        <label>
          Contraseña
          <input type="password" value={contrasena} onChange={(e) => setContrasena(e.target.value)} required autoComplete="current-password" />
        </label>
        <button className="btn btn-primario" disabled={enviando}>{enviando ? 'Ingresando…' : 'Ingresar'}</button>
      </form>
    </div>
  )
}
