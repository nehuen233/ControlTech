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

// Un error no capturado dentro de una peticion no debe apagar todo el servidor:
// se registra con detalle para poder corregirlo y el backend sigue atendiendo.
process.on('unhandledRejection', (err) => {
  console.error('Error no controlado (el servidor sigue funcionando):', err);
});
const { pool } = require('./config/db');
const { explicarErrorMySQL } = require('./config/diagnostico');
const { asegurarRolesAsignables } = require('./controllers/usuariosController');
const { asegurarEsquemaUnaVez } = require('./config/esquema');
const { iniciarVerificacionPeriodica } = require('./controllers/alertasController');
const { iniciarCobroPeriodico } = require('./utils/cobros');

const PORT = Number(process.env.PORT || 4000);

pool.query('SELECT 1')
  .then(async () => {
    console.log(`Conectado a MySQL (${process.env.DB_NAME || 'controltecchh'})`);
    const esq = await asegurarEsquemaUnaVez();
    for (const e of Object.values(esq.errores)) console.warn(`AVISO ${e}`);
    for (const a of esq.avisos) console.warn(`AVISO ${a}`);
    if (esq.multi) console.log('Esquema multi-institución disponible.');
    if (esq.bloqueo) console.log('Bloqueo de usuarios disponible.');
    if (esq.solicitudes) console.log('Recuperación de contraseña disponible.');
    if (esq.pagos) {
      console.log('Módulo de pagos disponible.');
      // Cuotas, vencimientos y suspensión por falta de pago (PAGOS_AUTOMATICOS=no lo desactiva).
      if (process.env.PAGOS_AUTOMATICOS !== 'no') iniciarCobroPeriodico();
    }
    const creados = await asegurarRolesAsignables().catch((err) => {
      console.warn(`No se pudieron verificar los roles asignables: ${err.message}`);
      return 0;
    });
    if (creados) console.log(`Se agregaron ${creados} rol(es) asignable(s) que faltaban en la tabla roles.`);
    // Los datos de demostracion ya no se cargan al iniciar: viven en la institucion "Demo"
    // y se cargan a pedido con "npm run db:demo".
  })
  .catch((err) => console.error(`No se pudo conectar a MySQL. ${explicarErrorMySQL(err)}\nEjecutá "npm run db:check" para diagnosticar.`));

app.listen(PORT, () => console.log(`API ControlTech escuchando en http://localhost:${PORT}/api`));

// Alertas automaticas de mantenimiento (preventivo vencido, programado sin realizar).
if (process.env.ALERTAS_AUTOMATICAS !== 'no') iniciarVerificacionPeriodica();
