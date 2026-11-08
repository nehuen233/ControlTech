// Acceso a datos de un colegio. Reglas (CLAUDE.md):
//  - laboratoriosPermitidos devuelve SIEMPRE una lista de ids de la institucion del usuario.
//  - Un recurso de otra institucion responde 404 (no se revela que existe). Un laboratorio
//    de la misma institucion que el usuario no tiene asignado responde 403.
const { query } = require('../config/db');
const { ROLES_TODOS_LOS_LABS } = require('./roles');
const { HttpError } = require('./httpError');

// Administrador y directivo: todos los laboratorios de su institucion. Resto: los asignados
// en usuario_laboratorio (dentro de su institucion). SUPERADMIN o sin institucion: ninguno.
async function laboratoriosPermitidos(user) {
  if (!user?.idInstitucion) return [];
  const rows = ROLES_TODOS_LOS_LABS.includes(user.rol)
    ? await query('SELECT id_laboratorio FROM laboratorios WHERE id_institucion = ?', [user.idInstitucion])
    : await query(
      `SELECT ul.id_laboratorio FROM usuario_laboratorio ul
         JOIN laboratorios l ON l.id_laboratorio = ul.id_laboratorio
        WHERE ul.id_usuario = ? AND l.id_institucion = ?`,
      [user.id, user.idInstitucion],
    );
  return rows.map((r) => r.id_laboratorio);
}

// Agrega al WHERE la restriccion por laboratorio sobre la columna indicada.
function filtroLaboratorios(labs, columna, where, params) {
  if (!Array.isArray(labs) || labs.length === 0) {
    where.push('1 = 0');
    return;
  }
  where.push(`${columna} IN (?)`);
  params.push(labs);
}

// 404 si el laboratorio no existe o es de otra institucion; 403 si es de la institucion
// pero el usuario no lo tiene asignado.
async function verificarAccesoLaboratorio(user, idLaboratorio, mensaje404 = 'El laboratorio no existe.') {
  const [lab] = await query('SELECT id_laboratorio FROM laboratorios WHERE id_laboratorio = ? AND id_institucion = ?', [idLaboratorio, user.idInstitucion]);
  if (!lab) throw new HttpError(404, mensaje404);
  const labs = await laboratoriosPermitidos(user);
  if (!labs.includes(Number(idLaboratorio))) throw new HttpError(403, 'No tenés acceso a ese laboratorio.');
}

// Obtiene el equipo (de la institucion del usuario) y verifica el acceso a su laboratorio.
async function obtenerEquipoAutorizado(user, idEquipo, conn) {
  const runner = conn ? (sql, p) => conn.query(sql, p).then(([r]) => r) : query;
  const rows = await runner('SELECT * FROM equipos WHERE id_equipo = ? AND id_institucion = ?', [idEquipo, user.idInstitucion]);
  if (!rows.length) throw new HttpError(404, 'El equipo indicado no existe.');
  await verificarAccesoLaboratorio(user, rows[0].id_laboratorio);
  return rows[0];
}

module.exports = {
  laboratoriosPermitidos, filtroLaboratorios, verificarAccesoLaboratorio, obtenerEquipoAutorizado,
};
