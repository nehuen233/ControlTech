// Laboratorios: listado, detalle, alta y edicion (tabla `laboratorios`).
const { query, withTransaction } = require('../config/db');
const { HttpError } = require('../utils/httpError');
const { ROLES, etiquetaRol } = require('../utils/roles');
const { laboratoriosPermitidos, filtroLaboratorios, verificarAccesoLaboratorio } = require('../utils/acceso');
const { registrarAccion } = require('../utils/historial');
const { texto, enteroPositivo } = require('../utils/validacion');

const ESTADOS_LAB = ['Activo', 'Inactivo'];
const LIMITES = { nombre: 100, edificio: 100, piso: 50, ubicacion: 150, codigo_acceso: 100 };

const esAdmin = (user) => user.rol === ROLES.ADMIN;

// El codigo de acceso fisico solo lo ve el administrador.
function publico(lab, user) {
  const out = {
    ...lab,
    total_equipos: Number(lab.total_equipos || 0),
    equipos_con_problemas: Number(lab.equipos_con_problemas || 0),
  };
  if (!esAdmin(user)) delete out.codigo_acceso;
  return out;
}

const SELECT_LAB = `
  SELECT l.id_laboratorio, l.nombre, l.descripcion, l.edificio, l.piso, l.ubicacion,
         l.capacidad_equipos, l.estado, l.codigo_acceso,
         COUNT(e.id_equipo) AS total_equipos,
         SUM(e.estado IN ('En mantenimiento','Fuera de servicio')) AS equipos_con_problemas
    FROM laboratorios l LEFT JOIN equipos e ON e.id_laboratorio = l.id_laboratorio`;

async function listar(req, res) {
  const labs = await laboratoriosPermitidos(req.user);
  const where = [];
  const params = [];
  filtroLaboratorios(labs, 'l.id_laboratorio', where, params);
  const rows = await query(
    `${SELECT_LAB} ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      GROUP BY l.id_laboratorio ORDER BY l.nombre`,
    params,
  );
  res.json(rows.map((r) => publico(r, req.user)));
}

async function obtener(id) {
  const rows = await query(`${SELECT_LAB} WHERE l.id_laboratorio = ? GROUP BY l.id_laboratorio`, [id]);
  if (!rows.length) throw new HttpError(404, 'El laboratorio no existe.');
  return rows[0];
}

async function detalle(req, res) {
  const id = enteroPositivo(req.params.id, 'El laboratorio');
  const lab = await obtener(id);
  await verificarAccesoLaboratorio(req.user, id);
  const porEstado = await query(
    'SELECT estado, COUNT(*) AS cantidad FROM equipos WHERE id_laboratorio = ? GROUP BY estado ORDER BY estado',
    [id],
  );
  const usuarios = await query(
    `SELECT u.id_usuario, u.nombre, u.apellido, r.nombre_rol
       FROM usuario_laboratorio ul
       JOIN usuarios u ON u.id_usuario = ul.id_usuario
       JOIN roles r ON r.id_rol = u.id_rol
      WHERE ul.id_laboratorio = ?
      ORDER BY FIELD(r.nombre_rol, 'ADMINISTRADOR') DESC, u.apellido, u.nombre`,
    [id],
  );
  const [mant] = await query(
    `SELECT SUM(m.estado <> 'Completado') AS abiertos, COUNT(*) AS total
       FROM mantenimientos m JOIN equipos e ON e.id_equipo = m.id_equipo WHERE e.id_laboratorio = ?`,
    [id],
  );
  res.json({
    ...publico(lab, req.user),
    equipos_por_estado: porEstado.map((r) => ({ estado: r.estado, cantidad: Number(r.cantidad) })),
    usuarios: usuarios.map((u) => ({ ...u, rolEtiqueta: etiquetaRol(u.nombre_rol) })),
    mantenimientos: { abiertos: Number(mant.abiertos || 0), total: Number(mant.total || 0) },
  });
}

// Usuarios asignados al laboratorio: candidatos a responsable de un equipo.
async function responsables(req, res) {
  const id = enteroPositivo(req.params.id, 'El laboratorio');
  await obtener(id);
  await verificarAccesoLaboratorio(req.user, id);
  const rows = await query(
    `SELECT u.id_usuario, CONCAT(u.nombre, ' ', u.apellido) AS nombre, r.nombre_rol
       FROM usuario_laboratorio ul
       JOIN usuarios u ON u.id_usuario = ul.id_usuario
       JOIN roles r ON r.id_rol = u.id_rol
      WHERE ul.id_laboratorio = ?
      ORDER BY u.apellido, u.nombre`,
    [id],
  );
  res.json(rows.map((u) => ({ ...u, rolEtiqueta: etiquetaRol(u.nombre_rol) })));
}

