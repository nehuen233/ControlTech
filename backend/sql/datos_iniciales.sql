-- ============================================================================
-- ControlTech - Carga segura de laboratorios, equipos y software
-- Generado a partir de "CONTROL TECH INSERTS.sql" (mismos datos).
--
-- Se puede ejecutar sobre una base que ya tiene datos y repetirse las veces que
-- haga falta: solo agrega lo que falta y NO duplica registros.
--   * No crea, modifica ni elimina usuarios (el administrador queda intacto).
--   * No toca mantenimientos, alertas, historial ni reportes.
--   * Laboratorios y software se identifican por nombre; equipos por
--     identificador / numero de serie (claves UNIQUE).
--
-- Ejecutar con:  npm run db:cargar   (desde la carpeta backend)
-- o en phpMyAdmin / consola, con la base de ControlTech seleccionada.
-- ============================================================================

-- 1. ROLES (nombre_rol es UNIQUE)
INSERT IGNORE INTO roles (nombre_rol) VALUES
('ADMINISTRADOR'), ('ENCARGADO'), ('DOCENTE'), ('DIRECTIVO'), ('TECNICO'), ('DOCENTE DE LABORATORIO');

-- 2. LABORATORIOS DEL COLEGIO (solo los que no existen por nombre)
INSERT INTO laboratorios (nombre, descripcion, edificio, piso, ubicacion, capacidad_equipos, estado, codigo_acceso)
SELECT 'Laboratorio 4-1', 'Laboratorio del cuarto piso para clases y actividades educativas con computadoras', 'Edificio principal del colegio', '4to piso', 'Sector 4-1', 15, 'Activo', NULL FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM laboratorios WHERE nombre = 'Laboratorio 4-1');
INSERT INTO laboratorios (nombre, descripcion, edificio, piso, ubicacion, capacidad_equipos, estado, codigo_acceso)
SELECT 'Laboratorio 4-2', 'Laboratorio del cuarto piso para clases y actividades educativas con computadoras', 'Edificio principal del colegio', '4to piso', 'Sector 4-2', 15, 'Activo', NULL FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM laboratorios WHERE nombre = 'Laboratorio 4-2');
INSERT INTO laboratorios (nombre, descripcion, edificio, piso, ubicacion, capacidad_equipos, estado, codigo_acceso)
SELECT 'Laboratorio 4-3', 'Laboratorio del cuarto piso para clases y actividades educativas con computadoras', 'Edificio principal del colegio', '4to piso', 'Sector 4-3', 15, 'Activo', NULL FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM laboratorios WHERE nombre = 'Laboratorio 4-3');
INSERT INTO laboratorios (nombre, descripcion, edificio, piso, ubicacion, capacidad_equipos, estado, codigo_acceso)
SELECT 'Laboratorio 4-4', 'Laboratorio del cuarto piso para clases y actividades educativas con computadoras', 'Edificio principal del colegio', '4to piso', 'Sector 4-4', 15, 'Activo', NULL FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM laboratorios WHERE nombre = 'Laboratorio 4-4');
INSERT INTO laboratorios (nombre, descripcion, edificio, piso, ubicacion, capacidad_equipos, estado, codigo_acceso)
SELECT 'Laboratorio 5-1', 'Laboratorio del quinto piso para clases y actividades educativas con computadoras', 'Edificio principal del colegio', '5to piso', 'Ala izquierda', 15, 'Activo', NULL FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM laboratorios WHERE nombre = 'Laboratorio 5-1');
INSERT INTO laboratorios (nombre, descripcion, edificio, piso, ubicacion, capacidad_equipos, estado, codigo_acceso)
SELECT 'Laboratorio 5-2', 'Laboratorio del quinto piso para clases y actividades educativas con computadoras', 'Edificio principal del colegio', '5to piso', 'Ala Derecha', 15, 'Activo', NULL FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM laboratorios WHERE nombre = 'Laboratorio 5-2');

-- 3. ASIGNACION DE USUARIOS A LABORATORIOS
-- Solo usuarios que ya existen y solo sobre los seis laboratorios originales
-- (no se agregan permisos sobre laboratorios creados despues).
-- Administrador: los seis laboratorios.
INSERT IGNORE INTO usuario_laboratorio (id_usuario, id_laboratorio)
SELECT u.id_usuario, l.id_laboratorio
FROM usuarios u CROSS JOIN laboratorios l
WHERE u.email = 'admin@controltech.com'
  AND l.nombre IN ('Laboratorio 4-1', 'Laboratorio 4-2', 'Laboratorio 4-3', 'Laboratorio 4-4', 'Laboratorio 5-1', 'Laboratorio 5-2');

-- Carlos: los cuatro laboratorios del 4to piso.
INSERT IGNORE INTO usuario_laboratorio (id_usuario, id_laboratorio)
SELECT u.id_usuario, l.id_laboratorio
FROM usuarios u CROSS JOIN laboratorios l
WHERE u.email = 'carlos@suiza26.edu'
  AND l.piso = '4to piso'
  AND l.nombre IN ('Laboratorio 4-1', 'Laboratorio 4-2', 'Laboratorio 4-3', 'Laboratorio 4-4', 'Laboratorio 5-1', 'Laboratorio 5-2');

