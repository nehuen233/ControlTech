-- ControlTech - Migracion 004: control de pagos de la plataforma.
-- El backend la aplica SOLO al iniciar (backend/src/config/migracion004.js). Ejecutá este archivo a
-- mano solo si la consola del backend dice "La base todavía no tiene el módulo de pagos"
-- (el usuario de MySQL del backend no tiene permisos ALTER, CREATE y REFERENCES).
-- Requiere la migracion 003. Es idempotente y no borra datos.

DROP PROCEDURE IF EXISTS ct_si_falta;
DELIMITER //
CREATE PROCEDURE ct_si_falta(existe INT, sentencia TEXT)
BEGIN
  IF existe = 0 THEN
    SET @ct_sql = sentencia;
    PREPARE ct_st FROM @ct_sql;
    EXECUTE ct_st;
    DEALLOCATE PREPARE ct_st;
  END IF;
END//
DELIMITER ;

-- 1. Plan y condiciones de cobro de cada institucion
CALL ct_si_falta((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'instituciones' AND COLUMN_NAME = 'plan'), 'ALTER TABLE instituciones ADD COLUMN plan ENUM(''Basico'',''Estandar'',''Institucional'') NULL');
CALL ct_si_falta((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'instituciones' AND COLUMN_NAME = 'abono_mensual'), 'ALTER TABLE instituciones ADD COLUMN abono_mensual DECIMAL(12,2) NULL');
CALL ct_si_falta((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'instituciones' AND COLUMN_NAME = 'dia_vencimiento'), 'ALTER TABLE instituciones ADD COLUMN dia_vencimiento TINYINT NOT NULL DEFAULT 10');
CALL ct_si_falta((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'instituciones' AND COLUMN_NAME = 'dias_gracia'), 'ALTER TABLE instituciones ADD COLUMN dias_gracia TINYINT NOT NULL DEFAULT 5');
CALL ct_si_falta((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'instituciones' AND COLUMN_NAME = 'motivo_suspension'), 'ALTER TABLE instituciones ADD COLUMN motivo_suspension ENUM(''Falta de pago'',''Manual'') NULL');

-- Una suspension anterior a este modulo se toma como manual (el cobro automatico no la levanta).
UPDATE instituciones SET motivo_suspension = 'Manual' WHERE estado = 'Suspendida' AND motivo_suspension IS NULL;

-- 2. Pagos (tabla de la plataforma: el colegio solo la lee)
CREATE TABLE IF NOT EXISTS pagos (
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
) ENGINE=InnoDB;

DROP PROCEDURE IF EXISTS ct_si_falta;
