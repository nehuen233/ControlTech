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
  if (!res.ok) {
    if (res.status === 401 && path !== '/auth/login') onUnauthorized()
    throw new ApiError(res.status, data?.error || `Error ${res.status}`, data?.detalles)
  }
  return data
}
