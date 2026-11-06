// Nombres de rol tal como estan registrados en la tabla `roles`.
const ROLES = Object.freeze({
  ADMIN: 'ADMINISTRADOR',
  ENCARGADO: 'ENCARGADO',
  DOCENTE: 'DOCENTE',
  DIRECTIVO: 'DIRECTIVO',
  TECNICO: 'TECNICO',
  DOCENTE_LAB: 'DOCENTE DE LABORATORIO',
});

// Unicos roles que el administrador puede asignar a usuarios nuevos o existentes.
// Administrador, Encargado y Directivo nunca se asignan desde el sistema.
const ROLES_ASIGNABLES = Object.freeze([ROLES.DOCENTE, ROLES.DOCENTE_LAB, ROLES.TECNICO]);

// Roles que ven todos los laboratorios.
const ROLES_TODOS_LOS_LABS = Object.freeze([ROLES.ADMIN, ROLES.DIRECTIVO]);
  
// Roles que gestionan mantenimientos (alta, edicion y cambio de estado) en sus laboratorios.
const ROLES_GESTION_MANTENIMIENTO = Object.freeze([
  ROLES.ADMIN, ROLES.TECNICO, ROLES.ENCARGADO, ROLES.DOCENTE_LAB,
]);

// Roles que pueden reportar un problema en un equipo de sus laboratorios.
const ROLES_REPORTE_PROBLEMAS = Object.freeze([...ROLES_GESTION_MANTENIMIENTO, ROLES.DOCENTE]);

const ETIQUETAS = Object.freeze({
  [ROLES.ADMIN]: 'Administrador',
  [ROLES.ENCARGADO]: 'Encargado',
  [ROLES.DOCENTE]: 'Docente',
  [ROLES.DIRECTIVO]: 'Directivo',
  [ROLES.TECNICO]: 'Técnico',
  [ROLES.DOCENTE_LAB]: 'Docente de laboratorio',
});

const etiquetaRol = (nombre) => ETIQUETAS[nombre] || nombre;

// "Docente, Docente de laboratorio o Técnico"
function listaRolesAsignables(conjuncion = 'o') {
  const e = ROLES_ASIGNABLES.map(etiquetaRol);
  return `${e.slice(0, -1).join(', ')} ${conjuncion} ${e[e.length - 1]}`;
}

module.exports = {
  ROLES, ROLES_ASIGNABLES, ROLES_TODOS_LOS_LABS, ROLES_GESTION_MANTENIMIENTO,
  ROLES_REPORTE_PROBLEMAS, etiquetaRol, listaRolesAsignables,
};
