-- ============================================================================
-- ARCHIVO HISTÓRICO (esquema anterior a la multi-institución, migración 003).
-- Sus INSERT no indican id_institucion y fallan sobre la base actual.
-- Para tener datos de ejemplo usá:  cd backend && npm run db:demo
-- (crea la institución "Demo" con laboratorios, equipos, software y usuarios).
-- Se conserva como referencia y lo usan las pruebas de migración
-- (backend/tests/fixtures/v1_datos.sql).
-- ============================================================================

USE controltecchh;
START TRANSACTION;

-- 1. ROLES
-- Se mantienen los cuatro roles iniciales y se agregan los perfiles del Figma.
INSERT INTO roles (nombre_rol) VALUES
('ADMINISTRADOR'),
('ENCARGADO'),
('DOCENTE'),
('DIRECTIVO'),
('TECNICO'),
('DOCENTE DE LABORATORIO')
ON DUPLICATE KEY UPDATE nombre_rol = VALUES(nombre_rol);

-- 2. LABORATORIOS DEL COLEGIO
-- Cuatro laboratorios en 4to piso y dos en 5to piso.
-- Los nombres de sectores son identificadores de ejemplo; ajustar a la ubicacion real.
-- El acceso a los laboratorios del 5to piso se realiza fisicamente con tarjeta o llave.
INSERT INTO laboratorios
(nombre, descripcion, edificio, piso, ubicacion, capacidad_equipos, estado, codigo_acceso)
VALUES
('Laboratorio 4-1', 'Laboratorio del cuarto piso para clases y actividades educativas con computadoras', 'Edificio principal del colegio', '4to piso', 'Sector 4-1', 15, 'Activo', NULL),
('Laboratorio 4-2', 'Laboratorio del cuarto piso para clases y actividades educativas con computadoras', 'Edificio principal del colegio', '4to piso', 'Sector 4-2', 15, 'Activo', NULL),
('Laboratorio 4-3', 'Laboratorio del cuarto piso para clases y actividades educativas con computadoras', 'Edificio principal del colegio', '4to piso', 'Sector 4-3', 15, 'Activo', NULL),
('Laboratorio 4-4', 'Laboratorio del cuarto piso para clases y actividades educativas con computadoras', 'Edificio principal del colegio', '4to piso', 'Sector 4-4', 15, 'Activo', NULL),
('Laboratorio 5-1', 'Laboratorio del quinto piso para clases y actividades educativas con computadoras', 'Edificio principal del colegio', '5to piso', 'Ala izquierda', 15, 'Activo', NULL),
('Laboratorio 5-2', 'Laboratorio del quinto piso para clases y actividades educativas con computadoras', 'Edificio principal del colegio', '5to piso', 'Ala Derecha', 15, 'Activo', NULL);

-- 3. USUARIOS DE DEMOSTRACION
-- Administrador: admin@controltech.com / Administrador1234
-- Los otros perfiles usan demo123, como en la pantalla de Figma.
-- Son credenciales de prueba local; adaptar al mecanismo de hash del backend.
INSERT INTO usuarios (nombre, apellido, email, contrasena, id_rol) VALUES
('Juan', 'Perez', 'admin@controltech.com', 'Administrador1234', (SELECT id_rol FROM roles WHERE nombre_rol = 'ADMINISTRADOR')),
('Carlos', 'Rodriguez', 'carlos@suiza26.edu', 'demo123', (SELECT id_rol FROM roles WHERE nombre_rol = 'TECNICO')),
('Pedro', 'Lopez', 'pedro@suiza26.edu', 'demo123', (SELECT id_rol FROM roles WHERE nombre_rol = 'DOCENTE')),
('Maria', 'Gonzalez', 'maria@suiza26.edu', 'demo123', (SELECT id_rol FROM roles WHERE nombre_rol = 'DOCENTE DE LABORATORIO')),
('Diego', 'Sanchez', 'diego@suiza26.edu', 'demo123', (SELECT id_rol FROM roles WHERE nombre_rol = 'TECNICO')),
('Sofia', 'Martinez', 'sofia@suiza26.edu', 'demo123', (SELECT id_rol FROM roles WHERE nombre_rol = 'DOCENTE DE LABORATORIO'));

-- 4. ASIGNACION DE USUARIOS A LABORATORIOS
-- Administrador: los seis laboratorios.
INSERT INTO usuario_laboratorio (id_usuario, id_laboratorio)
SELECT u.id_usuario, l.id_laboratorio
FROM usuarios u CROSS JOIN laboratorios l
WHERE u.email = 'admin@controltech.com';

