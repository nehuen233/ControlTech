// Paso 4 (opcional): sumar a docentes y técnicos. La contraseña inicial la genera el sistema
// (o la escribe el administrador) y se muestra una sola vez para copiarla.
import { useEffect, useRef, useState } from 'react'
import { api } from '../../api.js'
import { Alerta } from '../../components/ui.jsx'
import EncabezadoPaso from './Encabezado.jsx'
import Acciones from './Acciones.jsx'
import { IconoCopiar, IconoMas } from './iconos.jsx'

// Qué puede hacer cada rol, dicho en una línea.
const QUE_HACE = {
  DOCENTE: 'Ve sus laboratorios y avisa cuando una computadora tiene un problema.',
  'DOCENTE DE LABORATORIO': 'Además, carga computadoras y registra mantenimientos en sus laboratorios.',
  TECNICO: 'Carga computadoras, registra mantenimientos y resuelve problemas en sus laboratorios.',
}
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const VACIO = { nombre: '', apellido: '', email: '', id_rol: '', laboratorios: [], modo: 'generar', contrasena: '' }

function validar(f) {
  const e = {}
  if (!f.nombre.trim()) e.nombre = 'Escribí el nombre.'
  if (!f.apellido.trim()) e.apellido = 'Escribí el apellido.'
  if (!EMAIL_RE.test(f.email.trim())) e.email = 'Escribí un email válido: con este va a ingresar.'
  if (!f.id_rol) e.id_rol = 'Elegí qué va a hacer en el sistema.'
  if (!f.laboratorios.length) e.laboratorios = 'Marcá al menos un laboratorio.'
  if (f.modo === 'escribir' && f.contrasena.length < 8) e.contrasena = 'La contraseña necesita al menos 8 caracteres.'
  return e
}

