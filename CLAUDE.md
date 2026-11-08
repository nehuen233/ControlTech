# ControlTech — reglas del proyecto

ControlTech es un sistema MULTI-INSTITUCIÓN: una sola base y un solo backend atienden a varios
colegios. Toda funcionalidad nueva debe respetar el aislamiento entre instituciones.

## Stack
- Frontend: React 19 + Vite, CSS propio (frontend/src/index.css), sin librerías de UI.
- Backend: Express + mysql2 (backend/src). Consultas SQL a mano, siempre parametrizadas.
- Base: MySQL 8, base `controltecchh`. Esquema base en `BD CONTROLTECH.sql`; cambios
  posteriores como migraciones idempotentes en backend/src/config/esquema.js
  + archivo espejo en backend/sql/migraciones/NNN_nombre.sql.
- Idioma: todo el código, comentarios, mensajes y UI en español rioplatense (vos).

## Modelo de tenencia
- Tabla `instituciones`. Cada colegio es una fila.
- `req.user.idInstitucion` sale SIEMPRE de la base (middleware `autenticar`), nunca del
  cliente: no se acepta `id_institucion` en body, query ni params de rutas institucionales.
- Tablas con `id_institucion` propio: usuarios, laboratorios, equipos, software,
  usuario_laboratorio, historial_acciones, reportes.
- Tablas que heredan la institución por su padre: equipo_software, licencias (vía software),
  mantenimientos y alertas (vía equipo), solicitudes_contrasena (vía usuario).
- Rol SUPERADMIN (id_institucion NULL): administra la plataforma (alta y suspensión de
  instituciones y su primer administrador). No ve datos internos de ningún colegio
  desde las rutas institucionales.

## Reglas obligatorias
1. Toda consulta de una ruta institucional filtra por institución: directamente
   (`x.id_institucion = ?`) o a través de `laboratoriosPermitidos(user)`, que devuelve
   SIEMPRE una lista de ids de la institución del usuario (nunca `null` = "todo").
2. Un recurso de otra institución responde 404 ("no existe"), nunca 403: no se revela
   que existe. (Un laboratorio de la MISMA institución que el usuario no tiene asignado
   sigue respondiendo 403 "No tenés acceso".)
3. Las unicidades son por institución (nombre de laboratorio, identificador y nro de
   serie de equipo, software nombre+versión, nro de licencia). El email de usuario es
   único global (el login es por email).
4. Al relacionar dos registros (equipo↔laboratorio, usuario↔laboratorio,
   equipo↔software, responsable de equipo) se verifica que sean de la misma institución.
5. Eventos en tiempo real (SSE): solo se envían a clientes de la misma institución.
6. Nada de datos de un colegio puntual hardcodeados en el código. Los datos de
   demostración viven en un script aparte (`npm run db:demo`, backend/src/config/datosDemo.js)
   y se cargan en la institución "Demo".
7. Cada funcionalidad nueva incluye pruebas de aislamiento en backend/tests: un usuario
   de la institución A no puede listar, ver, crear, modificar ni borrar nada de B.
8. Migraciones: solo agregan; son idempotentes (verifican antes de aplicar), no borran
   datos y dejan el sistema funcionando si se cortan a mitad.

## Cómo trabajar en el repo
- Backend: `cd backend && npm start` (puerto 4000). Frontend: `cd frontend && npm run dev` (5173).
- Pruebas: con MySQL y el backend corriendo, `cd backend && npm test`. Necesitan
  `SUPERADMIN_EMAIL` y `SUPERADMIN_PASSWORD` en backend/.env: crean sus propias instituciones.
- Verificación rápida de la base: `npm run db:check` (en backend).
