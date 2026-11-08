// Migracion 003 - esquema multi-institucion.
// Cada paso verifica antes de aplicar: se puede correr muchas veces y, si se corta a mitad,
// la siguiente ejecucion sigue desde donde quedo. Solo agrega: no borra datos.
//
// Sobre una base existente (un solo colegio), todo lo que habia pasa a la institucion 1
// (nombre en INSTITUCION_INICIAL_NOMBRE). Una base nueva creada con "BD CONTROLTECH.sql"
// ya nace con este esquema y la migracion no hace nada.
//
// Espejo manual: backend/sql/migraciones/003_multi_institucion.sql
const { query } = require('./db');
const { hashContrasena } = require('../utils/password');

const TABLAS = ['usuarios', 'laboratorios', 'equipos', 'software', 'usuario_laboratorio', 'historial_acciones', 'reportes'];
// Quedan NULL: usuarios (SUPERADMIN) e historial_acciones (acciones del SUPERADMIN).
const NOT_NULL = ['laboratorios', 'equipos', 'software', 'usuario_laboratorio', 'reportes'];

const SQL_INSTITUCIONES = `CREATE TABLE IF NOT EXISTS instituciones (
  id_institucion   INT AUTO_INCREMENT PRIMARY KEY,
  nombre           VARCHAR(150) NOT NULL,
  slug             VARCHAR(60)  NOT NULL UNIQUE,
  cuit             VARCHAR(13)  NULL,
  direccion        VARCHAR(200) NULL,
  localidad        VARCHAR(100) NULL,
  provincia        VARCHAR(100) NULL,
  email_contacto   VARCHAR(150) NULL,
  telefono         VARCHAR(50)  NULL,
  logo_url         VARCHAR(300) NULL,
  estado           ENUM('Prueba','Activa','Suspendida') NOT NULL DEFAULT 'Prueba',
  fecha_fin_prueba DATE NULL,
  configurada      TINYINT(1) NOT NULL DEFAULT 0,
  fecha_alta       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB`;

// "Colegio Suiza N.º 26" -> "colegio-suiza-n-26"
function slugDe(texto) {
  const s = String(texto || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60).replace(/-+$/, '');
  return s || 'institucion';
}

async function slugDisponible(base, excluirId = 0) {
  let slug = slugDe(base);
  for (let n = 2; ; n += 1) {
    const [r] = await query('SELECT id_institucion FROM instituciones WHERE slug = ? AND id_institucion <> ?', [slug, excluirId]);
    if (!r) return slug;
    const sufijo = `-${n}`;
    slug = `${slugDe(base).slice(0, 60 - sufijo.length)}${sufijo}`;
  }
}

// ---------- Consultas sobre el esquema ----------
const columna = async (t, c) => (await query(
  'SELECT IS_NULLABLE AS nulo FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?', [t, c],
))[0];
const tabla = async (t) => (await query('SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?', [t])).length > 0;

// Indices unicos de una tabla: [{ nombre, columnas: 'col1,col2' }]
async function indicesUnicos(t) {
  return query(
    `SELECT INDEX_NAME AS nombre, GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) AS columnas
       FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND NON_UNIQUE = 0 AND INDEX_NAME <> 'PRIMARY'
      GROUP BY INDEX_NAME`,
    [t],
  );
}
const tieneUnico = async (t, cols) => (await indicesUnicos(t)).some((i) => i.columnas === cols);

async function tieneFk(t, cols, refTabla) {
  const rows = await query(
    `SELECT CONSTRAINT_NAME AS nombre, GROUP_CONCAT(COLUMN_NAME ORDER BY ORDINAL_POSITION) AS columnas
       FROM information_schema.KEY_COLUMN_USAGE
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND REFERENCED_TABLE_NAME = ?
      GROUP BY CONSTRAINT_NAME`,
    [t, refTabla],
  );
  return rows.some((r) => r.columnas === cols);
}

