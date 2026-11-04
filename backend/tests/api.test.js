// Pruebas de integracion contra la API en ejecucion y la base MySQL real.
// Requiere: servidor Express levantado (npm start) y la base cargada con los scripts del repositorio.
// Uso: npm test   (variables opcionales: API_URL, y las DB_* del archivo .env)
// Las pruebas agregan registros de prueba (usuarios *@test.controltech, mantenimientos y problemas);
// no eliminan ni modifican los datos originales.
require('dotenv').config({ quiet: true });
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const mysql = require('mysql2/promise');

const API = process.env.API_URL || `http://localhost:${process.env.PORT || 4000}/api`;
const SUFIJO = Date.now().toString(36);
let db;
let admin;
let adminAntes;
let mantenimientosAntes;

async function call(path, { method = 'GET', token, body } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, data: await res.json().catch(() => null) };
}

async function login(email, contrasena) {
  const r = await call('/auth/login', { method: 'POST', body: { email, contrasena } });
  assert.equal(r.status, 200, `login ${email}: ${JSON.stringify(r.data)}`);
  return r.data;
}

const idRol = async (nombre) => (await db.query('SELECT id_rol FROM roles WHERE nombre_rol = ?', [nombre]))[0][0].id_rol;
const idLab = async (nombre) => (await db.query('SELECT id_laboratorio FROM laboratorios WHERE nombre = ?', [nombre]))[0][0].id_laboratorio;
const equipo = async (ident) => (await db.query('SELECT * FROM equipos WHERE identificador = ?', [ident]))[0][0];

before(async () => {
  db = await mysql.createConnection({
    host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306), user: process.env.DB_USER,
    password: process.env.DB_PASSWORD, database: process.env.DB_NAME, dateStrings: true,
  });
  [[adminAntes]] = await db.query("SELECT * FROM usuarios WHERE email = 'admin@controltech.com'");
  [mantenimientosAntes] = await db.query('SELECT * FROM mantenimientos ORDER BY id_mantenimiento');
  admin = await login('admin@controltech.com', 'Administrador1234');
});

after(async () => { await db?.end(); });

// ---------------- Integracion ----------------
test('health: Express responde y MySQL está conectado', async () => {
  const r = await call('/health');
  assert.equal(r.status, 200);
  assert.deepEqual(r.data, { ok: true, db: 'conectada' });
});

test('rutas protegidas rechazan peticiones sin token o con token inválido', async () => {
  assert.equal((await call('/mantenimientos')).status, 401);
  assert.equal((await call('/usuarios', { token: 'x.y.z' })).status, 401);
  assert.equal((await call('/no-existe')).status, 404);
});

// ---------------- Usuarios y roles ----------------
test('el administrador existente inicia sesión y conserva sus permisos', async () => {
  assert.equal(admin.usuario.rol, 'ADMINISTRADOR');
  assert.equal(admin.usuario.laboratorios, null, 'el admin ve todos los laboratorios');
  assert.equal((await call('/usuarios', { token: admin.token })).status, 200);
  const labs = await call('/laboratorios', { token: admin.token });
  assert.equal(labs.data.length, 6);
  const [[{ n }]] = await db.query("SELECT COUNT(*) n FROM usuarios u JOIN roles r ON r.id_rol=u.id_rol WHERE r.nombre_rol='ADMINISTRADOR'");
  assert.equal(n, 1, 'existe un único administrador');
});

test('solo se ofrecen los roles Docente y Docente de laboratorio', async () => {
  const r = await call('/roles/asignables', { token: admin.token });
  assert.equal(r.status, 200);
  assert.deepEqual(r.data.map((x) => x.nombre_rol), ['DOCENTE', 'DOCENTE DE LABORATORIO']);
});

test('registro de un docente', async () => {
  const email = `docente.${SUFIJO}@test.controltech`;
  const r = await call('/usuarios', {
    method: 'POST', token: admin.token,
    body: { nombre: 'Ana', apellido: 'Prueba', email, contrasena: 'Docente2026', id_rol: await idRol('DOCENTE'), laboratorios: [await idLab('Laboratorio 4-1')] },
  });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  assert.equal(r.data.nombre_rol, 'DOCENTE');
  const [[u]] = await db.query('SELECT contrasena FROM usuarios WHERE email = ?', [email]);
  assert.match(u.contrasena, /^\$2[aby]\$/, 'la contraseña se guarda con hash bcrypt');
  const s = await login(email, 'Docente2026');
  assert.equal(s.usuario.rol, 'DOCENTE');
  assert.equal((await call('/usuarios', { token: s.token })).status, 403, 'un docente no gestiona usuarios');
});

