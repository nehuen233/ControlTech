const jwt = require('jsonwebtoken');
const { query } = require('../config/db');
const { HttpError } = require('../utils/httpError');
const { estado: esquema, asegurarEsquemaUnaVez, colBloqueado } = require('../config/esquema');
const { huellaContrasena } = require('../utils/password');
const { ROLES } = require('../utils/roles');

const MENSAJE_SUSPENDIDA = 'El acceso de tu institución está suspendido. Comunicate con ControlTech para reactivarlo.';

// Sin la migracion 003 el codigo no puede aislar los datos de cada colegio: mejor no responder.
async function exigirEsquemaMulti() {
  await asegurarEsquemaUnaVez();
  if (!esquema.multi) throw new HttpError(503, esquema.errores.multi || 'La base de datos necesita la migración multi-institución.', { codigo: 'MIGRACION_PENDIENTE' });
}

// Valida el token y recarga desde MySQL, en cada peticion, el rol, la institucion y su estado:
// nada de eso viaja en el token ni se acepta del cliente.
// Express pasa los parametros por posicion (req, res, next): no quitar _res aunque no se use.
async function autenticar(req, _res, next) {
  try {
    const header = req.headers.authorization || '';
    const [tipo, token] = header.split(' ');
    if (tipo !== 'Bearer' || !token) throw new HttpError(401, 'Iniciá sesión para continuar.');
    let payload;
    try {
      payload = jwt.verify(token, process.env.JWT_SECRET);
    } catch {
      throw new HttpError(401, 'La sesión expiró o no es válida. Iniciá sesión nuevamente.');
    }
    await exigirEsquemaMulti();
    const rows = await query(
      `SELECT u.id_usuario, u.nombre, u.apellido, u.email, u.contrasena, r.nombre_rol, ${colBloqueado()} AS bloqueado,
              u.id_institucion, i.estado AS estado_institucion
         FROM usuarios u
         JOIN roles r ON r.id_rol = u.id_rol
         LEFT JOIN instituciones i ON i.id_institucion = u.id_institucion
        WHERE u.id_usuario = ?`,
      [payload.sub],
    );
    if (!rows.length) throw new HttpError(401, 'El usuario de la sesión ya no existe.');
    const u = rows[0];
    if (Number(u.bloqueado)) throw new HttpError(401, 'Tu cuenta fue bloqueada por el administrador.', { codigo: 'CUENTA_BLOQUEADA' });
    // La sesion se emitio con otra contraseña: el administrador la cambio.
    if (payload.pv !== huellaContrasena(u.contrasena)) {
      throw new HttpError(401, 'Tu contraseña fue cambiada. Iniciá sesión con la nueva contraseña.', { codigo: 'CONTRASENA_CAMBIADA' });
    }
    if (u.estado_institucion === 'Suspendida') throw new HttpError(403, MENSAJE_SUSPENDIDA, { codigo: 'INSTITUCION_SUSPENDIDA' });
    req.user = {
      id: u.id_usuario, nombre: u.nombre, apellido: u.apellido, email: u.email, rol: u.nombre_rol,
      idInstitucion: u.id_institucion ?? null,
      esSuperadmin: u.nombre_rol === ROLES.SUPERADMIN,
    };
    next();
  } catch (err) {
    next(err);
  }
}

// Rutas de un colegio: exigen un usuario que pertenezca a una institucion. El SUPERADMIN
// administra la plataforma y no ve datos internos de los colegios.
function requiereInstitucion(req, _res, next) {
  if (!req.user?.idInstitucion) {
    return next(new HttpError(403, 'Esta sección es de un colegio. El superadministrador gestiona la plataforma desde Instituciones.', { codigo: 'SOLO_INSTITUCION' }));
  }
  next();
}

const permitirRoles = (...roles) => (req, res, next) => {
  const lista = roles.flat();
  if (!req.user || !lista.includes(req.user.rol)) {
    return next(new HttpError(403, 'Tu rol no tiene permiso para realizar esta acción.'));
  }
  next();
};

module.exports = { autenticar, requiereInstitucion, permitirRoles, exigirEsquemaMulti, MENSAJE_SUSPENDIDA };
