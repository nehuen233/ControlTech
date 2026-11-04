const { HttpError } = require('./httpError');

const ESTADOS_EQUIPO = ['Operativo', 'Disponible', 'En uso', 'En mantenimiento', 'Fuera de servicio'];
const ESTADOS_PROBLEMA_EQUIPO = ['En mantenimiento', 'Fuera de servicio'];
const TIPOS_MANTENIMIENTO = ['Preventivo', 'Correctivo', 'Actualizacion'];
const ESTADOS_MANTENIMIENTO = ['Pendiente', 'En proceso', 'Completado'];
const SEVERIDADES = ['Baja', 'Media', 'Alta', 'Critica'];

const texto = (v) => (typeof v === 'string' ? v.trim() : '');

function enteroPositivo(valor, campo) {
  const n = Number(valor);
  if (!Number.isInteger(n) || n <= 0) throw new HttpError(400, `${campo} no es válido.`);
  return n;
}

function fechaValida(valor) {
  if (typeof valor !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false;
  const d = new Date(`${valor}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === valor;
}

function enumOpcional(valor, permitidos, campo) {
  if (valor === undefined || valor === null || valor === '') return null;
  if (!permitidos.includes(valor)) {
    throw new HttpError(400, `${campo} debe ser uno de: ${permitidos.join(', ')}.`);
  }
  return valor;
}

module.exports = {
  ESTADOS_EQUIPO, ESTADOS_PROBLEMA_EQUIPO, TIPOS_MANTENIMIENTO, ESTADOS_MANTENIMIENTO, SEVERIDADES,
  texto, enteroPositivo, fechaValida, enumOpcional,
};
