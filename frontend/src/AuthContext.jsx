import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { api, getToken, setToken, setUnauthorizedHandler } from './api.js'

const AuthContext = createContext(null)

export const ROLES = {
  ADMIN: 'ADMINISTRADOR',
  DOCENTE: 'DOCENTE',
  DOCENTE_LAB: 'DOCENTE DE LABORATORIO',
  TECNICO: 'TECNICO',
  ENCARGADO: 'ENCARGADO',
  DIRECTIVO: 'DIRECTIVO',
}
// Coinciden con los permisos que valida el backend.
export const ROLES_GESTION = [ROLES.ADMIN, ROLES.TECNICO, ROLES.ENCARGADO, ROLES.DOCENTE_LAB]
export const ROLES_REPORTE = [...ROLES_GESTION, ROLES.DOCENTE]

export function AuthProvider({ children }) {
  const [usuario, setUsuario] = useState(null)
  const [cargando, setCargando] = useState(Boolean(getToken()))
  // Motivo del ultimo cierre de sesion forzado (cuenta bloqueada o eliminada, sesion vencida).
  const [aviso, setAviso] = useState('')

  const logout = useCallback((motivo) => {
    setToken(null)
    setUsuario(null)
    setAviso(typeof motivo === 'string' ? motivo : '')
  }, [])

  useEffect(() => {
    setUnauthorizedHandler(logout)
    if (!getToken()) return
    api('/auth/me')
      .then((d) => setUsuario(d.usuario))
      .catch(() => logout())
      .finally(() => setCargando(false))
  }, [logout])

  const login = async (email, contrasena) => {
    const d = await api('/auth/login', { method: 'POST', body: { email, contrasena } })
    setToken(d.token)
    setAviso('')
    setUsuario(d.usuario)
  }

  const value = {
    usuario,
    cargando,
    login,
    logout,
    aviso,
    esAdmin: usuario?.rol === ROLES.ADMIN,
    puedeGestionar: ROLES_GESTION.includes(usuario?.rol),
    puedeReportar: ROLES_REPORTE.includes(usuario?.rol),
  }
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => useContext(AuthContext)
