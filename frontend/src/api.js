const TOKEN_KEY = 'controltech_token'

export const getToken = () => {
  try { return localStorage.getItem(TOKEN_KEY) } catch { return null }
}
export const setToken = (t) => {
  try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY) } catch { /* sin storage */ }
}

export class ApiError extends Error {
  constructor(status, message, detalles) {
    super(message)
    this.status = status
    this.detalles = detalles
  }
}

let onUnauthorized = () => {}
export const setUnauthorizedHandler = (fn) => { onUnauthorized = fn }

export async function api(path, { method = 'GET', body, params } = {}) {
  const qs = params
    ? '?' + new URLSearchParams(Object.entries(params).filter(([, v]) => v !== '' && v != null)).toString()
    : ''
  const headers = { Accept: 'application/json' }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  const token = getToken()
  if (token) headers.Authorization = `Bearer ${token}`

  let res
  try {
    res = await fetch(`/api${path}${qs}`, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined })
  } catch {
    throw new ApiError(0, 'No se pudo conectar con el servidor de ControlTech.')
  }
  const data = await res.json().catch(() => null)
  // 502/503/504 sin cuerpo JSON: el proxy de Vite no llega al backend Express.
  if ([502, 503, 504].includes(res.status) && !data?.error) {
    throw new ApiError(res.status, 'No se pudo conectar con el backend de ControlTech (puerto 4000). Verificá que esté corriendo con "npm start" en la carpeta backend.')
  }
  // Ruta inexistente en el backend: casi siempre es un backend iniciado antes de
  // actualizar el codigo (Node solo carga el codigo al arrancar).
  if (res.status === 404 && (data?.codigo === 'RUTA_NO_ENCONTRADA' || /^Ruta no encontrada/.test(data?.error || ''))) {
    throw new ApiError(404, 'El backend no reconoce esta función: probablemente está corriendo una versión anterior. Reinicialo (Ctrl+C y "npm start" en la carpeta backend) y recargá la página.')
  }
  if (!res.ok) {
    if (res.status === 401 && path !== '/auth/login') onUnauthorized()
    throw new ApiError(res.status, data?.error || `Error ${res.status}`, data?.detalles)
  }
  return data
}
