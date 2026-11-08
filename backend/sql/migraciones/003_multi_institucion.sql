-- ControlTech - Migracion 003: esquema multi-institucion.
-- El backend la aplica SOLO al iniciar (backend/src/config/migracion003.js). Ejecutá este archivo a
-- mano solo si la consola del backend dice "La base todavía no tiene el esquema multi-institución"
-- (el usuario de MySQL del backend no tiene permisos ALTER, CREATE, INDEX y REFERENCES).
--
-- Cómo: en MySQL Workbench, conectado como root, seleccioná la base de ControlTech
-- (doble clic en controltecchh) y ejecutá el archivo completo. Es idempotente: cada paso
-- verifica antes de aplicar, así que se puede volver a correr si se cortó.
-- No borra datos: todo lo existente pasa a la institución 1. Si hay nombres de laboratorio o de
-- software repetidos, el paso de unicidad correspondiente falla: corregí los duplicados y volvé
-- a ejecutar. El usuario SUPERADMIN lo crea el backend al iniciar (SUPERADMIN_EMAIL/PASSWORD).

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

-- 1. Tabla instituciones
CREATE TABLE IF NOT EXISTS instituciones (
  id_institucion   INT AUTO_INCREMENT PRIMARY KEY,
  nombre           VARCHAR(150) NOT NULL,
  slug             VARCHAR(60)  NOT NULL UNIQUE,
  cuit             VARCHAR(13)  NULL,
  direccion        VARCHAR(200) NULL,
  localidad        VARCHAR(100) NULL,
  provincia        VARCHAR(100) NULL,
  email_contacto   VARCHAR(150) NULL,
  telefono         VARCHAR(50)  NULL,
  logo_url         VARCHAR(300) NULL,
  estado           ENUM('Prueba','Activa','Suspendida') NOT NULL DEFAULT 'Prueba',
  fecha_fin_prueba DATE NULL,
  configurada      TINYINT(1) NOT NULL DEFAULT 0,
  fecha_alta       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- 2. Columnas id_institucion (NULL al principio)
CALL ct_si_falta((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'usuarios' AND COLUMN_NAME = 'id_institucion'), 'ALTER TABLE usuarios ADD COLUMN id_institucion INT NULL');
CALL ct_si_falta((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'laboratorios' AND COLUMN_NAME = 'id_institucion'), 'ALTER TABLE laboratorios ADD COLUMN id_institucion INT NULL');
CALL ct_si_falta((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'equipos' AND COLUMN_NAME = 'id_institucion'), 'ALTER TABLE equipos ADD COLUMN id_institucion INT NULL');
CALL ct_si_falta((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'software' AND COLUMN_NAME = 'id_institucion'), 'ALTER TABLE software ADD COLUMN id_institucion INT NULL');
CALL ct_si_falta((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'usuario_laboratorio' AND COLUMN_NAME = 'id_institucion'), 'ALTER TABLE usuario_laboratorio ADD COLUMN id_institucion INT NULL');
CALL ct_si_falta((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'historial_acciones' AND COLUMN_NAME = 'id_institucion'), 'ALTER TABLE historial_acciones ADD COLUMN id_institucion INT NULL');
CALL ct_si_falta((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'reportes' AND COLUMN_NAME = 'id_institucion'), 'ALTER TABLE reportes ADD COLUMN id_institucion INT NULL');

-- 3. Rol SUPERADMIN
INSERT IGNORE INTO roles (nombre_rol) VALUES ('SUPERADMIN');

-- 4. Datos existentes -> institución 1 (cambiá el nombre si querés; después se edita desde el sistema)
INSERT INTO instituciones (id_institucion, nombre, slug, estado, configurada)
SELECT 1, 'Institución principal', 'institucion-principal', 'Activa', 1 FROM DUAL
 WHERE NOT EXISTS (SELECT 1 FROM instituciones WHERE id_institucion = 1)
   AND (EXISTS (SELECT 1 FROM laboratorios) OR EXISTS (SELECT 1 FROM usuarios u JOIN roles r ON r.id_rol = u.id_rol WHERE r.nombre_rol <> 'SUPERADMIN'));
UPDATE usuarios u JOIN roles r ON r.id_rol = u.id_rol SET u.id_institucion = 1
 WHERE u.id_institucion IS NULL AND r.nombre_rol <> 'SUPERADMIN' AND EXISTS (SELECT 1 FROM instituciones WHERE id_institucion = 1);
UPDATE laboratorios SET id_institucion = 1 WHERE id_institucion IS NULL AND EXISTS (SELECT 1 FROM instituciones WHERE id_institucion = 1);
UPDATE software SET id_institucion = 1 WHERE id_institucion IS NULL AND EXISTS (SELECT 1 FROM instituciones WHERE id_institucion = 1);
UPDATE equipos e JOIN laboratorios l ON l.id_laboratorio = e.id_laboratorio SET e.id_institucion = l.id_institucion WHERE e.id_institucion IS NULL;
UPDATE usuario_laboratorio ul JOIN laboratorios l ON l.id_laboratorio = ul.id_laboratorio SET ul.id_institucion = l.id_institucion WHERE ul.id_institucion IS NULL;
UPDATE historial_acciones h JOIN usuarios u ON u.id_usuario = h.id_usuario SET h.id_institucion = u.id_institucion WHERE h.id_institucion IS NULL AND u.id_institucion IS NOT NULL;
UPDATE reportes r JOIN usuarios u ON u.id_usuario = r.id_usuario SET r.id_institucion = u.id_institucion WHERE r.id_institucion IS NULL AND u.id_institucion IS NOT NULL;

-- 5. NOT NULL (usuarios e historial_acciones quedan NULL para el SUPERADMIN)
CALL ct_si_falta((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'laboratorios' AND COLUMN_NAME = 'id_institucion' AND IS_NULLABLE = 'NO'), 'ALTER TABLE laboratorios MODIFY id_institucion INT NOT NULL');
CALL ct_si_falta((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'equipos' AND COLUMN_NAME = 'id_institucion' AND IS_NULLABLE = 'NO'), 'ALTER TABLE equipos MODIFY id_institucion INT NOT NULL');
CALL ct_si_falta((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'software' AND COLUMN_NAME = 'id_institucion' AND IS_NULLABLE = 'NO'), 'ALTER TABLE software MODIFY id_institucion INT NOT NULL');
CALL ct_si_falta((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'usuario_laboratorio' AND COLUMN_NAME = 'id_institucion' AND IS_NULLABLE = 'NO'), 'ALTER TABLE usuario_laboratorio MODIFY id_institucion INT NOT NULL');
CALL ct_si_falta((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'reportes' AND COLUMN_NAME = 'id_institucion' AND IS_NULLABLE = 'NO'), 'ALTER TABLE reportes MODIFY id_institucion INT NOT NULL');

-- 6. Unicidades por institución (primero la nueva, después se quita la global)
CALL ct_si_falta((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'usuarios' AND INDEX_NAME = 'uq_usuarios_id_institucion'), 'ALTER TABLE usuarios ADD UNIQUE KEY uq_usuarios_id_institucion (id_usuario, id_institucion)');
CALL ct_si_falta((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'laboratorios' AND INDEX_NAME = 'uq_laboratorios_id_institucion'), 'ALTER TABLE laboratorios ADD UNIQUE KEY uq_laboratorios_id_institucion (id_laboratorio, id_institucion)');
CALL ct_si_falta((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'laboratorios' AND INDEX_NAME = 'uq_laboratorios_nombre'), 'ALTER TABLE laboratorios ADD UNIQUE KEY uq_laboratorios_nombre (id_institucion, nombre)');
CALL ct_si_falta((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'equipos' AND INDEX_NAME = 'uq_equipos_identificador'), 'ALTER TABLE equipos ADD UNIQUE KEY uq_equipos_identificador (id_institucion, identificador)');
CALL ct_si_falta((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'equipos' AND INDEX_NAME = 'uq_equipos_nro_serie'), 'ALTER TABLE equipos ADD UNIQUE KEY uq_equipos_nro_serie (id_institucion, nro_serie)');
CALL ct_si_falta(1 - (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'equipos' AND INDEX_NAME = 'identificador'), 'ALTER TABLE equipos DROP INDEX identificador');
CALL ct_si_falta(1 - (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'equipos' AND INDEX_NAME = 'nro_serie'), 'ALTER TABLE equipos DROP INDEX nro_serie');
CALL ct_si_falta((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'software' AND INDEX_NAME = 'uq_software_nombre_version'), 'ALTER TABLE software ADD UNIQUE KEY uq_software_nombre_version (id_institucion, nombre_software, version)');
CALL ct_si_falta((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'licencias' AND INDEX_NAME = 'uq_licencias_numero'), 'ALTER TABLE licencias ADD UNIQUE KEY uq_licencias_numero (id_software, numero_licencia)');
CALL ct_si_falta(1 - (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'licencias' AND INDEX_NAME = 'numero_licencia'), 'ALTER TABLE licencias DROP INDEX numero_licencia');

-- 7. Claves foráneas
CALL ct_si_falta((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'usuarios' AND CONSTRAINT_NAME = 'fk_usuarios_institucion'), 'ALTER TABLE usuarios ADD CONSTRAINT fk_usuarios_institucion FOREIGN KEY (id_institucion) REFERENCES instituciones (id_institucion)');
CALL ct_si_falta((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'laboratorios' AND CONSTRAINT_NAME = 'fk_laboratorios_institucion'), 'ALTER TABLE laboratorios ADD CONSTRAINT fk_laboratorios_institucion FOREIGN KEY (id_institucion) REFERENCES instituciones (id_institucion)');
CALL ct_si_falta((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'equipos' AND CONSTRAINT_NAME = 'fk_equipos_institucion'), 'ALTER TABLE equipos ADD CONSTRAINT fk_equipos_institucion FOREIGN KEY (id_institucion) REFERENCES instituciones (id_institucion)');
CALL ct_si_falta((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'software' AND CONSTRAINT_NAME = 'fk_software_institucion'), 'ALTER TABLE software ADD CONSTRAINT fk_software_institucion FOREIGN KEY (id_institucion) REFERENCES instituciones (id_institucion)');
CALL ct_si_falta((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'usuario_laboratorio' AND CONSTRAINT_NAME = 'fk_usuario_laboratorio_institucion'), 'ALTER TABLE usuario_laboratorio ADD CONSTRAINT fk_usuario_laboratorio_institucion FOREIGN KEY (id_institucion) REFERENCES instituciones (id_institucion)');
CALL ct_si_falta((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'historial_acciones' AND CONSTRAINT_NAME = 'fk_historial_acciones_institucion'), 'ALTER TABLE historial_acciones ADD CONSTRAINT fk_historial_acciones_institucion FOREIGN KEY (id_institucion) REFERENCES instituciones (id_institucion)');
CALL ct_si_falta((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'reportes' AND CONSTRAINT_NAME = 'fk_reportes_institucion'), 'ALTER TABLE reportes ADD CONSTRAINT fk_reportes_institucion FOREIGN KEY (id_institucion) REFERENCES instituciones (id_institucion)');
CALL ct_si_falta((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'equipos' AND CONSTRAINT_NAME = 'fk_equipos_laboratorio_institucion'), 'ALTER TABLE equipos ADD CONSTRAINT fk_equipos_laboratorio_institucion FOREIGN KEY (id_laboratorio, id_institucion) REFERENCES laboratorios (id_laboratorio, id_institucion)');
CALL ct_si_falta((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'usuario_laboratorio' AND CONSTRAINT_NAME = 'fk_ul_laboratorio_institucion'), 'ALTER TABLE usuario_laboratorio ADD CONSTRAINT fk_ul_laboratorio_institucion FOREIGN KEY (id_laboratorio, id_institucion) REFERENCES laboratorios (id_laboratorio, id_institucion)');
CALL ct_si_falta((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'usuario_laboratorio' AND CONSTRAINT_NAME = 'fk_ul_usuario_institucion'), 'ALTER TABLE usuario_laboratorio ADD CONSTRAINT fk_ul_usuario_institucion FOREIGN KEY (id_usuario, id_institucion) REFERENCES usuarios (id_usuario, id_institucion)');

DROP PROCEDURE IF EXISTS ct_si_falta;
