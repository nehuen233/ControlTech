const { explicarErrorMySQL } = require('../config/diagnostico');

function noEncontrado(req, res) {
  res.status(404).json({ error: 'Ruta no encontrada.' });
}

// eslint-disable-next-line no-unused-vars
function manejadorErrores(err, req, res, next) {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'El cuerpo de la petición no es JSON válido.' });
  }
  if (err.status) {
    return res.status(err.status).json({ error: err.message, ...(err.details ? { detalles: err.details } : {}) });
  }
  if (err.code === 'ER_DUP_ENTRY') {
    return res.status(409).json({ error: 'El registro ya existe.' });
  }
  if (err.code === 'ER_NO_REFERENCED_ROW_2') {
    return res.status(400).json({ error: 'Alguna referencia indicada no existe.' });
  }
  if (['ECONNREFUSED', 'ER_ACCESS_DENIED_ERROR', 'ER_BAD_DB_ERROR', 'ENOTFOUND', 'ETIMEDOUT'].includes(err.code)) {
    const motivo = explicarErrorMySQL(err);
    console.error(`MySQL: ${motivo}`);
    return res.status(503).json({ error: `Sin conexión con la base de datos. ${motivo}` });
  }
  console.error(err);
  res.status(500).json({ error: 'Error interno del servidor.' });
}

module.exports = { noEncontrado, manejadorErrores };
