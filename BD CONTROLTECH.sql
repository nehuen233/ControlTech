-- ============================================================================
-- ControlTech - esquema de la base (multi-institución)
-- Crea la base `controltecchh` con todas las tablas. Una instalación nueva nace sin
-- colegios ni datos: el SUPERADMIN (SUPERADMIN_EMAIL / SUPERADMIN_PASSWORD del .env)
-- lo crea el backend al iniciar, y desde el sistema da de alta cada institución con su
-- primer administrador. Los datos de demostración se cargan aparte, en la institución
-- "Demo": `npm run db:demo` (backend) o el archivo "CONTROL TECH INSERTS.sql".
--
-- Una base EXISTENTE (versión de un solo colegio) NO se recrea con este archivo:
-- el backend la migra solo al iniciar (backend/src/config/migracion003.js).
-- ============================================================================

CREATE DATABASE controltecchh CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE controltecchh;

CREATE TABLE roles (
 id_rol INT AUTO_INCREMENT PRIMARY KEY,
 nombre_rol VARCHAR(50) NOT NULL UNIQUE
) ENGINE=InnoDB;

-- Cada colegio es una fila. `configurada` la usa el asistente de configuración inicial.
CREATE TABLE instituciones (
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

CREATE TABLE laboratorios (
 id_laboratorio INT AUTO_INCREMENT PRIMARY KEY,
 nombre VARCHAR(100) NOT NULL,
 descripcion TEXT,
 edificio VARCHAR(100),
 piso VARCHAR(50),
 ubicacion VARCHAR(150),
 capacidad_equipos INT,
 estado ENUM('Activo','Inactivo') NOT NULL DEFAULT 'Activo',
 codigo_acceso VARCHAR(100),
 id_institucion INT NOT NULL,
 CONSTRAINT chk_capacidad CHECK (capacidad_equipos IS NULL OR capacidad_equipos >= 0),
 UNIQUE KEY uq_laboratorios_id_institucion (id_laboratorio, id_institucion),
 UNIQUE KEY uq_laboratorios_nombre (id_institucion, nombre),
 CONSTRAINT fk_laboratorios_institucion FOREIGN KEY (id_institucion) REFERENCES instituciones (id_institucion)
) ENGINE=InnoDB;

-- id_institucion NULL solo para el SUPERADMIN. El email es único en todo el sistema.
CREATE TABLE usuarios (
 id_usuario INT AUTO_INCREMENT PRIMARY KEY,
 nombre VARCHAR(80) NOT NULL,
 apellido VARCHAR(80) NOT NULL,
 email VARCHAR(150) NOT NULL UNIQUE,
 contrasena VARCHAR(255) NOT NULL,
 id_rol INT NOT NULL,
 bloqueado TINYINT(1) NOT NULL DEFAULT 0,
 id_institucion INT NULL,
 FOREIGN KEY (id_rol) REFERENCES roles(id_rol),
 UNIQUE KEY uq_usuarios_id_institucion (id_usuario, id_institucion),
 CONSTRAINT fk_usuarios_institucion FOREIGN KEY (id_institucion) REFERENCES instituciones (id_institucion)
) ENGINE=InnoDB;

-- Usuario y laboratorio de la MISMA institución (claves foráneas compuestas).
CREATE TABLE usuario_laboratorio (
 id_usuario INT NOT NULL,
 id_laboratorio INT NOT NULL,
 id_institucion INT NOT NULL,
 PRIMARY KEY (id_usuario,id_laboratorio),
 FOREIGN KEY (id_usuario) REFERENCES usuarios(id_usuario),
 FOREIGN KEY (id_laboratorio) REFERENCES laboratorios(id_laboratorio),
 CONSTRAINT fk_usuario_laboratorio_institucion FOREIGN KEY (id_institucion) REFERENCES instituciones (id_institucion),
 CONSTRAINT fk_ul_usuario_institucion FOREIGN KEY (id_usuario, id_institucion) REFERENCES usuarios (id_usuario, id_institucion),
 CONSTRAINT fk_ul_laboratorio_institucion FOREIGN KEY (id_laboratorio, id_institucion) REFERENCES laboratorios (id_laboratorio, id_institucion)
) ENGINE=InnoDB;

-- Identificador y número de serie únicos POR institución; el laboratorio debe ser de la misma.
CREATE TABLE equipos (
 id_equipo INT AUTO_INCREMENT PRIMARY KEY,
 identificador VARCHAR(50) NOT NULL,
 nro_serie VARCHAR(100) NOT NULL,
 tipo VARCHAR(80) NOT NULL DEFAULT 'Computadora',
 marca VARCHAR(80) NOT NULL,
 modelo VARCHAR(100),
 procesador VARCHAR(100),
 ram VARCHAR(50),
 almacenamiento VARCHAR(100),
 estado ENUM('Operativo','Disponible','En uso','En mantenimiento','Fuera de servicio') NOT NULL DEFAULT 'Operativo',
 fecha_registro DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 id_laboratorio INT NOT NULL,
 id_responsable INT NULL,
 id_institucion INT NOT NULL,
 FOREIGN KEY (id_laboratorio) REFERENCES laboratorios(id_laboratorio),
 FOREIGN KEY (id_responsable) REFERENCES usuarios(id_usuario),
 UNIQUE KEY uq_equipos_identificador (id_institucion, identificador),
 UNIQUE KEY uq_equipos_nro_serie (id_institucion, nro_serie),
 CONSTRAINT fk_equipos_institucion FOREIGN KEY (id_institucion) REFERENCES instituciones (id_institucion),
 CONSTRAINT fk_equipos_laboratorio_institucion FOREIGN KEY (id_laboratorio, id_institucion) REFERENCES laboratorios (id_laboratorio, id_institucion)
) ENGINE=InnoDB;

-- Catálogo de software propio de cada institución.
CREATE TABLE software (
 id_software INT AUTO_INCREMENT PRIMARY KEY,
 nombre_software VARCHAR(100) NOT NULL,
 version VARCHAR(50),
 proveedor VARCHAR(100),
 descripcion TEXT,
 id_institucion INT NOT NULL,
 UNIQUE KEY uq_software_nombre_version (id_institucion, nombre_software, version),
 CONSTRAINT fk_software_institucion FOREIGN KEY (id_institucion) REFERENCES instituciones (id_institucion)
) ENGINE=InnoDB;

CREATE TABLE equipo_software (
 id_equipo INT NOT NULL,
 id_software INT NOT NULL,
 fecha_instalacion DATE,
 PRIMARY KEY (id_equipo,id_software),
 FOREIGN KEY (id_equipo) REFERENCES equipos(id_equipo) ON DELETE CASCADE,
 FOREIGN KEY (id_software) REFERENCES software(id_software) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE licencias (
 id_licencia INT AUTO_INCREMENT PRIMARY KEY,
 id_software INT NOT NULL,
 tipo_licencia ENUM('Gratuita','Pago','Prueba') NOT NULL,
 numero_licencia VARCHAR(150),
 fecha_vencimiento DATE,
 estado ENUM('Activa','Vencida','Suspendida') NOT NULL DEFAULT 'Activa',
 FOREIGN KEY (id_software) REFERENCES software(id_software),
 UNIQUE KEY uq_licencias_numero (id_software, numero_licencia)
) ENGINE=InnoDB;

CREATE TABLE mantenimientos (
 id_mantenimiento INT AUTO_INCREMENT PRIMARY KEY,
 id_equipo INT NOT NULL,
 id_usuario INT NOT NULL,
 fecha_mantenimiento DATE NOT NULL,
 tipo ENUM('Preventivo','Correctivo','Actualizacion') NOT NULL,
 detalle TEXT NOT NULL,
 costo DECIMAL(10,2),
 notas_adicionales TEXT,
 estado ENUM('Pendiente','En proceso','Completado') NOT NULL DEFAULT 'Pendiente',
 FOREIGN KEY (id_equipo) REFERENCES equipos(id_equipo),
 FOREIGN KEY (id_usuario) REFERENCES usuarios(id_usuario),
 CONSTRAINT chk_costo CHECK (costo IS NULL OR costo >= 0)
) ENGINE=InnoDB;

CREATE TABLE alertas (
 id_alerta INT AUTO_INCREMENT PRIMARY KEY,
 id_equipo INT NOT NULL,
 titulo VARCHAR(150) NOT NULL,
 descripcion TEXT NOT NULL,
 severidad ENUM('Baja','Media','Alta','Critica') NOT NULL DEFAULT 'Media',
 fecha_creacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 fecha_limite DATE,
 estado ENUM('Activa','Resuelta') NOT NULL DEFAULT 'Activa',
 FOREIGN KEY (id_equipo) REFERENCES equipos(id_equipo)
) ENGINE=InnoDB;

-- id_institucion NULL en las acciones del SUPERADMIN.
CREATE TABLE historial_acciones (
 id_accion INT AUTO_INCREMENT PRIMARY KEY,
 id_usuario INT NOT NULL,
 accion ENUM('Crear','Modificar','Eliminar') NOT NULL,
 entidad VARCHAR(80) NOT NULL,
 id_registro INT,
 detalle TEXT,
 fecha_hora DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 id_institucion INT NULL,
 FOREIGN KEY (id_usuario) REFERENCES usuarios(id_usuario),
 CONSTRAINT fk_historial_acciones_institucion FOREIGN KEY (id_institucion) REFERENCES instituciones (id_institucion)
) ENGINE=InnoDB;

CREATE TABLE reportes (
 id_reporte INT AUTO_INCREMENT PRIMARY KEY,
 id_usuario INT NOT NULL,
 tipo VARCHAR(80) NOT NULL,
 descripcion TEXT,
 fecha_generacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 id_institucion INT NOT NULL,
 FOREIGN KEY (id_usuario) REFERENCES usuarios(id_usuario),
 CONSTRAINT fk_reportes_institucion FOREIGN KEY (id_institucion) REFERENCES instituciones (id_institucion)
) ENGINE=InnoDB;

-- Pedidos de "¿Olvidaste tu contraseña?" (heredan la institución por el usuario).
CREATE TABLE solicitudes_contrasena (
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

INSERT INTO roles (nombre_rol) VALUES
('ADMINISTRADOR'),('ENCARGADO'),('DOCENTE'),('DIRECTIVO'),('TECNICO'),('DOCENTE DE LABORATORIO'),('SUPERADMIN');

SHOW TABLES;
