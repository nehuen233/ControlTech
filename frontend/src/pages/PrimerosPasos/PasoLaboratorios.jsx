// Paso 2: los laboratorios del colegio. Alta rápida (uno tras otro) y tarjetas editables.
import { useRef, useState } from 'react'
import { api } from '../../api.js'
import { Alerta } from '../../components/ui.jsx'
import { CAPACIDAD_MIN, CAPACIDAD_MAX, EliminarLaboratorio } from '../Laboratorios.jsx'
import EncabezadoPaso from './Encabezado.jsx'
import Acciones from './Acciones.jsx'
import GrillaPuestos, { LeyendaPuestos } from './GrillaPuestos.jsx'
import { IconoLapiz, IconoMas, IconoPapelera } from './iconos.jsx'

const VACIO = { nombre: '', edificio: '', piso: '', ubicacion: '', capacidad_equipos: String(CAPACIDAD_MAX) }
const deLab = (l) => ({
  nombre: l.nombre, edificio: l.edificio || '', piso: l.piso || '', ubicacion: l.ubicacion || '',
  capacidad_equipos: String(l.capacidad_equipos ?? CAPACIDAD_MAX),
})

function validar(f, minimo) {
  const e = {}
  if (!f.nombre.trim()) e.nombre = 'Escribí un nombre, por ejemplo "Laboratorio 1".'
  const c = Number(f.capacidad_equipos)
  if (f.capacidad_equipos === '' || !Number.isInteger(c) || c < CAPACIDAD_MIN || c > CAPACIDAD_MAX) {
    e.capacidad_equipos = `Elegí un número de ${CAPACIDAD_MIN} a ${CAPACIDAD_MAX}.`
  } else if (c < minimo) {
    e.capacidad_equipos = `Ya tiene ${minimo} computadoras cargadas: la capacidad no puede ser menor.`
  }
  return e
}