export default function PasoEquipo({ datos, recargar, titulo, numero, onAtras, onSiguiente }) {
  const [roles, setRoles] = useState(null)
  // Con un solo laboratorio, viene marcado.
  const inicial = () => ({ ...VACIO, laboratorios: datos.laboratorios.length === 1 ? [datos.laboratorios[0].id_laboratorio] : [] })
  const [f, setF] = useState(inicial)
  const [errores, setErrores] = useState({})
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [credencial, setCredencial] = useState(null)
  const [copiado, setCopiado] = useState(false)
  const tarjeta = useRef(null)
  const labs = datos.laboratorios
  const equipo = datos.usuarios.filter((u) => u.nombre_rol !== 'ADMINISTRADOR')

  useEffect(() => {
    api('/roles/asignables').then(setRoles).catch((e) => setError(e.message))
  }, [])

  const set = (k) => (ev) => {
    setF((v) => ({ ...v, [k]: ev.target.value }))
    if (errores[k]) setErrores((v) => ({ ...v, [k]: undefined }))
  }
  const toggleLab = (id) => {
    setF((v) => ({ ...v, laboratorios: v.laboratorios.includes(id) ? v.laboratorios.filter((x) => x !== id) : [...v.laboratorios, id] }))
    if (errores.laboratorios) setErrores((v) => ({ ...v, laboratorios: undefined }))
  }
  const escrito = f.nombre.trim() || f.apellido.trim() || f.email.trim()

  const invitar = async () => {
    setError('')
    const e = validar(f)
    setErrores(e)
    if (Object.keys(e).length) {
      document.getElementById(`eq-${Object.keys(e)[0]}`)?.focus()
      return false
    }
    setEnviando(true)
    try {
      const body = {
        nombre: f.nombre.trim(), apellido: f.apellido.trim(), email: f.email.trim(), id_rol: Number(f.id_rol), laboratorios: f.laboratorios,
        ...(f.modo === 'generar' ? { generar: true } : { contrasena: f.contrasena }),
      }
      const r = await api('/usuarios', { method: 'POST', body })
      setCredencial({ nombre: `${r.nombre} ${r.apellido}`, email: r.email, contrasena: r.contrasena_temporal || f.contrasena, generada: Boolean(r.contrasena_temporal), rol: r.rolEtiqueta })
      setCopiado(false)
      setF(inicial())
      await recargar()
      setEnviando(false)
      setTimeout(() => tarjeta.current?.focus(), 0)
      return true
    } catch (err) {
      if (/email/i.test(err.message)) setErrores({ email: err.message })
      else setError(err.message)
      setEnviando(false)
      return false
    }
  }

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(`Email: ${credencial.email}\nContraseña: ${credencial.contrasena}`)
      setCopiado(true)
    } catch { setCopiado(false) }
  }

  // "Invitar y seguir": si quedó alguien escrito, se invita primero.
  const seguir = async () => { if (!escrito || await invitar()) onSiguiente() }
  const err = (k) => errores[k] && <span id={`eq-${k}-error`} className="pp-campo-error">{errores[k]}</span>
  const ariaErr = (k) => ({ 'aria-invalid': Boolean(errores[k]), 'aria-describedby': errores[k] ? `eq-${k}-error` : undefined })

  return (
    <div className="pp-paso-form">
      <EncabezadoPaso numero={numero} titulo="Equipo de trabajo" refTitulo={titulo} opcional>
        Sumá a los docentes y técnicos que van a usar ControlTech. Cada uno entra con su email y solo ve los laboratorios que le asignes.
      </EncabezadoPaso>

      {credencial && (
        <div className="pp-credencial" ref={tarjeta} tabIndex={-1} role="status">
          <p><strong>{credencial.nombre}</strong> ya puede ingresar como {credencial.rol}.</p>
          <dl>
            <div><dt>Email</dt><dd>{credencial.email}</dd></div>
            <div><dt>Contraseña</dt><dd className="pp-clave">{credencial.contrasena}</dd></div>
          </dl>
          <p className="pp-nota">{credencial.generada ? 'Esta contraseña no se vuelve a mostrar: copiala y pasásela por un medio privado.' : 'Pasale la contraseña que escribiste por un medio privado.'}</p>
          <div className="pp-credencial-acciones">
            <button type="button" className="btn btn-secundario btn-icono" onClick={copiar}><IconoCopiar /> {copiado ? 'Copiado' : 'Copiar email y contraseña'}</button>
            <button type="button" className="btn-link" onClick={() => setCredencial(null)}>Ya la guardé</button>
          </div>
        </div>
      )}

      <section className="pp-bloque" aria-labelledby="eq-alta">
        <h2 id="eq-alta">{equipo.length ? 'Sumar a otra persona' : 'Sumar a una persona'}</h2>
        <div aria-live="polite"><Alerta>{error}</Alerta></div>
        <form id="form-equipo" className="pp-subform" noValidate onSubmit={(ev) => { ev.preventDefault(); invitar() }}>
          <div className="pp-fila">
            <label className={`pp-campo ${errores.nombre ? 'con-error' : ''}`} htmlFor="eq-nombre"><span className="pp-campo-etiqueta">Nombre</span>
              <input id="eq-nombre" value={f.nombre} onChange={set('nombre')} maxLength={80} autoComplete="off" {...ariaErr('nombre')} />{err('nombre')}</label>
            <label className={`pp-campo ${errores.apellido ? 'con-error' : ''}`} htmlFor="eq-apellido"><span className="pp-campo-etiqueta">Apellido</span>
              <input id="eq-apellido" value={f.apellido} onChange={set('apellido')} maxLength={80} autoComplete="off" {...ariaErr('apellido')} />{err('apellido')}</label>
          </div>
          <label className={`pp-campo ${errores.email ? 'con-error' : ''}`} htmlFor="eq-email"><span className="pp-campo-etiqueta">Email</span>
            <input id="eq-email" type="email" value={f.email} onChange={set('email')} maxLength={150} autoComplete="off" {...ariaErr('email')} />{err('email')}</label>

          <fieldset className={`pp-fieldset ${errores.id_rol ? 'con-error' : ''}`} aria-describedby={errores.id_rol ? 'eq-id_rol-error' : undefined}>
            <legend>Qué va a hacer</legend>
            {!roles ? <p className="pp-nota">Cargando roles…</p> : (
              <div className="pp-opciones">
                {roles.map((r, i) => (
                  <label key={r.id_rol} className={`pp-opcion ${String(r.id_rol) === f.id_rol ? 'es-sel' : ''}`}>
                    <input type="radio" name="eq-rol" id={i === 0 ? 'eq-id_rol' : undefined} value={r.id_rol} checked={String(r.id_rol) === f.id_rol} onChange={set('id_rol')} />
                    <span><strong>{r.etiqueta}</strong><span>{QUE_HACE[r.nombre_rol] || ''}</span></span>
                  </label>
                ))}
              </div>
            )}
            {err('id_rol')}
          </fieldset>

          <fieldset className={`pp-fieldset ${errores.laboratorios ? 'con-error' : ''}`} aria-describedby={errores.laboratorios ? 'eq-laboratorios-error' : undefined}>
            <legend>Laboratorios donde trabaja</legend>
            {labs.length === 0 ? <p className="pp-nota">Primero creá un laboratorio en el paso 2.</p> : (
              <div className="pp-checks">
                {labs.map((l, i) => (
                  <label key={l.id_laboratorio} className="check">
                    <input type="checkbox" id={i === 0 ? 'eq-laboratorios' : undefined} checked={f.laboratorios.includes(l.id_laboratorio)} onChange={() => toggleLab(l.id_laboratorio)} /> {l.nombre}
                  </label>
                ))}
              </div>
            )}
            {err('laboratorios')}
          </fieldset>

          <fieldset className="pp-fieldset">
            <legend>Contraseña inicial</legend>
            <label className="check"><input type="radio" name="eq-modo" checked={f.modo === 'generar'} onChange={() => setF((v) => ({ ...v, modo: 'generar' }))} /> Que el sistema genere una</label>
            <label className="check"><input type="radio" name="eq-modo" checked={f.modo === 'escribir'} onChange={() => setF((v) => ({ ...v, modo: 'escribir' }))} /> Escribirla yo</label>
            {f.modo === 'escribir' && (
              <label className={`pp-campo ${errores.contrasena ? 'con-error' : ''}`} htmlFor="eq-contrasena"><span className="pp-campo-etiqueta">Contraseña (mínimo 8 caracteres)</span>
                <input id="eq-contrasena" type="text" value={f.contrasena} onChange={set('contrasena')} minLength={8} maxLength={72} autoComplete="new-password" {...ariaErr('contrasena')} />{err('contrasena')}</label>
            )}
          </fieldset>
          <div><button className="btn btn-secundario btn-icono" disabled={enviando || labs.length === 0}><IconoMas /> {enviando ? 'Sumando…' : 'Sumar al equipo'}</button></div>
        </form>
      </section>

      <section className="pp-bloque" aria-labelledby="eq-lista">
        <h2 id="eq-lista">Tu equipo</h2>
        {equipo.length === 0 ? <p className="pp-vacio">Por ahora sos la única persona. Podés sumar a tu equipo ahora o más tarde desde Usuarios.</p> : (
          <ul className="pp-personas">
            {equipo.map((u) => (
              <li key={u.id_usuario}>
                <span className="pp-inicial" aria-hidden="true">{u.nombre[0]}{u.apellido[0]}</span>
                <span><strong>{u.nombre} {u.apellido}</strong><span>{u.rolEtiqueta}{u.laboratorios ? `, ${u.laboratorios}` : ''}</span></span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Acciones onAtras={onAtras}
        principal={{ texto: escrito ? 'Sumar y seguir' : equipo.length ? 'Seguir' : 'Lo hago después', onClick: seguir, cargando: enviando }} />
    </div>
  )
}
