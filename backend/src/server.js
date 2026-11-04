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

const PORT = Number(process.env.PORT || 4000);

pool.query('SELECT 1')
  .then(() => console.log(`Conectado a MySQL (${process.env.DB_NAME || 'controltecchh'})`))
  .catch((err) => console.error('No se pudo conectar a MySQL:', err.message));

app.listen(PORT, () => console.log(`API ControlTech escuchando en http://localhost:${PORT}/api`));
