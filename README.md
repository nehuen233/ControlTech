# ControlTech

Sistema de gestión de laboratorios, equipos y mantenimientos.

| Capa | Tecnología | Carpeta |
|---|---|---|
| Base de datos | MySQL 8 | `BD CONTROLTECH.sql`, `CONTROL TECH INSERTS.sql` |
| Backend | JavaScript + Express | `backend/` |
| Frontend | React + CSS (Vite) | `frontend/` |

El backend usa **exactamente** el esquema de `BD CONTROLTECH.sql` (base `controltecchh`): no crea, elimina ni altera tablas.

## 1. Base de datos

Si la base todavía no existe:

```bash
mysql -u root -p < "BD CONTROLTECH.sql"
mysql -u root -p < "CONTROL TECH INSERTS.sql"
```

Si ya existe (con el administrador cargado) **no** vuelvas a ejecutar estos scripts. Solo creá un usuario para la aplicación (opcional, recomendado):

```sql
CREATE USER 'controltech'@'localhost' IDENTIFIED BY 'una-clave';
GRANT SELECT, INSERT, UPDATE, DELETE ON controltecchh.* TO 'controltech'@'localhost';
```

## 2. Backend (Express)

```bash
cd backend
npm install
cp .env.example .env   # editar DB_USER, DB_PASSWORD, DB_NAME y JWT_SECRET
npm start              # http://localhost:4000/api
```

`GET http://localhost:4000/api/health` responde `{"ok":true,"db":"conectada"}` si la conexión con MySQL funciona.

### Si el backend no se conecta a MySQL

```bash
cd backend
npm run db:check
```

El comando indica la causa exacta y cómo resolverla. Los casos más comunes:

| Mensaje | Solución |
|---|---|
| MySQL no responde en 127.0.0.1:3306 | Iniciar MySQL (en XAMPP: *Start* en MySQL) y revisar `DB_PORT`. |
| MySQL rechazó al usuario… | Corregir `DB_USER` / `DB_PASSWORD` en `backend/.env` (en XAMPP: `root` y contraseña vacía). |
| La base "…" no existe… | Poner en `DB_NAME` el nombre real de la base (`controltecchh` según `BD CONTROLTECH.sql`). |
| Método de autenticación no compatible | `ALTER USER 'usuario'@'localhost' IDENTIFIED WITH mysql_native_password BY 'clave';` |

Recordá crear el archivo `backend/.env` a partir de `backend/.env.example`: sin él se usan los valores por defecto.

## 3. Frontend (React)

```bash
cd frontend
npm install
npm run dev            # http://localhost:5173
```

Vite redirige `/api` al backend en `http://localhost:4000` (configurable con `VITE_API_TARGET`).

## 4. Pruebas

Con el backend en ejecución:

```bash
cd backend
npm test
```

Son pruebas de integración contra la API y MySQL reales. **Agregan** registros de prueba (usuarios `*@test.controltech`, mantenimientos y problemas); ejecutarlas sobre una base de desarrollo.

## Roles y permisos (validados en Express)

| Rol | Laboratorios | Mantenimientos | Usuarios |
|---|---|---|---|
| Administrador | Todos | Gestiona | Registra y asigna roles |
| Directivo | Todos | Solo consulta | — |
| Técnico / Encargado | Asignados | Gestiona | — |
| Docente de laboratorio | Asignados | Gestiona | — |
| Docente | Asignados | Consulta y reporta problemas | — |

- Al registrar o reasignar usuarios solo se aceptan **Docente** y **Docente de laboratorio**; cualquier otro rol se rechaza con `403`, aunque se envíe directo a la API.
- La cuenta del administrador está protegida: no se puede cambiar su rol, ni duplicar su email, ni crear otro administrador. No existe un endpoint para eliminar usuarios.
- Las cuentas cargadas por los scripts SQL guardan la contraseña en texto plano; el login las acepta sin modificarlas. Las cuentas nuevas se guardan con hash bcrypt.

## Sección Mantenimientos (unificada)

Reúne en una sola entrada de navegación:

- **Equipos con problemas**: equipos *Fuera de servicio*, *En mantenimiento* o que *necesitan reparación* (alerta activa o mantenimiento correctivo sin finalizar).
- **Mantenimientos**: preventivos, correctivos y actualizaciones; pendientes, en proceso y finalizados. Alta, edición y cambio de estado.
- **Historial de intervenciones** de cada equipo: mantenimientos, problemas reportados y acciones registradas.
- Filtros por laboratorio, equipo, estado y tipo de mantenimiento.

Correspondencia con las tablas existentes:

| Dato mostrado | Origen |
|---|---|
| Equipo afectado / laboratorio | `equipos.identificador`, `laboratorios.nombre` |
| Problema detectado | `alertas.titulo` / `alertas.descripcion` (alertas activas) |
| Tipo, estado, fecha, descripción, observaciones | `mantenimientos.tipo`, `estado`, `fecha_mantenimiento`, `detalle`, `notas_adicionales` |
| Responsable | `mantenimientos.id_usuario` (y `equipos.id_responsable` en equipos) |
| Fecha de registro | `historial_acciones.fecha_hora` (acción *Crear*) / `alertas.fecha_creacion` |
| Próxima revisión | `alertas.fecha_limite` |

### Endpoints

| Método | Ruta | Permiso |
|---|---|---|
| POST | `/api/auth/login` | público |
| GET | `/api/auth/me` | autenticado |
| GET | `/api/roles/asignables` | administrador |
| GET / POST | `/api/usuarios` | administrador |
| PATCH | `/api/usuarios/:id/rol` | administrador |
| GET | `/api/laboratorios`, `/api/equipos` | autenticado (filtrado por laboratorio) |
| GET | `/api/mantenimientos/resumen` | autenticado |
| GET | `/api/mantenimientos/equipos-con-problemas` | autenticado |
| GET | `/api/mantenimientos/historial/:idEquipo` | autenticado |
| GET | `/api/mantenimientos`, `/api/mantenimientos/:id` | autenticado |
| POST | `/api/mantenimientos` | gestión |
| PUT | `/api/mantenimientos/:id` | gestión |
| PATCH | `/api/mantenimientos/:id/estado` | gestión |
| POST | `/api/mantenimientos/problemas` | gestión y docentes |
| PATCH | `/api/mantenimientos/problemas/:id/resolver` | gestión |
