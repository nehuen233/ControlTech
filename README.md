# ControlTech

Sistema de gestión de laboratorios, equipos y mantenimientos para **varios colegios**: una
sola base y un solo backend atienden a todas las instituciones, y cada una ve únicamente sus
propios datos.

| Capa | Tecnología | Carpeta |
|---|---|---|
| Base de datos | MySQL 8 | `BD CONTROLTECH.sql` + migraciones en `backend/sql/migraciones/` |
| Backend | JavaScript + Express | `backend/` |
| Frontend | React + CSS (Vite) | `frontend/` |

Las reglas para trabajar en el código (aislamiento, migraciones, pruebas) están en [`CLAUDE.md`](CLAUDE.md).

## Instituciones (multi-colegio)

Una **institución** es un colegio que usa ControlTech. Cada una tiene sus propios usuarios,
laboratorios, equipos, software, licencias, mantenimientos, alertas e historial.

- **Aislamiento**: el backend toma la institución del usuario desde la base en cada petición
  (nunca del navegador). Un recurso de otra institución responde *404 no existe*, los listados
  solo muestran lo propio y los avisos en tiempo real solo llegan a la misma institución.
- **Nombres por institución**: dos colegios pueden tener un "Laboratorio 1" o una "PC-01". El
  email de cada usuario sí es único en toda la plataforma (se ingresa con el email).
- **Estados**: *Prueba* (recién creada, con fecha de fin opcional), *Activa* y *Suspendida*. Con
  la institución suspendida sus usuarios no pueden ingresar y las sesiones abiertas se cierran
  en el momento; sus datos no se borran y vuelven al reactivarla.
- **Superadministrador (SUPERADMIN)**: administra la plataforma. No pertenece a ningún colegio y
  no ve sus datos internos: solo la sección **Instituciones** (alta, estado y totales).
- **Administrador de cada colegio**: lo crea el SUPERADMIN junto con la institución. Mientras el
  colegio no está configurado, al iniciar sesión entra al asistente **Primeros pasos**
  (`#/primeros-pasos`): datos del colegio, laboratorios, computadoras (en serie o pegadas desde
  una planilla), equipo de trabajo, software y resumen. Puede salir con "Terminar más tarde" y
  retomarlo desde el aviso "Configuración X de 5"; el progreso se calcula con los datos reales.
  Los demás roles no ven el asistente.

### Dar de alta un colegio

1. Configurá `SUPERADMIN_EMAIL` y `SUPERADMIN_PASSWORD` en `backend/.env` y reiniciá el backend:
   si ese usuario no existe, se crea al iniciar.
2. Ingresá con esas credenciales → sección **Instituciones** → **Nueva institución**.
3. Completá el nombre del colegio y los datos de su **primer administrador** (nombre, email y
   contraseña inicial). La institución queda en estado *Prueba*.
4. Pasale al administrador su email y contraseña: al ingresar completa la configuración inicial
   y carga laboratorios, equipos y usuarios.
5. Con **Cambiar estado** la pasás a *Activa* o la suspendés.

## 1. Base de datos

### Instalación nueva

```bash
mysql -u root -p < "BD CONTROLTECH.sql"
```

La base nace **sin colegios ni datos**. Al iniciar, el backend crea el SUPERADMIN y desde el
sistema se dan de alta las instituciones. Para probar con datos de ejemplo:

```bash
cd backend
npm run db:demo
```

Crea (si no existe) la institución **"Colegio Demo"** con 5 laboratorios, 66 computadoras propias
de cada laboratorio, software, licencias, algunos mantenimientos y alertas, y usuarios de ejemplo
(`admin@demo.controltech`, `carlos@` y `diego@` técnicos, `pedro@` docente, `maria@` y `sofia@`
docentes de laboratorio, todos `@demo.controltech`). Las contraseñas se muestran **una sola vez**
al crearlos (o se toman de `DEMO_ADMIN_PASSWORD` / `DEMO_USUARIOS_PASSWORD`). Se puede repetir:
solo agrega lo que falta y nunca toca otra institución.

### Base existente (versión de un solo colegio): migración

**No** vuelvas a ejecutar `BD CONTROLTECH.sql` sobre una base con datos. Alcanza con actualizar el
código y reiniciar el backend: la **migración 003** se aplica sola al iniciar y

- crea la tabla `instituciones` y la institución **1** (nombre de `INSTITUCION_INICIAL_NOMBRE`,
  por defecto "Institución principal"), en estado *Activa* y ya configurada;
