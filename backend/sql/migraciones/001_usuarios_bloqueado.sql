-- ControlTech - Migracion 001: bloqueo de usuarios.
-- El backend la aplica solo al iniciar. Ejecutala a mano solo si en la terminal
-- aparece "No se pudo agregar la columna usuarios.bloqueado" (el usuario de MySQL
-- del backend no tiene permiso ALTER). Seleccioná la base de ControlTech antes.
-- No modifica datos: todos los usuarios quedan desbloqueados (0).
ALTER TABLE usuarios ADD COLUMN bloqueado TINYINT(1) NOT NULL DEFAULT 0;