test('registro de un docente de laboratorio', async () => {
  const email = `doclab.${SUFIJO}@test.controltech`;
  const r = await call('/usuarios', {
    method: 'POST', token: admin.token,
    body: { nombre: 'Luis', apellido: 'Prueba', email, contrasena: 'DocLab2026', id_rol: await idRol('DOCENTE DE LABORATORIO'), laboratorios: [await idLab('Laboratorio 5-1')] },
  });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  const [rows] = await db.query('SELECT l.nombre FROM usuario_laboratorio ul JOIN laboratorios l USING (id_laboratorio) JOIN usuarios u USING (id_usuario) WHERE u.email = ?', [email]);
  assert.deepEqual(rows.map((x) => x.nombre), ['Laboratorio 5-1']);
});

for (const rol of ['ADMINISTRADOR', 'TECNICO', 'ENCARGADO', 'DIRECTIVO']) {
  test(`la API rechaza asignar el rol ${rol} a un usuario nuevo`, async () => {
    const email = `rechazo.${rol.toLowerCase()}.${SUFIJO}@test.controltech`;
    const r = await call('/usuarios', {
      method: 'POST', token: admin.token,
      body: { nombre: 'X', apellido: 'Y', email, contrasena: 'Segura2026', id_rol: await idRol(rol), laboratorios: [1] },
    });
    assert.equal(r.status, 403);
    assert.match(r.data.error, /Solo se permiten Docente y Docente de laboratorio/);
    const [rows] = await db.query('SELECT 1 FROM usuarios WHERE email = ?', [email]);
    assert.equal(rows.length, 0, 'no se creó el usuario');
  });
}

test('validaciones claras del registro', async () => {
  const base = { nombre: 'A', apellido: 'B', email: `val.${SUFIJO}@test.controltech`, contrasena: 'Segura2026', id_rol: await idRol('DOCENTE'), laboratorios: [1] };
  const casos = [
    [{ ...base, id_rol: undefined }, 400, /Seleccioná un rol/],
    [{ ...base, id_rol: 9999 }, 400, /no existe/],
    [{ ...base, email: 'malo' }, 400, /email válido/],
    [{ ...base, contrasena: '123' }, 400, /al menos 8/],
    [{ ...base, laboratorios: [] }, 400, /al menos un laboratorio/],
  ];
  for (const [body, status, msg] of casos) {
    const r = await call('/usuarios', { method: 'POST', token: admin.token, body });
    assert.equal(r.status, status, JSON.stringify(r.data));
    assert.match(r.data.error, msg);
  }
});

test('se impiden las cuentas duplicadas (incluida la del administrador)', async () => {
  const body = { nombre: 'Juan', apellido: 'Perez', email: 'ADMIN@controltech.com', contrasena: 'OtraClave2026', id_rol: await idRol('DOCENTE'), laboratorios: [1] };
  const r = await call('/usuarios', { method: 'POST', token: admin.token, body });
  assert.equal(r.status, 409);
  const r2 = await call('/usuarios', { method: 'POST', token: admin.token, body: { ...body, email: `DOCENTE.${SUFIJO}@test.controltech` } });
  assert.equal(r2.status, 409);
});