- agrega `id_institucion` a las tablas y asigna **todos los datos existentes a la institución 1**
  (el administrador conserva su email, contraseña y rol);
- cambia las unicidades a "por institución" y agrega las claves foráneas que impiden mezclar
  colegios; crea el rol SUPERADMIN y su usuario.

Es idempotente (se puede cortar y volver a correr) y no borra datos. Si el usuario de MySQL del
`.env` no tiene permisos `ALTER`, `CREATE`, `INDEX` y `REFERENCES`, el backend lo avisa al iniciar:
ejecutá entonces `backend/sql/migraciones/003_multi_institucion.sql` con `root` y reiniciá.
Antes de migrar una base en uso, hacé un respaldo (`mysqldump controltecchh > respaldo.sql`).
`npm run db:check` muestra después las instituciones con sus totales.

## 2. Backend (Express)

```bash
cd backend
npm install
cp .env.example .env   # editar DB_*, JWT_SECRET y SUPERADMIN_*
npm start              # http://localhost:4000/api
```

Variables de `backend/.env` relacionadas con las instituciones:

| Variable | Para qué |
|---|---|
| `SUPERADMIN_EMAIL`, `SUPERADMIN_PASSWORD` | Superadministrador de la plataforma; se crea al iniciar si no existe (contraseña de 8+ caracteres). También lo usan las pruebas. |
| `INSTITUCION_INICIAL_NOMBRE` | Nombre de la institución 1 al migrar una base de un solo colegio. |
| `DEMO_ADMIN_EMAIL`, `DEMO_ADMIN_PASSWORD`, `DEMO_USUARIOS_PASSWORD` | Opcionales, para `npm run db:demo`. |
| `TEST_MYSQL_ADMIN_USER`, `TEST_MYSQL_ADMIN_PASSWORD` | Opcionales: usuario que puede crear bases `ct_prueba_*` para la prueba de migración. |

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

Con MySQL y el backend en ejecución, y `SUPERADMIN_EMAIL` / `SUPERADMIN_PASSWORD` en `backend/.env`:

```bash
cd backend
npm test
```

Son pruebas de integración contra la API y MySQL reales:

- `api.test.js`: cada corrida crea **su propia institución** (por la API del SUPERADMIN), le carga
  los datos de demostración y prueba todas las funciones; al final verifica que ninguna otra
  institución cambió.
- `primeros-pasos.test.js`: alta de computadoras en lote (errores por fila, capacidad, aislamiento) y contraseña inicial generada.
- `instituciones.test.js`: aislamiento entre dos instituciones A y B (listar, ver, crear, modificar
  y borrar), unicidades por institución, eventos en tiempo real, suspensión y SUPERADMIN.
- `migracion.test.js`: migra una copia del esquema anterior (`tests/fixtures`) en una base
  descartable. Se omite si no hay `TEST_MYSQL_ADMIN_USER`.

Las pruebas **agregan** instituciones y registros de prueba: ejecutarlas sobre una base de desarrollo.

## Roles y permisos (validados en Express)

| Rol | Laboratorios | Mantenimientos | Usuarios |
|---|---|---|---|
| Administrador | Todos | Gestiona | Registra y asigna roles |
| Directivo | Todos | Solo consulta | — |
| Técnico / Encargado | Asignados | Gestiona | — |
| Docente de laboratorio | Asignados | Gestiona | — |
| Docente | Asignados | Consulta y reporta problemas | — |

- Al registrar o reasignar usuarios solo se aceptan **Docente**, **Docente de laboratorio** y **Técnico**; Administrador, Encargado y Directivo se rechazan con `403`, aunque se envíen directo a la API.
- Si a la tabla `roles` le faltan TECNICO o DOCENTE DE LABORATORIO, el backend los agrega al iniciar, sin duplicar ni modificar los existentes.
- Todos los roles trabajan **dentro de su institución**: "todos los laboratorios" del administrador y el directivo son los de su colegio.
- La cuenta del administrador está protegida: no se puede cambiar su rol, bloquear ni eliminar desde el panel. Los administradores de cada colegio los crea el SUPERADMIN.
- Las cuentas cargadas por los scripts SQL guardan la contraseña en texto plano; el login las acepta sin modificarlas. Las cuentas nuevas se guardan con hash bcrypt.

## Datos de demostración (institución Demo)

`npm run db:demo` usa `backend/src/config/datosDemo.js`. Ningún colegio recibe datos automáticamente.

