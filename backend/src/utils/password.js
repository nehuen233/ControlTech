const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const BCRYPT_RE = /^\$2[aby]\$\d{2}\$/;

// Las cuentas cargadas por los scripts SQL (incluido el administrador) guardan la
// contrasena en texto plano. Se admiten ambos formatos para no modificar sus
// credenciales; las cuentas nuevas siempre se guardan con bcrypt.
async function verificarContrasena(ingresada, almacenada) {
  if (typeof ingresada !== 'string' || typeof almacenada !== 'string') return false;
  if (BCRYPT_RE.test(almacenada)) return bcrypt.compare(ingresada, almacenada);
  const a = Buffer.from(ingresada);
  const b = Buffer.from(almacenada);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const hashContrasena = (plano) => bcrypt.hash(plano, 10);

module.exports = { verificarContrasena, hashContrasena };