test('la cuenta del administrador no puede cambiar de rol y no se asignan roles prohibidos', async () => {
  const r = await call(`/usuarios/${adminAntes.id_usuario}/rol`, { method: 'PATCH', token: admin.token, body: { id_rol: await idRol('DOCENTE') } });
  assert.equal(r.status, 403);
  const [[doc]] = await db.query('SELECT id_usuario FROM usuarios WHERE email = ?', [`docente.${SUFIJO}@test.controltech`]);
  const r2 = await call(`/usuarios/${doc.id_usuario}/rol`, { method: 'PATCH', token: admin.token, body: { id_rol: await idRol('TECNICO') } });
  assert.equal(r2.status, 403);
  const r3 = await call(`/usuarios/${doc.id_usuario}/rol`, { method: 'PATCH', token: admin.token, body: { id_rol: await idRol('ADMINISTRADOR') } });
  assert.equal(r3.status, 403);
  const r4 = await call(`/usuarios/${doc.id_usuario}/rol`, { method: 'PATCH', token: admin.token, body: { id_rol: await idRol('DOCENTE DE LABORATORIO') } });
  assert.equal(r4.status, 200);
  assert.equal(r4.data.nombre_rol, 'DOCENTE DE LABORATORIO');
  // Los tecnicos existentes no se pueden reasignar desde el panel.
  const [[tec]] = await db.query("SELECT id_usuario FROM usuarios WHERE email = 'carlos@suiza26.edu'");
  assert.equal((await call(`/usuarios/${tec.id_usuario}/rol`, { method: 'PATCH', token: admin.token, body: { id_rol: await idRol('DOCENTE') } })).status, 403);
});

// ---------------- Mantenimientos ----------------
test('visualización de equipos con problemas', async () => {
  const r = await call('/mantenimientos/equipos-con-problemas', { token: admin.token });
  assert.equal(r.status, 200);
  const ids = r.data.map((e) => e.identificador);
  for (const id of ['PC-4A-12', 'PC-5B-12', 'PC-4A-11']) assert.ok(ids.includes(id), `${id} debería figurar`);
  const fuera = r.data.find((e) => e.identificador === 'PC-4C-12');
  assert.equal(fuera.categoria, 'Fuera de servicio');
  assert.ok(fuera.problemas.some((p) => p.titulo === 'Equipo sin encendido'));
  const filtrado = await call('/mantenimientos/equipos-con-problemas?categoria=Fuera%20de%20servicio', { token: admin.token });
  assert.ok(filtrado.data.length > 0 && filtrado.data.every((e) => e.categoria === 'Fuera de servicio'));
});

test('visualización de mantenimientos y filtros', async () => {
  const todos = await call('/mantenimientos', { token: admin.token });
  assert.equal(todos.status, 200);
  assert.ok(todos.data.length >= 8);
  const m = todos.data[0];
  for (const k of ['equipo', 'laboratorio', 'tipo', 'estado', 'fecha_mantenimiento', 'responsable', 'detalle', 'notas_adicionales', 'problema_detectado', 'proxima_revision', 'fecha_registro']) {
    assert.ok(k in m, `falta el campo ${k}`);
  }
  const pend = await call('/mantenimientos?estado=Pendiente', { token: admin.token });
  assert.ok(pend.data.length > 0 && pend.data.every((x) => x.estado === 'Pendiente'));
  const prev = await call('/mantenimientos?tipo=Preventivo', { token: admin.token });
  assert.ok(prev.data.length > 0 && prev.data.every((x) => x.tipo === 'Preventivo'));
  const lab = await idLab('Laboratorio 5-1');
  const porLab = await call(`/mantenimientos?laboratorio=${lab}`, { token: admin.token });
  assert.ok(porLab.data.length > 0 && porLab.data.every((x) => x.id_laboratorio === lab));
  const eq = await equipo('PC-4A-11');
  const porEq = await call(`/mantenimientos?equipo=${eq.id_equipo}`, { token: admin.token });
  assert.ok(porEq.data.length > 0 && porEq.data.every((x) => x.id_equipo === eq.id_equipo));
  assert.equal((await call('/mantenimientos?estado=Inventado', { token: admin.token })).status, 400);
});

