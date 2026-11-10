import { useEffect, useState } from 'react'
import { useAuth } from './AuthContext.jsx'
import Login from './pages/Login.jsx'
import Inicio from './pages/Inicio.jsx'
import Laboratorios from './pages/Laboratorios.jsx'
import Equipos from './pages/Equipos.jsx'
import Mantenimientos from './pages/Mantenimientos.jsx'
import Usuarios from './pages/Usuarios.jsx'
import Instituciones from './pages/Instituciones.jsx'
import PrimerosPasos from './pages/PrimerosPasos/index.jsx'
import AvisoProgreso from './components/AvisoProgreso.jsx'
import { RUTA as RUTA_PRIMEROS_PASOS, dejadoParaDespues } from './pages/PrimerosPasos/progreso.js'
import { Cargando } from './components/ui.jsx'
import { Campana, useAlertas } from './components/Alertas.jsx'

// Navegacion principal. "Mantenimientos" reemplaza a las antiguas secciones separadas
// de equipos con problemas y mantenimientos.
const SECCIONES = [
  { id: 'inicio', titulo: 'Inicio', componente: Inicio },
  { id: 'laboratorios', titulo: 'Laboratorios', componente: Laboratorios },
  { id: 'equipos', titulo: 'Equipos', componente: Equipos },
  { id: 'mantenimientos', titulo: 'Mantenimientos', componente: Mantenimientos },
  { id: 'usuarios', titulo: 'Usuarios', componente: Usuarios, soloAdmin: true },
]
// El SUPERADMIN administra la plataforma: solo ve las instituciones, no los datos de un colegio.
const SECCIONES_PLATAFORMA = [
  { id: 'instituciones', titulo: 'Instituciones', componente: Instituciones },
]

const leerHash = () => window.location.hash.replace(/^#\/?/, '') || 'inicio'

export default function App() {
  const { usuario, cargando, logout, esAdmin, esSuperadmin, institucion } = useAuth()
  const { solicitudes } = useAlertas()
  const [ruta, setRuta] = useState(leerHash)
  const [menuAbierto, setMenuAbierto] = useState(false)

  useEffect(() => {
    const onHash = () => { setRuta(leerHash()); setMenuAbierto(false) }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  if (cargando) return <Cargando texto="Verificando sesión…" />
  if (!usuario) return <Login />

  const visibles = esSuperadmin ? SECCIONES_PLATAFORMA : SECCIONES.filter((s) => !s.soloAdmin || esAdmin)
  // Configuración inicial: solo para el ADMINISTRADOR de un colegio sin configurar. Entra
  // directo al asistente, salvo que en esta sesión haya elegido "Terminar más tarde"; en ese
  // caso ve el aviso compacto con su progreso. Los demás roles no ven nada de esto.
  const falteConfigurar = esAdmin && institucion && Number(institucion.configurada) === 0
  const enAsistente = esAdmin && ruta.split('/')[0] === RUTA_PRIMEROS_PASOS
  if (enAsistente || (falteConfigurar && !dejadoParaDespues(usuario.id))) return <PrimerosPasos />
  const actual = visibles.find((s) => s.id === ruta.split(/[?/]/)[0]) || visibles[0]
  const Pagina = actual.componente

  return (
    <div className="layout">
      <aside className={`sidebar ${menuAbierto ? 'abierta' : ''}`}>
        <div className="marca">
          <span className="marca-logo" aria-hidden="true">CT</span>
          <span className="marca-textos">
            <span>ControlTech</span>
            <span className="marca-institucion" title={institucion?.nombre}>{esSuperadmin ? 'Plataforma' : institucion?.nombre}</span>
          </span>
        </div>
        <nav aria-label="Secciones">
          {visibles.map((s) => (
            <a key={s.id} href={`#/${s.id}`} className={s.id === actual.id ? 'activo' : ''} aria-current={s.id === actual.id ? 'page' : undefined}>
              {s.titulo}
              {s.id === 'usuarios' && solicitudes.length > 0 && (
                <span className="contador-nav" title="Solicitudes de cambio de contraseña pendientes" aria-label={`${solicitudes.length} solicitudes de cambio de contraseña pendientes`}>{solicitudes.length}</span>
              )}
            </a>
          ))}
        </nav>
        <div className="sidebar-usuario">
          <strong>{usuario.nombre} {usuario.apellido}</strong>
          <span>{usuario.rolEtiqueta}</span>
          <button type="button" className="btn btn-secundario" onClick={() => { window.location.hash = '#/inicio'; logout() }}>Cerrar sesión</button>
        </div>
      </aside>
      <div className="contenido">
        <header className="topbar">
          <button type="button" className="btn-menu" onClick={() => setMenuAbierto((v) => !v)} aria-label="Abrir menú">☰</button>
          <h1>{actual.titulo}</h1>
          <Campana />
        </header>
        <main>
          {falteConfigurar && <AvisoProgreso />}
          <Pagina key={actual.id} />
        </main>
      </div>
    </div>
  )
}
