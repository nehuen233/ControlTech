const jwt = require('jsonwebtoken');
const { query } = require('../config/db');
const { HttpError } = require('../utils/httpError');
const { verificarContrasena, huellaContrasena } = require('../utils/password');
const { estado: esquema } = require('../config/esquema');
const { emitirAdmins } = require('../utils/eventos');
const { ROLES: R } = require('../utils/roles');
const { etiquetaRol } = require('../utils/roles');
const { laboratoriosPermitidos } = require('../utils/acceso');
const { texto } = require('../utils/validacion');
const { asegurarEsquemaUnaVez, colBloqueado } = require('../config/esquema');

async function perfil(user) {
  const labs = await laboratoriosPermitidos(user);
  return { ...user, rolEtiqueta: etiquetaRol(user.rol), laboratorios: labs };
}

async function login(req, res) {
  const email = texto(req.body?.email).toLowerCase();
  const contrasena = typeof req.body?.contrasena === 'string' ? req.body.contrasena : '';
  if (!email || !contrasena) throw new HttpError(400, 'Ingresá el email y la contraseña.');

  await asegurarEsquemaUnaVez();
  const rows = await query(
    `SELECT u.id_usuario, u.nombre, u.apellido, u.email, u.contrasena, r.nombre_rol, ${colBloqueado()} AS bloqueado
       FROM usuarios u JOIN roles r ON r.id_rol = u.id_rol
      WHERE LOWER(u.email) = ?`,
    [email],
  );
  const u = rows[0];
  if (!u || !(await verificarContrasena(contrasena, u.contrasena))) {
    throw new HttpError(401, 'Email o contraseña incorrectos.');
  }
  // Se informa el bloqueo solo con la contraseña correcta (no revela cuentas a terceros).
  if (Number(u.bloqueado)) {
    throw new HttpError(403, 'Tu cuenta está bloqueada. Consultá con el administrador del sistema.', { codigo: 'CUENTA_BLOQUEADA' });
  }
  const user = { id: u.id_usuario, nombre: u.nombre, apellido: u.apellido, email: u.email, rol: u.nombre_rol };
  const token = jwt.sign({ sub: u.id_usuario, pv: huellaContrasena(u.contrasena) }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '8h',
  });
  res.json({ token, usuario: await perfil(user) });
}

async function me(req, res) {
  res.json({ usuario: await perfil(req.user) });
}

// ---------- "¿Olvidaste tu contraseña?" ----------
// Publico. Registra una solicitud para que el administrador cambie la contraseña. La
// respuesta es siempre la misma, exista o no el email, para no revelar que cuentas hay.
const RESPUESTA_RECUPERAR = 'Si el email corresponde a una cuenta del sistema, el administrador recibirá tu solicitud y te comunicará la nueva contraseña.';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Limite contra envios repetidos (en memoria): 3 solicitudes por email y 30 por direccion IP
// cada 15 minutos. Por email, porque detras del proxy de Vite todos llegan con la misma IP.
const intentos = new Map();
const VENTANA_MS = 15 * 60000;
function superaLimite(clave, maximo) {
  const ahora = Date.now();
  const lista = (intentos.get(clave) || []).filter((t) => ahora - t < VENTANA_MS);
  lista.push(ahora);
  intentos.set(clave, lista);
  if (intentos.size > 5000) for (const [k, v] of intentos) if (!v.some((t) => ahora - t < VENTANA_MS)) intentos.delete(k);
  return lista.length > maximo;
}

async function recuperar(req, res) {
  const email = texto(req.body?.email).toLowerCase();
  const mensaje = texto(req.body?.mensaje).slice(0, 300) || null;
  if (!EMAIL_RE.test(email)) throw new HttpError(400, 'Ingresá un email válido.');
  if (superaLimite(`email:${email}`, 3) || superaLimite(`ip:${req.ip}`, 30)) throw new HttpError(429, 'Hiciste demasiadas solicitudes. Esperá unos minutos e intentá de nuevo.');
  await asegurarEsquemaUnaVez();
  if (!esquema.solicitudes) throw new HttpError(503, 'La recuperación de contraseña no está disponible todavía. Avisale al administrador.');

  const [u] = await query(
    `SELECT u.id_usuario, u.nombre, u.apellido, u.email, r.nombre_rol, ${colBloqueado()} AS bloqueado
       FROM usuarios u JOIN roles r ON r.id_rol = u.id_rol WHERE LOWER(u.email) = ?`,
    [email],
  );
  // El administrador no usa esta opcion; un email inexistente tampoco genera nada.
  if (u && u.nombre_rol !== R.ADMIN) {
    // Una sola solicitud pendiente por usuario: si ya habia una, se actualiza.
    const [pend] = await query("SELECT id_solicitud FROM solicitudes_contrasena WHERE id_usuario = ? AND estado = 'Pendiente'", [u.id_usuario]);
    let id;
    if (pend) {
      await query('UPDATE solicitudes_contrasena SET fecha_solicitud = NOW(), mensaje = COALESCE(?, mensaje) WHERE id_solicitud = ?', [mensaje, pend.id_solicitud]);
      id = pend.id_solicitud;
    } else {
      const r = await query('INSERT INTO solicitudes_contrasena (id_usuario, mensaje) VALUES (?, ?)', [u.id_usuario, mensaje]);
      id = r.insertId;
    }
    const [sol] = await query(
      `SELECT s.id_solicitud, s.mensaje, s.fecha_solicitud, s.estado, u.id_usuario, u.nombre, u.apellido, u.email, r.nombre_rol
         FROM solicitudes_contrasena s JOIN usuarios u ON u.id_usuario = s.id_usuario JOIN roles r ON r.id_rol = u.id_rol
        WHERE s.id_solicitud = ?`,
      [id],
    );
    emitirAdmins('solicitud-contrasena', { ...sol, bloqueado: Boolean(Number(u.bloqueado)) });
  }
  res.json({ ok: true, mensaje: RESPUESTA_RECUPERAR });
}

module.exports = { login, me, recuperar };
