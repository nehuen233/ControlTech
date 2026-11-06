// Capacidad de los laboratorios: entre CAPACIDAD_MIN y CAPACIDAD_MAX computadoras.
const CAPACIDAD_MIN = 15;
const CAPACIDAD_MAX = 30;

const MENSAJE_RANGO = `La capacidad del laboratorio debe ser un número entero entre ${CAPACIDAD_MIN} y ${CAPACIDAD_MAX} equipos.`;

// Laboratorios antiguos sin capacidad cargada: se aplica el maximo permitido.
const capacidadEfectiva = (c) => (c == null ? CAPACIDAD_MAX : Number(c));

const capacidadValida = (c) => Number.isInteger(c) && c >= CAPACIDAD_MIN && c <= CAPACIDAD_MAX;

module.exports = { CAPACIDAD_MIN, CAPACIDAD_MAX, MENSAJE_RANGO, capacidadEfectiva, capacidadValida };