// Formulario de laboratorio: alta (lab = null) o edición dentro de su tarjeta.
function FormLab({ lab, idForm, onGuardado, onCancelar, registrar }) {
  const [f, setF] = useState(lab ? deLab(lab) : VACIO)
  const [errores, setErrores] = useState({})
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)
  const minimo = lab ? Number(lab.total_equipos || 0) : 0
  const pre = `${idForm}-`

  const set = (k) => (ev) => {
    setF((v) => ({ ...v, [k]: ev.target.value }))
    if (errores[k]) setErrores((v) => ({ ...v, [k]: undefined }))
  }
  const sumar = (d) => setF((v) => {
    const c = Math.min(CAPACIDAD_MAX, Math.max(CAPACIDAD_MIN, (Number(v.capacidad_equipos) || CAPACIDAD_MIN) + d))
    return { ...v, capacidad_equipos: String(c) }
  })

  // Devuelve true si guardó (o no había nada que guardar en un alta vacía).
  const guardar = async () => {
    setError('')
    if (!lab && !f.nombre.trim() && !f.edificio.trim() && !f.piso.trim() && !f.ubicacion.trim()) return true
    const e = validar(f, minimo)
    setErrores(e)
    if (Object.keys(e).length) {
      document.getElementById(`${pre}${Object.keys(e)[0]}`)?.focus()
      return false
    }
    setEnviando(true)
    const body = { ...f, nombre: f.nombre.trim(), capacidad_equipos: Number(f.capacidad_equipos) }
    // Un laboratorio antiguo puede tener otra capacidad: se envía solo si cambió.
    if (lab && String(lab.capacidad_equipos ?? '') === f.capacidad_equipos) delete body.capacidad_equipos
    try {
      if (lab) await api(`/laboratorios/${lab.id_laboratorio}`, { method: 'PUT', body })
      else await api('/laboratorios', { method: 'POST', body })
      await onGuardado(lab ? `${body.nombre} actualizado.` : `${body.nombre} agregado.`)
      if (!lab) { setF(VACIO); document.getElementById(`${pre}nombre`)?.focus() }
      setEnviando(false)
      return true
    } catch (err) {
      if (/llamado/.test(err.message)) setErrores({ nombre: 'Ya hay un laboratorio con ese nombre en tu colegio.' })
      else setError(err.message)
      setEnviando(false)
      return false
    }
  }
  registrar?.(guardar)

  const err = (k) => errores[k] && <span id={`${pre}${k}-error`} className="pp-campo-error">{errores[k]}</span>
  const capacidad = Number(f.capacidad_equipos)
  const capValida = Number.isInteger(capacidad) && capacidad >= CAPACIDAD_MIN && capacidad <= CAPACIDAD_MAX

  return (
    <form id={idForm} className="pp-form-lab" noValidate onSubmit={(ev) => { ev.preventDefault(); guardar() }}>
      <div aria-live="polite"><Alerta>{error}</Alerta></div>
      <div className="pp-form-lab-campos">
        <label className={`pp-campo ${errores.nombre ? 'con-error' : ''}`} htmlFor={`${pre}nombre`}>
          <span className="pp-campo-etiqueta">Nombre</span>
          <input id={`${pre}nombre`} value={f.nombre} onChange={set('nombre')} maxLength={100} placeholder="Ej.: Laboratorio 1"
            aria-invalid={Boolean(errores.nombre)} aria-describedby={errores.nombre ? `${pre}nombre-error` : undefined} />
          {err('nombre')}
        </label>
        <div className="pp-fila pp-fila-3">
          <label className="pp-campo" htmlFor={`${pre}edificio`}>
            <span className="pp-campo-etiqueta">Edificio<span className="pp-opcional"> (opcional)</span></span>
            <input id={`${pre}edificio`} value={f.edificio} onChange={set('edificio')} maxLength={100} />
          </label>
          <label className="pp-campo" htmlFor={`${pre}piso`}>
            <span className="pp-campo-etiqueta">Piso<span className="pp-opcional"> (opcional)</span></span>
            <input id={`${pre}piso`} value={f.piso} onChange={set('piso')} maxLength={50} placeholder="Ej.: 1er piso" />
          </label>
          <label className="pp-campo" htmlFor={`${pre}ubicacion`}>
            <span className="pp-campo-etiqueta">Ubicación<span className="pp-opcional"> (opcional)</span></span>
            <input id={`${pre}ubicacion`} value={f.ubicacion} onChange={set('ubicacion')} maxLength={150} placeholder="Ej.: al lado de la biblioteca" />
          </label>
        </div>
        <div className={`pp-campo ${errores.capacidad_equipos ? 'con-error' : ''}`}>
          <label className="pp-campo-etiqueta" htmlFor={`${pre}capacidad_equipos`}>Capacidad</label>
          <div className="pp-capacidad">
            <div className="pp-contador">
              <button type="button" className="pp-contador-btn" onClick={() => sumar(-1)} aria-label="Una computadora menos" disabled={capacidad <= CAPACIDAD_MIN}>−</button>
              <input id={`${pre}capacidad_equipos`} type="number" inputMode="numeric" min={Math.max(CAPACIDAD_MIN, minimo)} max={CAPACIDAD_MAX} step="1"
                value={f.capacidad_equipos} onChange={set('capacidad_equipos')} aria-invalid={Boolean(errores.capacidad_equipos)}
                aria-describedby={`${pre}capacidad-ayuda${errores.capacidad_equipos ? ` ${pre}capacidad_equipos-error` : ''}`} />
              <button type="button" className="pp-contador-btn" onClick={() => sumar(1)} aria-label="Una computadora más" disabled={capacidad >= CAPACIDAD_MAX}>+</button>
            </div>
            <span id={`${pre}capacidad-ayuda`} className="pp-campo-ayuda">Cuántas computadoras entran: de {CAPACIDAD_MIN} a {CAPACIDAD_MAX}.</span>
          </div>
          {err('capacidad_equipos')}
          {capValida && <GrillaPuestos capacidad={capacidad} ocupados={minimo} nombre={f.nombre || 'Laboratorio nuevo'} />}
        </div>
      </div>
      <div className="pp-form-lab-acciones">
        {onCancelar && <button type="button" className="btn btn-secundario" onClick={onCancelar}>Cancelar</button>}
        <button className={`btn ${lab ? 'btn-primario' : 'btn-secundario'} btn-icono`} disabled={enviando}>
          {lab ? (enviando ? 'Guardando…' : 'Guardar cambios') : <><IconoMas /> {enviando ? 'Agregando…' : 'Agregar laboratorio'}</>}
        </button>
      </div>
    </form>
  )
}

