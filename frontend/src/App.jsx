import { useEffect, useState } from 'react'
import { useAuth } from './AuthContext.jsx'
import Login from './pages/Login.jsx'
import Inicio from './pages/Inicio.jsx'
import Laboratorios from './pages/Laboratorios.jsx'
import Equipos from './pages/Equipos.jsx'
import Mantenimientos from './pages/Mantenimientos.jsx'
import Usuarios from './pages/Usuarios.jsx'
import { Cargando } from './components/ui.jsx'

// Navegacion principal. "Mantenimientos" reemplaza a las antiguas secciones separadas
// de equipos con problemas y mantenimientos.
const SECCIONES = [
  { id: 'inicio', titulo: 'Inicio', componente: Inicio },
  { id: 'laboratorios', titulo: 'Laboratorios', componente: Laboratorios },
  { id: 'equipos', titulo: 'Equipos', componente: Equipos },
  { id: 'mantenimientos', titulo: 'Mantenimientos', componente: Mantenimientos },
  { id: 'usuarios', titulo: 'Usuarios', componente: Usuarios, soloAdmin: true },
]

const leerHash = () => window.location.hash.replace(/^#\/?/, '') || 'inicio'

export default function App() {
  const { usuario, cargando, logout, esAdmin } = useAuth()
  const [ruta, setRuta] = useState(leerHash)
  const [menuAbierto, setMenuAbierto] = useState(false)

  useEffect(() => {
    const onHash = () => { setRuta(leerHash()); setMenuAbierto(false) }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  if (cargando) return <Cargando texto="Verificando sesión…" />
  if (!usuario) return <Login />

  const visibles = SECCIONES.filter((s) => !s.soloAdmin || esAdmin)
  const actual = visibles.find((s) => s.id === ruta.split(/[?/]/)[0]) || visibles[0]
  const Pagina = actual.componente

  return (
    <div className="layout">
      <aside className={`sidebar ${menuAbierto ? 'abierta' : ''}`}>
        <div className="marca">
          <span className="marca-logo" aria-hidden="true">CT</span>
          <span>ControlTech</span>
        </div>
        <nav aria-label="Secciones">
          {visibles.map((s) => (
            <a key={s.id} href={`#/${s.id}`} className={s.id === actual.id ? 'activo' : ''} aria-current={s.id === actual.id ? 'page' : undefined}>
              {s.titulo}
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
        </header>
        <main>
          <Pagina key={actual.id} />
        </main>
      </div>
    </div>
  )
}