-- Diego: los dos laboratorios del 5to piso.
INSERT IGNORE INTO usuario_laboratorio (id_usuario, id_laboratorio)
SELECT u.id_usuario, l.id_laboratorio
FROM usuarios u CROSS JOIN laboratorios l
WHERE u.email = 'diego@suiza26.edu'
  AND l.piso = '5to piso'
  AND l.nombre IN ('Laboratorio 4-1', 'Laboratorio 4-2', 'Laboratorio 4-3', 'Laboratorio 4-4', 'Laboratorio 5-1', 'Laboratorio 5-2');

-- Docentes: laboratorios donde se les asigna acceso de demostracion.
INSERT IGNORE INTO usuario_laboratorio (id_usuario, id_laboratorio)
SELECT u.id_usuario, l.id_laboratorio
FROM usuarios u CROSS JOIN laboratorios l
WHERE u.email = 'pedro@suiza26.edu'
  AND l.nombre = 'Laboratorio 4-1';


INSERT IGNORE INTO usuario_laboratorio (id_usuario, id_laboratorio)
SELECT u.id_usuario, l.id_laboratorio
FROM usuarios u CROSS JOIN laboratorios l
WHERE u.email = 'maria@suiza26.edu'
  AND l.nombre IN ('Laboratorio 4-2', 'Laboratorio 4-3');

INSERT IGNORE INTO usuario_laboratorio (id_usuario, id_laboratorio)
SELECT u.id_usuario, l.id_laboratorio
FROM usuarios u CROSS JOIN laboratorios l
WHERE u.email = 'sofia@suiza26.edu'
  AND l.nombre IN ('Laboratorio 5-1', 'Laboratorio 5-2');

-- 4. COMPUTADORAS: 12 por laboratorio, 72 en total (INSERT IGNORE omite las ya registradas)
INSERT IGNORE INTO equipos
(identificador, nro_serie, tipo, marca, modelo, procesador, ram, almacenamiento,
 estado, id_laboratorio, id_responsable)
VALUES

