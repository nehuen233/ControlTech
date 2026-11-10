const { query, withTransaction } = require('../config/db');
const { HttpError } = require('../utils/httpError');
const { hashContrasena, generarTemporal } = require('../utils/password');
const { ROLES, ROLES_ASIGNABLES, etiquetaRol, listaRolesAsignables } = require('../utils/roles');
const { registrarAccion } = require('../utils/historial');
const { texto, enteroPositivo } = require('../utils/validacion');
const { estado: esquema, asegurarEsquemaUnaVez, colBloqueado } = require('../config/esquema');
const { cerrarSesionesDe, emitirAdmins } = require('../utils/eventos');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Crea los roles asignables que falten en `roles` (nombre_rol es UNIQUE: no duplica).
// Necesario si la base se creo solo con "BD CONTROLTECH.sql", que no incluye
// TECNICO ni DOCENTE DE LABORATORIO.
async function asegurarRolesAsignables() {
  const r = await query('INSERT IGNORE INTO roles (nombre_rol) VALUES ?', [ROLES_ASIGNABLES.map((n) => [n])]);
  return r.affectedRows;
}

async function rolesAsignables(_req, res) {
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

// Los laboratorios tienen que ser de la institucion del administrador (regla 4).
async function validarLaboratorios(lista, idInstitucion) {
  if (!Array.isArray(lista) || lista.length === 0) {
    throw new HttpError(400, 'Asigná al menos un laboratorio al usuario.');
  }
  const ids = [...new Set(lista.map((v) => enteroPositivo(v, 'El laboratorio')))];
  const rows = await query('SELECT id_laboratorio FROM laboratorios WHERE id_laboratorio IN (?) AND id_institucion = ?', [ids, idInstitucion]);
  if (rows.length !== ids.length) throw new HttpError(400, 'Algún laboratorio indicado no existe.');
  return ids;
}

async function listar(req, res) {
  await asegurarEsquemaUnaVez();
  const usuarios = await query(
    `SELECT u.id_usuario, u.nombre, u.apellido, u.email, u.id_rol, r.nombre_rol, ${colBloqueado()} AS bloqueado,
            (SELECT COUNT(*) FROM mantenimientos m WHERE m.id_usuario = u.id_usuario) AS mantenimientos,
            (SELECT COUNT(*) FROM historial_acciones h WHERE h.id_usuario = u.id_usuario) AS acciones,
            (SELECT COUNT(*) FROM reportes rp WHERE rp.id_usuario = u.id_usuario) AS reportes,
            ${esquema.solicitudes ? "(SELECT MAX(sc.id_solicitud) FROM solicitudes_contrasena sc WHERE sc.id_usuario = u.id_usuario AND sc.estado = 'Pendiente')" : 'NULL'} AS solicitud_pendiente,
            GROUP_CONCAT(l.nombre ORDER BY l.nombre SEPARATOR ', ') AS laboratorios,
            GROUP_CONCAT(l.id_laboratorio ORDER BY l.nombre) AS ids_laboratorios
       FROM usuarios u
       JOIN roles r ON r.id_rol = u.id_rol
       LEFT JOIN usuario_laboratorio ul ON ul.id_usuario = u.id_usuario
       LEFT JOIN laboratorios l ON l.id_laboratorio = ul.id_laboratorio AND l.id_institucion = u.id_institucion
      WHERE u.id_institucion = ?
      GROUP BY u.id_usuario
      ORDER BY u.id_usuario`,
    [req.user.idInstitucion],
  );
  res.json(usuarios.map((u) => ({
    ...u,
    rolEtiqueta: etiquetaRol(u.nombre_rol),
    ids_laboratorios: u.ids_laboratorios ? u.ids_laboratorios.split(',').map(Number) : [],
    // Solo se pueden editar cuentas con roles asignables; el administrador queda protegido.
    editable: ROLES_ASIGNABLES.includes(u.nombre_rol),
    bloqueado: Boolean(Number(u.bloqueado)),
    mantenimientos: Number(u.mantenimientos), acciones: Number(u.acciones), reportes: Number(u.reportes),
    protegido: u.nombre_rol === ROLES.ADMIN || u.id_usuario === req.user.id,
    solicitud_pendiente: u.solicitud_pendiente ? Number(u.solicitud_pendiente) : null,
  })));
  if (!esquema.bloqueo) res.setHeader('X-ControlTech-Aviso', 'bloqueo-no-disponible');
}

// Cuenta sobre la que el administrador puede actuar: de su institucion (si no, 404), nunca
// un administrador ni la propia.
async function obtenerGestionable(req, mensajeAdmin) {
  const id = enteroPositivo(req.params.id, 'El usuario');
  const [u] = await query(
    'SELECT u.id_usuario, u.nombre, u.apellido, u.email, r.nombre_rol FROM usuarios u JOIN roles r ON r.id_rol = u.id_rol WHERE u.id_usuario = ? AND u.id_institucion = ?',
    [id, req.user.idInstitucion],
  );
  if (!u) throw new HttpError(404, 'El usuario no existe.');
  if (u.nombre_rol === ROLES.ADMIN || id === req.user.id) {
    throw new HttpError(403, mensajeAdmin || 'La cuenta del administrador no puede bloquearse ni eliminarse.');
  }
  return u;
}

// Bloquea o desbloquea una cuenta. Al bloquear se cierran sus sesiones abiertas.
async function cambiarBloqueo(req, res) {
  await asegurarEsquemaUnaVez();
  if (!esquema.bloqueo) throw new HttpError(503, esquema.error || 'La función de bloqueo no está disponible.');
  const u = await obtenerGestionable(req);
  if (typeof req.body?.bloqueado !== 'boolean') throw new HttpError(400, 'Indicá si la cuenta se bloquea (true) o se desbloquea (false).');
  const bloqueado = req.body.bloqueado;
  await withTransaction(async (conn) => {
    await conn.query('UPDATE usuarios SET bloqueado = ? WHERE id_usuario = ?', [bloqueado ? 1 : 0, u.id_usuario]);
    await registrarAccion(conn, {
      idUsuario: req.user.id, accion: 'Modificar', entidad: 'Usuario', idRegistro: u.id_usuario,
      detalle: `${bloqueado ? 'Bloqueo' : 'Desbloqueo'} de la cuenta ${u.email}.`,
    });
  });
  if (bloqueado) cerrarSesionesDe(u.id_usuario, 'Tu cuenta fue bloqueada por el administrador.');
  res.json({ id_usuario: u.id_usuario, email: u.email, bloqueado });
}

// Elimina una cuenta. Sus mantenimientos, acciones y reportes dependen de ella (claves
// foraneas): si tiene historial no se elimina y se propone bloquearla.
async function eliminar(req, res) {
  const u = await obtenerGestionable(req);
  const [h] = await query(
    `SELECT (SELECT COUNT(*) FROM mantenimientos WHERE id_usuario = ?) AS mantenimientos,
            (SELECT COUNT(*) FROM historial_acciones WHERE id_usuario = ?) AS acciones,
            (SELECT COUNT(*) FROM reportes WHERE id_usuario = ?) AS reportes`,
    [u.id_usuario, u.id_usuario, u.id_usuario],
  );
  const conHistorial = Number(h.mantenimientos) + Number(h.acciones) + Number(h.reportes);
  if (conHistorial) {
    throw new HttpError(409,
      `${u.nombre} ${u.apellido} tiene historial registrado (${h.mantenimientos} mantenimiento(s), ${h.acciones} acción(es), ${h.reportes} reporte(s)) y no puede eliminarse sin perderlo. Bloqueá la cuenta para que no pueda ingresar.`,
      { mantenimientos: Number(h.mantenimientos), acciones: Number(h.acciones), reportes: Number(h.reportes) });
  }
  const r = await withTransaction(async (conn) => {
    const [eq] = await conn.query('UPDATE equipos SET id_responsable = NULL WHERE id_responsable = ?', [u.id_usuario]);
    await conn.query('DELETE FROM usuario_laboratorio WHERE id_usuario = ?', [u.id_usuario]);
    await conn.query('DELETE FROM usuarios WHERE id_usuario = ?', [u.id_usuario]);
    await registrarAccion(conn, {
      idUsuario: req.user.id, accion: 'Eliminar', entidad: 'Usuario', idRegistro: u.id_usuario,
      detalle: `Baja del usuario ${u.email} (${etiquetaRol(u.nombre_rol)}).${eq.affectedRows ? ` ${eq.affectedRows} equipo(s) quedaron sin responsable.` : ''}`,
    });
    return { equipos: eq.affectedRows };
  });
  cerrarSesionesDe(u.id_usuario, 'Tu cuenta fue eliminada por el administrador.');
  res.json({ id_usuario: u.id_usuario, email: u.email, equipos_sin_responsable: r.equipos });
}

async function crear(req, res) {
  const nombre = texto(req.body?.nombre);
  const apellido = texto(req.body?.apellido);
  const email = texto(req.body?.email).toLowerCase();
  // generar: true → el sistema crea una contraseña temporal y la devuelve UNA sola vez.
  const generar = req.body?.generar === true;
  const contrasena = generar ? generarTemporal() : (typeof req.body?.contrasena === 'string' ? req.body.contrasena : '');

  const errores = [];
  if (!nombre) errores.push('El nombre es obligatorio.');
  if (!apellido) errores.push('El apellido es obligatorio.');
  if (nombre.length > 80 || apellido.length > 80) errores.push('Nombre y apellido admiten hasta 80 caracteres.');
  if (!EMAIL_RE.test(email) || email.length > 150) errores.push('Ingresá un email válido.');
  if (contrasena.length < 8) errores.push('La contraseña debe tener al menos 8 caracteres.');
  if (errores.length) throw new HttpError(400, errores[0], errores);

  const rol = await resolverRolAsignable(req.body?.id_rol);
  const labs = await validarLaboratorios(req.body?.laboratorios, req.user.idInstitucion);

  // El email es unico en toda la plataforma (el login es por email). El mensaje no dice
  // en que institucion esta registrado.
  const existente = await query('SELECT id_usuario FROM usuarios WHERE LOWER(email) = ?', [email]);
  if (existente.length) throw new HttpError(409, 'Ese email ya está en uso.');

  const hash = await hashContrasena(contrasena);
  const id = await withTransaction(async (conn) => {
    const [r] = await conn.query(
      'INSERT INTO usuarios (nombre, apellido, email, contrasena, id_rol, id_institucion) VALUES (?, ?, ?, ?, ?, ?)',
      [nombre, apellido, email, hash, rol.id_rol, req.user.idInstitucion],
    );
    await conn.query(
      'INSERT INTO usuario_laboratorio (id_usuario, id_laboratorio, id_institucion) VALUES ?',
      [labs.map((l) => [r.insertId, l, req.user.idInstitucion])],
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
    ...(generar ? { contrasena_temporal: contrasena } : {}),
  });
}

// Cambia el rol (y opcionalmente los laboratorios) de un usuario existente.
async function actualizarRol(req, res) {
  const id = enteroPositivo(req.params.id, 'El usuario');
  const rows = await query(
    'SELECT u.id_usuario, u.email, r.nombre_rol FROM usuarios u JOIN roles r ON r.id_rol = u.id_rol WHERE u.id_usuario = ? AND u.id_institucion = ?',
    [id, req.user.idInstitucion],
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
  const labs = req.body?.laboratorios !== undefined ? await validarLaboratorios(req.body.laboratorios, req.user.idInstitucion) : null;

  await withTransaction(async (conn) => {
    await conn.query('UPDATE usuarios SET id_rol = ? WHERE id_usuario = ?', [rol.id_rol, id]);
    if (labs) {
      await conn.query('DELETE FROM usuario_laboratorio WHERE id_usuario = ?', [id]);
      await conn.query('INSERT INTO usuario_laboratorio (id_usuario, id_laboratorio, id_institucion) VALUES ?', [labs.map((l) => [id, l, req.user.idInstitucion])]);
    }
    await registrarAccion(conn, {
      idUsuario: req.user.id, accion: 'Modificar', entidad: 'Usuario', idRegistro: id,
      detalle: `Asignación de rol ${etiquetaRol(rol.nombre_rol)} a ${destino.email}.`,
    });
  });
  res.json({ id_usuario: id, id_rol: rol.id_rol, nombre_rol: rol.nombre_rol, rolEtiqueta: etiquetaRol(rol.nombre_rol) });
}

// ---------- Solicitudes de cambio de contraseña ("¿Olvidaste tu contraseña?") ----------

async function requiereSolicitudes() {
  await asegurarEsquemaUnaVez();
  if (!esquema.solicitudes) throw new HttpError(503, esquema.errores.solicitudes || 'La recuperación de contraseña no está disponible.');
}

async function listarSolicitudes(req, res) {
  await requiereSolicitudes();
  const estadoSol = req.query.estado || 'Pendiente';
  if (!['Pendiente', 'Atendida', 'Descartada', 'todas'].includes(estadoSol)) throw new HttpError(400, 'Estado de solicitud no válido.');
  const rows = await query(
    `SELECT s.id_solicitud, s.mensaje, s.fecha_solicitud, s.estado, s.fecha_atencion,
            u.id_usuario, u.nombre, u.apellido, u.email, r.nombre_rol, ${colBloqueado()} AS bloqueado,
            CONCAT(a.nombre, ' ', a.apellido) AS atendida_por
       FROM solicitudes_contrasena s
       JOIN usuarios u ON u.id_usuario = s.id_usuario
       JOIN roles r ON r.id_rol = u.id_rol
       LEFT JOIN usuarios a ON a.id_usuario = s.id_atendida_por
      WHERE u.id_institucion = ? ${estadoSol === 'todas' ? '' : 'AND s.estado = ?'}
      ORDER BY FIELD(s.estado, 'Pendiente') DESC, s.fecha_solicitud DESC
      LIMIT 200`,
    estadoSol === 'todas' ? [req.user.idInstitucion] : [req.user.idInstitucion, estadoSol],
  );
  res.json(rows.map((x) => ({ ...x, bloqueado: Boolean(Number(x.bloqueado)), rolEtiqueta: etiquetaRol(x.nombre_rol) })));
}

async function descartarSolicitud(req, res) {
  await requiereSolicitudes();
  const id = enteroPositivo(req.params.id, 'La solicitud');
  const [s] = await query('SELECT s.id_solicitud, s.estado, u.email, u.id_usuario FROM solicitudes_contrasena s JOIN usuarios u ON u.id_usuario = s.id_usuario WHERE s.id_solicitud = ? AND u.id_institucion = ?', [id, req.user.idInstitucion]);
  if (!s) throw new HttpError(404, 'La solicitud no existe.');
  if (s.estado !== 'Pendiente') throw new HttpError(409, 'La solicitud ya fue atendida o descartada.');
  await withTransaction(async (conn) => {
    await conn.query("UPDATE solicitudes_contrasena SET estado = 'Descartada', fecha_atencion = NOW(), id_atendida_por = ? WHERE id_solicitud = ?", [req.user.id, id]);
    await registrarAccion(conn, {
      idUsuario: req.user.id, accion: 'Modificar', entidad: 'Usuario', idRegistro: s.id_usuario,
      detalle: `Solicitud de cambio de contraseña de ${s.email} descartada.`,
    });
  });
  emitirAdmins(req.user.idInstitucion, 'solicitud-atendida', { id_solicitud: id, id_usuario: s.id_usuario });
  res.json({ id_solicitud: id, estado: 'Descartada' });
}

// El administrador asigna una contraseña nueva (escrita o temporal generada). Se guarda con
// bcrypt, se cierran las sesiones abiertas del usuario y sus solicitudes pendientes quedan atendidas.
async function cambiarContrasena(req, res) {
  const u = await obtenerGestionable(req, 'La contraseña del administrador no se cambia desde este panel.');
  const generar = req.body?.generar === true;
  const nueva = generar ? generarTemporal() : (typeof req.body?.contrasena === 'string' ? req.body.contrasena : '');
  if (nueva.length < 8) throw new HttpError(400, 'La contraseña debe tener al menos 8 caracteres.');
  if (nueva.length > 72) throw new HttpError(400, 'La contraseña admite hasta 72 caracteres.');
  const hash = await hashContrasena(nueva);
  let atendidas = [];
  await withTransaction(async (conn) => {
    await conn.query('UPDATE usuarios SET contrasena = ? WHERE id_usuario = ?', [hash, u.id_usuario]);
    if (esquema.solicitudes) {
      const [pend] = await conn.query("SELECT id_solicitud FROM solicitudes_contrasena WHERE id_usuario = ? AND estado = 'Pendiente'", [u.id_usuario]);
      atendidas = pend.map((p) => p.id_solicitud);
      if (atendidas.length) {
        await conn.query("UPDATE solicitudes_contrasena SET estado = 'Atendida', fecha_atencion = NOW(), id_atendida_por = ? WHERE id_solicitud IN (?)", [req.user.id, atendidas]);
      }
    }
    await registrarAccion(conn, {
      idUsuario: req.user.id, accion: 'Modificar', entidad: 'Usuario', idRegistro: u.id_usuario,
      detalle: `Cambio de contraseña de ${u.email}${generar ? ' (temporal generada)' : ''}${atendidas.length ? ' por solicitud del usuario' : ''}.`,
    });
  });
  cerrarSesionesDe(u.id_usuario, 'Tu contraseña fue cambiada por el administrador. Iniciá sesión con la nueva contraseña.');
  for (const id of atendidas) emitirAdmins(req.user.idInstitucion, 'solicitud-atendida', { id_solicitud: id, id_usuario: u.id_usuario });
  // La contraseña solo se devuelve si la genero el sistema, para que el administrador la comunique.
  res.json({ id_usuario: u.id_usuario, email: u.email, solicitudes_atendidas: atendidas.length, ...(generar ? { contrasena_temporal: nueva } : {}) });
}

module.exports = {
  asegurarRolesAsignables, rolesAsignables, listar, crear, actualizarRol, cambiarBloqueo, eliminar,
  listarSolicitudes, descartarSolicitud, cambiarContrasena,
};
