// Migracion 004 - control de pagos de la plataforma.
// Mismo patron que la 003: cada paso verifica antes de aplicar y solo agrega.
//   - instituciones: plan, abono_mensual, dia_vencimiento, dias_gracia, motivo_suspension
//   - tabla pagos (de la plataforma: el colegio solo la lee)
// Espejo manual: backend/sql/migraciones/004_pagos.sql
const { query } = require('./db');

const COLUMNAS = [
  ['plan', "ENUM('Basico','Estandar','Institucional') NULL"],
  ['abono_mensual', 'DECIMAL(12,2) NULL'],
  ['dia_vencimiento', 'TINYINT NOT NULL DEFAULT 10'],
  ['dias_gracia', 'TINYINT NOT NULL DEFAULT 5'],
  ['motivo_suspension', "ENUM('Falta de pago','Manual') NULL"],
];

const SQL_PAGOS = `CREATE TABLE IF NOT EXISTS pagos (
  id_pago            INT AUTO_INCREMENT PRIMARY KEY,
  id_institucion     INT NOT NULL,
  periodo            CHAR(7) NOT NULL,
  concepto           ENUM('Abono','Implementacion','Anual','Otro') NOT NULL DEFAULT 'Abono',
  monto              DECIMAL(12,2) NOT NULL,
  fecha_vencimiento  DATE NOT NULL,
  fecha_pago         DATE NULL,
  estado             ENUM('Pendiente','Pagado','Vencido','Anulado') NOT NULL DEFAULT 'Pendiente',
  medio              ENUM('Transferencia','Mercado Pago','Efectivo','Otro') NULL,
  referencia         VARCHAR(150) NULL,
  nro_factura        VARCHAR(50) NULL,
  notas              VARCHAR(300) NULL,
  id_registrado_por  INT NULL,
  fecha_registro     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_periodo (id_institucion, periodo, concepto),
  KEY ix_pagos_estado (estado, fecha_vencimiento),
  CONSTRAINT fk_pagos_institucion FOREIGN KEY (id_institucion) REFERENCES instituciones(id_institucion),
  CONSTRAINT fk_pagos_registrado_por FOREIGN KEY (id_registrado_por) REFERENCES usuarios(id_usuario) ON DELETE SET NULL
) ENGINE=InnoDB`;

const columna = async (t, c) => (await query(
  'SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?', [t, c],
)).length > 0;
const tabla = async (t) => (await query('SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?', [t])).length > 0;

async function migrar() {
  const hechos = [];
  for (const [c, def] of COLUMNAS) {
    if (!(await columna('instituciones', c))) {
      await query(`ALTER TABLE instituciones ADD COLUMN ${c} ${def}`);
      hechos.push(`instituciones.${c}`);
    }
  }
  // Una suspension anterior a este modulo se toma como manual: el proceso de cobro no la levanta.
  const r = await query("UPDATE instituciones SET motivo_suspension = 'Manual' WHERE estado = 'Suspendida' AND motivo_suspension IS NULL");
  if (r.affectedRows) hechos.push(`${r.affectedRows} suspensión(es) anteriores marcadas como manuales`);
  if (!(await tabla('pagos'))) {
    await query(SQL_PAGOS);
    hechos.push('tabla pagos');
  }
  return { hechos, avisos: [] };
}

async function aplicada() {
  if (!(await tabla('pagos'))) return false;
  for (const [c] of COLUMNAS) if (!(await columna('instituciones', c))) return false;
  return true;
}

module.exports = { migrar, aplicada, SQL_PAGOS };
