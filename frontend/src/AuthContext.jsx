import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { api, getToken, setToken, setUnauthorizedHandler } from './api.js'
import { olvidarDespues } from './pages/PrimerosPasos/progreso.js'

const AuthContext = createContext(null)

export const ROLES = {
  ADMIN: 'ADMINISTRADOR',
  DOCENTE: 'DOCENTE',
  DOCENTE_LAB: 'DOCENTE DE LABORATORIO',
  TECNICO: 'TECNICO',
  ENCARGADO: 'ENCARGADO',
  DIRECTIVO: 'DIRECTIVO',
  SUPERADMIN: 'SUPERADMIN',
}
// Coinciden con los permisos que valida el backend.
export const ROLES_GESTION = [ROLES.ADMIN, ROLES.TECNICO, ROLES.ENCARGADO, ROLES.DOCENTE_LAB]
export const ROLES_REPORTE = [...ROLES_GESTION, ROLES.DOCENTE]

export function AuthProvider({ children }) {
  const [usuario, setUsuario] = useState(null)
  // Institucion del usuario: { id, nombre, logo_url, estado, configurada } (null para el SUPERADMIN).
  const [institucion, setInstitucion] = useState(null)
  const [cargando, setCargando] = useState(Boolean(getToken()))
  // Motivo del ultimo cierre de sesion forzado (cuenta bloqueada o eliminada, sesion vencida).
  const [aviso, setAviso] = useState('')

  const logout = useCallback((motivo) => {
    setToken(null)
    setUsuario(null)
    setInstitucion(null)
    setAviso(typeof motivo === 'string' ? motivo : '')
  }, [])

  useEffect(() => {
    setUnauthorizedHandler(logout)
    if (!getToken()) return
    api('/auth/me')
      .then((d) => { setUsuario(d.usuario); setInstitucion(d.institucion || null) })
      .catch(() => logout())
      .finally(() => setCargando(false))
  }, [logout])

  const login = async (email, contrasena) => {
    const d = await api('/auth/login', { method: 'POST', body: { email, contrasena } })
    setToken(d.token)
    // Cada inicio de sesión vuelve a mostrar el asistente de configuración si falta.
    olvidarDespues()
    setAviso('')
    setUsuario(d.usuario)
    setInstitucion(d.institucion || null)
  }

  const value = {
    usuario,
    cargando,
    login,
    logout,
    aviso,
    institucion,
    // Tras editar la institucion (nombre, configuracion inicial) se actualiza la barra lateral.
    actualizarInstitucion: (i) => setInstitucion((prev) => ({ ...prev, ...i })),
    esAdmin: usuario?.rol === ROLES.ADMIN,
    esSuperadmin: usuario?.rol === ROLES.SUPERADMIN,
    puedeGestionar: ROLES_GESTION.includes(usuario?.rol),
    puedeReportar: ROLES_REPORTE.includes(usuario?.rol),
  }
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => useContext(AuthContext)
