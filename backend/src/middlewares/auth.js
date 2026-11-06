const jwt = require('jsonwebtoken');
const { query } = require('../config/db');
const { HttpError } = require('../utils/httpError');

// Valida el token y recarga el rol desde MySQL en cada peticion, para que un cambio
// de rol tenga efecto inmediato y no se pueda falsificar desde el cliente.
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
    const rows = await query(
      `SELECT u.id_usuario, u.nombre, u.apellido, u.email, r.nombre_rol
         FROM usuarios u JOIN roles r ON r.id_rol = u.id_rol
        WHERE u.id_usuario = ?`,
      [payload.sub],
    );
    if (!rows.length) throw new HttpError(401, 'El usuario de la sesión ya no existe.');
    const u = rows[0];
    req.user = { id: u.id_usuario, nombre: u.nombre, apellido: u.apellido, email: u.email, rol: u.nombre_rol };
    next();
  } catch (err) {
    next(err);
  }
}

const permitirRoles = (...roles) => (req, res, next) => {
  const lista = roles.flat();
  if (!req.user || !lista.includes(req.user.rol)) {
    return next(new HttpError(403, 'Tu rol no tiene permiso para realizar esta acción.'));
  }
  next();
};

module.exports = { autenticar, permitirRoles };
