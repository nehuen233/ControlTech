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

Si ya existe (con el administrador cargado) **no** vuelvas a ejecutar estos scripts: duplicarían registros.

### Datos iniciales (laboratorios y computadoras)

No hace falta cargarlos a mano: **al iniciar, el backend crea lo que falte** (ver *Laboratorios iniciales y sus computadoras*). Para cargar además las asignaciones de los usuarios de demostración y desactivar el Laboratorio 4-4:

```bash
cd backend
npm run db:cargar
```

Solo agrega lo que falta y se puede repetir sin duplicar nada. No crea ni modifica usuarios (el administrador queda intacto). `npm run db:check` muestra cuántos laboratorios y equipos tiene la base.

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

El comando indica la causa exacta y cómo resolverla. Para verificar además un usuario (por ejemplo, si el login devuelve 401):

```bash
npm run db:check -- admin@controltech.com Administrador1234
```

Los casos más comunes:

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

Vite redirige `/api` al backend en `http://127.0.0.1:4000` (configurable con `VITE_API_TARGET`).

> El backend y el frontend deben estar corriendo **a la vez**, cada uno en su terminal. Si el navegador muestra **error 502** o "No se pudo conectar con el backend", el backend está detenido o se cerró con un error: revisá su terminal y volvé a ejecutar `npm start` en `backend/`. Cada cambio en `backend/.env` requiere reiniciar el backend.

> **Después de cada `git pull` reiniciá el backend** (Ctrl+C y `npm start`): Node solo carga el código al arrancar. Si el backend sigue con la versión anterior, las funciones nuevas responden *404 Ruta no encontrada* y la pantalla indica que hay que reiniciarlo. El frontend (`npm run dev`) se actualiza solo.

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

- Al registrar o reasignar usuarios solo se aceptan **Docente**, **Docente de laboratorio** y **Técnico**; Administrador, Encargado y Directivo se rechazan con `403`, aunque se envíen directo a la API.
- Si la base se creó solo con `BD CONTROLTECH.sql` (que no incluye TECNICO ni DOCENTE DE LABORATORIO), el backend agrega esos roles a la tabla `roles` al iniciar, sin duplicar ni modificar los existentes.
- La cuenta del administrador está protegida: no se puede cambiar su rol, ni duplicar su email, ni crear otro administrador. No existe un endpoint para eliminar usuarios.
- Las cuentas cargadas por los scripts SQL guardan la contraseña en texto plano; el login las acepta sin modificarlas. Las cuentas nuevas se guardan con hash bcrypt.

## Laboratorios iniciales y sus computadoras

Al iniciar, el backend verifica los datos de `backend/src/config/datosIniciales.js` y crea lo que falte:

| Laboratorio | Computadoras | Equipamiento | Software |
|---|---|---|---|
| 4-1 (aula general) | 12 · PC-4A-01 a 12 | Dell OptiPlex 3090 Micro / 3080 | Chrome, Office 365 |
| 4-2 (informática básica) | 14 · PC-4B-01 a 14 | HP ProDesk 400 G7 / EliteDesk 800 G6 | Chrome, Office 365, VS Code |
| 4-3 (aula general) | 12 · PC-4C-01 a 12 | Lenovo ThinkCentre M720q / M70q Gen 2 | Chrome, Office 365 |
| 5-1 (programación web) | 15 · PC-5A-01 a 15 | Dell OptiPlex 7090 Tower (i7) | Chrome, VS Code, GitHub Desktop, XAMPP |
| 5-2 (desarrollo avanzado) | 13 · PC-5B-01 a 13 | Lenovo ThinkCentre M90t / ThinkStation P350 | Chrome, Office 365, VS Code, Visual Studio 2022, GitHub Desktop |

Cada laboratorio tiene su propio equipamiento, cantidad, estados y software (en `CONTROL TECH INSERTS.sql` las 12 computadoras eran idénticas en todos los laboratorios). Reglas:

- Laboratorios y software se identifican por nombre; computadoras por identificador y número de serie. **Nada se duplica ni se borra**, y no se vuelven a crear laboratorios ni computadoras que el administrador eliminó.
- Las computadoras de un laboratorio solo se cargan si ese laboratorio no tiene equipos cargados a mano.
- Las computadoras de demostración anteriores (las idénticas del script) se actualizan con los datos de su laboratorio **solo si nadie las modificó**, conservando su id: sus mantenimientos, alertas e historial siguen vinculados. Si se les cambió el software, se conserva ese software.
- El administrador puede crear más laboratorios o eliminarlos (un laboratorio inicial eliminado no se vuelve a crear). El Laboratorio 4-4 ya no forma parte de los datos iniciales: `npm run db:cargar` lo marca **Inactivo** sin borrar sus equipos ni su historial (se ve con "Mostrar laboratorios inactivos").

## Sección Laboratorios

