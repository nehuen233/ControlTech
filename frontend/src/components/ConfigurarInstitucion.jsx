import { useEffect, useState } from 'react'
import { api } from '../api.js'
import { useAuth } from '../AuthContext.jsx'
import { Alerta, Cargando, Modal } from './ui.jsx'

// Configuracion inicial de la institucion (solo administrador): revisa los datos del colegio
// y la marca como configurada. El estado y el slug los maneja la plataforma.
const CAMPOS = [
  ['nombre', 'Nombre de la institución', 150],
  ['cuit', 'CUIT', 13],
  ['direccion', 'Dirección', 200],
  ['localidad', 'Localidad', 100],
  ['provincia', 'Provincia', 100],
  ['email_contacto', 'Email de contacto', 150],
  ['telefono', 'Teléfono', 50],
  ['logo_url', 'Logo (dirección web, opcional)', 300],
]

export default function ConfigurarInstitucion({ onClose }) {
  const { actualizarInstitucion } = useAuth()
  const [f, setF] = useState(null)
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)

  useEffect(() => {
    api('/institucion')
      .then((i) => setF(Object.fromEntries(CAMPOS.map(([k]) => [k, i[k] || '']))))
      .catch((e) => setError(e.message))
  }, [])

  const set = (k) => (e) => setF((v) => ({ ...v, [k]: e.target.value }))

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    setEnviando(true)
    try {
      await api('/institucion', { method: 'PUT', body: Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v.trim() || null])) })
      const i = await api('/institucion/configurada', { method: 'PATCH', body: { configurada: true } })
      actualizarInstitucion({ nombre: i.nombre, logo_url: i.logo_url, configurada: i.configurada })
      onClose()
    } catch (err) {
      setError(err.message)
      setEnviando(false)
    }
  }

  return (
    <Modal titulo="Configuración inicial de la institución" onClose={onClose} ancho="640px">
      {!f ? (error ? <Alerta>{error}</Alerta> : <Cargando />) : (
        <form className="form" onSubmit={submit} noValidate>
          <Alerta>{error}</Alerta>
          {CAMPOS.map(([k, etiqueta, max]) => (
            <label key={k}>{etiqueta}
              <input value={f[k]} onChange={set(k)} maxLength={max} required={k === 'nombre'}
                type={k === 'email_contacto' ? 'email' : k === 'logo_url' ? 'url' : 'text'}
                placeholder={k === 'cuit' ? '30-12345678-9' : undefined} />
            </label>
          ))}
          <div className="form-acciones">
            <button type="button" className="btn btn-secundario" onClick={onClose}>Más tarde</button>
            <button className="btn btn-primario" disabled={enviando}>{enviando ? 'Guardando…' : 'Guardar y terminar'}</button>
          </div>
        </form>
      )}
    </Modal>
  )
}