test('docente de laboratorio: registra, modifica, cambia estado y consulta historial en su laboratorio', async () => {
  const s = await login('maria@suiza26.edu', 'demo123'); // Laboratorios 4-2 y 4-3
  const eq = await equipo('PC-4B-03');
  const detalle = `Prueba automatizada ${SUFIJO}`;

  // Reporte de problema
  const prob = await call('/mantenimientos/problemas', {
    method: 'POST', token: s.token,
    body: { id_equipo: eq.id_equipo, titulo: `Teclado sin respuesta ${SUFIJO}`, descripcion: 'Varias teclas no responden.', severidad: 'Alta', fecha_limite: '2026-12-01', estado_equipo: 'En mantenimiento' },
  });
  assert.equal(prob.status, 201, JSON.stringify(prob.data));
  const dupProb = await call('/mantenimientos/problemas', { method: 'POST', token: s.token, body: { id_equipo: eq.id_equipo, titulo: `Teclado sin respuesta ${SUFIJO}`, descripcion: 'x' } });
  assert.equal(dupProb.status, 409);

  // Registro
  const alta = await call('/mantenimientos', {
    method: 'POST', token: s.token,
    body: { id_equipo: eq.id_equipo, fecha_mantenimiento: '2026-11-04', tipo: 'Correctivo', detalle, costo: 1500, notas_adicionales: 'Obs inicial', estado: 'Pendiente' },
  });
  assert.equal(alta.status, 201, JSON.stringify(alta.data));
  const id = alta.data.id_mantenimiento;
  assert.equal(alta.data.responsable, 'Maria Gonzalez');
  assert.ok(alta.data.fecha_registro, 'la fecha de registro surge del historial');
  assert.match(alta.data.problema_detectado, /Teclado sin respuesta/);
  assert.equal(alta.data.proxima_revision, '2026-12-01');

  // Duplicado
  const dup = await call('/mantenimientos', { method: 'POST', token: s.token, body: { id_equipo: eq.id_equipo, fecha_mantenimiento: '2026-11-04', tipo: 'Correctivo', detalle } });
  assert.equal(dup.status, 409);

  // Equipos con problemas lo incluye
  const cp = await call(`/mantenimientos/equipos-con-problemas?equipo=${eq.id_equipo}`, { token: s.token });
  assert.equal(cp.data[0].categoria, 'En mantenimiento');
  assert.ok(cp.data[0].mantenimientos_abiertos.some((m) => m.id_mantenimiento === id));

  // Modificacion
  const mod = await call(`/mantenimientos/${id}`, { method: 'PUT', token: s.token, body: { notas_adicionales: 'Se reemplazó el teclado', costo: 2500 } });
  assert.equal(mod.status, 200, JSON.stringify(mod.data));
  assert.equal(mod.data.notas_adicionales, 'Se reemplazó el teclado');
  assert.equal(Number(mod.data.costo), 2500);

  // Cambio de estado
  const enProc = await call(`/mantenimientos/${id}/estado`, { method: 'PATCH', token: s.token, body: { estado: 'En proceso' } });
  assert.equal(enProc.data.estado, 'En proceso');
  const fin = await call(`/mantenimientos/${id}/estado`, { method: 'PATCH', token: s.token, body: { estado: 'Completado', estado_equipo: 'Operativo', resolver_problemas: true } });
  assert.equal(fin.status, 200, JSON.stringify(fin.data));
  assert.equal(fin.data.estado, 'Completado');
  assert.equal((await equipo('PC-4B-03')).estado, 'Operativo');
  const [[alerta]] = await db.query('SELECT estado FROM alertas WHERE id_alerta = ?', [prob.data.id_alerta]);
  assert.equal(alerta.estado, 'Resuelta');

  // Historial
  const h = await call(`/mantenimientos/historial/${eq.id_equipo}`, { token: s.token });
  assert.equal(h.status, 200);
  assert.ok(h.data.mantenimientos.some((m) => m.id_mantenimiento === id));
  assert.ok(h.data.problemas.some((p) => p.id_alerta === prob.data.id_alerta));
  const accionesM = h.data.acciones.filter((a) => a.entidad === 'Mantenimiento' && a.id_registro === id);
  assert.ok(accionesM.length >= 4, 'alta, modificación y dos cambios de estado registrados');
});