// ---------- Pasos ----------
async function migrar({ log = () => {} } = {}) {
  const avisos = [];
  const hechos = [];

  // 1. Tabla instituciones
  if (!(await tabla('instituciones'))) {
    await query(SQL_INSTITUCIONES);
    hechos.push('tabla instituciones');
  }

  // 2. Columnas id_institucion (NULL al principio, para no romper filas existentes)
  for (const t of TABLAS) {
    if (!(await columna(t, 'id_institucion'))) {
      await query(`ALTER TABLE ${t} ADD COLUMN id_institucion INT NULL`);
      hechos.push(`${t}.id_institucion`);
    }
  }

  // 3. Rol SUPERADMIN
  await query("INSERT IGNORE INTO roles (nombre_rol) VALUES ('SUPERADMIN')");

  // 4. Datos existentes -> institucion 1 (solo si hay datos sin institucion)
  const [pendientes] = await query(
    `SELECT (SELECT COUNT(*) FROM usuarios u JOIN roles r ON r.id_rol = u.id_rol WHERE u.id_institucion IS NULL AND r.nombre_rol <> 'SUPERADMIN')
          + (SELECT COUNT(*) FROM laboratorios WHERE id_institucion IS NULL)
          + (SELECT COUNT(*) FROM software WHERE id_institucion IS NULL) AS n`,
  );
  if (Number(pendientes.n) > 0) {
    const [uno] = await query('SELECT id_institucion FROM instituciones WHERE id_institucion = 1');
    if (!uno) {
      const nombre = (process.env.INSTITUCION_INICIAL_NOMBRE || 'Institución principal').trim().slice(0, 150) || 'Institución principal';
      await query(
        "INSERT INTO instituciones (id_institucion, nombre, slug, estado, configurada) VALUES (1, ?, ?, 'Activa', 1)",
        [nombre, await slugDisponible(nombre)],
      );
      hechos.push(`institución 1 "${nombre}"`);
    }
    await query("UPDATE usuarios u JOIN roles r ON r.id_rol = u.id_rol SET u.id_institucion = 1 WHERE u.id_institucion IS NULL AND r.nombre_rol <> 'SUPERADMIN'");
    await query('UPDATE laboratorios SET id_institucion = 1 WHERE id_institucion IS NULL');
    await query('UPDATE software SET id_institucion = 1 WHERE id_institucion IS NULL');
    hechos.push('datos existentes asignados a la institución 1');
  }
  // Las tablas hijas toman la institucion de su padre.
  await query('UPDATE equipos e JOIN laboratorios l ON l.id_laboratorio = e.id_laboratorio SET e.id_institucion = l.id_institucion WHERE e.id_institucion IS NULL');
  await query('UPDATE usuario_laboratorio ul JOIN laboratorios l ON l.id_laboratorio = ul.id_laboratorio SET ul.id_institucion = l.id_institucion WHERE ul.id_institucion IS NULL');
  await query('UPDATE historial_acciones h JOIN usuarios u ON u.id_usuario = h.id_usuario SET h.id_institucion = u.id_institucion WHERE h.id_institucion IS NULL AND u.id_institucion IS NOT NULL');
  await query('UPDATE reportes r JOIN usuarios u ON u.id_usuario = r.id_usuario SET r.id_institucion = u.id_institucion WHERE r.id_institucion IS NULL AND u.id_institucion IS NOT NULL');

  // 5. NOT NULL donde corresponde (solo si ya no quedan filas sin institucion)
  for (const t of NOT_NULL) {
    const c = await columna(t, 'id_institucion');
    if (c && c.nulo === 'YES') {
      const [q] = await query(`SELECT COUNT(*) AS n FROM ${t} WHERE id_institucion IS NULL`);
      if (Number(q.n)) { avisos.push(`${t}: ${q.n} fila(s) sin institución; la columna sigue admitiendo NULL.`); continue; }
      await query(`ALTER TABLE ${t} MODIFY id_institucion INT NOT NULL`);
      hechos.push(`${t}.id_institucion NOT NULL`);
    }
  }

  // 6. Indices unicos
  const asegurarUnico = async (t, cols, nombre, verificarDuplicados) => {
    if (await tieneUnico(t, cols)) return;
    if (verificarDuplicados) {
      const dups = await query(verificarDuplicados);
      if (dups.length) {
        avisos.push(`${t}: no se creó la unicidad (${cols}) porque hay duplicados: ${dups.map((d) => d.detalle).join('; ')}. Corregilos y reiniciá el backend.`);
        return;
      }
    }
    await query(`ALTER TABLE ${t} ADD UNIQUE KEY ${nombre} (${cols})`);
    hechos.push(`UNIQUE ${t}(${cols})`);
  };
  const quitarUnicoSimple = async (t, col) => {
    for (const i of await indicesUnicos(t)) {
      if (i.columnas === col) {
        await query(`ALTER TABLE ${t} DROP INDEX \`${i.nombre}\``);
        hechos.push(`sin UNIQUE global ${t}(${col})`);
      }
    }
  };

  await asegurarUnico('usuarios', 'id_usuario,id_institucion', 'uq_usuarios_id_institucion');
  await asegurarUnico('laboratorios', 'id_laboratorio,id_institucion', 'uq_laboratorios_id_institucion');
  await asegurarUnico('laboratorios', 'id_institucion,nombre', 'uq_laboratorios_nombre',
    `SELECT CONCAT('"', nombre, '" x', COUNT(*), ' (institución ', id_institucion, ')') AS detalle
       FROM laboratorios GROUP BY id_institucion, nombre HAVING COUNT(*) > 1`);
  // Equipos: primero la unicidad por institucion, despues se quita la global (nunca queda sin control).
  await asegurarUnico('equipos', 'id_institucion,identificador', 'uq_equipos_identificador',
    `SELECT CONCAT(identificador, ' x', COUNT(*)) AS detalle FROM equipos GROUP BY id_institucion, identificador HAVING COUNT(*) > 1`);
  await asegurarUnico('equipos', 'id_institucion,nro_serie', 'uq_equipos_nro_serie',
    `SELECT CONCAT(nro_serie, ' x', COUNT(*)) AS detalle FROM equipos GROUP BY id_institucion, nro_serie HAVING COUNT(*) > 1`);
  if (await tieneUnico('equipos', 'id_institucion,identificador')) await quitarUnicoSimple('equipos', 'identificador');
  if (await tieneUnico('equipos', 'id_institucion,nro_serie')) await quitarUnicoSimple('equipos', 'nro_serie');
  await asegurarUnico('software', 'id_institucion,nombre_software,version', 'uq_software_nombre_version',
    `SELECT CONCAT('"', nombre_software, ' ', COALESCE(version, ''), '" x', COUNT(*)) AS detalle
       FROM software GROUP BY id_institucion, nombre_software, version HAVING COUNT(*) > 1`);
  await asegurarUnico('licencias', 'id_software,numero_licencia', 'uq_licencias_numero');
  if (await tieneUnico('licencias', 'id_software,numero_licencia')) await quitarUnicoSimple('licencias', 'numero_licencia');

  // 7. Claves foraneas
  const asegurarFk = async (t, cols, ref, refCols, nombre, extra = '') => {
    if (await tieneFk(t, cols, ref)) return;
    await query(`ALTER TABLE ${t} ADD CONSTRAINT ${nombre} FOREIGN KEY (${cols}) REFERENCES ${ref} (${refCols}) ${extra}`);
    hechos.push(`FK ${t}(${cols}) → ${ref}`);
  };
  for (const t of TABLAS) await asegurarFk(t, 'id_institucion', 'instituciones', 'id_institucion', `fk_${t}_institucion`);
  if (await tieneUnico('laboratorios', 'id_laboratorio,id_institucion')) {
    // La base impide un equipo (o una asignacion) en un laboratorio de otro colegio.
    await asegurarFk('equipos', 'id_laboratorio,id_institucion', 'laboratorios', 'id_laboratorio, id_institucion', 'fk_equipos_laboratorio_institucion');
    await asegurarFk('usuario_laboratorio', 'id_laboratorio,id_institucion', 'laboratorios', 'id_laboratorio, id_institucion', 'fk_ul_laboratorio_institucion');
  }
  if (await tieneUnico('usuarios', 'id_usuario,id_institucion')) {
    await asegurarFk('usuario_laboratorio', 'id_usuario,id_institucion', 'usuarios', 'id_usuario, id_institucion', 'fk_ul_usuario_institucion');
  }

  // 8. SUPERADMIN inicial (solo si no hay ninguno)
  const [sa] = await query("SELECT u.email FROM usuarios u JOIN roles r ON r.id_rol = u.id_rol WHERE r.nombre_rol = 'SUPERADMIN' LIMIT 1");
  if (!sa) {
    const email = String(process.env.SUPERADMIN_EMAIL || '').trim().toLowerCase();
    const clave = process.env.SUPERADMIN_PASSWORD || '';
    if (!email || !clave) {
      avisos.push('No hay usuario SUPERADMIN: definí SUPERADMIN_EMAIL y SUPERADMIN_PASSWORD en backend/.env y reiniciá el backend para crearlo.');
    } else if (clave.length < 8) {
      avisos.push('SUPERADMIN_PASSWORD debe tener al menos 8 caracteres: no se creó el SUPERADMIN.');
    } else {
      const [ocupado] = await query('SELECT id_usuario FROM usuarios WHERE LOWER(email) = ?', [email]);
      if (ocupado) {
        avisos.push(`SUPERADMIN_EMAIL (${email}) ya pertenece a otro usuario: elegí otro email para el SUPERADMIN.`);
      } else {
        await query(
          `INSERT INTO usuarios (nombre, apellido, email, contrasena, id_rol, id_institucion)
           SELECT 'Super', 'Administrador', ?, ?, id_rol, NULL FROM roles WHERE nombre_rol = 'SUPERADMIN'`,
          [email, await hashContrasena(clave)],
        );
        hechos.push(`usuario SUPERADMIN ${email}`);
      }
    }
  }

  for (const h of hechos) log(h);
  return { hechos, avisos };
}

// La migracion se considera aplicada cuando existen la tabla y todas las columnas: el resto
// (indices, FK) refuerza el aislamiento, pero el codigo tambien lo controla.
async function aplicada() {
  if (!(await tabla('instituciones'))) return false;
  for (const t of TABLAS) if (!(await columna(t, 'id_institucion'))) return false;
  return true;
}

module.exports = { migrar, aplicada, slugDe, slugDisponible, SQL_INSTITUCIONES };
