const { query, withTransaction } = require('../config/db');
const { HttpError } = require('../utils/httpError');
const { hashContrasena } = require('../utils/password');
const { ROLES, ROLES_ASIGNABLES, etiquetaRol, listaRolesAsignables } = require('../utils/roles');
const { registrarAccion } = require('../utils/historial');
const { texto, enteroPositivo } = require('../utils/validacion');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Crea los roles asignables que falten en `roles` (nombre_rol es UNIQUE: no duplica).
// Necesario si la base se creo solo con "BD CONTROLTECH.sql", que no incluye
// TECNICO ni DOCENTE DE LABORATORIO.
async function asegurarRolesAsignables() {
  const r = await query('INSERT IGNORE INTO roles (nombre_rol) VALUES ?', [ROLES_ASIGNABLES.map((n) => [n])]);
  return r.affectedRows;
}

async function rolesAsignables( res) {
  await asegurarRolesAsignables();
  const rows = await query(
    'SELECT id_rol, nombre_rol FROM roles WHERE nombre_rol IN (?) ORDER BY FIELD(nombre_rol, ?)',
    [ROLES_ASIGNABLES, ROLES_ASIGNABLES],
  );
  res.json(rows.map((r) => ({ ...r, etiqueta: etiquetaRol(r.nombre_rol) })));
}

// Verifica que el rol solicitado exista y sea uno de los permitidos.
// Rechaza Administrador, Tecnico y cualquier otro rol aunque se envie directo a la API.
async function resolverRolAsignable(idRol) {
  if (idRol === undefined || idRol === null || idRol === '') {
    throw new HttpError(400, `Seleccioná un rol: ${listaRolesAsignables('o')}.`);
  }
  const id = enteroPositivo(idRol, 'El rol');
  const rows = await query('SELECT id_rol, nombre_rol FROM roles WHERE id_rol = ?', [id]);
  if (!rows.length) throw new HttpError(400, 'El rol indicado no existe.');
  if (!ROLES_ASIGNABLES.includes(rows[0].nombre_rol)) {
    throw new HttpError(
      403,
      `No se puede asignar el rol ${etiquetaRol(rows[0].nombre_rol)}. Solo se permiten ${listaRolesAsignables('y')}.`,
    );
  }
  return rows[0];
}

async function validarLaboratorios(lista) {
  if (!Array.isArray(lista) || lista.length === 0) {
    throw new HttpError(400, 'Asigná al menos un laboratorio al usuario.');
  }
  const ids = [...new Set(lista.map((v) => enteroPositivo(v, 'El laboratorio')))];
  const rows = await query('SELECT id_laboratorio FROM laboratorios WHERE id_laboratorio IN (?)', [ids]);
  if (rows.length !== ids.length) throw new HttpError(400, 'Algún laboratorio indicado no existe.');
  return ids;
}

async function listar(req, res) {
  const usuarios = await query(
    `SELECT u.id_usuario, u.nombre, u.apellido, u.email, u.id_rol, r.nombre_rol,
            GROUP_CONCAT(l.nombre ORDER BY l.nombre SEPARATOR ', ') AS laboratorios,
            GROUP_CONCAT(l.id_laboratorio ORDER BY l.nombre) AS ids_laboratorios
       FROM usuarios u
       JOIN roles r ON r.id_rol = u.id_rol
       LEFT JOIN usuario_laboratorio ul ON ul.id_usuario = u.id_usuario
       LEFT JOIN laboratorios l ON l.id_laboratorio = ul.id_laboratorio
      GROUP BY u.id_usuario
      ORDER BY u.id_usuario`,
  );
  res.json(usuarios.map((u) => ({
    ...u,
    rolEtiqueta: etiquetaRol(u.nombre_rol),
    ids_laboratorios: u.ids_laboratorios ? u.ids_laboratorios.split(',').map(Number) : [],
    // Solo se pueden editar cuentas con roles asignables; el administrador queda protegido.
    editable: ROLES_ASIGNABLES.includes(u.nombre_rol),
  })));
}

