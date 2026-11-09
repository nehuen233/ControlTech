// Paso 3: las computadoras de cada laboratorio. Dos formas de cargarlas:
//   - Generar en serie: prefijo + numeración, con los datos comunes (marca, modelo…).
//   - Pegar desde una planilla (Excel / Google Sheets): filas separadas por tabulaciones.
// Ambas llenan la misma tabla editable; se guardan todas juntas con POST /equipos/lote, que
// devuelve los errores por fila para marcarlos acá.
import { Fragment, useMemo, useRef, useState } from 'react'
import { api } from '../../api.js'
import { Alerta } from '../../components/ui.jsx'
import { CAPACIDAD_MAX } from '../Laboratorios.jsx'
import EncabezadoPaso from './Encabezado.jsx'
import Acciones from './Acciones.jsx'
import GrillaPuestos, { LeyendaPuestos } from './GrillaPuestos.jsx'
import { IconoCerrar } from './iconos.jsx'

const COLUMNAS = [
  { id: 'identificador', titulo: 'Identificador', obligatorio: true, pistas: ['identificador', 'id', 'nombre', 'pc', 'equipo', 'computadora', 'codigo', 'código'] },
  { id: 'nro_serie', titulo: 'Número de serie', obligatorio: true, pistas: ['serie', 'nro', 'numero de serie', 'número de serie', 'n/s', 'sn', 'serial'] },
  { id: 'marca', titulo: 'Marca', obligatorio: true, pistas: ['marca', 'fabricante'] },
  { id: 'modelo', titulo: 'Modelo', pistas: ['modelo'] },
  { id: 'procesador', titulo: 'Procesador', pistas: ['procesador', 'cpu'] },
  { id: 'ram', titulo: 'Memoria RAM', pistas: ['ram', 'memoria'] },
  { id: 'almacenamiento', titulo: 'Almacenamiento', pistas: ['almacenamiento', 'disco', 'ssd', 'hdd'] },
]
const EN_TABLA = ['identificador', 'nro_serie', 'marca', 'modelo']
const capacidadDe = (l) => Number(l.capacidad_equipos ?? CAPACIDAD_MAX)
const ocupadosDe = (l) => Number(l.total_equipos || 0)
const prefijoDe = (nombre) => `PC-${nombre.toUpperCase().replace('LABORATORIO', 'LAB').normalize('NFD').replace(/[^A-Z0-9]+/g, '')}`.slice(0, 20)
let siguienteClave = 1
const nuevaFila = (datos) => ({ clave: siguienteClave++, ...Object.fromEntries(COLUMNAS.map((c) => [c.id, ''])), ...datos })

// Errores que se pueden ver antes de enviar: obligatorios y repetidos dentro de la carga.
function validarFilas(filas) {
  const errores = {}
  const vistos = { identificador: new Map(), nro_serie: new Map() }
  filas.forEach((f, i) => {
    const faltan = COLUMNAS.filter((c) => c.obligatorio && !String(f[c.id]).trim()).map((c) => c.titulo.toLowerCase())
    if (faltan.length) { errores[f.clave] = `Falta ${faltan.join(' y ')}.`; return }
    for (const k of ['identificador', 'nro_serie']) {
      const v = String(f[k]).trim().toUpperCase()
      if (vistos[k].has(v)) { errores[f.clave] = `${k === 'identificador' ? 'El identificador' : 'El número de serie'} se repite en la fila ${vistos[k].get(v) + 1}.`; return }
      vistos[k].set(v, i)
    }
  })
  return errores
}