test('permisos por laboratorio: sin acceso a laboratorios ajenos', async () => {
  const s = await login('maria@suiza26.edu', 'demo123'); // 4-2 y 4-3
  const permitidos = [await idLab('Laboratorio 4-2'), await idLab('Laboratorio 4-3')];
  const lista = await call('/mantenimientos', { token: s.token });
  assert.ok(lista.data.every((m) => permitidos.includes(m.id_laboratorio)));
  const cp = await call('/mantenimientos/equipos-con-problemas', { token: s.token });
  assert.ok(cp.data.every((e) => permitidos.includes(e.id_laboratorio)));
  const eqs = await call('/equipos', { token: s.token });
  assert.ok(eqs.data.length === 24 && eqs.data.every((e) => permitidos.includes(e.id_laboratorio)));
  const ajeno = await equipo('PC-4A-11'); // Laboratorio 4-1
  assert.equal((await call(`/mantenimientos/historial/${ajeno.id_equipo}`, { token: s.token })).status, 403);
  assert.equal((await call('/mantenimientos', { method: 'POST', token: s.token, body: { id_equipo: ajeno.id_equipo, fecha_mantenimiento: '2026-11-04', tipo: 'Preventivo', detalle: 'no permitido' } })).status, 403);
  const [[mAjeno]] = await db.query('SELECT id_mantenimiento FROM mantenimientos WHERE id_equipo = ? LIMIT 1', [ajeno.id_equipo]);
  assert.equal((await call(`/mantenimientos/${mAjeno.id_mantenimiento}`, { method: 'PUT', token: s.token, body: { notas_adicionales: 'x' } })).status, 403);
  assert.equal((await call(`/mantenimientos?laboratorio=${await idLab('Laboratorio 4-1')}`, { token: s.token })).data.length, 0);
});

test('docente: consulta y reporta problemas en su laboratorio, pero no gestiona mantenimientos', async () => {
  const s = await login('pedro@suiza26.edu', 'demo123'); // Laboratorio 4-1
  const propio = await equipo('PC-4A-05');
  const ajeno = await equipo('PC-5A-05');
  assert.equal((await call('/mantenimientos', { token: s.token })).status, 200);
  assert.equal((await call('/mantenimientos', { method: 'POST', token: s.token, body: { id_equipo: propio.id_equipo, fecha_mantenimiento: '2026-11-04', tipo: 'Preventivo', detalle: 'x' } })).status, 403);
  const rep = await call('/mantenimientos/problemas', { method: 'POST', token: s.token, body: { id_equipo: propio.id_equipo, titulo: `Mouse roto ${SUFIJO}`, descripcion: 'No funciona el clic.' } });
  assert.equal(rep.status, 201, JSON.stringify(rep.data));
  assert.equal((await call('/mantenimientos/problemas', { method: 'POST', token: s.token, body: { id_equipo: ajeno.id_equipo, titulo: 'x', descripcion: 'y' } })).status, 403);
  assert.equal((await call('/mantenimientos/problemas', { method: 'POST', token: s.token, body: { id_equipo: propio.id_equipo, titulo: `Otro ${SUFIJO}`, descripcion: 'y', estado_equipo: 'Fuera de servicio' } })).status, 403);
  assert.equal((await call(`/mantenimientos/problemas/${rep.data.id_alerta}/resolver`, { method: 'PATCH', token: s.token, body: {} })).status, 403);
  // El administrador sí puede resolverlo.
  assert.equal((await call(`/mantenimientos/problemas/${rep.data.id_alerta}/resolver`, { method: 'PATCH', token: admin.token, body: {} })).status, 200);
});

test('administrador registra un mantenimiento en cualquier laboratorio', async () => {
  const eq = await equipo('PC-5B-02');
  const r = await call('/mantenimientos', { method: 'POST', token: admin.token, body: { id_equipo: eq.id_equipo, fecha_mantenimiento: '2026-11-05', tipo: 'Preventivo', detalle: `Limpieza programada ${SUFIJO}` } });
  assert.equal(r.status, 201);
  assert.equal(r.data.estado, 'Pendiente');
  assert.equal(r.data.responsable, 'Juan Perez');
});

// ---------------- Conservacion de datos ----------------
test('se conservan los mantenimientos anteriores y la cuenta del administrador', async () => {
  const [despues] = await db.query('SELECT * FROM mantenimientos WHERE id_mantenimiento IN (?) ORDER BY id_mantenimiento', [mantenimientosAntes.map((m) => m.id_mantenimiento)]);
  assert.deepEqual(despues, mantenimientosAntes);
  const [[adminDespues]] = await db.query("SELECT * FROM usuarios WHERE email = 'admin@controltech.com'");
  assert.deepEqual(adminDespues, adminAntes);
  const [labs] = await db.query('SELECT id_laboratorio FROM usuario_laboratorio WHERE id_usuario = ?', [adminAntes.id_usuario]);
  assert.equal(labs.length, 6);
});
