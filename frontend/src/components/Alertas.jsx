import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { api, suscribirEventos } from '../api.js'
import { useAuth, ROLES } from '../AuthContext.jsx'
import { Badge, fecha, fechaHora } from './ui.jsx'

// Alertas de mantenimiento en tiempo real: llegan por eventos del servidor (otra ventana
// reporto un problema o el sistema detecto un mantenimiento vencido) y, como respaldo,
// se vuelven a consultar cada minuto. Tambien recibe el aviso de cuenta bloqueada.
const AlertasContext = createContext(null)
const RESPALDO_MS = 60000
const ORDEN_SEV = { Critica: 0, Alta: 1, Media: 2, Baja: 3 }
const ordenar = (lista) => [...lista].sort((a, b) => (ORDEN_SEV[a.severidad] ?? 9) - (ORDEN_SEV[b.severidad] ?? 9) || String(b.fecha_creacion).localeCompare(String(a.fecha_creacion)))

// Avisa a las paginas abiertas (por ejemplo Mantenimientos) que recarguen sus datos.
const avisarCambio = () => window.dispatchEvent(new CustomEvent('controltech:alertas'))

export function AlertasProvider({ children }) {
  const { usuario, logout, puedeGestionar } = useAuth()
  const recibe = Boolean(usuario) && (puedeGestionar || usuario.rol === ROLES.DIRECTIVO)
  const [alertas, setAlertas] = useState([])
  const [avisos, setAvisos] = useState([])
  const [conectado, setConectado] = useState(false)
  const primeraCarga = useRef(true)

  const cerrarAviso = useCallback((id) => setAvisos((v) => v.filter((x) => x.id !== id)), [])
  const mostrarAviso = useCallback((aviso) => {
    const id = `${Date.now()}-${Math.random()}`
    setAvisos((v) => [...v.slice(-3), { ...aviso, id }])
    setTimeout(() => cerrarAviso(id), 9000)
  }, [cerrarAviso])

  const cargar = useCallback(async () => {
    if (!recibe) return
    try {
      const lista = await api('/alertas', { params: { estado: 'Activa' } })
      setAlertas(ordenar(lista))
      // Al entrar (una sola ventana abierta) se avisan las alertas pendientes.
      if (primeraCarga.current && lista.length) {
        mostrarAviso({ tipo: 'resumen', titulo: `Tenés ${lista.length} alerta(s) de mantenimiento activa(s)`, detalle: 'Revisalas en la campana o en Mantenimientos.' })
      }
      primeraCarga.current = false
    } catch { /* se reintenta en el proximo ciclo */ }
  }, [recibe, mostrarAviso])

  useEffect(() => {
    if (!usuario) { setAlertas([]); primeraCarga.current = true; return undefined }
    cargar()
    const cortar = suscribirEventos((nombre, datos) => {
      if (nombre === 'alerta' && recibe) {
        setAlertas((v) => ordenar([datos, ...v.filter((a) => a.id_alerta !== datos.id_alerta)]))
        mostrarAviso({
          tipo: 'alerta', severidad: datos.severidad,
          titulo: `${datos.equipo} · ${datos.titulo}`,
          detalle: `${datos.laboratorio} · ${datos.origen === 'sistema' ? 'Detectada por el sistema' : `Reportada por ${datos.reportado_por || 'un usuario'}`}`,
        })
        avisarCambio()
      } else if (nombre === 'alerta-resuelta' && recibe) {
        setAlertas((v) => v.filter((a) => a.id_alerta !== datos.id_alerta))
        avisarCambio()
      } else if (nombre === 'sesion') {
        logout(datos.motivo)
      }
    }, setConectado)
    const respaldo = recibe ? setInterval(cargar, RESPALDO_MS) : null
    return () => { cortar(); if (respaldo) clearInterval(respaldo) }
  }, [usuario, recibe, cargar, mostrarAviso, logout])

  // Contador en el titulo de la pestaña, visible aunque la ventana este en segundo plano.
  useEffect(() => {
    document.title = alertas.length && recibe ? `(${alertas.length}) ControlTech` : 'ControlTech'
  }, [alertas.length, recibe])

  const value = useMemo(() => ({ alertas, recibe, conectado, recargar: cargar }), [alertas, recibe, conectado, cargar])
  return (
    <AlertasContext.Provider value={value}>
      {children}
      <div className="avisos" aria-live="polite">
        {avisos.map((a) => (
          <div key={a.id} className={`aviso aviso-${a.severidad || 'info'}`} role="status">
            <div>
              <strong>{a.tipo === 'alerta' ? 'Nueva alerta de mantenimiento' : a.titulo}</strong>
              {a.tipo === 'alerta' && <div>{a.titulo}</div>}
              <div className="texto-suave chico">{a.detalle}</div>
            </div>
            <button type="button" className="btn-link cerrar" aria-label="Cerrar aviso" onClick={() => cerrarAviso(a.id)}>×</button>
          </div>
        ))}
      </div>
    </AlertasContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export const useAlertas = () => useContext(AlertasContext)

export function Campana() {
  const { alertas, recibe, conectado } = useAlertas()
  const { esAdmin } = useAuth()
  const [abierta, setAbierta] = useState(false)
  const [verificando, setVerificando] = useState('')
  const ref = useRef(null)

  useEffect(() => {
    if (!abierta) return undefined
    const fuera = (e) => { if (ref.current && !ref.current.contains(e.target)) setAbierta(false) }
    const esc = (e) => e.key === 'Escape' && setAbierta(false)
    document.addEventListener('mousedown', fuera)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', fuera); document.removeEventListener('keydown', esc) }
  }, [abierta])

  if (!recibe) return null
  const urgentes = alertas.filter((a) => a.severidad === 'Alta' || a.severidad === 'Critica').length

  const verificar = async () => {
    setVerificando('Verificando…')
    try {
      const r = await api('/alertas/verificar', { method: 'POST' })
      setVerificando(r.creadas ? `${r.creadas} alerta(s) nueva(s)` : 'No hay alertas nuevas')
    } catch (e) { setVerificando(e.message) }
  }

  return (
    <div className="campana" ref={ref}>
      <button type="button" className={`btn-campana ${alertas.length ? 'con-alertas' : ''}`} aria-expanded={abierta} aria-haspopup="true"
        aria-label={`Alertas de mantenimiento: ${alertas.length} activas`} onClick={() => setAbierta((v) => !v)}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></svg>
        {alertas.length > 0 && <span className={`contador-campana ${urgentes ? 'urgente' : ''}`}>{alertas.length > 99 ? '99+' : alertas.length}</span>}
      </button>
      {abierta && (
        <div className="panel-alertas" role="dialog" aria-label="Alertas de mantenimiento">
          <header>
            <strong>Alertas de mantenimiento</strong>
            <span className={`estado-conexion ${conectado ? 'ok' : ''}`} title={conectado ? 'Recibiendo alertas en tiempo real' : 'Reconectando; se consulta cada minuto'}>
              {conectado ? 'En vivo' : 'Reconectando'}
            </span>
          </header>
          {alertas.length === 0 ? <p className="vacio">No hay alertas activas.</p> : (
            <ul>
              {alertas.slice(0, 30).map((a) => (
                <li key={a.id_alerta}>
                  <a href={`#/mantenimientos?equipo=${a.id_equipo}`} onClick={() => setAbierta(false)}>
                    <div className="fila-titulo"><strong>{a.equipo}</strong> <Badge value={a.severidad} />{a.vencida && <span className="badge badge-danger">Vencida</span>}</div>
                    <div>{a.titulo}</div>
                    <div className="texto-suave chico">
                      {a.laboratorio} · {a.origen === 'sistema' ? 'Sistema' : (a.reportado_por || 'Reporte')} · {fechaHora(a.fecha_creacion)}
                      {a.fecha_limite ? ` · revisar antes del ${fecha(a.fecha_limite)}` : ''}
                    </div>
                  </a>
                </li>
              ))}
            </ul>
          )}
          <footer>
            <a href="#/mantenimientos" onClick={() => setAbierta(false)}>Ver todo en Mantenimientos</a>
            {esAdmin && <button type="button" className="btn-link" onClick={verificar}>Verificar ahora</button>}
          </footer>
          {verificando && <p className="texto-suave chico centro">{verificando}</p>}
        </div>
      )}
    </div>
  )
}