('PC-4A-01', 'CT26-4A-001', 'Computadora', 'Dell', 'OptiPlex 7090', 'Intel Core i5-11500', '16 GB', '512 GB SSD', 'Operativo', (SELECT id_laboratorio FROM laboratorios WHERE nombre = 'Laboratorio 4-1'), (SELECT id_usuario FROM usuarios WHERE email = 'carlos@suiza26.edu')),
('PC-4A-02', 'CT26-4A-002', 'Computadora', 'HP', 'ProDesk 600 G6', 'Intel Core i5-10500', '16 GB', '512 GB SSD', 'Operativo', (SELECT id_laboratorio FROM laboratorios WHERE nombre = 'Laboratorio 4-1'), (SELECT id_usuario FROM usuarios WHERE email = 'carlos@suiza26.edu')),
('PC-4A-03', 'CT26-4A-003', 'Computadora', 'Lenovo', 'ThinkCentre M720', 'Intel Core i5-8500', '8 GB', '256 GB SSD', 'Operativo', (SELECT id_laboratorio FROM laboratorios WHERE nombre = 'Laboratorio 4-1'), (SELECT id_usuario FROM usuarios WHERE email = 'carlos@suiza26.edu')),
('PC-4A-04', 'CT26-4A-004', 'Computadora', 'Dell', 'OptiPlex 3080', 'Intel Core i3-10100', '8 GB', '256 GB SSD', 'Operativo', (SELECT id_laboratorio FROM laboratorios WHERE nombre = 'Laboratorio 4-1'), (SELECT id_usuario FROM usuarios WHERE email = 'carlos@suiza26.edu')),
('PC-4A-05', 'CT26-4A-005', 'Computadora', 'HP', 'ProDesk 400 G7', 'Intel Core i5-10500', '16 GB', '1 TB HDD', 'Operativo', (SELECT id_laboratorio FROM laboratorios WHERE nombre = 'Laboratorio 4-1'), (SELECT id_usuario FROM usuarios WHERE email = 'carlos@suiza26.edu')),
('PC-4A-06', 'CT26-4A-006', 'Computadora', 'Lenovo', 'ThinkCentre M75', 'AMD Ryzen 5', '16 GB', '512 GB SSD', 'Operativo', (SELECT id_laboratorio FROM laboratorios WHERE nombre = 'Laboratorio 4-1'), (SELECT id_usuario FROM usuarios WHERE email = 'carlos@suiza26.edu')),
('PC-4A-07', 'CT26-4A-007', 'Computadora', 'Dell', 'OptiPlex 7090', 'Intel Core i5-11500', '16 GB', '512 GB SSD', 'En uso', (SELECT id_laboratorio FROM laboratorios WHERE nombre = 'Laboratorio 4-1'), (SELECT id_usuario FROM usuarios WHERE email = 'carlos@suiza26.edu')),
('PC-4A-08', 'CT26-4A-008', 'Computadora', 'HP', 'ProDesk 600 G6', 'Intel Core i5-10500', '16 GB', '512 GB SSD', 'En uso', (SELECT id_laboratorio FROM laboratorios WHERE nombre = 'Laboratorio 4-1'), (SELECT id_usuario FROM usuarios WHERE email = 'carlos@suiza26.edu')),
('PC-4A-09', 'CT26-4A-009', 'Computadora', 'Lenovo', 'ThinkCentre M720', 'Intel Core i5-8500', '8 GB', '256 GB SSD', 'Disponible', (SELECT id_laboratorio FROM laboratorios WHERE nombre = 'Laboratorio 4-1'), (SELECT id_usuario FROM usuarios WHERE email = 'carlos@suiza26.edu')),
('PC-4A-10', 'CT26-4A-010', 'Computadora', 'Dell', 'OptiPlex 3080', 'Intel Core i3-10100', '8 GB', '256 GB SSD', 'Disponible', (SELECT id_laboratorio FROM laboratorios WHERE nombre = 'Laboratorio 4-1'), (SELECT id_usuario FROM usuarios WHERE email = 'carlos@suiza26.edu')),
('PC-4A-11', 'CT26-4A-011', 'Computadora', 'HP', 'ProDesk 400 G7', 'Intel Core i5-10500', '16 GB', '1 TB HDD', 'En mantenimiento', (SELECT id_laboratorio FROM laboratorios WHERE nombre = 'Laboratorio 4-1'), (SELECT id_usuario FROM usuarios WHERE email = 'carlos@suiza26.edu')),
('PC-4A-12', 'CT26-4A-012', 'Computadora', 'Lenovo', 'ThinkCentre M75', 'AMD Ryzen 5', '16 GB', '512 GB SSD', 'Fuera de servicio', (SELECT id_laboratorio FROM laboratorios WHERE nombre = 'Laboratorio 4-1'), (SELECT id_usuario FROM usuarios WHERE email = 'carlos@suiza26.edu')),
('PC-4B-01', 'CT26-4B-001', 'Computadora', 'Dell', 'OptiPlex 7090', 'Intel Core i5-11500', '16 GB', '512 GB SSD', 'Operativo', (SELECT id_laboratorio FROM laboratorios WHERE nombre = 'Laboratorio 4-2'), (SELECT id_usuario FROM usuarios WHERE email = 'carlos@suiza26.edu')),
('PC-4B-02', 'CT26-4B-002', 'Computadora', 'HP', 'ProDesk 600 G6', 'Intel Core i5-10500', '16 GB', '512 GB SSD', 'Operativo', (SELECT id_laboratorio FROM laboratorios WHERE nombre = 'Laboratorio 4-2'), (SELECT id_usuario FROM usuarios WHERE email = 'carlos@suiza26.edu')),
('PC-4B-03', 'CT26-4B-003', 'Computadora', 'Lenovo', 'ThinkCentre M720', 'Intel Core i5-8500', '8 GB', '256 GB SSD', 'Operativo', (SELECT id_laboratorio FROM laboratorios WHERE nombre = 'Laboratorio 4-2'), (SELECT id_usuario FROM usuarios WHERE email = 'carlos@suiza26.edu')),
('PC-4B-04', 'CT26-4B-004', 'Computadora', 'Dell', 'OptiPlex 3080', 'Intel Core i3-10100', '8 GB', '256 GB SSD', 'Operativo', (SELECT id_laboratorio FROM laboratorios WHERE nombre = 'Laboratorio 4-2'), (SELECT id_usuario FROM usuarios WHERE email = 'carlos@suiza26.edu')),
('PC-4B-05', 'CT26-4B-005', 'Computadora', 'HP', 'ProDesk 400 G7', 'Intel Core i5-10500', '16 GB', '1 TB HDD', 'Operativo', (SELECT id_laboratorio FROM laboratorios WHERE nombre = 'Laboratorio 4-2'), (SELECT id_usuario FROM usuarios WHERE email = 'carlos@suiza26.edu')),
('PC-4B-06', 'CT26-4B-006', 'Computadora', 'Lenovo', 'ThinkCentre M75', 'AMD Ryzen 5', '16 GB', '512 GB SSD', 'Operativo', (SELECT id_laboratorio FROM laboratorios WHERE nombre = 'Laboratorio 4-2'), (SELECT id_usuario FROM usuarios WHERE email = 'carlos@suiza26.edu')),
('PC-4B-07', 'CT26-4B-007', 'Computadora', 'Dell', 'OptiPlex 7090', 'Intel Core i5-11500', '16 GB', '512 GB SSD', 'En uso', (SELECT id_laboratorio FROM laboratorios WHERE nombre = 'Laboratorio 4-2'), (SELECT id_usuario FROM usuarios WHERE email = 'carlos@suiza26.edu')),
('PC-4B-08', 'CT26-4B-008', 'Computadora', 'HP', 'ProDesk 600 G6', 'Intel Core i5-10500', '16 GB', '512 GB SSD', 'En uso', (SELECT id_laboratorio FROM laboratorios WHERE nombre = 'Laboratorio 4-2'), (SELECT id_usuario FROM usuarios WHERE email = 'carlos@suiza26.edu')),
('PC-4B-09', 'CT26-4B-009', 'Computadora', 'Lenovo', 'ThinkCentre M720', 'Intel Core i5-8500', '8 GB', '256 GB SSD', 'Disponible', (SELECT id_laboratorio FROM laboratorios WHERE nombre = 'Laboratorio 4-2'), (SELECT id_usuario FROM usuarios WHERE email = 'carlos@suiza26.edu')),
('PC-4B-10', 'CT26-4B-010', 'Computadora', 'Dell', 'OptiPlex 3080', 'Intel Core i3-10100', '8 GB', '256 GB SSD', 'Disponible', (SELECT id_laboratorio FROM laboratorios WHERE nombre = 'Laboratorio 4-2'), (SELECT id_usuario FROM usuarios WHERE email = 'carlos@suiza26.edu')),
('PC-4B-11', 'CT26-4B-011', 'Computadora', 'HP', 'ProDesk 400 G7', 'Intel Core i5-10500', '16 GB', '1 TB HDD', 'En mantenimiento', (SELECT id_laboratorio FROM laboratorios WHERE nombre = 'Laboratorio 4-2'), (SELECT id_usuario FROM usuarios WHERE email = 'carlos@suiza26.edu')),
('PC-4B-12', 'CT26-4B-012', 'Computadora', 'Lenovo', 'ThinkCentre M75', 'AMD Ryzen 5', '16 GB', '512 GB SSD', 'Fuera de servicio', (SELECT id_laboratorio FROM laboratorios WHERE nombre = 'Laboratorio 4-2'), (SELECT id_usuario FROM usuarios WHERE email = 'carlos@suiza26.edu')),
('PC-4C-01', 'CT26-4C-001', 'Computadora', 'Dell', 'OptiPlex 7090', 'Intel Core i5-11500', '16 GB', '512 GB SSD', 'Operativo', (SELECT id_laboratorio FROM laboratorios WHERE nombre = 'Laboratorio 4-3'), (SELECT id_usuario FROM usuarios WHERE email = 'carlos@suiza26.edu')),
('PC-4C-02', 'CT26-4C-002', 'Computadora', 'HP', 'ProDesk 600 G6', 'Intel Core i5-10500', '16 GB', '512 GB SSD', 'Operativo', (SELECT id_laboratorio FROM laboratorios WHERE nombre = 'Laboratorio 4-3'), (SELECT id_usuario FROM usuarios WHERE email = 'carlos@suiza26.edu')),
('PC-4C-03', 'CT26-4C-003', 'Computadora', 'Lenovo', 'ThinkCentre M720', 'Intel Core i5-8500', '8 GB', '256 GB SSD', 'Operativo', (SELECT id_laboratorio FROM laboratorios WHERE nombre = 'Laboratorio 4-3'), (SELECT id_usuario FROM usuarios WHERE email = 'carlos@suiza26.edu')),
('PC-4C-04', 'CT26-4C-004', 'Computadora', 'Dell', 'OptiPlex 3080', 'Intel Core i3-10100', '8 GB', '256 GB SSD', 'Operativo', (SELECT id_laboratorio FROM laboratorios WHERE nombre = 'Laboratorio 4-3'), (SELECT id_usuario FROM usuarios WHERE email = 'carlos@suiza26.edu')),
('PC-4C-05', 'CT26-4C-005', 'Computadora', 'HP', 'ProDesk 400 G7', 'Intel Core i5-10500', '16 GB', '1 TB HDD', 'Operativo', (SELECT id_laboratorio FROM laboratorios WHERE nombre = 'Laboratorio 4-3'), (SELECT id_usuario FROM usuarios WHERE email = 'carlos@suiza26.edu')),
('PC-4C-06', 'CT26-4C-006', 'Computadora', 'Lenovo', 'ThinkCentre M75', 'AMD Ryzen 5', '16 GB', '512 GB SSD', 'Operativo', (SELECT id_laboratorio FROM laboratorios WHERE nombre = 'Laboratorio 4-3'), (SELECT id_usuario FROM usuarios WHERE email = 'carlos@suiza26.edu')),
('PC-4C-07', 'CT26-4C-007', 'Computadora', 'Dell', 'OptiPlex 7090', 'Intel Core i5-11500', '16 GB', '512 GB SSD', 'En uso', (SELECT id_laboratorio FROM laboratorios WHERE nombre = 'Laboratorio 4-3'), (SELECT id_usuario FROM usuarios WHERE email = 'carlos@suiza26.edu')),
('PC-4C-08', 'CT26-4C-008', 'Computadora', 'HP', 'ProDesk 600 G6', 'Intel Core i5-10500', '16 GB', '512 GB SSD', 'En uso', (SELECT id_laboratorio FROM laboratorios WHERE nombre = 'Laboratorio 4-3'), (SELECT id_usuario FROM usuarios WHERE email = 'carlos@suiza26.edu')),
('PC-4C-09', 'CT26-4C-009', 'Computadora', 'Lenovo', 'ThinkCentre M720', 'Intel Core i5-8500', '8 GB', '256 GB SSD', 'Disponible', (SELECT id_laboratorio FROM laboratorios WHERE nombre = 'Laboratorio 4-3'), (SELECT id_usuario FROM usuarios WHERE email = 'carlos@suiza26.edu')),
('PC-4C-10', 'CT26-4C-010', 'Computadora', 'Dell', 'OptiPlex 3080', 'Intel Core i3-10100', '8 GB', '256 GB SSD', 'Disponible', (SELECT id_laboratorio FROM laboratorios WHERE nombre = 'Laboratorio 4-3'), (SELECT id_usuario FROM usuarios WHERE email = 'carlos@suiza26.edu')),
('PC-4C-11', 'CT26-4C-011', 'Computadora', 'HP', 'ProDesk 400 G7', 'Intel Core i5-10500', '16 GB', '1 TB HDD', 'En mantenimiento', (SELECT id_laboratorio FROM laboratorios WHERE nombre = 'Laboratorio 4-3'), (SELECT id_usuario FROM usuarios WHERE email = 'carlos@suiza26.edu')),
('PC-4C-12', 'CT26-4C-012', 'Computadora', 'Lenovo', 'ThinkCentre M75', 'AMD Ryzen 5', '16 GB', '512 GB SSD', 'Fuera de servicio', (SELECT id_laboratorio FROM laboratorios WHERE nombre = 'Laboratorio 4-3'), (SELECT id_usuario FROM usuarios WHERE email = 'carlos@suiza26.edu')),
('PC-4D-01', 'CT26-4D-001', 'Computadora', 'Dell', 'OptiPlex 7090', 'Intel Core i5-11500', '16 GB', '512 GB SSD', 'Operativo', (SELECT id_laboratorio FROM laboratorios WHERE nombre = 'Laboratorio 4-4'), (SELECT id_usuario FROM usuarios WHERE email = 'carlos@suiza26.edu')),
('PC-4D-02', 'CT26-4D-002', 'Computadora', 'HP', 'ProDesk 600 G6', 'Intel Core i5-10500', '16 GB', '512 GB SSD', 'Operativo', (SELECT id_laboratorio FROM laboratorios WHERE nombre = 'Laboratorio 4-4'), (SELECT id_usuario FROM usuarios WHERE email = 'carlos@suiza26.edu')),
('PC-4D-03', 'CT26-4D-003', 'Computadora', 'Lenovo', 'ThinkCentre M720', 'Intel Core i5-8500', '8 GB', '256 GB SSD', 'Operativo', (SELECT id_laboratorio FROM laboratorios WHERE nombre = 'Laboratorio 4-4'), (SELECT id_usuario FROM usuarios WHERE email = 'carlos@suiza26.edu')),
('PC-4D-04', 'CT26-4D-004', 'Computadora', 'Dell', 'OptiPlex 3080', 'Intel Core i3-10100', '8 GB', '256 GB SSD', 'Operativo', (SELECT id_laboratorio FROM laboratorios WHERE nombre = 'Laboratorio 4-4'), (SELECT id_usuario FROM usuarios WHERE email = 'carlos@suiza26.edu')),
('PC-4D-05', 'CT26-4D-005', 'Computadora', 'HP', 'ProDesk 400 G7', 'Intel Core i5-10500', '16 GB', '1 TB HDD', 'Operativo', (SELECT id_laboratorio FROM laboratorios WHERE nombre = 'Laboratorio 4-4'), (SELECT id_usuario FROM usuarios WHERE email = 'carlos@suiza26.edu')),
('PC-4D-06', 'CT26-4D-006', 'Computadora', 'Lenovo', 'ThinkCentre M75', 'AMD Ryzen 5', '16 GB', '512 GB SSD', 'Operativo', (SELECT id_laboratorio FROM laboratorios WHERE nombre = 'Laboratorio 4-4'), (SELECT id_usuario FROM usuarios WHERE email = 'carlos@suiza26.edu')),
('PC-4D-07', 'CT26-4D-007', 'Computadora', 'Dell', 'OptiPlex 7090', 'Intel Core i5-11500', '16 GB', '512 GB SSD', 'En uso', (SELECT id_laboratorio FROM laboratorios WHERE nombre = 'Laboratorio 4-4'), (SELECT id_usuario FROM usuarios WHERE email = 'carlos@suiza26.edu')),
('PC-4D-08', 'CT26-4D-008', 'Computadora', 'HP', 'ProDesk 600 G6', 'Intel Core i5-10500', '16 GB', '512 GB SSD', 'En uso', (SELECT id_laboratorio FROM laboratorios WHERE nombre = 'Laboratorio 4-4'), (SELECT id_usuario FROM usuarios WHERE email = 'carlos@suiza26.edu')),
('PC-4D-09', 'CT26-4D-009', 'Computadora', 'Lenovo', 'ThinkCentre M720', 'Intel Core i5-8500', '8 GB', '256 GB SSD', 'Disponible', (SELECT id_laboratorio FROM laboratorios WHERE nombre = 'Laboratorio 4-4'), (SELECT id_usuario FROM usuarios WHERE email = 'carlos@suiza26.edu')),
('PC-4D-10', 'CT26-4D-010', 'Computadora', 'Dell', 'OptiPlex 3080', 'Intel Core i3-10100', '8 GB', '256 GB SSD', 'Disponible', (SELECT id_laboratorio FROM laboratorios WHERE nombre = 'Laboratorio 4-4'), (SELECT id_usuario FROM usuarios WHERE email = 'carlos@suiza26.edu')),
('PC-4D-11', 'CT26-4D-011', 'Computadora', 'HP', 'ProDesk 400 G7', 'Intel Core i5-10500', '16 GB', '1 TB HDD', 'En mantenimiento', (SELECT id_laboratorio FROM laboratorios WHERE nombre = 'Laboratorio 4-4'), (SELECT id_usuario FROM usuarios WHERE email = 'carlos@suiza26.edu')),
('PC-4D-12', 'CT26-4D-012', 'Computadora', 'Lenovo', 'ThinkCentre M75', 'AMD Ryzen 5', '16 GB', '512 GB SSD', 'Fuera de servicio', (SELECT id_laboratorio FROM laboratorios WHERE nombre = 'Laboratorio 4-4'), (SELECT id_usuario FROM usuarios WHERE email = 'carlos@suiza26.edu')),
('PC-5A-01', 'CT26-5A-001', 'Computadora', 'Dell', 'OptiPlex 7090', 'Intel Core i5-11500', '16 GB', '512 GB SSD', 'Operativo', (SELECT id_laboratorio FROM laboratorios WHERE nombre = 'Laboratorio 5-1'), (SELECT id_usuario FROM usuarios WHERE email = 'diego@suiza26.edu')),
('PC-5A-02', 'CT26-5A-002', 'Computadora', 'HP', 'ProDesk 600 G6', 'Intel Core i5-10500', '16 GB', '512 GB SSD', 'Operativo', (SELECT id_laboratorio FROM laboratorios WHERE nombre = 'Laboratorio 5-1'), (SELECT id_usuario FROM usuarios WHERE email = 'diego@suiza26.edu')),
('PC-5A-03', 'CT26-5A-003', 'Computadora', 'Lenovo', 'ThinkCentre M720', 'Intel Core i5-8500', '8 GB', '256 GB SSD', 'Operativo', (SELECT id_laboratorio FROM laboratorios WHERE nombre = 'Laboratorio 5-1'), (SELECT id_usuario FROM usuarios WHERE email = 'diego@suiza26.edu')),
('PC-5A-04', 'CT26-5A-004', 'Computadora', 'Dell', 'OptiPlex 3080', 'Intel Core i3-10100', '8 GB', '256 GB SSD', 'Operativo', (SELECT id_laboratorio FROM laboratorios WHERE nombre = 'Laboratorio 5-1'), (SELECT id_usuario FROM usuarios WHERE email = 'diego@suiza26.edu')),
('PC-5A-05', 'CT26-5A-005', 'Computadora', 'HP', 'ProDesk 400 G7', 'Intel Core i5-10500', '16 GB', '1 TB HDD', 'Operativo', (SELECT id_laboratorio FROM laboratorios WHERE nombre = 'Laboratorio 5-1'), (SELECT id_usuario FROM usuarios WHERE email = 'diego@suiza26.edu')),
('PC-5A-06', 'CT26-5A-006', 'Computadora', 'Lenovo', 'ThinkCentre M75', 'AMD Ryzen 5', '16 GB', '512 GB SSD', 'Operativo', (SELECT id_laboratorio FROM laboratorios WHERE nombre = 'Laboratorio 5-1'), (SELECT id_usuario FROM usuarios WHERE email = 'diego@suiza26.edu')),
('PC-5A-07', 'CT26-5A-007', 'Computadora', 'Dell', 'OptiPlex 7090', 'Intel Core i5-11500', '16 GB', '512 GB SSD', 'En uso', (SELECT id_laboratorio FROM laboratorios WHERE nombre = 'Laboratorio 5-1'), (SELECT id_usuario FROM usuarios WHERE email = 'diego@suiza26.edu')),
('PC-5A-08', 'CT26-5A-008', 'Computadora', 'HP', 'ProDesk 600 G6', 'Intel Core i5-10500', '16 GB', '512 GB SSD', 'En uso', (SELECT id_laboratorio FROM laboratorios WHERE nombre = 'Laboratorio 5-1'), (SELECT id_usuario FROM usuarios WHERE email = 'diego@suiza26.edu')),
('PC-5A-09', 'CT26-5A-009', 'Computadora', 'Lenovo', 'ThinkCentre M720', 'Intel Core i5-8500', '8 GB', '256 GB SSD', 'Disponible', (SELECT id_laboratorio FROM laboratorios WHERE nombre = 'Laboratorio 5-1'), (SELECT id_usuario FROM usuarios WHERE email = 'diego@suiza26.edu')),
('PC-5A-10', 'CT26-5A-010', 'Computadora', 'Dell', 'OptiPlex 3080', 'Intel Core i3-10100', '8 GB', '256 GB SSD', 'Disponible', (SELECT id_laboratorio FROM laboratorios WHERE nombre = 'Laboratorio 5-1'), (SELECT id_usuario FROM usuarios WHERE email = 'diego@suiza26.edu')),
('PC-5A-11', 'CT26-5A-011', 'Computadora', 'HP', 'ProDesk 400 G7', 'Intel Core i5-10500', '16 GB', '1 TB HDD', 'En mantenimiento', (SELECT id_laboratorio FROM laboratorios WHERE nombre = 'Laboratorio 5-1'), (SELECT id_usuario FROM usuarios WHERE email = 'diego@suiza26.edu')),
('PC-5A-12', 'CT26-5A-012', 'Computadora', 'Lenovo', 'ThinkCentre M75', 'AMD Ryzen 5', '16 GB', '512 GB SSD', 'Fuera de servicio', (SELECT id_laboratorio FROM laboratorios WHERE nombre = 'Laboratorio 5-1'), (SELECT id_usuario FROM usuarios WHERE email = 'diego@suiza26.edu')),
('PC-5B-01', 'CT26-5B-001', 'Computadora', 'Dell', 'OptiPlex 7090', 'Intel Core i5-11500', '16 GB', '512 GB SSD', 'Operativo', (SELECT id_laboratorio FROM laboratorios WHERE nombre = 'Laboratorio 5-2'), (SELECT id_usuario FROM usuarios WHERE email = 'diego@suiza26.edu')),
('PC-5B-02', 'CT26-5B-002', 'Computadora', 'HP', 'ProDesk 600 G6', 'Intel Core i5-10500', '16 GB', '512 GB SSD', 'Operativo', (SELECT id_laboratorio FROM laboratorios WHERE nombre = 'Laboratorio 5-2'), (SELECT id_usuario FROM usuarios WHERE email = 'diego@suiza26.edu')),
('PC-5B-03', 'CT26-5B-003', 'Computadora', 'Lenovo', 'ThinkCentre M720', 'Intel Core i5-8500', '8 GB', '256 GB SSD', 'Operativo', (SELECT id_laboratorio FROM laboratorios WHERE nombre = 'Laboratorio 5-2'), (SELECT id_usuario FROM usuarios WHERE email = 'diego@suiza26.edu')),
('PC-5B-04', 'CT26-5B-004', 'Computadora', 'Dell', 'OptiPlex 3080', 'Intel Core i3-10100', '8 GB', '256 GB SSD', 'Operativo', (SELECT id_laboratorio FROM laboratorios WHERE nombre = 'Laboratorio 5-2'), (SELECT id_usuario FROM usuarios WHERE email = 'diego@suiza26.edu')),
('PC-5B-05', 'CT26-5B-005', 'Computadora', 'HP', 'ProDesk 400 G7', 'Intel Core i5-10500', '16 GB', '1 TB HDD', 'Operativo', (SELECT id_laboratorio FROM laboratorios WHERE nombre = 'Laboratorio 5-2'), (SELECT id_usuario FROM usuarios WHERE email = 'diego@suiza26.edu')),
('PC-5B-06', 'CT26-5B-006', 'Computadora', 'Lenovo', 'ThinkCentre M75', 'AMD Ryzen 5', '16 GB', '512 GB SSD', 'Operativo', (SELECT id_laboratorio FROM laboratorios WHERE nombre = 'Laboratorio 5-2'), (SELECT id_usuario FROM usuarios WHERE email = 'diego@suiza26.edu')),
('PC-5B-07', 'CT26-5B-007', 'Computadora', 'Dell', 'OptiPlex 7090', 'Intel Core i5-11500', '16 GB', '512 GB SSD', 'En uso', (SELECT id_laboratorio FROM laboratorios WHERE nombre = 'Laboratorio 5-2'), (SELECT id_usuario FROM usuarios WHERE email = 'diego@suiza26.edu')),
('PC-5B-08', 'CT26-5B-008', 'Computadora', 'HP', 'ProDesk 600 G6', 'Intel Core i5-10500', '16 GB', '512 GB SSD', 'En uso', (SELECT id_laboratorio FROM laboratorios WHERE nombre = 'Laboratorio 5-2'), (SELECT id_usuario FROM usuarios WHERE email = 'diego@suiza26.edu')),
('PC-5B-09', 'CT26-5B-009', 'Computadora', 'Lenovo', 'ThinkCentre M720', 'Intel Core i5-8500', '8 GB', '256 GB SSD', 'Disponible', (SELECT id_laboratorio FROM laboratorios WHERE nombre = 'Laboratorio 5-2'), (SELECT id_usuario FROM usuarios WHERE email = 'diego@suiza26.edu')),
('PC-5B-10', 'CT26-5B-010', 'Computadora', 'Dell', 'OptiPlex 3080', 'Intel Core i3-10100', '8 GB', '256 GB SSD', 'Disponible', (SELECT id_laboratorio FROM laboratorios WHERE nombre = 'Laboratorio 5-2'), (SELECT id_usuario FROM usuarios WHERE email = 'diego@suiza26.edu')),
('PC-5B-11', 'CT26-5B-011', 'Computadora', 'HP', 'ProDesk 400 G7', 'Intel Core i5-10500', '16 GB', '1 TB HDD', 'En mantenimiento', (SELECT id_laboratorio FROM laboratorios WHERE nombre = 'Laboratorio 5-2'), (SELECT id_usuario FROM usuarios WHERE email = 'diego@suiza26.edu')),
('PC-5B-12', 'CT26-5B-012', 'Computadora', 'Lenovo', 'ThinkCentre M75', 'AMD Ryzen 5', '16 GB', '512 GB SSD', 'Fuera de servicio', (SELECT id_laboratorio FROM laboratorios WHERE nombre = 'Laboratorio 5-2'), (SELECT id_usuario FROM usuarios WHERE email = 'diego@suiza26.edu'));