-- Carlos: los cuatro laboratorios del 4to piso.
INSERT INTO usuario_laboratorio (id_usuario, id_laboratorio)
SELECT u.id_usuario, l.id_laboratorio
FROM usuarios u CROSS JOIN laboratorios l
WHERE u.email = 'carlos@suiza26.edu'
  AND l.piso = '4to piso';

-- Diego: los dos laboratorios del 5to piso.
INSERT INTO usuario_laboratorio (id_usuario, id_laboratorio)
SELECT u.id_usuario, l.id_laboratorio
FROM usuarios u CROSS JOIN laboratorios l
WHERE u.email = 'diego@suiza26.edu'
  AND l.piso = '5to piso';

-- Docentes: laboratorios donde se les asigna acceso de demostracion.
INSERT INTO usuario_laboratorio (id_usuario, id_laboratorio)
SELECT u.id_usuario, l.id_laboratorio
FROM usuarios u CROSS JOIN laboratorios l
WHERE u.email = 'pedro@suiza26.edu'
  AND l.nombre = 'Laboratorio 4-1';


INSERT INTO usuario_laboratorio (id_usuario, id_laboratorio)
SELECT u.id_usuario, l.id_laboratorio
FROM usuarios u CROSS JOIN laboratorios l
WHERE u.email = 'maria@suiza26.edu'
  AND l.nombre IN ('Laboratorio 4-2', 'Laboratorio 4-3');

INSERT INTO usuario_laboratorio (id_usuario, id_laboratorio)
SELECT u.id_usuario, l.id_laboratorio
FROM usuarios u CROSS JOIN laboratorios l
WHERE u.email = 'sofia@suiza26.edu'
  AND l.nombre IN ('Laboratorio 5-1', 'Laboratorio 5-2');

-- 5. COMPUTADORAS: 12 por laboratorio, 72 en total.
-- Carlos queda como responsable tecnico de los equipos del 4to piso;
-- Diego queda como responsable tecnico de los equipos del 5to piso.
-- Las marcas, modelos y especificaciones son ejemplos para pruebas.
INSERT INTO equipos
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


-- 6. SOFTWARE UTILIZADO PARA ACTIVIDADES EDUCATIVAS
-- Classroom se utiliza desde el navegador; no se registra como programa instalado.
INSERT INTO software (nombre_software, version, proveedor, descripcion) VALUES
('Google Chrome', 'Version estable', 'Google', 'Navegador utilizado para acceder a Classroom y recursos educativos.'),
('Microsoft Office 365', 'Version institucional', 'Microsoft', 'Herramientas para documentos, presentaciones y trabajos escolares.'),
('Visual Studio Code', 'Version instalada', 'Microsoft', 'Editor de codigo utilizado en actividades de programacion.'),
('Visual Studio 2022', '2022', 'Microsoft', 'Entorno de desarrollo utilizado en las materias de programacion.'),
('GitHub Desktop', 'Version estable', 'GitHub (Microsoft)', 'Interfaz grafica de Git utilizada para gestionar repositorios y subir codigo desde Visual Studio Code.'),
('XAMPP', 'Version estable', 'Apache Friends', 'Paquete de desarrollo web que incluye Apache, MariaDB y PHP para practicas locales.');

-- 7. LICENCIAS
-- No se inventan claves comerciales; se dejan NULL cuando no se proporcionaron.
-- Los tipos son valores de demostracion y deben ajustarse a las licencias reales del colegio.
INSERT INTO licencias (id_software, tipo_licencia, numero_licencia, fecha_vencimiento, estado)
SELECT id_software, 'Gratuita', NULL, NULL, 'Activa'
FROM software WHERE nombre_software = 'Google Chrome';

INSERT INTO licencias (id_software, tipo_licencia, numero_licencia, fecha_vencimiento, estado)
SELECT id_software, 'Pago', NULL, NULL, 'Activa'
FROM software WHERE nombre_software = 'Microsoft Office 365';

INSERT INTO licencias (id_software, tipo_licencia, numero_licencia, fecha_vencimiento, estado)
SELECT id_software, 'Gratuita', NULL, NULL, 'Activa'
FROM software WHERE nombre_software = 'Visual Studio Code';

INSERT INTO licencias (id_software, tipo_licencia, numero_licencia, fecha_vencimiento, estado)
SELECT id_software, 'Prueba', NULL, NULL, 'Activa'
FROM software WHERE nombre_software = 'Visual Studio 2022';