function leerCampos(body, parcial) {
  const out = {};
  const errores = [];
  const presente = (k) => body[k] !== undefined;

  if (!parcial || presente('nombre')) {
    const n = texto(body.nombre);
    if (!n) errores.push('El nombre del laboratorio es obligatorio.');
    else out.nombre = n;
  }
  for (const k of ['edificio', 'piso', 'ubicacion', 'codigo_acceso']) {
    if (presente(k)) out[k] = texto(body[k]) || null;
  }
  if (presente('descripcion')) out.descripcion = texto(body.descripcion) || null;
  for (const [k, max] of Object.entries(LIMITES)) {
    if (out[k] && out[k].length > max) errores.push(`El campo ${k.replace('_', ' ')} admite hasta ${max} caracteres.`);
  }
  if (presente('capacidad_equipos')) {
    if (body.capacidad_equipos === null || body.capacidad_equipos === '') out.capacidad_equipos = null;
    else {
      const c = Number(body.capacidad_equipos);
      if (!Number.isInteger(c) || c < 0 || c > 10000) errores.push('La capacidad debe ser un número entero mayor o igual a 0.');
      else out.capacidad_equipos = c;
    }
  }
  if (!parcial || presente('estado')) {
    const e = body.estado === undefined || body.estado === '' ? (parcial ? undefined : 'Activo') : body.estado;
    if (!ESTADOS_LAB.includes(e)) errores.push('El estado debe ser Activo o Inactivo.');
    else out.estado = e;
  }
  if (errores.length) throw new HttpError(400, errores[0], errores);
  return out;
}

async function verificarNombreUnico(nombre, excluirId) {
  const rows = await query(
    'SELECT id_laboratorio FROM laboratorios WHERE LOWER(TRIM(nombre)) = LOWER(?) AND id_laboratorio <> ?',
    [nombre, excluirId || 0],
  );
  if (rows.length) throw new HttpError(409, `Ya existe un laboratorio llamado "${nombre}".`);
}

async function crear(req, res) {
  const campos = leerCampos(req.body || {}, false);
  await verificarNombreUnico(campos.nombre);
  const id = await withTransaction(async (conn) => {
    const [r] = await conn.query('INSERT INTO laboratorios SET ?', [campos]);
    // El administrador mantiene acceso a todos los laboratorios, como en los datos originales.
    await conn.query(
      `INSERT IGNORE INTO usuario_laboratorio (id_usuario, id_laboratorio)
       SELECT u.id_usuario, ? FROM usuarios u JOIN roles r ON r.id_rol = u.id_rol WHERE r.nombre_rol = ?`,
      [r.insertId, ROLES.ADMIN],
    );
    await registrarAccion(conn, {
      idUsuario: req.user.id, accion: 'Crear', entidad: 'Laboratorio', idRegistro: r.insertId,
      detalle: `Alta del laboratorio ${campos.nombre}.`,
    });
    return r.insertId;
  });
  res.status(201).json(publico(await obtener(id), req.user));
}

async function actualizar(req, res) {
  const id = enteroPositivo(req.params.id, 'El laboratorio');
  const actual = await obtener(id);
  const campos = leerCampos(req.body || {}, true);
  if (!Object.keys(campos).length) throw new HttpError(400, 'No se indicaron cambios.');
  if (campos.nombre) await verificarNombreUnico(campos.nombre, id);
  const total = Number(actual.total_equipos || 0);
  if (campos.capacidad_equipos != null && campos.capacidad_equipos < total) {
    throw new HttpError(400, `La capacidad no puede ser menor a los ${total} equipos registrados en el laboratorio.`);
  }
  await withTransaction(async (conn) => {
    await conn.query('UPDATE laboratorios SET ? WHERE id_laboratorio = ?', [campos, id]);
    await registrarAccion(conn, {
      idUsuario: req.user.id, accion: 'Modificar', entidad: 'Laboratorio', idRegistro: id,
      detalle: `Actualización (${Object.keys(campos).join(', ')}).`,
    });
  });
  res.json(publico(await obtener(id), req.user));
}

module.exports = { listar, detalle, responsables, crear, actualizar };
