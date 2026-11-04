const { query } = require('../config/db');
const { laboratoriosPermitidos, filtroLaboratorios } = require('../utils/acceso');
const { ESTADOS_EQUIPO, enumOpcional, texto } = require('../utils/validacion');

async function laboratorios(req, res) {
  const labs = await laboratoriosPermitidos(req.user);
  const where = [];
  const params = [];
  filtroLaboratorios(labs, 'l.id_laboratorio', where, params);
  const rows = await query(
    `SELECT l.id_laboratorio, l.nombre, l.edificio, l.piso, l.ubicacion, l.estado,
            COUNT(e.id_equipo) AS total_equipos,
            SUM(e.estado IN ('En mantenimiento','Fuera de servicio')) AS equipos_con_problemas
       FROM laboratorios l LEFT JOIN equipos e ON e.id_laboratorio = l.id_laboratorio
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      GROUP BY l.id_laboratorio ORDER BY l.nombre`,
    params,
  );
  res.json(rows.map((r) => ({ ...r, equipos_con_problemas: Number(r.equipos_con_problemas || 0) })));
}

async function equipos(req, res) {
  const labs = await laboratoriosPermitidos(req.user);
  const where = [];
  const params = [];
  filtroLaboratorios(labs, 'e.id_laboratorio', where, params);
  if (req.query.laboratorio) { where.push('e.id_laboratorio = ?'); params.push(Number(req.query.laboratorio)); }
  const estado = enumOpcional(req.query.estado, ESTADOS_EQUIPO, 'El estado');
  if (estado) { where.push('e.estado = ?'); params.push(estado); }
  const q = texto(req.query.q);
  if (q) { where.push('(e.identificador LIKE ? OR e.nro_serie LIKE ? OR e.marca LIKE ? OR e.modelo LIKE ?)'); params.push(...Array(4).fill(`%${q}%`)); }

  const rows = await query(
    `SELECT e.id_equipo, e.identificador, e.nro_serie, e.tipo, e.marca, e.modelo, e.procesador, e.ram,
            e.almacenamiento, e.estado, e.fecha_registro, e.id_laboratorio, l.nombre AS laboratorio,
            CONCAT(u.nombre, ' ', u.apellido) AS responsable
       FROM equipos e
       JOIN laboratorios l ON l.id_laboratorio = e.id_laboratorio
       LEFT JOIN usuarios u ON u.id_usuario = e.id_responsable
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY l.nombre, e.identificador`,
    params,
  );
  res.json(rows);
}

module.exports = { laboratorios, equipos };
