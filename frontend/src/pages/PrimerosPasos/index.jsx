// Asistente "Primeros pasos": la configuración inicial de un colegio recién dado de alta.
// Pantalla completa, sin la barra lateral. El progreso sale de los datos reales del servidor
// (progreso.js); cada paso guarda en el servidor al avanzar y "Atrás" no borra nada.
import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '../../AuthContext.jsx'
import { api } from '../../api.js'
import { Alerta } from '../../components/ui.jsx'
import { PASOS, PASOS_TAREA, RUTA, cargarDatos, estadoPasos, contarHechos, pasoParaRetomar, marcarDespues, olvidarDespues } from './progreso.js'
import { IconoCheck } from './iconos.jsx'
import PasoInstitucion from './PasoInstitucion.jsx'
import PasoLaboratorios from './PasoLaboratorios.jsx'
import PasoComputadoras from './PasoComputadoras.jsx'
import PasoEquipo from './PasoEquipo.jsx'
import PasoSoftware from './PasoSoftware.jsx'
import PasoResumen from './PasoResumen.jsx'
import './primeros-pasos.css'

const COMPONENTES = {
  institucion: PasoInstitucion,
  laboratorios: PasoLaboratorios,
  computadoras: PasoComputadoras,
  equipo: PasoEquipo,
  software: PasoSoftware,
  resumen: PasoResumen,
}

