import { useState } from 'react'

// Campo de contraseña con el botón "ojo" para mostrarla u ocultarla.
// Recibe las mismas props que un <input> (value, onChange, autoComplete, aria-*…).
const Ojo = ({ tachado }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
    <circle cx="12" cy="12" r="3" />
    {tachado && <path d="M3 3l18 18" />}
  </svg>
)

export default function CampoContrasena({ className = '', ...props }) {
  const [visible, setVisible] = useState(false)
  return (
    <span className={`campo-contrasena ${className}`}>
      <input {...props} type={visible ? 'text' : 'password'} autoCapitalize="off" autoCorrect="off" spellCheck={false} />
      <button type="button" className="campo-contrasena-ojo" onClick={() => setVisible((v) => !v)}
        aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'} aria-pressed={visible} title={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}>
        <Ojo tachado={visible} />
      </button>
    </span>
  )
}
