require('dotenv').config();
const crypto = require('crypto');

if (!process.env.JWT_SECRET) {
  if (process.env.NODE_ENV === 'production') {
    console.error('Falta JWT_SECRET en el archivo .env');
    process.exit(1);
  }
  process.env.JWT_SECRET = crypto.randomBytes(32).toString('hex');
  console.warn('JWT_SECRET no definido: se generó uno temporal (las sesiones se pierden al reiniciar).');
}

const app = require('./app');
const { pool } = require('./config/db');
const { explicarErrorMySQL } = require('./config/diagnostico');
const { asegurarRolesAsignables } = require('./controllers/usuariosController');
const { asegurarLaboratoriosUnaVez } = require('./config/laboratoriosIniciales');

const PORT = Number(process.env.PORT || 4000);

pool.query('SELECT 1')
  .then(async () => {
    console.log(`Conectado a MySQL (${process.env.DB_NAME || 'controltecchh'})`);
    const creados = await asegurarRolesAsignables().catch((err) => {
      console.warn(`No se pudieron verificar los roles asignables: ${err.message}`);
      return 0;
    });
    if (creados) console.log(`Se agregaron ${creados} rol(es) asignable(s) que faltaban en la tabla roles.`);
    const labs = await asegurarLaboratoriosUnaVez().catch((err) => {
      console.warn(`No se pudieron verificar los laboratorios iniciales: ${err.message}`);
      return 0;
    });
    if (labs) console.log(`Se agregaron ${labs} laboratorio(s) inicial(es) que faltaban.`);
  })
  .catch((err) => console.error(`No se pudo conectar a MySQL. ${explicarErrorMySQL(err)}\nEjecutá "npm run db:check" para diagnosticar.`));

app.listen(PORT, () => console.log(`API ControlTech escuchando en http://localhost:${PORT}/api`));