- Listado de los laboratorios (el administrador ve todos; el resto, los asignados) con ubicación, ocupación (equipos / capacidad) y equipos con problemas.
- Detalle de cada laboratorio: equipos por estado, usuarios asignados y mantenimientos abiertos.
- **Eliminar laboratorio** (solo el administrador, desde la tarjeta o la página del laboratorio):
  - Si tiene computadoras, **no se borran**: se trasladan al laboratorio activo que se elija, con sus mantenimientos, alertas, software e historial. Se controla que el destino tenga capacidad; cada traslado queda en el historial del equipo.
  - Las computadoras conservan su responsable solo si tiene acceso al laboratorio de destino.
  - Se quitan las asignaciones de usuarios a ese laboratorio.
  - La baja queda registrada en el historial y un laboratorio inicial eliminado **no se vuelve a crear** al reiniciar el sistema.
  - Como alternativa sin borrar, el laboratorio puede marcarse *Inactivo* desde Editar.
- **Página de cada laboratorio** (botón *Abrir*) con pestañas **Computadoras | Software | Mantenimiento**:
  - **Software** (*Gestión de Software*): programas instalados en las computadoras del laboratorio con proveedor, licencia (tipo, vencimiento y clave enmascarada), cantidad de equipos y acciones.
  - **Agregar Software**: elegir uno del catálogo o crear uno nuevo con su licencia, e instalarlo en todas las computadoras o en las que se elijan.
  - **Editar**: cambiar en qué computadoras está instalado; los datos y la licencia (comunes a todos los laboratorios) solo los modifica el administrador.
  - **Eliminar**: lo desinstala de las computadoras de ese laboratorio; el software sigue en el catálogo y en los demás laboratorios.
  - Lo gestionan el administrador y los roles de gestión en sus laboratorios; los docentes lo consultan sin ver las claves.
- **Alta y edición solo para el administrador**, con validación de nombre único y de capacidad.
- **Capacidad: entre 10 y 15 computadoras** (15 por defecto). Es obligatoria al crear un laboratorio, se valida en el backend al crear y al cambiarla, y no puede quedar por debajo de los equipos registrados. Los laboratorios antiguos con otra capacidad se pueden seguir editando sin tocarla; los que no tienen capacidad cargada admiten hasta 15 computadoras. El código de acceso solo lo ve el administrador.

## Información de equipos

- Ficha completa de cada equipo: datos generales, especificaciones, responsable, software instalado con su licencia (`equipo_software`, `software`, `licencias`), resumen de mantenimientos y problemas activos.
- **Alta y edición** para el administrador y los roles de gestión (Técnico, Encargado, Docente de laboratorio) dentro de sus laboratorios. Se valida: identificador y número de serie únicos, laboratorio activo y con capacidad disponible, y responsable asignado al laboratorio del equipo.
- Los docentes consultan la ficha pero no modifican equipos.
- **Eliminar equipo** (solo el administrador, desde la lista de Equipos o la ficha):
  - Los mantenimientos y problemas registrados de la computadora dependen de ella en la base (claves foráneas), así que **se eliminan junto con el equipo**; si tiene, la confirmación muestra cuántos y la API exige `confirmar_historial: true`.
  - También se quita el registro de su software instalado.
  - La baja queda en el historial de acciones (identificador, serie, modelo, laboratorio y lo eliminado), y una computadora de los datos iniciales eliminada **no se vuelve a crear** al reiniciar.
  - Para conservar el historial, conviene marcarla *Fuera de servicio* desde Editar en lugar de eliminarla.

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
| GET | `/api/laboratorios`, `/api/laboratorios/:id` | autenticado (filtrado por laboratorio) |
| POST / PUT / DELETE | `/api/laboratorios`, `/api/laboratorios/:id` | administrador |
| GET | `/api/laboratorios/:id/responsables` | gestión |
| GET | `/api/laboratorios/:id/software` | autenticado (filtrado por laboratorio) |
| POST / PUT / DELETE | `/api/laboratorios/:id/software`, `/api/laboratorios/:id/software/:idSoftware` | gestión, en sus laboratorios |
| GET | `/api/equipos`, `/api/equipos/:id`, `/api/software` | autenticado (filtrado por laboratorio) |
| POST / PUT | `/api/equipos`, `/api/equipos/:id` | gestión, en sus laboratorios |
| DELETE | `/api/equipos/:id` | administrador |
| GET | `/api/mantenimientos/resumen` | autenticado |
| GET | `/api/mantenimientos/equipos-con-problemas` | autenticado |
| GET | `/api/mantenimientos/historial/:idEquipo` | autenticado |
| GET | `/api/mantenimientos`, `/api/mantenimientos/:id` | autenticado |
| POST | `/api/mantenimientos` | gestión |
| PUT | `/api/mantenimientos/:id` | gestión |
| PATCH | `/api/mantenimientos/:id/estado` | gestión |
| POST | `/api/mantenimientos/problemas` | gestión y docentes |
| PATCH | `/api/mantenimientos/problemas/:id/resolver` | gestión |
