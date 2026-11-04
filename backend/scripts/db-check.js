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

const TABLAS = ['roles', 'laboratorios', 'usuarios', 'usuario_laboratorio', 'equipos', 'software',
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
        console.log('AVISO No hay laboratorios o equipos cargados. Ejecutá "npm run db:cargar" para cargarlos desde los datos del repositorio.');
      }
    }
    const [admins] = await pool.query("SELECT u.email FROM usuarios u JOIN roles r ON r.id_rol = u.id_rol WHERE r.nombre_rol = 'ADMINISTRADOR'");
    console.log(admins.length ? `OK  Administrador: ${admins.map((a) => a.email).join(', ')}` : 'ERR No hay ningún usuario ADMINISTRADOR');
    let credOk = true;
    const [email, contrasena] = process.argv.slice(2);
    if (email) credOk = await probarCredenciales(email, contrasena ?? '');
    process.exitCode = faltan.length || !admins.length || !credOk ? 1 : 0;
  } catch (err) {
    console.error(`ERR ${explicarErrorMySQL(err)}`);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