| Laboratorio | Computadoras | Equipamiento | Software |
|---|---|---|---|
| 4-1 (aula general) | 12 · PC-4A-01 a 12 | Dell OptiPlex 3090 Micro / 3080 | Chrome, Office 365 |
| 4-2 (informática básica) | 14 · PC-4B-01 a 14 | HP ProDesk 400 G7 / EliteDesk 800 G6 | Chrome, Office 365, VS Code |
| 4-3 (aula general) | 12 · PC-4C-01 a 12 | Lenovo ThinkCentre M720q / M70q Gen 2 | Chrome, Office 365 |
| 5-1 (programación web) | 15 · PC-5A-01 a 15 | Dell OptiPlex 7090 Tower (i7) | Chrome, VS Code, GitHub Desktop, XAMPP |
| 5-2 (desarrollo avanzado) | 13 · PC-5B-01 a 13 | Lenovo ThinkCentre M90t / ThinkStation P350 | Chrome, Office 365, VS Code, Visual Studio 2022, GitHub Desktop |

`CONTROL TECH INSERTS.sql` y `CONTROL TECH BD INSERT VERIF(para ver).sql` son del esquema anterior
(un solo colegio) y se conservan como referencia: no se ejecutan sobre la base actual.

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
  - La baja queda en el historial de acciones (identificador, serie, modelo, laboratorio y lo eliminado).
  - Para conservar el historial, conviene marcarla *Fuera de servicio* desde Editar en lugar de eliminarla.

## Bloqueo y eliminación de usuarios (solo el administrador)

En **Usuarios**, cada cuenta (salvo la del administrador) tiene las acciones **Bloquear/Desbloquear** y **Eliminar**:

- **Bloquear**: la cuenta no puede iniciar sesión ("Tu cuenta está bloqueada") y, si tiene una ventana abierta, su sesión se cierra en el momento. Se conserva todo su historial y se puede desbloquear.
- **Eliminar**: solo cuentas **sin historial**. Los mantenimientos, acciones y reportes de un usuario dependen de él en la base (claves foráneas); si tiene, se rechaza y se propone bloquearlo. Al eliminar se quitan sus asignaciones de laboratorio, sus equipos quedan sin responsable y la baja queda en el historial.
- Requiere la columna `usuarios.bloqueado`, que el backend **agrega solo al iniciar** (migración segura, no modifica datos). Si el usuario de MySQL no tiene permiso `ALTER`, la terminal lo indica: ejecutá `backend/sql/migraciones/001_usuarios_bloqueado.sql` (por ejemplo como `root` en phpMyAdmin) y reiniciá el backend. Mientras tanto el resto del sistema funciona.

## Recuperación de contraseña ("¿Olvidaste tu contraseña?")

1. En el inicio de sesión, el usuario elige **¿Olvidaste tu contraseña?**, escribe su email (y, si quiere, un mensaje) y envía la solicitud. La respuesta es siempre la misma, exista o no la cuenta, para no revelar qué emails están registrados. El administrador no usa esta opción. Hay un límite de 3 solicitudes por email cada 15 minutos, y cada usuario tiene una sola solicitud pendiente a la vez.
2. El **administrador** recibe un aviso **al instante** (Server-Sent Events) y un contador en **Usuarios**. Si no estaba conectado, lo ve al ingresar.
3. En **Usuarios → Solicitudes de cambio de contraseña**, el administrador elige **Cambiar contraseña** (generar una temporal, por ejemplo `iQas-2297-Ba`, o escribirla) o **Descartar**. También puede cambiar la contraseña de cualquier usuario desde su fila.
4. La contraseña nueva se guarda con **bcrypt**. Las sesiones abiertas del usuario se cierran ("Tu contraseña fue cambiada…") y la contraseña anterior deja de funcionar. La solicitud queda *Atendida* y el cambio, en el historial.

Usa la tabla `solicitudes_contrasena`, que el backend **crea solo al iniciar** (no modifica datos). Si el usuario de MySQL no tiene permiso `CREATE`, la terminal lo indica: ejecutá `backend/sql/migraciones/002_solicitudes_contrasena.sql` (por ejemplo como `root`) y reiniciá el backend.

## Alertas de mantenimiento (Necesidad 4)

El sistema avisa cuando un equipo **requiere mantenimiento**, para que el administrador actúe antes de que falle.

**Cómo se generan**
- **Por un usuario**: cualquier usuario puede usar *Avisar que requiere mantenimiento* (ficha del equipo) o *Reportar problema* (Mantenimientos).
- **Por el sistema** (al iniciar y cada `ALERTAS_INTERVALO_MIN` minutos, 15 por defecto):
  - *Mantenimiento preventivo vencido*: el equipo no tiene un preventivo completado hace `ALERTA_PREVENTIVO_DIAS` días (180 por defecto), contando desde el último o desde su alta.
  - *Mantenimiento programado sin realizar*: un mantenimiento cuya fecha ya pasó sigue Pendiente.
  - No se duplican, y al completar el mantenimiento (marcando los problemas como resueltos) dejan de estar activas. El administrador puede forzar la verificación con *Verificar ahora* en la campana.