-- 5. SOFTWARE UTILIZADO PARA ACTIVIDADES EDUCATIVAS (solo el que no existe por nombre)
INSERT INTO software (nombre_software, version, proveedor, descripcion)
SELECT 'Google Chrome', 'Version estable', 'Google', 'Navegador utilizado para acceder a Classroom y recursos educativos.' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM software WHERE nombre_software = 'Google Chrome');
INSERT INTO software (nombre_software, version, proveedor, descripcion)
SELECT 'Microsoft Office 365', 'Version institucional', 'Microsoft', 'Herramientas para documentos, presentaciones y trabajos escolares.' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM software WHERE nombre_software = 'Microsoft Office 365');
INSERT INTO software (nombre_software, version, proveedor, descripcion)
SELECT 'Visual Studio Code', 'Version instalada', 'Microsoft', 'Editor de codigo utilizado en actividades de programacion.' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM software WHERE nombre_software = 'Visual Studio Code');
INSERT INTO software (nombre_software, version, proveedor, descripcion)
SELECT 'Visual Studio 2022', '2022', 'Microsoft', 'Entorno de desarrollo utilizado en las materias de programacion.' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM software WHERE nombre_software = 'Visual Studio 2022');
INSERT INTO software (nombre_software, version, proveedor, descripcion)
SELECT 'GitHub Desktop', 'Version estable', 'GitHub (Microsoft)', 'Interfaz grafica de Git utilizada para gestionar repositorios y subir codigo desde Visual Studio Code.' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM software WHERE nombre_software = 'GitHub Desktop');
INSERT INTO software (nombre_software, version, proveedor, descripcion)
SELECT 'XAMPP', 'Version estable', 'Apache Friends', 'Paquete de desarrollo web que incluye Apache, MariaDB y PHP para practicas locales.' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM software WHERE nombre_software = 'XAMPP');

