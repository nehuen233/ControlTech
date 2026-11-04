const mysql = require('mysql2/promise');

// Pool de conexiones a la base MySQL existente de ControlTech.
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'controltecchh',
  waitForConnections: true,
  connectionLimit: 10,
  dateStrings: true,
  charset: 'utf8mb4',
});

async function query(sql, params = []) {
  const [rows] = await pool.query(sql, params);
  return rows;
}

// Ejecuta una funcion dentro de una transaccion y hace rollback ante cualquier error.
async function withTransaction(fn) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

module.exports = { pool, query, withTransaction };
