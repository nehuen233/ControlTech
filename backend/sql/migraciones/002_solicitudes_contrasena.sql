-- ControlTech - Migracion 002: solicitudes de cambio de contraseña ("¿Olvidaste tu contraseña?").
-- El backend la aplica solo al iniciar. Ejecutala a mano solo si en la terminal
-- aparece "No se pudo crear la tabla solicitudes_contrasena" (el usuario de MySQL
-- del backend no tiene permiso CREATE). Seleccioná la base de ControlTech antes.
-- Solo crea una tabla nueva: no modifica datos existentes.
CREATE TABLE IF NOT EXISTS solicitudes_contrasena (
  id_solicitud INT AUTO_INCREMENT PRIMARY KEY,
  id_usuario INT NOT NULL,
  mensaje VARCHAR(300) NULL,
  fecha_solicitud DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  estado ENUM('Pendiente','Atendida','Descartada') NOT NULL DEFAULT 'Pendiente',
  fecha_atencion DATETIME NULL,
  id_atendida_por INT NULL,
  FOREIGN KEY (id_usuario) REFERENCES usuarios(id_usuario) ON DELETE CASCADE,
  FOREIGN KEY (id_atendida_por) REFERENCES usuarios(id_usuario) ON DELETE SET NULL
) ENGINE=InnoDB;
