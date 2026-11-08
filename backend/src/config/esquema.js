// Migraciones seguras del esquema. Solo AGREGAN lo que el sistema necesita y no existe:
// no borran ni modifican datos.
//   001 - usuarios.bloqueado: permite al administrador bloquear cuentas.
//   002 - tabla solicitudes_contrasena: pedidos de "¿Olvidaste tu contraseña?".
//   003 - multi-institucion (config/migracion003.js): instituciones, id_institucion en las
//         tablas, unicidades por institucion, rol SUPERADMIN.
// Si el usuario de MySQL no tiene permiso (ALTER / CREATE), el resto del sistema sigue
// funcionando sin esa funcion y se indica el archivo de backend/sql/migraciones a ejecutar.
const { query } = require('./db');
const migracion003 = require('./migracion003');

const estado = { bloqueo: false, solicitudes: false, multi: false, verificado: false, error: null, errores: {}, avisos: [] };

const SQL_BLOQUEO = 'ALTER TABLE usuarios ADD COLUMN bloqueado TINYINT(1) NOT NULL DEFAULT 0';
const SQL_SOLICITUDES = `CREATE TABLE IF NOT EXISTS solicitudes_contrasena (
  id_solicitud INT AUTO_INCREMENT PRIMARY KEY,
  id_usuario INT NOT NULL,
  mensaje VARCHAR(300) NULL,
  fecha_solicitud DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  estado ENUM('Pendiente','Atendida','Descartada') NOT NULL DEFAULT 'Pendiente',
  fecha_atencion DATETIME NULL,
  id_atendida_por INT NULL,
  FOREIGN KEY (id_usuario) REFERENCES usuarios(id_usuario) ON DELETE CASCADE,
  FOREIGN KEY (id_atendida_por) REFERENCES usuarios(id_usuario) ON DELETE SET NULL
) ENGINE=InnoDB`;

const MIGRACIONES = [
  {
    clave: 'bloqueo', archivo: '001_usuarios_bloqueado.sql', permiso: 'ALTER', sql: SQL_BLOQUEO,
    existe: () => columnaExiste('usuarios', 'bloqueado'),
    nombre: 'la columna usuarios.bloqueado',
  },
  {
    clave: 'solicitudes', archivo: '002_solicitudes_contrasena.sql', permiso: 'CREATE y REFERENCES', sql: SQL_SOLICITUDES,
    existe: () => tablaExiste('solicitudes_contrasena'),
    nombre: 'la tabla solicitudes_contrasena',
  },
];

async function columnaExiste(tabla, columna) {
  const rows = await query(
    'SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?',
    [tabla, columna],
  );
  return rows.length > 0;
}

async function tablaExiste(tabla) {
  const rows = await query('SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?', [tabla]);
  return rows.length > 0;
}

async function asegurarEsquema() {
  const r = { agregadas: [], errores: [] };
  for (const m of MIGRACIONES) {
    try {
      if (!(await m.existe())) {
        await query(m.sql);
        r.agregadas.push(m.nombre);
      }
      estado[m.clave] = true;
      delete estado.errores[m.clave];
    } catch (err) {
      estado[m.clave] = await m.existe().catch(() => false);
      if (!estado[m.clave]) {
        estado.errores[m.clave] = `No se pudo crear ${m.nombre} (${err.code || err.message}). `
          + `Ejecutá backend/sql/migraciones/${m.archivo} con un usuario de MySQL con permiso ${m.permiso} (por ejemplo root) y reiniciá el backend.`;
        r.errores.push(estado.errores[m.clave]);
      }
    }
  }
  // 003 - multi-institucion (varios pasos, cada uno idempotente)
  try {
    const m = await migracion003.migrar();
    r.agregadas.push(...m.hechos);
    estado.avisos = m.avisos;
  } catch (err) {
    r.errores.push(`Migración 003: ${err.code || err.message}`);
  }
  estado.multi = await migracion003.aplicada().catch(() => false);
  if (!estado.multi) {
    estado.errores.multi = 'La base todavía no tiene el esquema multi-institución. '
      + 'Ejecutá backend/sql/migraciones/003_multi_institucion.sql con un usuario de MySQL con permisos ALTER, CREATE, INDEX y REFERENCES (por ejemplo root) y reiniciá el backend.';
    r.errores.push(estado.errores.multi);
  } else {
    delete estado.errores.multi;
  }
  estado.error = estado.errores.bloqueo || null; // compatibilidad: mensaje del bloqueo
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

module.exports = { estado, asegurarEsquema, asegurarEsquemaUnaVez, colBloqueado, SQL_BLOQUEO, SQL_SOLICITUDES };
