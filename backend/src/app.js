const express = require('express');
const cors = require('cors');
const rutas = require('./routes');
const { noEncontrado, manejadorErrores } = require('./middlewares/errores');

const app = express();
app.disable('x-powered-by');
app.use(cors({ origin: (process.env.CORS_ORIGIN || 'http://localhost:5173').split(',') }));
app.use(express.json({ limit: '100kb' }));
app.use('/api', rutas);
app.use(noEncontrado);
app.use(manejadorErrores);

module.exports = app;