-- 8. INSTALACIONES DE SOFTWARE EN EQUIPOS
-- Se conserva el metodo original INSERT ... SELECT con filtros LIKE e IN.
-- Chrome, Office y VS Code se asignan como datos de demostracion a las 72 computadoras.
INSERT INTO equipo_software (id_equipo, id_software, fecha_instalacion)
SELECT e.id_equipo, s.id_software, '2026-09-01'
FROM equipos e JOIN software s
WHERE s.nombre_software IN ('Google Chrome', 'Microsoft Office 365', 'Visual Studio Code');

-- Visual Studio 2022 se asigna como ejemplo a los laboratorios 4-4 y 5-2.
INSERT INTO equipo_software (id_equipo, id_software, fecha_instalacion)
SELECT e.id_equipo, s.id_software, '2026-09-01'
FROM equipos e
JOIN laboratorios l ON l.id_laboratorio = e.id_laboratorio
JOIN software s
WHERE s.nombre_software = 'Visual Studio 2022'
  AND l.nombre IN ('Laboratorio 4-4', 'Laboratorio 5-2');

-- 9. MANTENIMIENTOS DE DEMOSTRACION
-- Estos registros son ficticios y se usan para mostrar el funcionamiento de la pantalla.
INSERT INTO mantenimientos
(id_equipo, id_usuario, fecha_mantenimiento, tipo, detalle, costo, notas_adicionales, estado)
VALUES
((SELECT id_equipo FROM equipos WHERE identificador='PC-4A-03'), (SELECT id_usuario FROM usuarios WHERE email='carlos@suiza26.edu'), '2026-10-15', 'Preventivo', 'Limpieza y revision general del equipo.', 8500.00, 'Registro de demostracion.', 'Completado'),
((SELECT id_equipo FROM equipos WHERE identificador='PC-4A-11'), (SELECT id_usuario FROM usuarios WHERE email='carlos@suiza26.edu'), '2026-10-25', 'Correctivo', 'Revision de la fuente de alimentacion.', 32000.00, 'Equipo en seguimiento tecnico.', 'En proceso'),
((SELECT id_equipo FROM equipos WHERE identificador='PC-4B-05'), (SELECT id_usuario FROM usuarios WHERE email='carlos@suiza26.edu'), '2026-10-20', 'Actualizacion', 'Actualizacion de herramientas educativas.', 0.00, 'Verificar funcionamiento.', 'Completado'),
((SELECT id_equipo FROM equipos WHERE identificador='PC-4C-12'), (SELECT id_usuario FROM usuarios WHERE email='carlos@suiza26.edu'), '2026-10-28', 'Correctivo', 'Diagnostico por falla de encendido.', 15000.00, 'Requiere revision adicional.', 'Pendiente'),
((SELECT id_equipo FROM equipos WHERE identificador='PC-5A-04'), (SELECT id_usuario FROM usuarios WHERE email='diego@suiza26.edu'), '2026-10-18', 'Preventivo', 'Limpieza interna y control de temperatura.', 7000.00, 'Mantenimiento de demostracion.', 'Completado'),
((SELECT id_equipo FROM equipos WHERE identificador='PC-5A-11'), (SELECT id_usuario FROM usuarios WHERE email='diego@suiza26.edu'), '2026-10-27', 'Correctivo', 'Comprobacion del almacenamiento.', 12000.00, 'Pendiente de revision.', 'En proceso'),
((SELECT id_equipo FROM equipos WHERE identificador='PC-5B-06'), (SELECT id_usuario FROM usuarios WHERE email='diego@suiza26.edu'), '2026-10-22', 'Actualizacion', 'Actualizacion del entorno de programacion.', 0.00, 'Registro de demostracion.', 'Completado'),
((SELECT id_equipo FROM equipos WHERE identificador='PC-5B-12'), (SELECT id_usuario FROM usuarios WHERE email='diego@suiza26.edu'), '2026-10-29', 'Correctivo', 'Revision de equipo fuera de servicio.', 18000.00, 'Se requiere diagnostico.', 'Pendiente');