-- 6. LICENCIAS (una por software, si no tiene ninguna)
INSERT INTO licencias (id_software, tipo_licencia, numero_licencia, fecha_vencimiento, estado)
SELECT s.id_software, 'Gratuita', NULL, NULL, 'Activa'
FROM software s WHERE s.nombre_software = 'Google Chrome'
  AND NOT EXISTS (SELECT 1 FROM licencias li WHERE li.id_software = s.id_software);

INSERT INTO licencias (id_software, tipo_licencia, numero_licencia, fecha_vencimiento, estado)
SELECT s.id_software, 'Pago', NULL, NULL, 'Activa'
FROM software s WHERE s.nombre_software = 'Microsoft Office 365'
  AND NOT EXISTS (SELECT 1 FROM licencias li WHERE li.id_software = s.id_software);

INSERT INTO licencias (id_software, tipo_licencia, numero_licencia, fecha_vencimiento, estado)
SELECT s.id_software, 'Gratuita', NULL, NULL, 'Activa'
FROM software s WHERE s.nombre_software = 'Visual Studio Code'
  AND NOT EXISTS (SELECT 1 FROM licencias li WHERE li.id_software = s.id_software);

INSERT INTO licencias (id_software, tipo_licencia, numero_licencia, fecha_vencimiento, estado)
SELECT s.id_software, 'Prueba', NULL, NULL, 'Activa'
FROM software s WHERE s.nombre_software = 'Visual Studio 2022'
  AND NOT EXISTS (SELECT 1 FROM licencias li WHERE li.id_software = s.id_software);

