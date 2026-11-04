const jwt = require('jsonwebtoken');
const { query } = require('../config/db');
const { HttpError } = require('../utils/httpError');
const { verificarContrasena } = require('../utils/password');
const { etiquetaRol } = require('../utils/roles');
const { laboratoriosPermitidos } = require('../utils/acceso');
const { texto } = require('../utils/validacion');

async function perfil(user) {
  const labs = await laboratoriosPermitidos(user);
  return { ...user, rolEtiqueta: etiquetaRol(user.rol), laboratorios: labs };
}

async function login(req, res) {
  const email = texto(req.body?.email).toLowerCase();
  const contrasena = typeof req.body?.contrasena === 'string' ? req.body.contrasena : '';
  if (!email || !contrasena) throw new HttpError(400, 'Ingresá el email y la contraseña.');

  const rows = await query(
    `SELECT u.id_usuario, u.nombre, u.apellido, u.email, u.contrasena, r.nombre_rol
       FROM usuarios u JOIN roles r ON r.id_rol = u.id_rol
      WHERE LOWER(u.email) = ?`,
    [email],
  );
  const u = rows[0];
  if (!u || !(await verificarContrasena(contrasena, u.contrasena))) {
    throw new HttpError(401, 'Email o contraseña incorrectos.');
  }
  const user = { id: u.id_usuario, nombre: u.nombre, apellido: u.apellido, email: u.email, rol: u.nombre_rol };
  const token = jwt.sign({ sub: u.id_usuario }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '8h',
  });
  res.json({ token, usuario: await perfil(user) });
}

async function me(req, res) {
  res.json({ usuario: await perfil(req.user) });
}

module.exports = { login, me };