**Cómo llegan** (administrador, directivo y roles de gestión, cada uno solo los de sus laboratorios)
- **Dos ventanas abiertas** (el administrador y otro usuario): la alerta llega **al instante, sin recargar** (Server-Sent Events: `GET /api/alertas/stream`). Aparece un aviso, se actualiza el contador de la campana y el título de la pestaña (`(3) ControlTech`).
- **Una sola ventana**: si está el administrador, recibe en vivo las alertas del sistema; si está otro usuario, su aviso queda guardado y el administrador lo ve al entrar ("Tenés N alertas activas"). Como respaldo, la lista se consulta cada minuto.
- **Cada ventana tiene su propia sesión** (`sessionStorage`), así en el mismo navegador puede haber una ventana con el administrador y otra con otro usuario.

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

Todas las rutas de un colegio responden `403` al SUPERADMIN, y `403` con `codigo: INSTITUCION_SUSPENDIDA` si la institución del usuario está suspendida.

| Método | Ruta | Permiso |
|---|---|---|
| POST | `/api/auth/login` | público (devuelve `usuario` e `institucion`) |
| GET | `/api/auth/me` | autenticado |
| GET | `/api/institucion` | usuarios del colegio |
| PUT | `/api/institucion` (nombre, CUIT, dirección, localidad, provincia, email, teléfono, logo) | administrador |
| PATCH | `/api/institucion/configurada` | administrador |
| GET / POST | `/api/plataforma/instituciones` (alta con su primer administrador) | SUPERADMIN |
| PATCH | `/api/plataforma/instituciones/:id/estado` | SUPERADMIN |
| GET | `/api/roles/asignables` | administrador |
| GET / POST | `/api/usuarios` (`generar: true` crea la contraseña inicial y la devuelve una vez) | administrador |
| PATCH | `/api/usuarios/:id/rol` | administrador |
| GET | `/api/laboratorios`, `/api/laboratorios/:id` | autenticado (filtrado por laboratorio) |
| POST / PUT / DELETE | `/api/laboratorios`, `/api/laboratorios/:id` | administrador |
| GET | `/api/laboratorios/:id/responsables` | gestión |
| GET | `/api/laboratorios/:id/software` | autenticado (filtrado por laboratorio) |
| POST / PUT / DELETE | `/api/laboratorios/:id/software`, `/api/laboratorios/:id/software/:idSoftware` | gestión, en sus laboratorios |
| GET | `/api/equipos`, `/api/equipos/:id`, `/api/software` | autenticado (filtrado por laboratorio) |
| POST / PUT | `/api/equipos`, `/api/equipos/:id` | gestión, en sus laboratorios |
| POST | `/api/equipos/lote` (`{ id_laboratorio, equipos }`, errores por fila en `detalles`) | gestión, en sus laboratorios |
| DELETE | `/api/equipos/:id` | administrador |
| PATCH | `/api/usuarios/:id/bloqueo` | administrador |
| POST | `/api/auth/recuperar` | público |
| GET | `/api/usuarios/solicitudes` | administrador |
| PATCH | `/api/usuarios/:id/contrasena`, `/api/usuarios/solicitudes/:id/descartar` | administrador |
| DELETE | `/api/usuarios/:id` | administrador |
| GET | `/api/alertas`, `/api/alertas/resumen` | administrador, directivo y gestión (por laboratorio) |
| GET | `/api/alertas/stream` (eventos en tiempo real) | autenticado |
| POST | `/api/alertas/verificar` | administrador |
| GET | `/api/mantenimientos/resumen` | autenticado |
| GET | `/api/mantenimientos/equipos-con-problemas` | autenticado |
| GET | `/api/mantenimientos/historial/:idEquipo` | autenticado |
| GET | `/api/mantenimientos`, `/api/mantenimientos/:id` | autenticado |
| POST | `/api/mantenimientos` | gestión |
| PUT | `/api/mantenimientos/:id` | gestión |
| PATCH | `/api/mantenimientos/:id/estado` | gestión |
| POST | `/api/mantenimientos/problemas` | gestión y docentes |
| PATCH | `/api/mantenimientos/problemas/:id/resolver` | gestión |