async function crear(req, res) {
  const nombre = texto(req.body?.nombre);
  const apellido = texto(req.body?.apellido);
  const email = texto(req.body?.email).toLowerCase();
  const contrasena = typeof req.body?.contrasena === 'string' ? req.body.contrasena : '';

  const errores = [];
  if (!nombre) errores.push('El nombre es obligatorio.');
  if (!apellido) errores.push('El apellido es obligatorio.');
  if (nombre.length > 80 || apellido.length > 80) errores.push('Nombre y apellido admiten hasta 80 caracteres.');
  if (!EMAIL_RE.test(email) || email.length > 150) errores.push('Ingresá un email válido.');
  if (contrasena.length < 8) errores.push('La contraseña debe tener al menos 8 caracteres.');
  if (errores.length) throw new HttpError(400, errores[0], errores);

  const rol = await resolverRolAsignable(req.body?.id_rol);
  const labs = await validarLaboratorios(req.body?.laboratorios);

  const existente = await query('SELECT id_usuario FROM usuarios WHERE LOWER(email) = ?', [email]);
  if (existente.length) throw new HttpError(409, 'Ya existe un usuario registrado con ese email.');

  const hash = await hashContrasena(contrasena);
  const id = await withTransaction(async (conn) => {
    const [r] = await conn.query(
      'INSERT INTO usuarios (nombre, apellido, email, contrasena, id_rol) VALUES (?, ?, ?, ?, ?)',
      [nombre, apellido, email, hash, rol.id_rol],
    );
    await conn.query(
      'INSERT INTO usuario_laboratorio (id_usuario, id_laboratorio) VALUES ?',
      [labs.map((l) => [r.insertId, l])],
    );
    await registrarAccion(conn, {
      idUsuario: req.user.id, accion: 'Crear', entidad: 'Usuario', idRegistro: r.insertId,
      detalle: `Alta de usuario ${email} con rol ${etiquetaRol(rol.nombre_rol)}.`,
    });
    return r.insertId;
  });

  res.status(201).json({
    id_usuario: id, nombre, apellido, email, id_rol: rol.id_rol,
    nombre_rol: rol.nombre_rol, rolEtiqueta: etiquetaRol(rol.nombre_rol), ids_laboratorios: labs,
  });
}

// Cambia el rol (y opcionalmente los laboratorios) de un usuario existente.
async function actualizarRol(req, res) {
  const id = enteroPositivo(req.params.id, 'El usuario');
  const rows = await query(
    'SELECT u.id_usuario, u.email, r.nombre_rol FROM usuarios u JOIN roles r ON r.id_rol = u.id_rol WHERE u.id_usuario = ?',
    [id],
  );
  if (!rows.length) throw new HttpError(404, 'El usuario no existe.');
  const destino = rows[0];
  if (destino.nombre_rol === ROLES.ADMIN || id === req.user.id) {
    throw new HttpError(403, 'La cuenta del administrador no puede modificarse.');
  }
  if (!ROLES_ASIGNABLES.includes(destino.nombre_rol)) {
    throw new HttpError(403, `No se puede modificar el rol de un usuario ${etiquetaRol(destino.nombre_rol)} desde este panel.`);
  }

  const rol = await resolverRolAsignable(req.body?.id_rol);
  const labs = req.body?.laboratorios !== undefined ? await validarLaboratorios(req.body.laboratorios) : null;

  await withTransaction(async (conn) => {
    await conn.query('UPDATE usuarios SET id_rol = ? WHERE id_usuario = ?', [rol.id_rol, id]);
    if (labs) {
      await conn.query('DELETE FROM usuario_laboratorio WHERE id_usuario = ?', [id]);
      await conn.query('INSERT INTO usuario_laboratorio (id_usuario, id_laboratorio) VALUES ?', [labs.map((l) => [id, l])]);
    }
    await registrarAccion(conn, {
      idUsuario: req.user.id, accion: 'Modificar', entidad: 'Usuario', idRegistro: id,
      detalle: `Asignación de rol ${etiquetaRol(rol.nombre_rol)} a ${destino.email}.`,
    });
  });
  res.json({ id_usuario: id, id_rol: rol.id_rol, nombre_rol: rol.nombre_rol, rolEtiqueta: etiquetaRol(rol.nombre_rol) });
}

module.exports = { asegurarRolesAsignables, rolesAsignables, listar, crear, actualizarRol };
