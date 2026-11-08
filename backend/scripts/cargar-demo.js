// Crea (si no existe) la institucion "Demo" y le carga los datos de demostracion:
// 5 laboratorios, sus computadoras, software y licencias, usuarios de ejemplo de cada rol y
// algunos mantenimientos y alertas. Solo agrega lo que falta: se puede ejecutar varias veces.
// No toca ninguna otra institucion.
// Uso: npm run db:demo
//   DEMO_ADMIN_EMAIL / DEMO_ADMIN_PASSWORD (backend/.env, opcionales): administrador de la
//   Demo. Si no se indican se usa admin@demo.controltech y se genera una contraseña.
//   DEMO_USUARIOS_PASSWORD (opcional): contraseña de los usuarios de ejemplo nuevos.
require('dotenv').config({ quiet: true });
const { pool } = require('../src/config/db');
const { explicarErrorMySQL } = require('../src/config/diagnostico');
const { asegurarEsquemaUnaVez } = require('../src/config/esquema');
const { asegurarInstitucionDemo, cargarDatosDemo, DOMINIO_DEMO, NOMBRE_DEMO } = require('../src/config/datosDemo');
const { etiquetaRol } = require('../src/utils/roles');

(async () => {
  try {
    const esq = await asegurarEsquemaUnaVez();
    if (!esq.multi) throw new Error(esq.errores.multi);
    const inst = await asegurarInstitucionDemo();
    console.log(`${inst.creada ? 'OK  Institución creada' : 'OK  Institución existente'}: "${NOMBRE_DEMO}" (id ${inst.id}, slug "demo").`);
    const r = await cargarDatosDemo({
      idInstitucion: inst.id,
      dominio: DOMINIO_DEMO,
      emailAdmin: process.env.DEMO_ADMIN_EMAIL || `admin@${DOMINIO_DEMO}`,
      contrasenaAdmin: process.env.DEMO_ADMIN_PASSWORD || undefined,
      contrasenaUsuarios: process.env.DEMO_USUARIOS_PASSWORD || undefined,
    });
    console.log('');
    for (const [k, v] of Object.entries(r)) if (typeof v === 'number') console.log(`    ${k.padEnd(16)} +${v}`);
    for (const o of r.omitidos) console.log(`AVISO ${o}`);
    if (r.usuarios_creados.length) {
      console.log('\nUsuarios creados (anotá las contraseñas: no se vuelven a mostrar):');
      for (const u of r.usuarios_creados) console.log(`    ${u.email.padEnd(30)} ${etiquetaRol(u.rol).padEnd(24)} ${u.contrasena}`);
    } else {
      console.log('\nLos usuarios de la Demo ya existían: no se modificaron.');
    }
    console.log('\nOK  Datos de demostración listos. Las demás instituciones no se modificaron.');
  } catch (err) {
    console.error(`ERR No se pudo cargar la demo. ${err.code ? explicarErrorMySQL(err) : err.message}`);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
