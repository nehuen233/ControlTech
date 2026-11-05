// Carga los datos iniciales de ControlTech: los 5 laboratorios, sus computadoras (propias
// de cada laboratorio), el software, las licencias y las asignaciones de los usuarios de
// demostracion que existan. Solo agrega lo que falta: se puede ejecutar varias veces.
// Uso: npm run db:cargar
require('dotenv').config({ quiet: true });
const { pool, query } = require('../src/config/db');
const { explicarErrorMySQL } = require('../src/config/diagnostico');
const { asegurarDatosIniciales, asignarUsuariosDemo } = require('../src/config/datosIniciales');

const TABLAS = ['laboratorios', 'equipos', 'software', 'licencias', 'equipo_software', 'usuario_laboratorio', 'usuarios'];

async function contar() {
  const out = {};
  for (const t of TABLAS) out[t] = Number((await query(`SELECT COUNT(*) AS n FROM ${t}`))[0].n);
  return out;
}

(async () => {
  try {
    const antes = await contar();
    const r = await asegurarDatosIniciales({ reemplazarDemo: true });
    const asignaciones = await asignarUsuariosDemo();
    // El Laboratorio 4-4 no forma parte de los datos iniciales: se desactiva sin borrar nada.
    const inactivo = await query("UPDATE laboratorios SET estado = 'Inactivo' WHERE nombre = 'Laboratorio 4-4' AND estado = 'Activo'");
    const despues = await contar();
    console.log(`Base: ${process.env.DB_NAME || 'controltecchh'}\n`);
    console.log('Tabla                 Antes  Después  Agregados');
    for (const t of TABLAS) {
      console.log(`${t.padEnd(20)} ${String(antes[t]).padStart(6)} ${String(despues[t]).padStart(8)} ${String(despues[t] - antes[t]).padStart(10)}`);
    }
    console.log('');
    if (r.equipos_actualizados) console.log(`OK  ${r.equipos_actualizados} computadora(s) de demostración actualizadas con el equipamiento propio de su laboratorio (mismo id: sus mantenimientos se conservan).`);
    if (asignaciones) console.log(`OK  ${asignaciones} asignación(es) de usuarios de demostración a laboratorios.`);
    if (inactivo.affectedRows) console.log('OK  Laboratorio 4-4 marcado como Inactivo (no se borró nada).');
    for (const o of r.omitidos) console.log(`AVISO Computadoras no cargadas en ${o}.`);
    if (despues.usuarios !== antes.usuarios) throw new Error('Se modificó la tabla de usuarios (no debería ocurrir).');
    console.log('OK  Carga completa. Los usuarios (incluido el administrador) no se modificaron.');
  } catch (err) {
    console.error(`ERR No se pudo completar la carga. ${err.code ? explicarErrorMySQL(err) : err.message}`);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
