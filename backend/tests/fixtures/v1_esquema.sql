
CREATE DATABASE controltecchh CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE controltecchh;

CREATE TABLE roles (
 id_rol INT AUTO_INCREMENT PRIMARY KEY,
 nombre_rol VARCHAR(50) NOT NULL UNIQUE
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
 CONSTRAINT chk_capacidad CHECK (capacidad_equipos IS NULL OR capacidad_equipos >= 0)
) ENGINE=InnoDB;

CREATE TABLE usuarios (
 id_usuario INT AUTO_INCREMENT PRIMARY KEY,
 nombre VARCHAR(80) NOT NULL,
 apellido VARCHAR(80) NOT NULL,
 email VARCHAR(150) NOT NULL UNIQUE,
 contrasena VARCHAR(255) NOT NULL,
 id_rol INT NOT NULL,
 FOREIGN KEY (id_rol) REFERENCES roles(id_rol)
) ENGINE=InnoDB;

CREATE TABLE usuario_laboratorio (
 id_usuario INT NOT NULL,
 id_laboratorio INT NOT NULL,
 PRIMARY KEY (id_usuario,id_laboratorio),
 FOREIGN KEY (id_usuario) REFERENCES usuarios(id_usuario),
 FOREIGN KEY (id_laboratorio) REFERENCES laboratorios(id_laboratorio)
) ENGINE=InnoDB;

CREATE TABLE equipos (
 id_equipo INT AUTO_INCREMENT PRIMARY KEY,
 identificador VARCHAR(50) NOT NULL UNIQUE,
 nro_serie VARCHAR(100) NOT NULL UNIQUE,
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
 FOREIGN KEY (id_laboratorio) REFERENCES laboratorios(id_laboratorio),
 FOREIGN KEY (id_responsable) REFERENCES usuarios(id_usuario)
) ENGINE=InnoDB;

CREATE TABLE software (
 id_software INT AUTO_INCREMENT PRIMARY KEY,
 nombre_software VARCHAR(100) NOT NULL,
 version VARCHAR(50),
 proveedor VARCHAR(100),
 descripcion TEXT
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
 numero_licencia VARCHAR(150) UNIQUE,
 fecha_vencimiento DATE,
 estado ENUM('Activa','Vencida','Suspendida') NOT NULL DEFAULT 'Activa',
 FOREIGN KEY (id_software) REFERENCES software(id_software)
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

CREATE TABLE historial_acciones (
 id_accion INT AUTO_INCREMENT PRIMARY KEY,
 id_usuario INT NOT NULL,
 accion ENUM('Crear','Modificar','Eliminar') NOT NULL,
 entidad VARCHAR(80) NOT NULL,
 id_registro INT,
 detalle TEXT,
 fecha_hora DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY (id_usuario) REFERENCES usuarios(id_usuario)
) ENGINE=InnoDB;

CREATE TABLE reportes (
 id_reporte INT AUTO_INCREMENT PRIMARY KEY,
 id_usuario INT NOT NULL,
 tipo VARCHAR(80) NOT NULL,
 descripcion TEXT,
 fecha_generacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY (id_usuario) REFERENCES usuarios(id_usuario)
) ENGINE=InnoDB;

INSERT INTO roles (nombre_rol) VALUES
('ADMINISTRADOR'),('ENCARGADO'),('DOCENTE'),('DIRECTIVO');

SHOW TABLES;
