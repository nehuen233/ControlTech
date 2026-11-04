// Carga segura de laboratorios, equipos y software desde sql/datos_iniciales.sql.
// Solo agrega lo que falta: se puede ejecutar varias veces sin duplicar datos.
// Uso: npm run db:cargar
require('dotenv').config({ quiet: true });
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const { explicarErrorMySQL } = require('../src/config/diagnostico');

const TABLAS = ['laboratorios', 'equipos', 'software', 'licencias', 'equipo_software', 'usuario_laboratorio', 'usuarios'];

async function contar(conn) {
  const out = {};
  for (const t of TABLAS) {
    const [[r]] = await conn.query(`SELECT COUNT(*) AS n FROM ${t}`);
    out[t] = Number(r.n);
  }
  return out;
}

(async () => {
  const base = process.env.DB_NAME || 'controltecchh';
  let conn;
  try {
    conn = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost', port: Number(process.env.DB_PORT || 3306),
      user: process.env.DB_USER || 'root', password: process.env.DB_PASSWORD || '', database: base,
      multipleStatements: true, charset: 'utf8mb4',
    });
  } catch (err) {
    console.error(`ERR ${explicarErrorMySQL(err)}`);
    process.exit(1);
  }
  try {
    const antes = await contar(conn);
    const sql = fs.readFileSync(path.join(__dirname, '..', 'sql', 'datos_iniciales.sql'), 'utf8');
    await conn.beginTransaction();
    await conn.query(sql);
    await conn.commit();
    const despues = await contar(conn);
    console.log(`Base: ${base}\n`);
    console.log('Tabla                 Antes  Después  Agregados');
    for (const t of TABLAS) {
      console.log(`${t.padEnd(20)} ${String(antes[t]).padStart(6)} ${String(despues[t]).padStart(8)} ${String(despues[t] - antes[t]).padStart(10)}`);
    }
    if (despues.usuarios !== antes.usuarios) throw new Error('Se modificó la tabla de usuarios (no debería ocurrir).');
    console.log('\nOK  Carga completa. Los usuarios (incluido el administrador) no se modificaron.');
  } catch (err) {
    await conn.rollback().catch(() => { });
    console.error(`ERR No se pudo completar la carga; no se guardó ningún cambio. ${err.code ? explicarErrorMySQL(err) : err.message}`);
    process.exitCode = 1;
  } finally {
    await conn.end();
  }
})();