-- 7. INSTALACIONES DE SOFTWARE EN EQUIPOS
-- Solo sobre las 72 computadoras originales que todavia no tienen software
-- registrado: no se reinstala software quitado a mano ni se toca a equipos nuevos.
INSERT IGNORE INTO equipo_software (id_equipo, id_software, fecha_instalacion)
SELECT e.id_equipo, s.id_software, '2026-09-01'
FROM equipos e
JOIN laboratorios l ON l.id_laboratorio = e.id_laboratorio
JOIN software s
WHERE e.identificador IN (
  'PC-4A-01', 'PC-4A-02', 'PC-4A-03', 'PC-4A-04', 'PC-4A-05', 'PC-4A-06', 'PC-4A-07', 'PC-4A-08',
  'PC-4A-09', 'PC-4A-10', 'PC-4A-11', 'PC-4A-12', 'PC-4B-01', 'PC-4B-02', 'PC-4B-03', 'PC-4B-04',
  'PC-4B-05', 'PC-4B-06', 'PC-4B-07', 'PC-4B-08', 'PC-4B-09', 'PC-4B-10', 'PC-4B-11', 'PC-4B-12',
  'PC-4C-01', 'PC-4C-02', 'PC-4C-03', 'PC-4C-04', 'PC-4C-05', 'PC-4C-06', 'PC-4C-07', 'PC-4C-08',
  'PC-4C-09', 'PC-4C-10', 'PC-4C-11', 'PC-4C-12', 'PC-4D-01', 'PC-4D-02', 'PC-4D-03', 'PC-4D-04',
  'PC-4D-05', 'PC-4D-06', 'PC-4D-07', 'PC-4D-08', 'PC-4D-09', 'PC-4D-10', 'PC-4D-11', 'PC-4D-12',
  'PC-5A-01', 'PC-5A-02', 'PC-5A-03', 'PC-5A-04', 'PC-5A-05', 'PC-5A-06', 'PC-5A-07', 'PC-5A-08',
  'PC-5A-09', 'PC-5A-10', 'PC-5A-11', 'PC-5A-12', 'PC-5B-01', 'PC-5B-02', 'PC-5B-03', 'PC-5B-04',
  'PC-5B-05', 'PC-5B-06', 'PC-5B-07', 'PC-5B-08', 'PC-5B-09', 'PC-5B-10', 'PC-5B-11', 'PC-5B-12')
  AND NOT EXISTS (SELECT 1 FROM equipo_software x WHERE x.id_equipo = e.id_equipo)
  AND (s.nombre_software IN ('Google Chrome', 'Microsoft Office 365', 'Visual Studio Code')
       OR (s.nombre_software = 'Visual Studio 2022' AND l.nombre IN ('Laboratorio 4-4', 'Laboratorio 5-2')));