export default function PasoLaboratorios({ datos, recargar, titulo, numero, onAtras, onSiguiente }) {
  const [editando, setEditando] = useState(null)
  const [eliminando, setEliminando] = useState(null)
  const [aviso, setAviso] = useState('')
  const [siguiendo, setSiguiendo] = useState(false)
  const labs = datos.laboratorios
  const guardarAlta = useRef(null)

  const guardado = async (mensaje) => {
    await recargar()
    setEditando(null)
    setAviso(mensaje)
  }

  // "Guardar y seguir": si quedó un laboratorio escrito sin agregar, se guarda primero.
  const seguir = async () => {
    setSiguiendo(true)
    const ok = guardarAlta.current ? await guardarAlta.current() : true
    setSiguiendo(false)
    if (ok) onSiguiente()
  }

  return (
    <div className="pp-paso-form">
      <EncabezadoPaso numero={numero} titulo="Laboratorios" refTitulo={titulo}>
        Cargá las aulas que tienen computadoras. Agregá uno y seguí con el próximo; después podés sumar más desde la sección Laboratorios.
      </EncabezadoPaso>

      <p className="pp-aviso-ok" role="status" aria-live="polite">{aviso}</p>

      <section className="pp-bloque" aria-labelledby="labs-alta">
        <h2 id="labs-alta">{labs.length ? 'Agregar otro laboratorio' : 'Tu primer laboratorio'}</h2>
        <FormLab idForm="lab-nuevo" onGuardado={guardado} registrar={(fn) => { guardarAlta.current = fn }} />
      </section>

      <section className="pp-bloque" aria-labelledby="labs-lista">
        <div className="pp-bloque-cabecera">
          <h2 id="labs-lista">Laboratorios de tu colegio</h2>
          {labs.length > 0 && <LeyendaPuestos />}
        </div>
        {labs.length === 0 ? (
          <p className="pp-vacio">Todavía no hay laboratorios. El que agregues arriba aparece acá.</p>
        ) : (
          <ul className="pp-labs">
            {labs.map((l) => (
              <li key={l.id_laboratorio} className="pp-lab">
                {editando === l.id_laboratorio ? (
                  <FormLab lab={l} idForm={`lab-${l.id_laboratorio}`} onGuardado={guardado} onCancelar={() => setEditando(null)} />
                ) : (
                  <>
                    <div className="pp-lab-cabecera">
                      <div>
                        <h3>{l.nombre}</h3>
                        <p className="pp-lab-datos">{[l.edificio, l.piso, l.ubicacion].filter(Boolean).join(', ') || 'Sin ubicación cargada'}</p>
                      </div>
                      <div className="pp-lab-botones">
                        <button type="button" className="pp-icono-btn" onClick={() => setEditando(l.id_laboratorio)} aria-label={`Editar ${l.nombre}`} title="Editar"><IconoLapiz /></button>
                        <button type="button" className="pp-icono-btn peligro" onClick={() => setEliminando(l)} aria-label={`Eliminar ${l.nombre}`} title="Eliminar"><IconoPapelera /></button>
                      </div>
                    </div>
                    <GrillaPuestos capacidad={l.capacidad_equipos ?? CAPACIDAD_MAX} ocupados={Number(l.total_equipos || 0)} chica nombre={l.nombre} />
                    <p className="pp-lab-cuenta">{Number(l.total_equipos || 0)} de {l.capacidad_equipos ?? CAPACIDAD_MAX} computadoras</p>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {eliminando && (
        <EliminarLaboratorio lab={eliminando} onClose={() => setEliminando(null)}
          onEliminado={async (m) => { setEliminando(null); await guardado(m || `${eliminando.nombre} eliminado.`) }} />
      )}

      {labs.length === 0 && <p className="pp-nota">Para cargar computadoras en el paso siguiente vas a necesitar al menos un laboratorio.</p>}
      <Acciones onAtras={onAtras} principal={{ texto: 'Guardar y seguir', onClick: seguir, cargando: siguiendo }} />
    </div>
  )
}
