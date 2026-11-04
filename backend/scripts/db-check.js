// Verifica la conexion con MySQL y que existan las tablas y el administrador.
// Uso: npm run db:check
require('dotenv').config({ quiet: true });
const { pool } = require('../src/config/db');
const { explicarErrorMySQL } = require('../src/config/diagnostico');

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
    const [admins] = await pool.query("SELECT u.email FROM usuarios u JOIN roles r ON r.id_rol = u.id_rol WHERE r.nombre_rol = 'ADMINISTRADOR'");
    console.log(admins.length ? `OK  Administrador: ${admins.map((a) => a.email).join(', ')}` : 'ERR No hay ningún usuario ADMINISTRADOR');
    process.exitCode = faltan.length || !admins.length ? 1 : 0;
  } catch (err) {
    console.error(`ERR ${explicarErrorMySQL(err)}`);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
