const { query } = require('../config/db');
const { ROLES_TODOS_LOS_LABS } = require('./roles');
const { HttpError } = require('./httpError');

// Devuelve null si el usuario ve todos los laboratorios, o la lista de IDs asignados
// en `usuario_laboratorio`.
async function laboratoriosPermitidos(user) {
  if (ROLES_TODOS_LOS_LABS.includes(user.rol)) return null;
  const rows = await query(
    'SELECT id_laboratorio FROM usuario_laboratorio WHERE id_usuario = ?',
    [user.id],
  );
  return rows.map((r) => r.id_laboratorio);
}

// Agrega al WHERE la restriccion por laboratorio sobre la columna indicada.
function filtroLaboratorios(labs, columna, where, params) {
  if (labs === null) return;
  if (labs.length === 0) {
    where.push('1 = 0');
    return;
  }
  where.push(`${columna} IN (?)`);
  params.push(labs);
}

async function verificarAccesoLaboratorio(user, idLaboratorio) {
  const labs = await laboratoriosPermitidos(user);
  if (labs !== null && !labs.includes(Number(idLaboratorio))) {
    throw new HttpError(403, 'No tenés acceso a ese laboratorio.');
  }
}

// Obtiene el equipo y verifica que pertenezca a un laboratorio del usuario.
async function obtenerEquipoAutorizado(user, idEquipo, conn) {
  const runner = conn ? (sql, p) => conn.query(sql, p).then(([r]) => r) : query;
  const rows = await runner('SELECT * FROM equipos WHERE id_equipo = ?', [idEquipo]);
  if (!rows.length) throw new HttpError(404, 'El equipo indicado no existe.');
  await verificarAccesoLaboratorio(user, rows[0].id_laboratorio);
  return rows[0];
}

module.exports = {
  laboratoriosPermitidos, filtroLaboratorios, verificarAccesoLaboratorio, obtenerEquipoAutorizado,
};