-- 10. ALERTAS DE MANTENIMIENTO
INSERT INTO alertas (id_equipo, titulo, descripcion, severidad, fecha_creacion, fecha_limite, estado)
VALUES
((SELECT id_equipo FROM equipos WHERE identificador='PC-4A-11'), 'Revision de fuente de alimentacion', 'El equipo requiere seguimiento por una falla de alimentacion.', 'Critica', '2026-10-25 09:00:00', '2026-11-05', 'Activa'),
((SELECT id_equipo FROM equipos WHERE identificador='PC-4C-12'), 'Equipo sin encendido', 'Se solicita diagnostico tecnico antes de volver a utilizarlo.', 'Alta', '2026-10-28 10:00:00', '2026-11-06', 'Activa'),
((SELECT id_equipo FROM equipos WHERE identificador='PC-5A-11'), 'Revision de almacenamiento', 'Se requiere comprobar el estado de la unidad de almacenamiento.', 'Media', '2026-10-27 11:00:00', '2026-11-07', 'Activa'),
((SELECT id_equipo FROM equipos WHERE identificador='PC-5B-12'), 'Equipo fuera de servicio', 'El equipo necesita una revision antes de volver al laboratorio.', 'Alta', '2026-10-29 12:00:00', '2026-11-08', 'Activa'),
((SELECT id_equipo FROM equipos WHERE identificador='PC-4B-09'), 'Control preventivo', 'Se recomienda realizar una revision preventiva.', 'Baja', '2026-10-20 08:30:00', '2026-11-12', 'Resuelta');

-- 11. HISTORIAL DE ACCIONES DE DEMOSTRACION
INSERT INTO historial_acciones (id_usuario, accion, entidad, id_registro, detalle, fecha_hora)
VALUES
((SELECT id_usuario FROM usuarios WHERE email='admin@controltech.com'), 'Crear', 'Laboratorio', (SELECT id_laboratorio FROM laboratorios WHERE nombre='Laboratorio 4-1'), 'Registro inicial del laboratorio.', '2026-10-01 09:00:00'),
((SELECT id_usuario FROM usuarios WHERE email='admin@controltech.com'), 'Crear', 'Laboratorio', (SELECT id_laboratorio FROM laboratorios WHERE nombre='Laboratorio 5-1'), 'Registro inicial del laboratorio.', '2026-10-01 09:10:00'),
((SELECT id_usuario FROM usuarios WHERE email='carlos@suiza26.edu'), 'Modificar', 'Equipo', (SELECT id_equipo FROM equipos WHERE identificador='PC-4A-01'), 'Actualizacion de datos del equipo.', '2026-10-15 12:00:00'),
((SELECT id_usuario FROM usuarios WHERE email='carlos@suiza26.edu'), 'Crear', 'Mantenimiento', (SELECT m.id_mantenimiento FROM mantenimientos m JOIN equipos e ON e.id_equipo = m.id_equipo WHERE e.identificador='PC-4B-05' ORDER BY m.id_mantenimiento DESC LIMIT 1), 'Registro de mantenimiento.', '2026-10-29 10:00:00'),
((SELECT id_usuario FROM usuarios WHERE email='diego@suiza26.edu'), 'Crear', 'Alerta', (SELECT id_alerta FROM alertas WHERE titulo='Equipo fuera de servicio'), 'Registro de alerta para revision tecnica.', '2026-10-29 12:10:00'),
((SELECT id_usuario FROM usuarios WHERE email='admin@controltech.com'), 'Modificar', 'Usuario', (SELECT id_usuario FROM usuarios WHERE email='maria@suiza26.edu'), 'Revision de asignacion de laboratorio.', '2026-10-28 15:00:00'),
((SELECT id_usuario FROM usuarios WHERE email='pedro@suiza26.edu'), 'Crear', 'Reporte', NULL, 'Solicitud de reporte de equipos del laboratorio.', '2026-10-30 09:00:00'),
((SELECT id_usuario FROM usuarios WHERE email='diego@suiza26.edu'), 'Modificar', 'Mantenimiento', (SELECT m.id_mantenimiento FROM mantenimientos m JOIN equipos e ON e.id_equipo = m.id_equipo WHERE e.identificador='PC-5B-12' ORDER BY m.id_mantenimiento DESC LIMIT 1), 'Seguimiento del mantenimiento del equipo.', '2026-10-30 10:00:00');

-- 12. REPORTES DE DEMOSTRACION
INSERT INTO reportes (id_usuario, tipo, descripcion, fecha_generacion)
VALUES
((SELECT id_usuario FROM usuarios WHERE email='admin@controltech.com'), 'Inventario', 'Reporte general de equipos de los seis laboratorios.', '2026-10-29 09:00:00'),
((SELECT id_usuario FROM usuarios WHERE email='carlos@suiza26.edu'), 'Mantenimiento', 'Reporte de mantenimientos de los laboratorios del cuarto piso.', '2026-10-30 11:30:00'),
((SELECT id_usuario FROM usuarios WHERE email='admin@controltech.com'), 'Software', 'Reporte de programas instalados en los laboratorios.', '2026-10-30 14:00:00');

-- 13. CONFIRMAR LA CARGA DE DATOS
-- COMMIT guarda definitivamente los INSERT realizados en esta transaccion.
COMMIT;