export default function PasoComputadoras({ datos, recargar, titulo, numero, onAtras, onSiguiente, irA }) {
  const labs = datos.laboratorios.filter((l) => l.estado === 'Activo')
  const primeroConLugar = labs.find((l) => ocupadosDe(l) === 0) || labs[0]
  const [idLab, setIdLab] = useState(primeroConLugar?.id_laboratorio ?? null)
  const [modo, setModo] = useState('serie')
  const [filas, setFilas] = useState([])
  const [erroresServidor, setErroresServidor] = useState({})
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')
  const [enviando, setEnviando] = useState(false)
  // Los datos faltantes se marcan recién después de intentar guardar.
  const [intentado, setIntentado] = useState(false)
  const tabla = useRef(null)

  const lab = labs.find((l) => l.id_laboratorio === idLab)
  const libres = lab ? capacidadDe(lab) - ocupadosDe(lab) : 0
  const erroresLocales = useMemo(() => validarFilas(filas), [filas])
  const excedidas = Math.max(0, filas.length - libres)

  const elegirLab = (id) => {
    if (filas.length && !window.confirm('Tenés computadoras sin guardar en este laboratorio. ¿Las descartás?')) return
    setIdLab(id); setFilas([]); setErroresServidor({}); setError(''); setAviso('')
  }

  const agregarFilas = (nuevas) => {
    setFilas((v) => [...v, ...nuevas])
    setIntentado(false)
    setErroresServidor({})
    setError('')
    setTimeout(() => tabla.current?.focus(), 0)
  }
  const editarFila = (clave, k, valor) => {
    setFilas((v) => v.map((f) => (f.clave === clave ? { ...f, [k]: valor } : f)))
    setErroresServidor((v) => ({ ...v, [clave]: undefined }))
  }
  const quitarFila = (clave) => setFilas((v) => v.filter((f) => f.clave !== clave))

  // Devuelve true si no quedó nada pendiente.
  const guardar = async () => {
    if (!filas.length) return true
    setError(''); setAviso('')
    setIntentado(true)
    if (excedidas) { setError(`Hay ${excedidas} computadora(s) de más para la capacidad del ${lab.nombre}. Quitá filas o subí la capacidad en el paso Laboratorios.`); return false }
    if (Object.keys(erroresLocales).length) { setError('Hay filas con datos para completar. Están marcadas en la tabla.'); tabla.current?.focus(); return false }
    setEnviando(true)
    try {
      const equipos = filas.map((f) => Object.fromEntries(COLUMNAS.map((c) => [c.id, String(f[c.id]).trim()]).filter(([, v]) => v)))
      const r = await api('/equipos/lote', { method: 'POST', body: { id_laboratorio: lab.id_laboratorio, equipos } })
      setFilas([])
      setErroresServidor({})
      const d = await recargar()
      setAviso(`Listo: ${r.creados} computadora(s) cargadas en el ${lab.nombre}.`)
      // Siguiente laboratorio todavía vacío, si hay.
      const otro = d?.laboratorios.find((l) => l.estado === 'Activo' && ocupadosDe(l) === 0)
      if (otro) setIdLab(otro.id_laboratorio)
      setEnviando(false)
      return true
    } catch (err) {
      if (Array.isArray(err.detalles)) {
        setErroresServidor(Object.fromEntries(err.detalles.map((d) => [filas[d.fila - 1]?.clave, d.error])))
      }
      setError(err.message)
      setEnviando(false)
      return false
    }
  }

  const seguir = async () => { if (await guardar()) onSiguiente() }

  if (!labs.length) {
    return (
      <div className="pp-paso-form">
        <EncabezadoPaso numero={numero} titulo="Computadoras" refTitulo={titulo}>
          Acá vas a cargar las computadoras de cada laboratorio.
        </EncabezadoPaso>
        <div className="pp-vacio pp-vacio-accion">
          <p>Primero necesitás al menos un laboratorio activo donde ubicar las computadoras.</p>
          <button type="button" className="btn btn-primario" onClick={() => irA('laboratorios')}>Ir a Laboratorios</button>
        </div>
        <Acciones onAtras={onAtras} onSaltar={onSiguiente} textoSaltar="Lo hago después" />
      </div>
    )
  }

  const errorDe = (f) => erroresServidor[f.clave] || (intentado ? erroresLocales[f.clave] : undefined)

  return (
    <div className="pp-paso-form">
      <EncabezadoPaso numero={numero} titulo="Computadoras" refTitulo={titulo}>
        Elegí un laboratorio y cargá sus computadoras: generalas en serie o pegalas desde una planilla. Revisá la tabla y guardalas juntas.
      </EncabezadoPaso>

      <section className="pp-bloque" aria-labelledby="pc-labs">
        <h2 id="pc-labs">Laboratorio</h2>
        <div className="pp-selector-labs" role="radiogroup" aria-labelledby="pc-labs">
          {labs.map((l) => {
            const sel = l.id_laboratorio === idLab
            return (
              <button key={l.id_laboratorio} type="button" role="radio" aria-checked={sel}
                className={`pp-selector-lab ${sel ? 'es-sel' : ''}`} onClick={() => !sel && elegirLab(l.id_laboratorio)}>
                <strong>{l.nombre}</strong>
                <span>{ocupadosDe(l)} de {capacidadDe(l)}</span>
              </button>
            )
          })}
        </div>
        <div className="pp-lab-estado">
          <GrillaPuestos capacidad={capacidadDe(lab)} ocupados={ocupadosDe(lab)} nuevos={filas.length} nombre={lab.nombre} />
          <LeyendaPuestos conNuevos={filas.length > 0} conExcedidos={excedidas > 0} />
          <p className={`pp-lugar ${excedidas ? 'es-excedido' : ''}`} aria-live="polite">
            {excedidas
              ? `Te pasaste por ${excedidas}: en el ${lab.nombre} quedan ${libres} lugares.`
              : libres === 0 ? `El ${lab.nombre} está completo.`
                : `Quedan ${libres - filas.length} lugares libres${filas.length ? ` después de estas ${filas.length}` : ''}.`}
          </p>
        </div>
      </section>

      <p className="pp-aviso-ok" role="status" aria-live="polite">{aviso}</p>

      {libres > 0 && (
        <section className="pp-bloque" aria-labelledby="pc-forma">
          <h2 id="pc-forma">Cómo las cargás</h2>
          <div className="pp-pestanas" role="tablist" aria-labelledby="pc-forma">
            <button type="button" role="tab" id="tab-serie" aria-selected={modo === 'serie'} aria-controls="panel-carga" onClick={() => setModo('serie')}>Generar en serie</button>
            <button type="button" role="tab" id="tab-pegar" aria-selected={modo === 'pegar'} aria-controls="panel-carga" onClick={() => setModo('pegar')}>Pegar desde una planilla</button>
          </div>
          <div id="panel-carga" role="tabpanel" aria-labelledby={modo === 'serie' ? 'tab-serie' : 'tab-pegar'}>
            {modo === 'serie'
              ? <GenerarSerie key={lab.id_laboratorio} lab={lab} disponibles={libres - filas.length} onGenerar={agregarFilas} />
              : <PegarPlanilla key={lab.id_laboratorio} onUsar={agregarFilas} />}
          </div>
        </section>
      )}

      {filas.length > 0 && (
        <section className="pp-bloque" aria-labelledby="pc-tabla" ref={tabla} tabIndex={-1}>
          <div className="pp-bloque-cabecera">
            <h2 id="pc-tabla">Para guardar: {filas.length} computadora(s)</h2>
            <button type="button" className="btn-link peligro" onClick={() => { setFilas([]); setErroresServidor({}); setError('') }}>Descartar todas</button>
          </div>
          <div aria-live="assertive"><Alerta>{error}</Alerta></div>
          <table className="pp-tabla">
            <thead>
              <tr>
                <th scope="col" className="pp-col-num">#</th>
                {EN_TABLA.map((k) => <th key={k} scope="col">{COLUMNAS.find((c) => c.id === k).titulo}</th>)}
                <th scope="col"><span className="pp-oculto">Quitar</span></th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f, i) => {
                const e = errorDe(f)
                return (
                  <Fragment key={f.clave}>
                  <tr className={e ? 'con-error' : ''}>
                    <td className="pp-col-num" data-etiqueta="Fila">{i + 1}</td>
                    {EN_TABLA.map((k) => {
                      const col = COLUMNAS.find((c) => c.id === k)
                      return (
                        <td key={k} data-etiqueta={col.titulo}>
                          <input value={f[k]} onChange={(ev) => editarFila(f.clave, k, ev.target.value)}
                            aria-label={`${col.titulo}, fila ${i + 1}`} aria-invalid={Boolean(e && col.obligatorio && !String(f[k]).trim())}
                            aria-describedby={e ? `fila-error-${f.clave}` : undefined}
                            maxLength={k === 'identificador' ? 50 : k === 'nro_serie' ? 100 : 80}
                            placeholder={col.obligatorio ? 'Obligatorio' : ''} />
                        </td>
                      )
                    })}
                    <td className="pp-col-quitar">
                      <button type="button" className="pp-icono-btn" onClick={() => quitarFila(f.clave)} aria-label={`Quitar fila ${i + 1}`} title="Quitar"><IconoCerrar /></button>
                    </td>
                  </tr>
                  {e && <tr className="pp-fila-error-tr"><td className="pp-fila-error" id={`fila-error-${f.clave}`} colSpan={EN_TABLA.length + 2}>Fila {i + 1}: {e}</td></tr>}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
          <div className="pp-guardar-filas">
            <button type="button" className="btn btn-secundario" onClick={guardar} disabled={enviando || excedidas > 0}>
              {enviando ? 'Guardando…' : `Guardar ${filas.length} computadora(s) en el ${lab.nombre}`}
            </button>
          </div>
        </section>
      )}

      <Acciones onAtras={onAtras}
        principal={{ texto: filas.length ? 'Guardar y seguir' : 'Seguir', onClick: seguir, cargando: enviando }} />
    </div>
  )
}

function GenerarSerie({ lab, disponibles, onGenerar }) {
  const ocupados = ocupadosDe(lab)
  const [f, setF] = useState({
    prefijo: prefijoDe(lab.nombre), desde: String(ocupados + 1), cantidad: String(Math.max(disponibles, 0)), digitos: '2',
    marca: '', modelo: '', procesador: '', ram: '', almacenamiento: '',
  })
  const [error, setError] = useState('')
  const set = (k) => (ev) => setF((v) => ({ ...v, [k]: ev.target.value }))

  const cantidad = Number(f.cantidad)
  const desde = Number(f.desde)
  const digitos = Number(f.digitos)
  const id = (n) => `${f.prefijo.trim()}${f.prefijo.trim() ? '-' : ''}${String(n).padStart(digitos, '0')}`
  const valido = f.prefijo.trim() && Number.isInteger(cantidad) && cantidad >= 1 && Number.isInteger(desde) && desde >= 0

  const generar = (ev) => {
    ev.preventDefault()
    if (!f.prefijo.trim()) return setError('Escribí un prefijo, por ejemplo PC-LAB1.')
    if (!Number.isInteger(cantidad) || cantidad < 1) return setError('Indicá cuántas computadoras querés generar.')
    if (cantidad > disponibles) return setError(`En el ${lab.nombre} quedan ${disponibles} lugares.`)
    setError('')
    const comunes = Object.fromEntries(['marca', 'modelo', 'procesador', 'ram', 'almacenamiento'].map((k) => [k, f[k].trim()]))
    onGenerar(Array.from({ length: cantidad }, (_, i) => nuevaFila({ ...comunes, identificador: id(desde + i).toUpperCase() })))
  }

  return (
    <form className="pp-subform" onSubmit={generar} noValidate>
      <div className="pp-fila pp-fila-3">
        <label className="pp-campo"><span className="pp-campo-etiqueta">Prefijo</span>
          <input value={f.prefijo} onChange={set('prefijo')} maxLength={40} autoCapitalize="characters" /></label>
        <label className="pp-campo"><span className="pp-campo-etiqueta">Empieza en</span>
          <input type="number" inputMode="numeric" min="0" value={f.desde} onChange={set('desde')} /></label>
        <label className="pp-campo"><span className="pp-campo-etiqueta">Cantidad</span>
          <input type="number" inputMode="numeric" min="1" max={disponibles} value={f.cantidad} onChange={set('cantidad')} aria-describedby="serie-cant-ayuda" />
          <span id="serie-cant-ayuda" className="pp-campo-ayuda">Hasta {disponibles}.</span></label>
      </div>
      <p className="pp-vista-ids" aria-live="polite">
        {valido ? <>Se van a llamar <strong>{id(desde).toUpperCase()}</strong>{cantidad > 1 && <> a <strong>{id(desde + cantidad - 1).toUpperCase()}</strong></>}.</> : 'Completá prefijo y cantidad para ver cómo se van a llamar.'}
      </p>
      <fieldset className="pp-fieldset">
        <legend>Datos comunes a todas</legend>
        <div className="pp-fila pp-fila-3">
          <label className="pp-campo"><span className="pp-campo-etiqueta">Marca</span><input value={f.marca} onChange={set('marca')} maxLength={80} placeholder="Ej.: Dell" /></label>
          <label className="pp-campo"><span className="pp-campo-etiqueta">Modelo<span className="pp-opcional"> (opcional)</span></span><input value={f.modelo} onChange={set('modelo')} maxLength={100} /></label>
          <label className="pp-campo"><span className="pp-campo-etiqueta">Procesador<span className="pp-opcional"> (opcional)</span></span><input value={f.procesador} onChange={set('procesador')} maxLength={100} /></label>
          <label className="pp-campo"><span className="pp-campo-etiqueta">Memoria RAM<span className="pp-opcional"> (opcional)</span></span><input value={f.ram} onChange={set('ram')} maxLength={50} placeholder="Ej.: 8 GB" /></label>
          <label className="pp-campo"><span className="pp-campo-etiqueta">Almacenamiento<span className="pp-opcional"> (opcional)</span></span><input value={f.almacenamiento} onChange={set('almacenamiento')} maxLength={100} placeholder="Ej.: 256 GB SSD" /></label>
        </div>
      </fieldset>
      <div aria-live="polite">{error && <p className="pp-campo-error">{error}</p>}</div>
      <div><button className="btn btn-secundario" disabled={disponibles < 1}>Generar {Number.isInteger(cantidad) && cantidad > 0 ? cantidad : ''} fila(s)</button></div>
      <p className="pp-nota">Después completás el número de serie de cada una en la tabla.</p>
    </form>
  )
}

// Interpreta lo pegado: filas por línea, columnas por tabulación (o ; cuando no hay tabs).
function interpretar(texto) {
  const lineas = texto.replace(/\r/g, '').split('\n').filter((l) => l.trim())
  if (!lineas.length) return { filas: [], encabezado: null }
  const sep = lineas[0].includes('\t') ? '\t' : lineas[0].includes(';') ? ';' : '\t'
  const filas = lineas.map((l) => l.split(sep).map((c) => c.trim()))
  const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  const adivinar = (celda) => COLUMNAS.find((c) => c.pistas.some((p) => norm(celda) === norm(p) || norm(celda).includes(norm(p))))?.id || ''
  const guess = filas[0].map(adivinar)
  const esEncabezado = guess.filter(Boolean).length >= 2
  return { filas: esEncabezado ? filas.slice(1) : filas, asignacion: esEncabezado ? guess : COLUMNAS.slice(0, filas[0].length).map((c) => c.id), encabezado: esEncabezado ? filas[0] : null }
}

function PegarPlanilla({ onUsar }) {
  const [texto, setTexto] = useState('')
  const [asignacion, setAsignacion] = useState([])
  const leido = useMemo(() => interpretar(texto), [texto])
  // Al pegar, las columnas se asignan solas (por los títulos o en el orden habitual).
  const cambiarTexto = (t) => { setTexto(t); setAsignacion(interpretar(t).asignacion || []) }
  const columnas = Math.max(0, ...leido.filas.map((f) => f.length))
  const faltan = COLUMNAS.filter((c) => c.obligatorio && !asignacion.includes(c.id))
  const repetidas = asignacion.filter((a, i) => a && asignacion.indexOf(a) !== i)

  const usar = () => {
    onUsar(leido.filas.map((celdas) => nuevaFila(Object.fromEntries(asignacion.map((a, i) => [a, celdas[i] || '']).filter(([a]) => a)))))
    cambiarTexto('')
  }

  return (
    <div className="pp-subform">
      <label className="pp-campo" htmlFor="pegar-texto">
        <span className="pp-campo-etiqueta">Pegá acá las filas</span>
        <textarea id="pegar-texto" rows={5} value={texto} onChange={(ev) => cambiarTexto(ev.target.value)} aria-describedby="pegar-ayuda"
          placeholder={'PC-01\tCN-0001\tDell\tOptiPlex 3090\nPC-02\tCN-0002\tDell\tOptiPlex 3090'} spellCheck={false} />
        <span id="pegar-ayuda" className="pp-campo-ayuda">En Excel o Google Sheets seleccioná las celdas (con o sin la fila de títulos), copiá con Ctrl+C y pegá con Ctrl+V.</span>
      </label>
      {leido.filas.length > 0 && (
        <>
          <p className="pp-nota" aria-live="polite">Se leyeron {leido.filas.length} fila(s){leido.encabezado ? ' (la primera era de títulos y no se cuenta)' : ''}. Indicá qué dato hay en cada columna.</p>
          <div className="pp-vista-previa">
            <table className="pp-tabla pp-tabla-previa">
              <thead>
                <tr>
                  {Array.from({ length: columnas }, (_, i) => (
                    <th key={i} scope="col">
                      <label className="pp-oculto" htmlFor={`col-${i}`}>Dato de la columna {i + 1}</label>
                      <select id={`col-${i}`} value={asignacion[i] || ''} onChange={(ev) => setAsignacion((v) => { const n = [...v]; n[i] = ev.target.value; return n })}>
                        <option value="">No usar</option>
                        {COLUMNAS.map((c) => <option key={c.id} value={c.id}>{c.titulo}</option>)}
                      </select>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {leido.filas.slice(0, 5).map((f, r) => (
                  <tr key={r}>{Array.from({ length: columnas }, (_, i) => <td key={i}>{f[i] || ''}</td>)}</tr>
                ))}
              </tbody>
            </table>
            {leido.filas.length > 5 && <p className="pp-nota">Y {leido.filas.length - 5} fila(s) más.</p>}
          </div>
          <div aria-live="polite">
            {faltan.length > 0 && <p className="pp-campo-error">Falta indicar la columna de {faltan.map((c) => c.titulo.toLowerCase()).join(', ')}.</p>}
            {repetidas.length > 0 && <p className="pp-campo-error">Hay dos columnas con el mismo dato.</p>}
          </div>
          <div><button type="button" className="btn btn-secundario" onClick={usar} disabled={faltan.length > 0 || repetidas.length > 0}>Pasar {leido.filas.length} fila(s) a la tabla</button></div>
        </>
      )}
    </div>
  )
}
