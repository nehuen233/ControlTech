// Migraciones seguras del esquema. Solo AGREGAN lo que el sistema necesita y no existe:
// no borran ni modifican datos.
//   001 - usuarios.bloqueado: permite al administrador bloquear cuentas.
// Si el usuario de MySQL no tiene permiso ALTER, el sistema sigue funcionando sin la
// funcion de bloqueo y se indica la sentencia para ejecutarla a mano
// (backend/sql/migraciones/001_usuarios_bloqueado.sql).
const { query } = require('./db');

const estado = { bloqueo: false, verificado: false, error: null };

const SQL_BLOQUEO = 'ALTER TABLE usuarios ADD COLUMN bloqueado TINYINT(1) NOT NULL DEFAULT 0';

async function columnaExiste(tabla, columna) {
  const rows = await query(
    'SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?',
    [tabla, columna],
  );
  return rows.length > 0;
}

async function asegurarEsquema() {
  const r = { agregadas: [], error: null };
  try {
    if (!(await columnaExiste('usuarios', 'bloqueado'))) {
      await query(SQL_BLOQUEO);
      r.agregadas.push('usuarios.bloqueado');
    }
    estado.bloqueo = true;
    estado.error = null;
  } catch (err) {
    estado.bloqueo = await columnaExiste('usuarios', 'bloqueado').catch(() => false);
    if (!estado.bloqueo) {
      estado.error = `No se pudo agregar la columna usuarios.bloqueado (${err.code || err.message}). `
        + 'Ejecutá backend/sql/migraciones/001_usuarios_bloqueado.sql con un usuario de MySQL con permiso ALTER (por ejemplo root) y reiniciá el backend.';
      r.error = estado.error;
    }
  }
  estado.verificado = true;
  return r;
}

let enCurso = null;
async function asegurarEsquemaUnaVez() {
  if (estado.verificado) return estado;
  enCurso = enCurso || asegurarEsquema().finally(() => { enCurso = null; });
  await enCurso;
  return estado;
}

// Expresion SQL del estado de bloqueo; "0" si la columna todavia no existe.
const colBloqueado = (alias = 'u') => (estado.bloqueo ? `${alias}.bloqueado` : '0');

module.exports = { estado, asegurarEsquema, asegurarEsquemaUnaVez, colBloqueado, SQL_BLOQUEO };
