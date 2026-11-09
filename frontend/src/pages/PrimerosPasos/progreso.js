// Progreso del asistente "Primeros pasos". Se deduce SIEMPRE de los datos reales del colegio
// (lo que hay en el servidor), nunca de algo guardado en el navegador: si el administrador
// cierra y vuelve otro dia, el asistente retoma donde corresponde.
import { api } from '../../api.js'

export const PASOS = [
  { id: 'institucion', titulo: 'Tu institución' },
  { id: 'laboratorios', titulo: 'Laboratorios' },
  { id: 'computadoras', titulo: 'Computadoras' },
  { id: 'equipo', titulo: 'Equipo de trabajo', opcional: true },
  { id: 'software', titulo: 'Software', opcional: true },
  { id: 'resumen', titulo: 'Resumen' },
]
// Pasos que se cuentan en "Configuración X de 5" (el resumen no es una tarea).
export const PASOS_TAREA = PASOS.filter((p) => p.id !== 'resumen')

const DATOS_EXTRA = ['cuit', 'direccion', 'localidad', 'provincia', 'email_contacto', 'telefono', 'logo_url']

export async function cargarDatos() {
  const [institucion, laboratorios, usuarios, software] = await Promise.all([
    api('/institucion'), api('/laboratorios'), api('/usuarios'), api('/software'),
  ])
  return { institucion, laboratorios, usuarios, software }
}

export function estadoPasos(d) {
  const computadoras = d.laboratorios.reduce((s, l) => s + Number(l.total_equipos || 0), 0)
  return {
    institucion: DATOS_EXTRA.some((k) => d.institucion[k]),
    laboratorios: d.laboratorios.length > 0,
    computadoras: computadoras > 0,
    equipo: d.usuarios.some((u) => u.nombre_rol !== 'ADMINISTRADOR'),
    software: d.software.length > 0,
  }
}

export const contarHechos = (estado) => PASOS_TAREA.filter((p) => estado[p.id]).length

// Primer paso sin hacer (para retomar); si estan todos, el resumen.
export function pasoParaRetomar(estado) {
  const i = PASOS_TAREA.findIndex((p) => !estado[p.id])
  return i === -1 ? PASOS.length - 1 : i
}

export const totalComputadoras = (labs) => labs.reduce((s, l) => s + Number(l.total_equipos || 0), 0)

export const RUTA = 'primeros-pasos'
const CLAVE_DESPUES = 'ct_primeros_pasos_despues'

// "Terminar más tarde" vale para esta ventana y esta sesión: al volver a iniciar sesión, el
// administrador de un colegio sin configurar vuelve a entrar al asistente.
export const dejadoParaDespues = (idUsuario) => { try { return sessionStorage.getItem(CLAVE_DESPUES) === String(idUsuario) } catch { return false } }
export const olvidarDespues = () => { try { sessionStorage.removeItem(CLAVE_DESPUES) } catch { /* sin storage */ } }
export const marcarDespues = (idUsuario) => { try { sessionStorage.setItem(CLAVE_DESPUES, String(idUsuario)) } catch { /* sin storage */ } }

