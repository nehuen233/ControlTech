// Paso 1: los datos del colegio. Solo el nombre es obligatorio.
import { useState } from 'react'
import { api } from '../../api.js'
import { useAuth } from '../../AuthContext.jsx'
import { Alerta } from '../../components/ui.jsx'
import EncabezadoPaso from './Encabezado.jsx'
import Acciones from './Acciones.jsx'
import { PROVINCIAS } from './provincias.js'

const CAMPOS = ['nombre', 'cuit', 'direccion', 'localidad', 'provincia', 'email_contacto', 'telefono', 'logo_url']
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function validar(f) {
  const e = {}
  if (!f.nombre.trim()) e.nombre = 'Escribí el nombre del colegio.'
  if (f.cuit.trim() && !/^\d{2}-?\d{8}-?\d$/.test(f.cuit.trim())) e.cuit = 'El CUIT tiene 11 números, por ejemplo 30-12345678-9.'
  if (f.email_contacto.trim() && !EMAIL_RE.test(f.email_contacto.trim())) e.email_contacto = 'Revisá el email: falta la @ o el dominio.'
  if (f.logo_url.trim() && !/^https?:\/\/\S+$/i.test(f.logo_url.trim())) e.logo_url = 'La dirección del logo empieza con http:// o https://.'
  return e
}

export default function PasoInstitucion({ datos, recargar, titulo, numero, onSiguiente }) {
  const { actualizarInstitucion } = useAuth()
  const [f, setF] = useState(() => Object.fromEntries(CAMPOS.map((k) => [k, datos.institucion[k] || ''])))
  const [errores, setErrores] = useState({})
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [logoRoto, setLogoRoto] = useState(false)

  const set = (k) => (ev) => {
    setF((v) => ({ ...v, [k]: ev.target.value }))
    if (errores[k]) setErrores((v) => ({ ...v, [k]: undefined }))
    if (k === 'logo_url') setLogoRoto(false)
  }

  const guardar = async (ev) => {
    ev.preventDefault()
    setError('')
    const e = validar(f)
    setErrores(e)
    if (Object.keys(e).length) {
      document.getElementById(`inst-${Object.keys(e)[0]}`)?.focus()
      return
    }
    // Sin cambios: se sigue sin llamar al servidor.
    const cambios = CAMPOS.some((k) => (f[k] || '').trim() !== (datos.institucion[k] || ''))
    if (!cambios) return onSiguiente()
    setEnviando(true)
    try {
      const i = await api('/institucion', { method: 'PUT', body: Object.fromEntries(CAMPOS.map((k) => [k, f[k].trim() || null])) })
      actualizarInstitucion({ nombre: i.nombre, logo_url: i.logo_url })
      await recargar()
      onSiguiente()
    } catch (err) {
      setError(err.message)
      setEnviando(false)
    }
  }

  const campo = (k, etiqueta, props = {}, ayuda) => (
    <label className={`pp-campo ${errores[k] ? 'con-error' : ''}`} htmlFor={`inst-${k}`}>
      <span className="pp-campo-etiqueta">{etiqueta}{k === 'nombre' ? '' : <span className="pp-opcional"> (opcional)</span>}</span>
      <input id={`inst-${k}`} value={f[k]} onChange={set(k)} aria-invalid={Boolean(errores[k])}
        aria-describedby={errores[k] ? `inst-${k}-error` : ayuda ? `inst-${k}-ayuda` : undefined} {...props} />
      {errores[k] ? <span id={`inst-${k}-error`} className="pp-campo-error">{errores[k]}</span>
        : ayuda && <span id={`inst-${k}-ayuda`} className="pp-campo-ayuda">{ayuda}</span>}
    </label>
  )

  return (
    <form className="pp-paso-form" onSubmit={guardar} noValidate id="form-institucion">
      <EncabezadoPaso numero={numero} titulo="Tu institución" refTitulo={titulo}>
        Estos datos identifican a tu colegio en ControlTech. Solo el nombre es obligatorio; el resto lo podés completar ahora o más adelante.
      </EncabezadoPaso>

      <div aria-live="polite"><Alerta>{error}</Alerta></div>

      <section className="pp-bloque" aria-labelledby="inst-identidad">
        <h2 id="inst-identidad">Identidad</h2>
        {campo('nombre', 'Nombre del colegio', { required: true, maxLength: 150, autoComplete: 'organization' })}
        <div className="pp-fila">
          {campo('cuit', 'CUIT', { maxLength: 13, inputMode: 'numeric', placeholder: '30-12345678-9' })}
        </div>
        <div className="pp-logo">
          {campo('logo_url', 'Logo', { type: 'url', maxLength: 300, placeholder: 'https://…/logo.png' }, 'Pegá la dirección web de la imagen del logo.')}
          <div className="pp-logo-vista" aria-live="polite">
            {f.logo_url && !errores.logo_url && !logoRoto
              ? <img src={f.logo_url} alt={`Vista previa del logo de ${f.nombre || 'tu colegio'}`} onError={() => setLogoRoto(true)} />
              : <span className="pp-logo-vacio">{logoRoto ? 'No se pudo cargar la imagen. Revisá la dirección.' : 'Vista previa'}</span>}
          </div>
        </div>
      </section>

      <section className="pp-bloque" aria-labelledby="inst-ubicacion">
        <h2 id="inst-ubicacion">Ubicación</h2>
        {campo('direccion', 'Dirección', { maxLength: 200, autoComplete: 'street-address', placeholder: 'Calle y número' })}
        <div className="pp-fila">
          {campo('localidad', 'Localidad', { maxLength: 100, autoComplete: 'address-level2' })}
          <label className="pp-campo" htmlFor="inst-provincia">
            <span className="pp-campo-etiqueta">Provincia<span className="pp-opcional"> (opcional)</span></span>
            <select id="inst-provincia" value={f.provincia} onChange={set('provincia')}>
              <option value="">Elegí una provincia</option>
              {f.provincia && !PROVINCIAS.includes(f.provincia) && <option value={f.provincia}>{f.provincia}</option>}
              {PROVINCIAS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </label>
        </div>
      </section>

      <section className="pp-bloque" aria-labelledby="inst-contacto">
        <h2 id="inst-contacto">Contacto</h2>
        <div className="pp-fila">
          {campo('email_contacto', 'Email', { type: 'email', maxLength: 150, autoComplete: 'email', placeholder: 'secretaria@colegio.edu.ar' })}
          {campo('telefono', 'Teléfono', { type: 'tel', maxLength: 50, autoComplete: 'tel' })}
        </div>
      </section>

      <Acciones principal={{ texto: 'Guardar y seguir', submit: true, form: 'form-institucion', cargando: enviando }} />
    </form>
  )
}
