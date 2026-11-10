// Paso 5 (opcional): el software instalado. Se elige de una lista de programas habituales en
// colegios (o se escriben otros) y en qué laboratorios están; se instala en todas sus
// computadoras con los endpoints de /laboratorios/:id/software.
import { useCallback, useEffect, useState } from 'react'
import { api } from '../../api.js'
import { Alerta } from '../../components/ui.jsx'
import EncabezadoPaso from './Encabezado.jsx'
import Acciones from './Acciones.jsx'
import { IconoCheck, IconoCerrar, IconoMas } from './iconos.jsx'

const HABITUALES = [
  { nombre_software: 'Google Chrome', proveedor: 'Google', licencia: 'Gratuita', para: 'Navegador' },
  { nombre_software: 'Mozilla Firefox', proveedor: 'Mozilla', licencia: 'Gratuita', para: 'Navegador' },
  { nombre_software: 'Microsoft Office', proveedor: 'Microsoft', licencia: 'Pago', para: 'Documentos y planillas' },
  { nombre_software: 'LibreOffice', proveedor: 'The Document Foundation', licencia: 'Gratuita', para: 'Documentos y planillas' },
  { nombre_software: 'Visual Studio Code', proveedor: 'Microsoft', licencia: 'Gratuita', para: 'Programación' },
  { nombre_software: 'Python', proveedor: 'Python Software Foundation', licencia: 'Gratuita', para: 'Programación' },
  { nombre_software: 'Scratch', proveedor: 'MIT', licencia: 'Gratuita', para: 'Programación por bloques' },
  { nombre_software: 'GeoGebra', proveedor: 'GeoGebra', licencia: 'Gratuita', para: 'Matemática' },
  { nombre_software: 'Adobe Acrobat Reader', proveedor: 'Adobe', licencia: 'Gratuita', para: 'Leer PDF' },
  { nombre_software: 'VLC', proveedor: 'VideoLAN', licencia: 'Gratuita', para: 'Audio y video' },
]
const igual = (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase()

export default function PasoSoftware({ datos, recargar, titulo, numero, onAtras, onSiguiente, irA }) {
  const labsConPc = datos.laboratorios.filter((l) => Number(l.total_equipos || 0) > 0)
  const [elegidos, setElegidos] = useState([])
  const [otro, setOtro] = useState('')
  const [labsSel, setLabsSel] = useState(() => labsConPc.map((l) => l.id_laboratorio))
  const [instalado, setInstalado] = useState({})
  const [resultado, setResultado] = useState(null)
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)

  const laboratorios = datos.laboratorios
  const cargarInstalado = useCallback(async () => {
    try {
      const conPc = laboratorios.filter((l) => Number(l.total_equipos || 0) > 0)
      const pares = await Promise.all(conPc.map(async (l) => [l.id_laboratorio, await api(`/laboratorios/${l.id_laboratorio}/software`)]))
      setInstalado(Object.fromEntries(pares))
    } catch (e) { setError(e.message) }
  }, [laboratorios])
  useEffect(() => { cargarInstalado() }, [cargarInstalado])

  const estaElegido = (n) => elegidos.some((e) => igual(e.nombre_software, n))
  const alternar = (p) => setElegidos((v) => (estaElegido(p.nombre_software) ? v.filter((e) => !igual(e.nombre_software, p.nombre_software)) : [...v, p]))
  const sumarOtro = (ev) => {
    ev.preventDefault()
    const n = otro.trim()
    if (!n) return
    if (!estaElegido(n)) setElegidos((v) => [...v, HABITUALES.find((h) => igual(h.nombre_software, n)) || { nombre_software: n.slice(0, 100) }])
    setOtro('')
  }
  const toggleLab = (id) => setLabsSel((v) => (v.includes(id) ? v.filter((x) => x !== id) : [...v, id]))

  // Instala cada programa elegido en todas las computadoras de cada laboratorio elegido.
  const instalar = async () => {
    setError(''); setResultado(null)
    if (!elegidos.length) return true
    if (!labsSel.length) { setError('Marcá al menos un laboratorio.'); return false }
    setEnviando(true)
    const catalogo = new Map(datos.software.map((s) => [s.nombre_software.toLowerCase(), s.id_software]))
    const res = []
    for (const p of elegidos) {
      let id = catalogo.get(p.nombre_software.toLowerCase())
      let ok = 0
      let fallo = ''
      for (const idLab of labsSel) {
        try {
          if (id) {
            await api(`/laboratorios/${idLab}/software`, { method: 'POST', body: { id_software: id, equipos: 'todos' } })
          } else {
            const r = await api(`/laboratorios/${idLab}/software`, {
              method: 'POST',
              body: {
                software: { nombre_software: p.nombre_software, ...(p.proveedor ? { proveedor: p.proveedor } : {}) },
                ...(p.licencia ? { licencia: { tipo_licencia: p.licencia } } : {}),
                equipos: 'todos',
              },
            })
            id = r.id_software
            catalogo.set(p.nombre_software.toLowerCase(), id)
          }
          ok += 1
        } catch (e) {
          if (e.status === 409 && /ya estaba instalado/.test(e.message)) ok += 1
          else fallo = e.message
        }
      }
      res.push({ nombre: p.nombre_software, ok, fallo })
    }
    setResultado(res)
    const fallidos = res.filter((r) => r.fallo)
    setElegidos((v) => v.filter((p) => fallidos.some((f) => f.nombre === p.nombre_software)))
    await recargar()
    await cargarInstalado()
    setEnviando(false)
    return fallidos.length === 0
  }

  const seguir = async () => { if (await instalar()) onSiguiente() }

  if (!labsConPc.length) {
    return (
      <div className="pp-paso-form">
        <EncabezadoPaso numero={numero} titulo="Software" refTitulo={titulo} opcional>
          Acá vas a indicar qué programas tienen instaladas las computadoras.
        </EncabezadoPaso>
        <div className="pp-vacio pp-vacio-accion">
          <p>Para cargar software primero tiene que haber computadoras en algún laboratorio.</p>
          <button type="button" className="btn btn-primario" onClick={() => irA('computadoras')}>Ir a Computadoras</button>
        </div>
        <Acciones onAtras={onAtras} principal={{ texto: 'Lo hago después', onClick: onSiguiente }} />
      </div>
    )
  }

  return (
    <div className="pp-paso-form">
      <EncabezadoPaso numero={numero} titulo="Software" refTitulo={titulo} opcional>
        Marcá los programas que tienen las computadoras y en qué laboratorios. Se cargan en todas sus computadoras; después podés ajustar cada una.
      </EncabezadoPaso>

      <section className="pp-bloque" aria-labelledby="sw-programas">
        <h2 id="sw-programas">Programas</h2>
        <div className="pp-programas" role="group" aria-labelledby="sw-programas">
          {HABITUALES.map((p) => {
            const sel = estaElegido(p.nombre_software)
            return (
              <button key={p.nombre_software} type="button" className={`pp-programa ${sel ? 'es-sel' : ''}`} aria-pressed={sel} onClick={() => alternar(p)}>
                <span className="pp-programa-marca" aria-hidden="true">{sel ? <IconoCheck width={14} height={14} /> : null}</span>
                <span><strong>{p.nombre_software}</strong><span>{p.para}</span></span>
              </button>
            )
          })}
        </div>
        <form className="pp-otro" onSubmit={sumarOtro}>
          <label className="pp-campo" htmlFor="sw-otro"><span className="pp-campo-etiqueta">¿Otro programa?</span>
            <input id="sw-otro" value={otro} onChange={(ev) => setOtro(ev.target.value)} maxLength={100} placeholder="Ej.: Arduino IDE" /></label>
          <button className="btn btn-secundario btn-icono" disabled={!otro.trim()}><IconoMas /> Agregar</button>
        </form>
        {elegidos.some((e) => !HABITUALES.some((h) => igual(h.nombre_software, e.nombre_software))) && (
          <ul className="pp-chips" aria-label="Otros programas elegidos">
            {elegidos.filter((e) => !HABITUALES.some((h) => igual(h.nombre_software, e.nombre_software))).map((e) => (
              <li key={e.nombre_software}>{e.nombre_software}
                <button type="button" className="pp-chip-quitar" onClick={() => alternar(e)} aria-label={`Quitar ${e.nombre_software}`}><IconoCerrar width={14} height={14} /></button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="pp-bloque" aria-labelledby="sw-labs">
        <h2 id="sw-labs">En qué laboratorios</h2>
        <div className="pp-checks">
          {labsConPc.map((l) => (
            <label key={l.id_laboratorio} className="check">
              <input type="checkbox" checked={labsSel.includes(l.id_laboratorio)} onChange={() => toggleLab(l.id_laboratorio)} /> {l.nombre} <span className="pp-nota">({l.total_equipos} computadoras)</span>
            </label>
          ))}
        </div>
      </section>

      <div aria-live="polite">
        <Alerta>{error}</Alerta>
        {resultado && (
          <ul className="pp-resultados">
            {resultado.map((r) => (
              <li key={r.nombre} className={r.fallo ? 'con-error' : ''}>
                {r.fallo ? <><strong>{r.nombre}</strong>: {r.fallo}</> : <><strong>{r.nombre}</strong> quedó cargado en {r.ok} laboratorio(s).</>}
              </li>
            ))}
          </ul>
        )}
      </div>

      {elegidos.length > 0 && (
        <div className="pp-guardar-filas">
          <button type="button" className="btn btn-primario" onClick={instalar} disabled={enviando}>
            {enviando ? 'Cargando…' : `Cargar ${elegidos.length} programa(s) en ${labsSel.length} laboratorio(s)`}
          </button>
        </div>
      )}

      <section className="pp-bloque" aria-labelledby="sw-hoy">
        <h2 id="sw-hoy">Lo que ya está cargado</h2>
        <ul className="pp-instalado">
          {labsConPc.map((l) => (
            <li key={l.id_laboratorio}>
              <strong>{l.nombre}</strong>
              <span>{instalado[l.id_laboratorio]?.length ? instalado[l.id_laboratorio].map((s) => s.nombre_software).join(', ') : 'Todavía nada.'}</span>
            </li>
          ))}
        </ul>
      </section>

      <Acciones onAtras={onAtras}
        principal={{ texto: elegidos.length ? 'Cargar y seguir' : datos.software.length ? 'Seguir' : 'Lo hago después', onClick: seguir, cargando: enviando }} />
    </div>
  )
}