// Paso pedido en la ruta: #/primeros-pasos/laboratorios
const pasoDeRuta = () => {
  const id = window.location.hash.replace(/^#\/?/, '').split('/')[1]
  const i = PASOS.findIndex((p) => p.id === id)
  return i === -1 ? null : i
}
const irA = (i) => { window.location.hash = `#/${RUTA}/${PASOS[i].id}` }

export default function PrimerosPasos() {
  const { usuario, institucion, actualizarInstitucion } = useAuth()
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState('')
  const [paso, setPaso] = useState(pasoDeRuta)
  const [listo, setListo] = useState(false)
  const titulo = useRef(null)
  const primeraVez = useRef(true)

  const recargar = useCallback(async () => {
    try {
      const d = await cargarDatos()
      setDatos(d)
      setError('')
      return d
    } catch (e) {
      setError(e.message)
      return null
    }
  }, [])

  // Primera carga: si la ruta no indica un paso, se retoma el primero sin hacer.
  useEffect(() => {
    recargar().then((d) => {
      if (d && pasoDeRuta() === null) irA(pasoParaRetomar(estadoPasos(d)))
    })
  }, [recargar])

  useEffect(() => {
    const onHash = () => setPaso(pasoDeRuta())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  // Al cambiar de paso, el foco va al título (lectores de pantalla y teclado) y la página arriba.
  useEffect(() => {
    if (paso === null) return
    window.scrollTo({ top: 0 })
    if (primeraVez.current) { primeraVez.current = false; return }
    titulo.current?.focus()
  }, [paso])

  const terminarMasTarde = () => {
    marcarDespues(usuario.id)
    window.location.hash = '#/inicio'
  }

  const finalizar = async () => {
    const i = await api('/institucion/configurada', { method: 'PATCH', body: { configurada: true } })
    actualizarInstitucion({ nombre: i.nombre, logo_url: i.logo_url, configurada: i.configurada })
    olvidarDespues()
    setListo(true)
  }

  const nombreColegio = datos?.institucion.nombre || institucion?.nombre

  if (listo) return <Listo nombre={nombreColegio} />

  const estado = datos ? estadoPasos(datos) : {}
  const hechos = contarHechos(estado)
  const i = paso ?? 0
  const actual = PASOS[i]
  const Paso = COMPONENTES[actual.id]

  return (
    <div className="pp">
      <header className="pp-cabecera">
        <div className="pp-marca">
          <span className="marca-logo" aria-hidden="true">CT</span>
          <span className="pp-marca-textos">
            <strong>ControlTech</strong>
            <span>{nombreColegio}</span>
          </span>
        </div>
        <button type="button" className="btn btn-secundario" onClick={terminarMasTarde}>Terminar más tarde</button>
      </header>

      <div className="pp-cuerpo">
        <nav className="pp-pasos" aria-label="Pasos de la configuración">
          <p className="pp-pasos-titulo">Primeros pasos</p>
          <ol>
            {PASOS.map((p, n) => {
              const hecho = Boolean(estado[p.id])
              const esActual = n === i
              return (
                <li key={p.id}>
                  <a href={`#/${RUTA}/${p.id}`} className={`pp-paso ${esActual ? 'es-actual' : ''} ${hecho ? 'es-hecho' : ''}`}
                    aria-current={esActual ? 'step' : undefined}>
                    <span className="pp-paso-marca" aria-hidden="true">{hecho && !esActual ? <IconoCheck width={14} height={14} /> : n + 1}</span>
                    <span className="pp-paso-texto">
                      {p.titulo}
                      <span className="pp-paso-estado">{esActual ? 'Estás acá' : hecho ? 'Hecho' : p.opcional ? 'Opcional' : 'Pendiente'}</span>
                    </span>
                  </a>
                </li>
              )
            })}
          </ol>
          <p className="pp-pasos-pie">Podés volver a cualquier paso cuando quieras. Lo que cargás se guarda al avanzar.</p>
        </nav>

        <main className="pp-principal">
          <div className="pp-movil" aria-hidden="true">
            <span>Paso {i + 1} de {PASOS.length}</span>
            <span>{hechos} de {PASOS_TAREA.length} hechos</span>
          </div>
          <div className="pp-movil-barra" role="progressbar" aria-label="Progreso de la configuración"
            aria-valuemin={0} aria-valuemax={PASOS.length} aria-valuenow={i + 1} aria-valuetext={`Paso ${i + 1} de ${PASOS.length}: ${actual.titulo}`}>
            <span style={{ width: `${((i + 1) / PASOS.length) * 100}%` }} />
          </div>

          <div className="pp-contenido">
            {error && !datos ? (
              <div className="pp-estado">
                <Alerta>{error}</Alerta>
                <button type="button" className="btn btn-secundario" onClick={recargar}>Reintentar</button>
              </div>
            ) : !datos ? (
              <p className="pp-estado texto-suave" role="status">Cargando los datos de tu colegio…</p>
            ) : (
              <Paso
                key={actual.id}
                datos={datos}
                estado={estado}
                recargar={recargar}
                titulo={titulo}
                numero={i + 1}
                onAtras={i > 0 ? () => irA(i - 1) : null}
                onSiguiente={() => irA(Math.min(i + 1, PASOS.length - 1))}
                irA={(id) => irA(PASOS.findIndex((p) => p.id === id))}
                finalizar={finalizar}
              />
            )}
          </div>
        </main>
      </div>
    </div>
  )
}

function Listo({ nombre }) {
  const ref = useRef(null)
  useEffect(() => { ref.current?.focus() }, [])
  const accesos = [
    { href: '#/laboratorios', titulo: 'Laboratorios', texto: 'Mirá cada laboratorio con sus computadoras y su software.' },
    { href: '#/equipos', titulo: 'Equipos', texto: 'Buscá una computadora, mirá su ficha o avisá un problema.' },
    { href: '#/usuarios', titulo: 'Usuarios', texto: 'Sumá docentes y técnicos, y asignales sus laboratorios.' },
  ]
  return (
    <div className="pp pp-final">
      <main className="pp-final-in">
        <span className="pp-final-sello" aria-hidden="true"><IconoCheck width={34} height={34} /></span>
        <h1 ref={ref} tabIndex={-1}>¡Listo! {nombre} ya está configurado.</h1>
        <p className="pp-bajada">Desde ahora tu equipo puede usar ControlTech. Todo lo que cargaste se puede cambiar cuando quieras.</p>
        <ul className="pp-accesos">
          {accesos.map((a) => (
            <li key={a.href}>
              <a href={a.href}>
                <strong>{a.titulo}</strong>
                <span>{a.texto}</span>
              </a>
            </li>
          ))}
        </ul>
        <a className="btn btn-primario" href="#/inicio">Ir al inicio</a>
      </main>
    </div>
  )
}
