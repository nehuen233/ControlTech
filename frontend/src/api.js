const TOKEN_KEY = 'controltech_token'

// La sesion se guarda por ventana (sessionStorage): asi se puede tener abierta una
// ventana con el administrador y otra con otro usuario en el mismo navegador.
// Una sesion anterior guardada en localStorage se pasa a esta ventana una sola vez.
export const getToken = () => {
  try {
    const t = sessionStorage.getItem(TOKEN_KEY)
    if (t) return t
    const viejo = localStorage.getItem(TOKEN_KEY)
    if (viejo) {
      sessionStorage.setItem(TOKEN_KEY, viejo)
      localStorage.removeItem(TOKEN_KEY)
    }
    return viejo
  } catch { return null }
}
export const setToken = (t) => {
  try { t ? sessionStorage.setItem(TOKEN_KEY, t) : sessionStorage.removeItem(TOKEN_KEY) } catch { /* sin storage */ }
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
    if (res.status === 401 && path !== '/auth/login') onUnauthorized(data?.error)
    throw new ApiError(res.status, data?.error || `Error ${res.status}`, data?.detalles)
  }
  return data
}

// Eventos en tiempo real del servidor (Server-Sent Events) con la sesion de esta ventana.
// Se usa fetch (y no EventSource) para enviar el token en el encabezado. Reconecta solo.
// onEvento(nombre, datos) recibe: 'conectado', 'alerta', 'alerta-resuelta', 'sesion'.
export function suscribirEventos(onEvento, onEstado = () => {}) {
  let activo = true
  let controlador = null
  let espera = 1000
  const conectar = async () => {
    while (activo) {
      controlador = new AbortController()
      try {
        const res = await fetch('/api/alertas/stream', {
          headers: { Accept: 'text/event-stream', Authorization: `Bearer ${getToken()}` },
          signal: controlador.signal,
        })
        if (res.status === 401) {
          const d = await res.json().catch(() => null)
          onUnauthorized(d?.error)
          return
        }
        if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`)
        onEstado(true)
        espera = 1000
        const lector = res.body.pipeThrough(new TextDecoderStream()).getReader()
        let buffer = ''
        for (;;) {
          const { value, done } = await lector.read()
          if (done) break
          buffer += value
          let fin
          while ((fin = buffer.indexOf('\n\n')) >= 0) {
            const bloque = buffer.slice(0, fin)
            buffer = buffer.slice(fin + 2)
            let nombre = 'message'
            const datos = []
            for (const linea of bloque.split('\n')) {
              if (linea.startsWith('event:')) nombre = linea.slice(6).trim()
              else if (linea.startsWith('data:')) datos.push(linea.slice(5).trim())
            }
            if (datos.length) {
              try { onEvento(nombre, JSON.parse(datos.join('\n'))) } catch { /* evento mal formado */ }
            }
          }
        }
      } catch {
        if (!activo) return
      }
      onEstado(false)
      if (!activo) return
      await new Promise((r) => setTimeout(r, espera))
      espera = Math.min(espera * 2, 15000)
    }
  }
  conectar()
  return () => { activo = false; controlador?.abort() }
}
