// Verifica la conexion con MySQL y que existan las tablas y el administrador.
// Uso: npm run db:check
//      npm run db:check -- <email> <contrasena>   (ademas prueba esas credenciales)
require('dotenv').config({ quiet: true });
const { pool } = require('../src/config/db');
const { explicarErrorMySQL } = require('../src/config/diagnostico');
const { verificarContrasena } = require('../src/utils/password');

async function probarCredenciales(email, contrasena) {
  console.log(`\nProbando el ingreso de "${email}" ...`);
  const [rows] = await pool.query(
    `SELECT u.email, u.contrasena, r.nombre_rol FROM usuarios u JOIN roles r ON r.id_rol = u.id_rol
      WHERE LOWER(TRIM(u.email)) = LOWER(TRIM(?))`,
    [email],
  );
  if (!rows.length) {
    const [[db]] = await pool.query('SELECT DATABASE() AS db');
    const [todos] = await pool.query('SELECT email FROM usuarios ORDER BY id_usuario LIMIT 10');
    console.log(`ERR El email no existe en la base "${db.db}". Usuarios encontrados: ${todos.map((t) => t.email).join(', ') || '(ninguno)'}`);
    return false;
  }
  const u = rows[0];
  if (u.email !== u.email.trim()) console.log('AVISO El email guardado tiene espacios al inicio o al final.');
  const guardada = u.contrasena;
  const esHash = /^\$2[aby]\$/.test(guardada);
  console.log(`OK  Usuario encontrado (rol ${u.nombre_rol}); contraseña guardada como ${esHash ? 'hash bcrypt' : `texto plano de ${guardada.length} caracteres`}`);
  if (await verificarContrasena(contrasena, guardada)) {
    console.log('OK  La contraseña coincide: el ingreso debería funcionar.');
    return true;
  }
  if (!esHash && guardada.trim() === contrasena.trim()) {
    console.log('ERR La contraseña difiere solo por espacios al inicio o al final (en lo guardado o en lo escrito).');
  } else if (!esHash && guardada.toLowerCase() === contrasena.toLowerCase()) {
    console.log('ERR La contraseña difiere solo en mayúsculas/minúsculas.');
  } else {
    console.log(`ERR La contraseña no coincide con la guardada (escribiste ${contrasena.length} caracteres).`);
  }
  return false;
}

const TABLAS = ['instituciones', 'roles', 'laboratorios', 'usuarios', 'usuario_laboratorio', 'equipos', 'software',
  'equipo_software', 'licencias', 'mantenimientos', 'alertas', 'historial_acciones', 'reportes'];

(async () => {
  console.log(`Conectando a ${process.env.DB_USER || 'root'}@${process.env.DB_HOST || 'localhost'}:${process.env.DB_PORT || 3306} / ${process.env.DB_NAME || 'controltecchh'} ...`);
  try {
    const [[v]] = await pool.query('SELECT VERSION() AS version');
    console.log(`OK  Conexión establecida (servidor ${v.version})`);
    const [rows] = await pool.query('SELECT table_name AS t FROM information_schema.tables WHERE table_schema = DATABASE()');
    const existentes = rows.map((r) => r.t.toLowerCase());
    const faltan = TABLAS.filter((t) => !existentes.includes(t));
    if (faltan.length) console.log(`ERR Faltan tablas: ${faltan.join(', ')}`);
    else console.log(`OK  Las ${TABLAS.length} tablas del modelo existen`);
    if (!faltan.length) {
      const conteo = {};
      for (const t of ['laboratorios', 'equipos', 'software', 'mantenimientos']) {
        const [[r]] = await pool.query(`SELECT COUNT(*) AS n FROM ${t}`);
        conteo[t] = Number(r.n);
      }
      console.log(`OK  Registros: ${Object.entries(conteo).map(([t, n]) => `${n} ${t}`).join(', ')}`);
      if (!conteo.laboratorios || !conteo.equipos) {
        console.log('AVISO No hay laboratorios o equipos cargados. Para probar el sistema con datos de ejemplo ejecutá "npm run db:demo" (crea la institución Demo).');
      }
    }
    let admins = [];
    let superadmins = [];
    if (!faltan.length) {
      const [inst] = await pool.query(
        `SELECT i.id_institucion, i.nombre, i.estado,
                (SELECT COUNT(*) FROM usuarios u WHERE u.id_institucion = i.id_institucion) AS usuarios,
                (SELECT COUNT(*) FROM laboratorios l WHERE l.id_institucion = i.id_institucion) AS laboratorios,
                (SELECT COUNT(*) FROM equipos e WHERE e.id_institucion = i.id_institucion) AS equipos
           FROM instituciones i ORDER BY i.id_institucion`,
      );
      console.log(inst.length ? `OK  Instituciones: ${inst.length}` : 'AVISO No hay instituciones: el superadministrador las da de alta desde la sección Instituciones.');
      for (const i of inst) console.log(`      ${String(i.id_institucion).padStart(3)}  ${i.nombre} [${i.estado}] - ${i.usuarios} usuarios, ${i.laboratorios} laboratorios, ${i.equipos} equipos`);
      [admins] = await pool.query("SELECT u.email, i.nombre AS institucion FROM usuarios u JOIN roles r ON r.id_rol = u.id_rol LEFT JOIN instituciones i ON i.id_institucion = u.id_institucion WHERE r.nombre_rol = 'ADMINISTRADOR'");
      [superadmins] = await pool.query("SELECT u.email FROM usuarios u JOIN roles r ON r.id_rol = u.id_rol WHERE r.nombre_rol = 'SUPERADMIN'");
      console.log(superadmins.length ? `OK  Superadministrador: ${superadmins.map((a) => a.email).join(', ')}` : 'AVISO No hay SUPERADMIN: configurá SUPERADMIN_EMAIL y SUPERADMIN_PASSWORD en backend/.env y reiniciá el backend.');
      if (admins.length) console.log(`OK  Administradores: ${admins.map((a) => `${a.email} (${a.institucion || 'sin institución'})`).join(', ')}`);
    } else {
      console.log('AVISO Iniciá el backend para aplicar las migraciones (o ejecutá backend/sql/migraciones/*.sql).');
    }
    let credOk = true;
    const [email, contrasena] = process.argv.slice(2);
    if (email) credOk = await probarCredenciales(email, contrasena ?? '');
    process.exitCode = faltan.length || (!admins.length && !superadmins.length) || !credOk ? 1 : 0;
  } catch (err) {
    console.error(`ERR ${explicarErrorMySQL(err)}`);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
