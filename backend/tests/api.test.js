// Pruebas de integracion contra la API en ejecucion y la base MySQL real.
// Requiere: servidor Express levantado (npm start) y la base cargada con los scripts del repositorio.
// Uso: npm test   (variables opcionales: API_URL, y las DB_* del archivo .env)
// Las pruebas agregan registros de prueba (usuarios *@test.controltech, mantenimientos y problemas);
// no eliminan ni modifican los datos originales.
require('dotenv').config({ quiet: true });
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const mysql = require('mysql2/promise');
const { CAPACIDAD_MIN: CMIN, CAPACIDAD_MAX: CMAX } = require('../src/utils/capacidad');

const API = process.env.API_URL || `http://localhost:${process.env.PORT || 4000}/api`;
const SUFIJO = Date.now().toString(36);
let db;
let admin;
let adminAntes;
let mantenimientosAntes;
let equiposAntes;
let laboratoriosAntes;

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

// Inserta n computadoras de prueba directo en la base (para probar la capacidad).
async function llenar(idLab, n, prefijo) {
  const filas = Array.from({ length: n }, (_, i) => [`${prefijo}-${i + 1}-${SUFIJO}`.toUpperCase(), `S-${prefijo}-${i + 1}-${SUFIJO}`.toUpperCase(), 'HP', idLab]);
  await db.query('INSERT INTO equipos (identificador, nro_serie, marca, id_laboratorio) VALUES ?', [filas]);
}
// Escucha los eventos en tiempo real (SSE) de una sesion, como lo hace una ventana abierta.
function escuchar(token) {
  const ctrl = new AbortController();
  const eventos = [];
  (async () => {
    try {
      const res = await fetch(`${API}/alertas/stream`, { headers: { Authorization: `Bearer ${token}` }, signal: ctrl.signal });
      const lector = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let buf = '';
      for (;;) {
        const { value, done } = await lector.read();
        if (done) break;
        buf += value;
        let i;
        while ((i = buf.indexOf('\n\n')) >= 0) {
          const bloque = buf.slice(0, i);
          buf = buf.slice(i + 2);
          let ev = 'message';
          let d = '';
          for (const l of bloque.split('\n')) {
            if (l.startsWith('event:')) ev = l.slice(6).trim();
            else if (l.startsWith('data:')) d += l.slice(5).trim();
          }
          if (d) eventos.push({ ev, datos: JSON.parse(d) });
        }
      }
    } catch { /* conexion cerrada */ }
  })();
  return { eventos, cerrar: () => ctrl.abort() };
}
async function esperar(fn, ms = 4000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const r = fn();
    if (r) return r;
    await new Promise((ok) => setTimeout(ok, 50));
  }
  return fn();
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
  [laboratoriosAntes] = await db.query('SELECT * FROM laboratorios WHERE id_laboratorio <= 6 ORDER BY id_laboratorio');
  [equiposAntes] = await db.query("SELECT * FROM equipos WHERE nro_serie LIKE 'CT26-%' AND identificador NOT IN ('PC-4B-03','PC-4D-04') ORDER BY id_equipo");
  admin = await login('admin@controltech.com', 'Administrador1234');
});

after(async () => {
  await db?.end();
  // Pool del backend usado por las pruebas que llaman directo a los datos iniciales.
  await require('../src/config/db').pool.end();
});

// ---------------- Integracion ----------------
test('health: Express responde y MySQL está conectado', async () => {
  const r = await call('/health');
  assert.equal(r.status, 200);
  assert.deepEqual(r.data, { ok: true, db: 'conectada' });
});

test('rutas protegidas rechazan peticiones sin token o con token inválido', async () => {
  assert.equal((await call('/mantenimientos')).status, 401);
  assert.equal((await call('/usuarios', { token: 'x.y.z' })).status, 401);
  const r404 = await call('/no-existe');
  assert.equal(r404.status, 404);
  assert.equal(r404.data.codigo, 'RUTA_NO_ENCONTRADA');
  assert.match(r404.data.error, /GET \/api\/no-existe/);
});

// ---------------- Usuarios y roles ----------------
test('el administrador existente inicia sesión y conserva sus permisos', async () => {
  assert.equal(admin.usuario.rol, 'ADMINISTRADOR');
  assert.equal(admin.usuario.laboratorios, null, 'el admin ve todos los laboratorios');
  assert.equal((await call('/usuarios', { token: admin.token })).status, 200);
  const labs = await call('/laboratorios', { token: admin.token });
  const [[{ total }]] = await db.query('SELECT COUNT(*) AS total FROM laboratorios');
  assert.equal(labs.data.length, total, 'el administrador ve todos los laboratorios');
  const [[{ n }]] = await db.query("SELECT COUNT(*) n FROM usuarios u JOIN roles r ON r.id_rol=u.id_rol WHERE r.nombre_rol='ADMINISTRADOR'");
  assert.equal(n, 1, 'existe un único administrador');
});

test('solo se ofrecen los roles Docente, Docente de laboratorio y Técnico', async () => {
  const r = await call('/roles/asignables', { token: admin.token });
  assert.equal(r.status, 200);
  assert.deepEqual(r.data.map((x) => x.nombre_rol), ['DOCENTE', 'DOCENTE DE LABORATORIO', 'TECNICO']);
  assert.deepEqual(r.data.map((x) => x.etiqueta), ['Docente', 'Docente de laboratorio', 'Técnico']);
});

test('registro de un técnico: gestiona mantenimientos y equipos solo en sus laboratorios', async () => {
  const email = `tecnico.${SUFIJO}@test.controltech`;
  const r = await call('/usuarios', {
    method: 'POST', token: admin.token,
    body: { nombre: 'Tomas', apellido: 'Prueba', email, contrasena: 'Tecnico2026', id_rol: await idRol('TECNICO'), laboratorios: [await idLab('Laboratorio 5-2')] },
  });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  assert.equal(r.data.nombre_rol, 'TECNICO');
  assert.equal(r.data.rolEtiqueta, 'Técnico');
  const s = await login(email, 'Tecnico2026');
  assert.equal(s.usuario.rol, 'TECNICO');
  assert.equal((await call('/usuarios', { token: s.token })).status, 403, 'un técnico no gestiona usuarios');
  const propio = await equipo('PC-5B-03');
  const ajeno = await equipo('PC-4A-03');
  const m = await call('/mantenimientos', { method: 'POST', token: s.token, body: { id_equipo: propio.id_equipo, fecha_mantenimiento: '2026-11-06', tipo: 'Preventivo', detalle: `Revisión técnico ${SUFIJO}` } });
  assert.equal(m.status, 201, JSON.stringify(m.data));
  assert.equal(m.data.responsable, 'Tomas Prueba');
  assert.equal((await call('/mantenimientos', { method: 'POST', token: s.token, body: { id_equipo: ajeno.id_equipo, fecha_mantenimiento: '2026-11-06', tipo: 'Preventivo', detalle: 'x' } })).status, 403);
  assert.equal((await call(`/equipos/${ajeno.id_equipo}`, { token: s.token })).status, 403);
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

for (const rol of ['ADMINISTRADOR', 'ENCARGADO', 'DIRECTIVO']) {
  test(`la API rechaza asignar el rol ${rol} a un usuario nuevo`, async () => {
    const email = `rechazo.${rol.toLowerCase()}.${SUFIJO}@test.controltech`;
    const r = await call('/usuarios', {
      method: 'POST', token: admin.token,
      body: { nombre: 'X', apellido: 'Y', email, contrasena: 'Segura2026', id_rol: await idRol(rol), laboratorios: [1] },
    });
    assert.equal(r.status, 403);
    assert.match(r.data.error, /Solo se permiten Docente, Docente de laboratorio y Técnico/);
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
  for (const prohibido of ['ADMINISTRADOR', 'ENCARGADO', 'DIRECTIVO']) {
    const x = await call(`/usuarios/${doc.id_usuario}/rol`, { method: 'PATCH', token: admin.token, body: { id_rol: await idRol(prohibido) } });
    assert.equal(x.status, 403, prohibido);
  }
  const aTecnico = await call(`/usuarios/${doc.id_usuario}/rol`, { method: 'PATCH', token: admin.token, body: { id_rol: await idRol('TECNICO') } });
  assert.equal(aTecnico.status, 200);
  assert.equal(aTecnico.data.nombre_rol, 'TECNICO');
  const r4 = await call(`/usuarios/${doc.id_usuario}/rol`, { method: 'PATCH', token: admin.token, body: { id_rol: await idRol('DOCENTE DE LABORATORIO') } });
  assert.equal(r4.status, 200);
  assert.equal(r4.data.nombre_rol, 'DOCENTE DE LABORATORIO');
  const [[{ n }]] = await db.query("SELECT COUNT(*) n FROM usuarios u JOIN roles r ON r.id_rol=u.id_rol WHERE r.nombre_rol='ADMINISTRADOR'");
  assert.equal(n, 1, 'sigue habiendo un único administrador');
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
  const [[{ total }]] = await db.query('SELECT COUNT(*) AS total FROM equipos WHERE id_laboratorio IN (?)', [permitidos]);
  assert.ok(eqs.data.length === Number(total) && eqs.data.every((e) => permitidos.includes(e.id_laboratorio)));
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

// ---------------- Laboratorios ----------------
const LAB_TEST = `Laboratorio Prueba ${SUFIJO}`;
let labTest;

test('administrador: alta de laboratorio con validaciones y sin duplicados', async () => {
  const sinNombre = await call('/laboratorios', { method: 'POST', token: admin.token, body: { piso: '6to piso' } });
  assert.equal(sinNombre.status, 400);
  assert.match(sinNombre.data.error, /nombre del laboratorio es obligatorio/);
  for (const cap of [-2, 0, CMIN - 1, CMAX + 1, CMIN + 0.5, '', null, undefined]) {
    const r = await call('/laboratorios', { method: 'POST', token: admin.token, body: { nombre: LAB_TEST, capacidad_equipos: cap } });
    assert.equal(r.status, 400, `capacidad ${cap} debe rechazarse`);
    assert.match(r.data.error, new RegExp(`entre ${CMIN} y ${CMAX} equipos`));
  }
  const [[ninguno]] = await db.query('SELECT COUNT(*) AS n FROM laboratorios WHERE nombre = ?', [LAB_TEST]);
  assert.equal(Number(ninguno.n), 0, 'ninguna capacidad inválida crea el laboratorio');
  for (const cap of [CMIN, CMAX]) {
    const lim = await call('/laboratorios', { method: 'POST', token: admin.token, body: { nombre: `Lab Limite ${cap} ${SUFIJO}`, capacidad_equipos: cap } });
    assert.equal(lim.status, 201, `capacidad ${cap} es válida`);
    assert.equal(lim.data.capacidad_equipos, cap);
  }

  const r = await call('/laboratorios', {
    method: 'POST', token: admin.token,
    body: { nombre: LAB_TEST, descripcion: 'Laboratorio de pruebas', edificio: 'Anexo', piso: '6to piso', ubicacion: 'Ala norte', capacidad_equipos: CMIN, codigo_acceso: 'TARJ-99' },
  });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  assert.equal(r.data.estado, 'Activo');
  assert.equal(r.data.codigo_acceso, 'TARJ-99');
  labTest = r.data.id_laboratorio;
  const [asig] = await db.query('SELECT 1 FROM usuario_laboratorio WHERE id_usuario = ? AND id_laboratorio = ?', [adminAntes.id_usuario, labTest]);
  assert.equal(asig.length, 1, 'el administrador queda asignado al laboratorio nuevo');
  const dup = await call('/laboratorios', { method: 'POST', token: admin.token, body: { nombre: `  ${LAB_TEST.toUpperCase()} `, capacidad_equipos: CMAX } });
  assert.equal(dup.status, 409);
  const dupExistente = await call('/laboratorios', { method: 'POST', token: admin.token, body: { nombre: 'Laboratorio 4-1', capacidad_equipos: CMAX } });
  assert.equal(dupExistente.status, 409);
});

test('solo el administrador crea o edita laboratorios', async () => {
  const maria = await login('maria@suiza26.edu', 'demo123');
  assert.equal((await call('/laboratorios', { method: 'POST', token: maria.token, body: { nombre: `X ${SUFIJO}`, capacidad_equipos: CMAX } })).status, 403);
  assert.equal((await call(`/laboratorios/${await idLab('Laboratorio 4-2')}`, { method: 'PUT', token: maria.token, body: { piso: 'x' } })).status, 403);
});

test('detalle de laboratorio y restricción por laboratorio asignado', async () => {
  const maria = await login('maria@suiza26.edu', 'demo123');
  const propio = await call(`/laboratorios/${await idLab('Laboratorio 4-2')}`, { token: maria.token });
  assert.equal(propio.status, 200);
  assert.equal(propio.data.total_equipos >= 12, true);
  assert.ok(propio.data.equipos_por_estado.length > 0);
  assert.ok(propio.data.usuarios.some((u) => u.nombre === 'Maria'));
  assert.equal('codigo_acceso' in propio.data, false, 'el código de acceso solo lo ve el administrador');
  assert.equal((await call(`/laboratorios/${await idLab('Laboratorio 4-1')}`, { token: maria.token })).status, 403);
  const lista = await call('/laboratorios', { token: maria.token });
  assert.deepEqual(lista.data.map((l) => l.nombre), ['Laboratorio 4-2', 'Laboratorio 4-3']);
});

test('edición de laboratorio', async () => {
  const r = await call(`/laboratorios/${labTest}`, { method: 'PUT', token: admin.token, body: { ubicacion: 'Ala sur', capacidad_equipos: CMIN + 1 } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.ubicacion, 'Ala sur');
  assert.equal(r.data.capacidad_equipos, CMIN + 1);
  for (const cap of [CMIN - 1, CMAX + 1, null]) {
    const x = await call(`/laboratorios/${labTest}`, { method: 'PUT', token: admin.token, body: { capacidad_equipos: cap } });
    assert.equal(x.status, 400, `capacidad ${cap} debe rechazarse al editar`);
    assert.match(x.data.error, new RegExp(`entre ${CMIN} y ${CMAX} equipos`));
  }
  const [[lab41]] = await db.query("SELECT COUNT(*) AS n FROM equipos e JOIN laboratorios l USING (id_laboratorio) WHERE l.nombre = 'Laboratorio 4-1'");
  // Capacidad válida pero menor a los equipos registrados.
  const [lleno41] = await db.query('INSERT INTO laboratorios (nombre, capacidad_equipos) VALUES (?, ?)', [`Lab Ocupado ${SUFIJO}`, CMAX]);
  await llenar(lleno41.insertId, CMIN + 1, 'OC');
  const bajo = await call(`/laboratorios/${lleno41.insertId}`, { method: 'PUT', token: admin.token, body: { capacidad_equipos: CMIN } });
  assert.equal(bajo.status, 400);
  assert.match(bajo.data.error, /no puede ser menor/);
  // Un laboratorio antiguo con capacidad fuera del rango se puede seguir editando sin tocar la capacidad.
  const [viejo] = await db.query('INSERT INTO laboratorios (nombre, capacidad_equipos) VALUES (?, ?)', [`Lab Antiguo ${SUFIJO}`, CMAX + 20]);
  const ed = await call(`/laboratorios/${viejo.insertId}`, { method: 'PUT', token: admin.token, body: { ubicacion: 'Planta baja' } });
  assert.equal(ed.status, 200, JSON.stringify(ed.data));
  assert.equal(ed.data.capacidad_equipos, CMAX + 20);
  assert.equal((await call(`/laboratorios/${viejo.insertId}`, { method: 'PUT', token: admin.token, body: { capacidad_equipos: CMAX + 5 } })).status, 400);
  assert.equal((await call(`/laboratorios/${labTest}`, { method: 'PUT', token: admin.token, body: { estado: 'Cerrado' } })).status, 400);
});

// ---------------- Informacion de equipos ----------------
test('ficha completa de un equipo con software y licencias', async () => {
  const eq = await equipo('PC-5B-01'); // Lab 5-2: Chrome, Office, VS Code y Visual Studio 2022
  const r = await call(`/equipos/${eq.id_equipo}`, { token: admin.token });
  assert.equal(r.status, 200);
  for (const k of ['identificador', 'nro_serie', 'tipo', 'marca', 'modelo', 'procesador', 'ram', 'almacenamiento', 'estado', 'laboratorio', 'responsable', 'fecha_registro']) {
    assert.ok(k in r.data, `falta ${k}`);
  }
  const programas = r.data.software.map((s) => s.nombre_software);
  for (const n of ['Google Chrome', 'Microsoft Office 365', 'Visual Studio 2022', 'Visual Studio Code']) assert.ok(programas.includes(n), `falta ${n}`);
  assert.equal(r.data.software.find((s) => s.nombre_software === 'Visual Studio 2022').tipo_licencia, 'Prueba');
  assert.ok('total' in r.data.mantenimientos && Array.isArray(r.data.problemas_activos));
  const maria = await login('maria@suiza26.edu', 'demo123');
  assert.equal((await call(`/equipos/${eq.id_equipo}`, { token: maria.token })).status, 403);
});

test('alta de equipo con software, responsable y validaciones', async () => {
  const [[sw]] = await db.query("SELECT id_software FROM software WHERE nombre_software = 'Google Chrome'");
  const base = {
    identificador: `pc-t-${SUFIJO}`, nro_serie: `SER-${SUFIJO}-1`, marca: 'Dell', modelo: 'OptiPlex 3000', procesador: 'Intel Core i5-12500',
    ram: '16 GB', almacenamiento: '512 GB SSD', id_laboratorio: labTest, id_responsable: adminAntes.id_usuario,
    software: [{ id_software: sw.id_software, fecha_instalacion: '2026-11-01' }],
  };
  const r = await call('/equipos', { method: 'POST', token: admin.token, body: base });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  assert.equal(r.data.identificador, `PC-T-${SUFIJO}`.toUpperCase());
  assert.equal(r.data.estado, 'Operativo');
  assert.equal(r.data.responsable, 'Juan Perez');
  assert.equal(r.data.software.length, 1);
  assert.equal(r.data.software[0].fecha_instalacion, '2026-11-01');

  const dupId = await call('/equipos', { method: 'POST', token: admin.token, body: { ...base, nro_serie: `SER-${SUFIJO}-2` } });
  assert.equal(dupId.status, 409);
  assert.match(dupId.data.error, /identificador/);
  const dupSerie = await call('/equipos', { method: 'POST', token: admin.token, body: { ...base, identificador: `PC-T2-${SUFIJO}` } });
  assert.equal(dupSerie.status, 409);
  assert.match(dupSerie.data.error, /número de serie/);
  const [[pedro]] = await db.query("SELECT id_usuario FROM usuarios WHERE email = 'pedro@suiza26.edu'");
  const respAjeno = await call('/equipos', { method: 'POST', token: admin.token, body: { ...base, identificador: `PC-T3-${SUFIJO}`, nro_serie: `SER-${SUFIJO}-3`, id_responsable: pedro.id_usuario } });
  assert.equal(respAjeno.status, 400);
  assert.match(respAjeno.data.error, /responsable debe ser un usuario asignado/);
  const faltantes = await call('/equipos', { method: 'POST', token: admin.token, body: { id_laboratorio: labTest } });
  assert.equal(faltantes.status, 400);
  assert.ok(faltantes.data.detalles.length >= 3);
  const swMalo = await call('/equipos', { method: 'POST', token: admin.token, body: { ...base, identificador: `PC-T4-${SUFIJO}`, nro_serie: `SER-${SUFIJO}-4`, software: [{ id_software: 99999 }] } });
  assert.equal(swMalo.status, 400);
});

test('capacidad y estado del laboratorio al agregar equipos', async () => {
  for (const n of [5, 6]) {
    const r = await call('/equipos', { method: 'POST', token: admin.token, body: { identificador: `PC-T${n}-${SUFIJO}`, nro_serie: `SER-${SUFIJO}-${n}`, marca: 'HP', id_laboratorio: labTest } });
    assert.equal(r.status, 201, JSON.stringify(r.data));
  }
  // Laboratorio con la capacidad mínima completo: el siguiente equipo se rechaza.
  const lleno10 = await call('/laboratorios', { method: 'POST', token: admin.token, body: { nombre: `Lab Lleno ${SUFIJO}`, capacidad_equipos: CMIN } });
  await llenar(lleno10.data.id_laboratorio, CMIN, 'LL');
  const lleno = await call('/equipos', { method: 'POST', token: admin.token, body: { identificador: `PC-T7-${SUFIJO}`, nro_serie: `SER-${SUFIJO}-7`, marca: 'HP', id_laboratorio: lleno10.data.id_laboratorio } });
  assert.equal(lleno.status, 409);
  assert.match(lleno.data.error, new RegExp(`capacidad máxima \\(${CMIN} equipos\\)`));
  // Laboratorio antiguo sin capacidad cargada: se aplica el máximo permitido.
  const [sinCap] = await db.query('INSERT INTO laboratorios (nombre) VALUES (?)', [`Lab Sin Capacidad ${SUFIJO}`]);
  await llenar(sinCap.insertId, CMAX, 'SC');
  const tope = await call('/equipos', { method: 'POST', token: admin.token, body: { identificador: `PC-T9-${SUFIJO}`, nro_serie: `SER-${SUFIJO}-9`, marca: 'HP', id_laboratorio: sinCap.insertId } });
  assert.equal(tope.status, 409);
  assert.match(tope.data.error, new RegExp(`capacidad máxima \\(${CMAX} equipos\\)`));

  const inactivo = await call('/laboratorios', { method: 'POST', token: admin.token, body: { nombre: `${LAB_TEST} inactivo`, estado: 'Inactivo', capacidad_equipos: CMIN } });
  assert.equal(inactivo.status, 201);
  const r = await call('/equipos', { method: 'POST', token: admin.token, body: { identificador: `PC-T8-${SUFIJO}`, nro_serie: `SER-${SUFIJO}-8`, marca: 'HP', id_laboratorio: inactivo.data.id_laboratorio } });
  assert.equal(r.status, 400);
  assert.match(r.data.error, /inactivo/);
});

test('edición de equipo: datos, software y registro en el historial', async () => {
  const [[eq]] = await db.query('SELECT id_equipo FROM equipos WHERE identificador = ?', [`PC-T-${SUFIJO}`.toUpperCase()]);
  const sw = (await db.query("SELECT id_software, nombre_software FROM software WHERE nombre_software IN ('Visual Studio Code','XAMPP')"))[0];
  const r = await call(`/equipos/${eq.id_equipo}`, {
    method: 'PUT', token: admin.token,
    body: { ram: '32 GB', estado: 'En uso', software: sw.map((s) => ({ id_software: s.id_software, fecha_instalacion: '2026-11-03' })) },
  });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.ram, '32 GB');
  assert.equal(r.data.estado, 'En uso');
  assert.deepEqual(r.data.software.map((s) => s.nombre_software).sort(), ['Visual Studio Code', 'XAMPP']);
  assert.equal(r.data.marca, 'Dell', 'los campos no enviados se conservan');
  const [acc] = await db.query("SELECT accion FROM historial_acciones WHERE entidad = 'Equipo' AND id_registro = ? ORDER BY id_accion", [eq.id_equipo]);
  assert.deepEqual(acc.map((a) => a.accion), ['Crear', 'Modificar']);
  const dupSerie = await call(`/equipos/${eq.id_equipo}`, { method: 'PUT', token: admin.token, body: { nro_serie: 'CT26-4A-001' } });
  assert.equal(dupSerie.status, 409);
});

test('permisos: docente de laboratorio gestiona equipos solo en sus laboratorios; docente no', async () => {
  const email = `equipos.${SUFIJO}@test.controltech`;
  const alta = await call('/usuarios', {
    method: 'POST', token: admin.token,
    body: { nombre: 'Eva', apellido: 'Prueba', email, contrasena: 'Equipos2026', id_rol: await idRol('DOCENTE DE LABORATORIO'), laboratorios: [labTest] },
  });
  assert.equal(alta.status, 201);
  const s = await login(email, 'Equipos2026');
  const [[eq]] = await db.query('SELECT id_equipo FROM equipos WHERE identificador = ?', [`PC-T5-${SUFIJO}`]);
  const ed = await call(`/equipos/${eq.id_equipo}`, { method: 'PUT', token: s.token, body: { modelo: 'EliteDesk 800', id_responsable: alta.data.id_usuario } });
  assert.equal(ed.status, 200, JSON.stringify(ed.data));
  assert.equal(ed.data.responsable, 'Eva Prueba');
  const resp = await call(`/laboratorios/${labTest}/responsables`, { token: s.token });
  assert.ok(resp.data.some((u) => u.id_usuario === alta.data.id_usuario));
  const ajeno = await equipo('PC-4A-02');
  assert.equal((await call(`/equipos/${ajeno.id_equipo}`, { method: 'PUT', token: s.token, body: { ram: '64 GB' } })).status, 403);
  assert.equal((await call(`/equipos/${eq.id_equipo}`, { method: 'PUT', token: s.token, body: { id_laboratorio: await idLab('Laboratorio 4-1') } })).status, 403);
  assert.equal((await call('/equipos', { method: 'POST', token: s.token, body: { identificador: `PC-X-${SUFIJO}`, nro_serie: `SER-X-${SUFIJO}`, marca: 'HP', id_laboratorio: await idLab('Laboratorio 4-1') } })).status, 403);

  const pedro = await login('pedro@suiza26.edu', 'demo123');
  const propio = await equipo('PC-4A-05');
  assert.equal((await call(`/equipos/${propio.id_equipo}`, { token: pedro.token })).status, 200, 'el docente consulta la ficha');
  assert.equal((await call(`/equipos/${propio.id_equipo}`, { method: 'PUT', token: pedro.token, body: { ram: '64 GB' } })).status, 403);
  assert.equal((await call('/equipos', { method: 'POST', token: pedro.token, body: {} })).status, 403);
});

// ---------------- Laboratorios iniciales ----------------
test('los 5 laboratorios iniciales figuran en el sistema y no se duplican', async () => {
  const { asegurarLaboratoriosIniciales, LABORATORIOS_INICIALES } = require('../src/config/laboratoriosIniciales');
  const nombres = LABORATORIOS_INICIALES.map((l) => l.nombre);
  assert.deepEqual(nombres, ['Laboratorio 4-1', 'Laboratorio 4-2', 'Laboratorio 4-3', 'Laboratorio 5-1', 'Laboratorio 5-2']);
  assert.equal(await asegurarLaboratoriosIniciales(), 0, 'una segunda verificación no crea nada');
  const [rows] = await db.query('SELECT nombre, COUNT(*) AS n FROM laboratorios WHERE nombre IN (?) GROUP BY nombre', [nombres]);
  assert.equal(rows.length, 5);
  assert.ok(rows.every((r) => Number(r.n) === 1), 'cada laboratorio existe una sola vez');
  const lista = await call('/laboratorios', { token: admin.token });
  for (const n of nombres) assert.ok(lista.data.some((l) => l.nombre === n && l.estado === 'Activo'), `${n} visible y activo`);
});

test('computadoras iniciales: cargadas en cada laboratorio y distintas entre laboratorios', async () => {
  const { PERFILES, EQUIPOS_INICIALES, asegurarDatosIniciales } = require('../src/config/datosIniciales');
  const ids = EQUIPOS_INICIALES.map((e) => e.identificador);
  assert.equal(new Set(ids).size, ids.length, 'identificadores únicos');
  assert.equal(new Set(EQUIPOS_INICIALES.map((e) => e.nro_serie)).size, ids.length, 'números de serie únicos');
  const firmas = PERFILES.map((p) => JSON.stringify(EQUIPOS_INICIALES.filter((e) => e.laboratorio === p.laboratorio)
    .map(({ marca, modelo, procesador, ram, almacenamiento, estado }) => [marca, modelo, procesador, ram, almacenamiento, estado])));
  assert.equal(new Set(firmas).size, PERFILES.length, 'ningún laboratorio repite el equipamiento de otro');
  assert.equal(new Set(PERFILES.map((p) => JSON.stringify(p.software))).size >= 4, true, 'software distinto según el uso del laboratorio');

  for (const p of PERFILES) {
    const [rows] = await db.query(
      'SELECT e.identificador FROM equipos e JOIN laboratorios l ON l.id_laboratorio = e.id_laboratorio WHERE l.nombre = ? AND e.identificador LIKE ?',
      [p.laboratorio, `PC-${p.prefijo}-%`],
    );
    const [bajas] = await db.query("SELECT COUNT(*) AS n FROM historial_acciones WHERE entidad = 'Equipo' AND accion = 'Eliminar' AND detalle LIKE ?", [`Baja del equipo "PC-${p.prefijo}-%`]);
    assert.ok(rows.length + Number(bajas[0].n) >= p.cantidad, `${p.laboratorio}: ${rows.length} de ${p.cantidad} computadoras`);
  }
  const r = await asegurarDatosIniciales();
  assert.equal(r.equipos_agregados, 0, 'una segunda aplicación no agrega computadoras');
  assert.equal(r.laboratorios, 0);
  const lab51 = await call(`/laboratorios/${await idLab('Laboratorio 5-1')}/software`, { token: admin.token });
  assert.ok(lab51.data.some((s) => s.nombre_software === 'XAMPP'), 'el 5-1 (programación) tiene XAMPP');
});

// ---------------- Software por laboratorio ----------------
const SW = `Herramienta Prueba ${SUFIJO}`;
const CLAVE = `TEST-${SUFIJO}-ABCD`.toUpperCase();
let idSwNuevo;

test('software de un laboratorio con licencias e instalaciones', async () => {
  const r = await call(`/laboratorios/${await idLab('Laboratorio 5-2')}/software`, { token: admin.token });
  assert.equal(r.status, 200);
  const vs = r.data.find((s) => s.nombre_software === 'Visual Studio 2022');
  assert.ok(vs, 'Visual Studio 2022 está instalado en el 5-2');
  assert.equal(vs.licencia.tipo_licencia, 'Prueba');
  assert.ok(vs.instalaciones >= 12);
  assert.equal(vs.equipos.length, vs.instalaciones);
  const det = await call(`/laboratorios/${await idLab('Laboratorio 5-2')}`, { token: admin.token });
  assert.equal(det.data.total_software, r.data.length);
});

test('agregar software nuevo con licencia a todas las computadoras del laboratorio', async () => {
  const body = {
    software: { nombre_software: SW, version: '1.0', proveedor: 'Proveedor Prueba' },
    licencia: { tipo_licencia: 'Pago', numero_licencia: CLAVE, fecha_vencimiento: '2026-12-30' },
    equipos: 'todos', fecha_instalacion: '2026-11-05',
  };
  const r = await call(`/laboratorios/${labTest}/software`, { method: 'POST', token: admin.token, body });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  assert.equal(r.data.instalados_ahora, 3);
  assert.equal(r.data.instalaciones, 3);
  assert.equal(r.data.licencia.tipo_licencia, 'Pago');
  assert.equal(r.data.licencia.numero_licencia, CLAVE);
  assert.equal(r.data.licencia.fecha_vencimiento, '2026-12-30');
  idSwNuevo = r.data.id_software;
  const dup = await call(`/laboratorios/${labTest}/software`, { method: 'POST', token: admin.token, body: { ...body, licencia: undefined } });
  assert.equal(dup.status, 409);
  assert.match(dup.data.error, /ya existe en el catálogo/);
  const otra = await call(`/laboratorios/${labTest}/software`, { method: 'POST', token: admin.token, body: { id_software: idSwNuevo, equipos: 'todos' } });
  assert.equal(otra.status, 409);
  assert.match(otra.data.error, /ya estaba instalado/);
  const sinNombre = await call(`/laboratorios/${labTest}/software`, { method: 'POST', token: admin.token, body: { software: {}, equipos: 'todos' } });
  assert.equal(sinNombre.status, 400);
  const claveDup = await call(`/laboratorios/${labTest}/software`, { method: 'POST', token: admin.token, body: { software: { nombre_software: `${SW} B` }, licencia: { tipo_licencia: 'Pago', numero_licencia: CLAVE }, equipos: 'todos' } });
  assert.equal(claveDup.status, 409);
  assert.match(claveDup.data.error, /clave de licencia ya está registrada/);
  const ajeno = await equipo('PC-4A-01');
  const eqAjeno = await call(`/laboratorios/${labTest}/software`, { method: 'POST', token: admin.token, body: { id_software: idSwNuevo, equipos: [ajeno.id_equipo] } });
  assert.equal(eqAjeno.status, 400);
  assert.match(eqAjeno.data.error, /no pertenece a este laboratorio/);
});

test('elegir software del catálogo e instalarlo en computadoras puntuales', async () => {
  const [[xampp]] = await db.query("SELECT id_software FROM software WHERE nombre_software = 'GitHub Desktop'");
  const [[eq]] = await db.query('SELECT id_equipo FROM equipos WHERE id_laboratorio = ? ORDER BY id_equipo LIMIT 1', [labTest]);
  const r = await call(`/laboratorios/${labTest}/software`, { method: 'POST', token: admin.token, body: { id_software: xampp.id_software, equipos: [eq.id_equipo] } });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  assert.equal(r.data.instalaciones, 1);
  assert.deepEqual(r.data.equipos, [eq.id_equipo]);
});

test('editar software del laboratorio: equipos (gestión) y datos o licencia (solo administrador)', async () => {
  const eva = await login(`equipos.${SUFIJO}@test.controltech`, 'Equipos2026'); // Docente de laboratorio del laboratorio de prueba
  const lista = await call(`/laboratorios/${labTest}/software`, { token: eva.token });
  const item = lista.data.find((s) => s.id_software === idSwNuevo);
  assert.equal(item.licencia.numero_licencia, CLAVE, 'los roles de gestión ven la clave');
  const uno = item.equipos.slice(0, 1);
  const r = await call(`/laboratorios/${labTest}/software/${idSwNuevo}`, { method: 'PUT', token: eva.token, body: { equipos: uno } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.instalaciones, 1);
  const prohibido = await call(`/laboratorios/${labTest}/software/${idSwNuevo}`, { method: 'PUT', token: eva.token, body: { licencia: { tipo_licencia: 'Gratuita' } } });
  assert.equal(prohibido.status, 403);
  const admR = await call(`/laboratorios/${labTest}/software/${idSwNuevo}`, { method: 'PUT', token: admin.token, body: { software: { version: '1.1' }, licencia: { tipo_licencia: 'Pago', numero_licencia: CLAVE, fecha_vencimiento: '2027-06-30' } } });
  assert.equal(admR.status, 200, JSON.stringify(admR.data));
  assert.equal(admR.data.version, '1.1');
  assert.equal(admR.data.licencia.fecha_vencimiento, '2027-06-30');
  const [lics] = await db.query('SELECT COUNT(*) AS n FROM licencias WHERE id_software = ?', [idSwNuevo]);
  assert.equal(Number(lics[0].n), 1, 'se actualiza la licencia existente, no se duplica');
});

test('quitar software de un laboratorio y permisos por laboratorio', async () => {
  const eva = await login(`equipos.${SUFIJO}@test.controltech`, 'Equipos2026');
  const pedro = await login('pedro@suiza26.edu', 'demo123');
  const maria = await login('maria@suiza26.edu', 'demo123');
  const lab41 = await idLab('Laboratorio 4-1');
  const vista = await call(`/laboratorios/${lab41}/software`, { token: pedro.token });
  assert.equal(vista.status, 200, 'el docente consulta el software de su laboratorio');
  assert.ok(vista.data.every((s) => !s.licencia || !('numero_licencia' in s.licencia)), 'el docente no ve claves de licencia');
  assert.equal((await call(`/laboratorios/${lab41}/software`, { token: maria.token })).status, 403);
  const [[chrome]] = await db.query("SELECT id_software FROM software WHERE nombre_software = 'Google Chrome'");
  assert.equal((await call(`/laboratorios/${lab41}/software/${chrome.id_software}`, { method: 'DELETE', token: pedro.token })).status, 403);
  assert.equal((await call(`/laboratorios/${lab41}/software`, { method: 'POST', token: pedro.token, body: { id_software: chrome.id_software } })).status, 403);
  assert.equal((await call(`/laboratorios/${lab41}/software/${chrome.id_software}`, { method: 'DELETE', token: eva.token })).status, 403);

  const del = await call(`/laboratorios/${labTest}/software/${idSwNuevo}`, { method: 'DELETE', token: eva.token });
  assert.equal(del.status, 200, JSON.stringify(del.data));
  assert.equal(del.data.desinstalado_de, 1);
  assert.equal((await call(`/laboratorios/${labTest}/software/${idSwNuevo}`, { method: 'DELETE', token: eva.token })).status, 404);
  const [[cat]] = await db.query('SELECT COUNT(*) AS n FROM software WHERE id_software = ?', [idSwNuevo]);
  assert.equal(Number(cat.n), 1, 'el software sigue en el catálogo');
  const [acc] = await db.query("SELECT accion FROM historial_acciones WHERE entidad = 'Software' AND id_registro = ? ORDER BY id_accion", [idSwNuevo]);
  assert.ok(acc.some((a) => a.accion === 'Eliminar') && acc.some((a) => a.accion === 'Crear'));
});

// ---------------- Eliminacion de laboratorios ----------------
test('eliminar un laboratorio vacío (solo el administrador)', async () => {
  const c = await call('/laboratorios', { method: 'POST', token: admin.token, body: { nombre: `Lab Borrar ${SUFIJO}`, capacidad_equipos: CMIN } });
  assert.equal(c.status, 201);
  const id = c.data.id_laboratorio;
  const maria = await login('maria@suiza26.edu', 'demo123');
  assert.equal((await call(`/laboratorios/${id}`, { method: 'DELETE', token: maria.token })).status, 403);
  const r = await call(`/laboratorios/${id}`, { method: 'DELETE', token: admin.token });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.equipos_movidos, 0);
  assert.equal((await call(`/laboratorios/${id}`, { token: admin.token })).status, 404);
  const [asig] = await db.query('SELECT 1 FROM usuario_laboratorio WHERE id_laboratorio = ?', [id]);
  assert.equal(asig.length, 0, 'se quitan las asignaciones de usuarios');
  const [[h]] = await db.query("SELECT detalle FROM historial_acciones WHERE entidad = 'Laboratorio' AND accion = 'Eliminar' AND id_registro = ?", [id]);
  assert.equal(h.detalle, `Baja del laboratorio "Lab Borrar ${SUFIJO}".`);
  assert.equal((await call(`/laboratorios/${id}`, { method: 'DELETE', token: admin.token })).status, 404);
});

test('eliminar un laboratorio con computadoras: se trasladan con su historial', async () => {
  const [eqs] = await db.query('SELECT id_equipo, identificador, id_responsable FROM equipos WHERE id_laboratorio = ? ORDER BY id_equipo', [labTest]);
  assert.equal(eqs.length, 3);
  const m = await call('/mantenimientos', { method: 'POST', token: admin.token, body: { id_equipo: eqs[0].id_equipo, fecha_mantenimiento: '2026-11-05', tipo: 'Preventivo', detalle: `Antes de la baja ${SUFIJO}` } });
  assert.equal(m.status, 201);

  const sinDestino = await call(`/laboratorios/${labTest}`, { method: 'DELETE', token: admin.token });
  assert.equal(sinDestino.status, 409);
  assert.match(sinDestino.data.error, /tiene 3 computadora\(s\)/);
  assert.equal((await call(`/laboratorios/${labTest}`, { method: 'DELETE', token: admin.token, body: { destino: labTest } })).status, 400);
  const [[inactivo]] = await db.query('SELECT id_laboratorio FROM laboratorios WHERE nombre = ?', [`${LAB_TEST} inactivo`]);
  const rInactivo = await call(`/laboratorios/${labTest}`, { method: 'DELETE', token: admin.token, body: { destino: inactivo.id_laboratorio } });
  assert.equal(rInactivo.status, 400);
  assert.match(rInactivo.data.error, /inactivo/);
  const chico = await call('/laboratorios', { method: 'POST', token: admin.token, body: { nombre: `Lab Chico ${SUFIJO}`, capacidad_equipos: CMIN } });
  await llenar(chico.data.id_laboratorio, CMIN - 2, 'CH'); // le quedan 2 lugares
  const rLleno = await call(`/laboratorios/${labTest}`, { method: 'DELETE', token: admin.token, body: { destino: chico.data.id_laboratorio } });
  assert.equal(rLleno.status, 409);
  assert.match(rLleno.data.error, /solo tiene lugar para 2/);
  const [[sigue]] = await db.query('SELECT COUNT(*) AS n FROM laboratorios WHERE id_laboratorio = ?', [labTest]);
  assert.equal(Number(sigue.n), 1, 'los intentos rechazados no eliminan nada');

  const destino = await call('/laboratorios', { method: 'POST', token: admin.token, body: { nombre: `Lab Destino ${SUFIJO}`, capacidad_equipos: CMIN } });
  const r = await call(`/laboratorios/${labTest}`, { method: 'DELETE', token: admin.token, body: { destino: destino.data.id_laboratorio } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.equipos_movidos, 3);
  const [movidos] = await db.query('SELECT id_equipo, id_laboratorio, id_responsable FROM equipos WHERE id_equipo IN (?) ORDER BY id_equipo', [eqs.map((e) => e.id_equipo)]);
  assert.ok(movidos.every((e) => e.id_laboratorio === destino.data.id_laboratorio), 'las computadoras están en el laboratorio de destino');
  for (const e of movidos) {
    const antes = eqs.find((x) => x.id_equipo === e.id_equipo);
    // El administrador tiene acceso al destino (queda responsable); Eva no (queda sin responsable).
    assert.equal(e.id_responsable, antes.id_responsable === adminAntes.id_usuario ? adminAntes.id_usuario : null);
  }
  const [[mant]] = await db.query('SELECT id_equipo FROM mantenimientos WHERE id_mantenimiento = ?', [m.data.id_mantenimiento]);
  assert.equal(mant.id_equipo, eqs[0].id_equipo, 'el mantenimiento sigue vinculado a la computadora');
  const lista = await call('/mantenimientos', { token: admin.token, body: undefined });
  assert.ok(lista.data.some((x) => x.id_mantenimiento === m.data.id_mantenimiento && x.laboratorio === `Lab Destino ${SUFIJO}`));
});

// ---------------- Eliminacion de equipos ----------------
test('eliminar equipos: solo el administrador y con confirmación si tienen historial', async () => {
  const lab = await call('/laboratorios', { method: 'POST', token: admin.token, body: { nombre: `Lab Bajas ${SUFIJO}`, capacidad_equipos: CMIN } });
  const idLabB = lab.data.id_laboratorio;
  const nuevo = async (n) => (await call('/equipos', { method: 'POST', token: admin.token, body: { identificador: `PC-BAJA${n}-${SUFIJO}`, nro_serie: `SBAJA${n}-${SUFIJO}`, marca: 'HP', id_laboratorio: idLabB } })).data;
  const sinHist = await nuevo(1);
  const conHist = await nuevo(2);

  const maria = await login('maria@suiza26.edu', 'demo123');
  assert.equal((await call(`/equipos/${sinHist.id_equipo}`, { method: 'DELETE', token: maria.token })).status, 403);
  const tec = await login(`tecnico.${SUFIJO}@test.controltech`, 'Tecnico2026');
  assert.equal((await call(`/equipos/${sinHist.id_equipo}`, { method: 'DELETE', token: tec.token })).status, 403, 'un técnico no elimina equipos');

  // Sin historial: se elimina directamente.
  const r1 = await call(`/equipos/${sinHist.id_equipo}`, { method: 'DELETE', token: admin.token });
  assert.equal(r1.status, 200, JSON.stringify(r1.data));
  assert.equal(r1.data.mantenimientos_eliminados, 0);
  assert.equal((await call(`/equipos/${sinHist.id_equipo}`, { token: admin.token })).status, 404);
  assert.equal((await call(`/equipos/${sinHist.id_equipo}`, { method: 'DELETE', token: admin.token })).status, 404);

  // Con historial: mantenimiento, problema y software.
  const [[chrome]] = await db.query("SELECT id_software FROM software WHERE nombre_software = 'Google Chrome'");
  await call(`/laboratorios/${idLabB}/software`, { method: 'POST', token: admin.token, body: { id_software: chrome.id_software, equipos: [conHist.id_equipo] } });
  await call('/mantenimientos', { method: 'POST', token: admin.token, body: { id_equipo: conHist.id_equipo, fecha_mantenimiento: '2026-11-05', tipo: 'Correctivo', detalle: `Antes de la baja ${SUFIJO}` } });
  await call('/mantenimientos/problemas', { method: 'POST', token: admin.token, body: { id_equipo: conHist.id_equipo, titulo: `No enciende ${SUFIJO}`, descripcion: 'x' } });
  const sinConfirmar = await call(`/equipos/${conHist.id_equipo}`, { method: 'DELETE', token: admin.token });
  assert.equal(sinConfirmar.status, 409);
  assert.match(sinConfirmar.data.error, /1 mantenimiento\(s\) y 1 problema\(s\)/);
  assert.deepEqual(sinConfirmar.data.detalles, { mantenimientos: 1, mantenimientos_abiertos: 1, alertas: 1 });
  const [[aun]] = await db.query('SELECT COUNT(*) AS n FROM equipos WHERE id_equipo = ?', [conHist.id_equipo]);
  assert.equal(Number(aun.n), 1, 'sin confirmar no se elimina nada');

  const r2 = await call(`/equipos/${conHist.id_equipo}`, { method: 'DELETE', token: admin.token, body: { confirmar_historial: true } });
  assert.equal(r2.status, 200, JSON.stringify(r2.data));
  assert.deepEqual([r2.data.mantenimientos_eliminados, r2.data.problemas_eliminados, r2.data.software_desinstalado], [1, 1, 1]);
  for (const t of ['equipos', 'mantenimientos', 'alertas', 'equipo_software']) {
    const [[c]] = await db.query(`SELECT COUNT(*) AS n FROM ${t} WHERE id_equipo = ?`, [conHist.id_equipo]);
    assert.equal(Number(c.n), 0, `no quedan filas en ${t}`);
  }
  const [[h]] = await db.query("SELECT detalle FROM historial_acciones WHERE entidad = 'Equipo' AND accion = 'Eliminar' AND id_registro = ?", [conHist.id_equipo]);
  const S = SUFIJO.toUpperCase(); // identificador y serie se guardan en mayúsculas
  assert.match(h.detalle, new RegExp(`^Baja del equipo "PC-BAJA2-${S}" \\(serie SBAJA2-${S}`));
  assert.match(h.detalle, /Se eliminaron 1 mantenimiento\(s\) y 1 problema\(s\)/);
  const det = await call(`/laboratorios/${idLabB}`, { token: admin.token });
  assert.equal(det.data.total_equipos, 0);
});

// ---------------- Bloqueo y eliminacion de usuarios ----------------
async function usuarioNuevo(prefijo, labsIds) {
  const email = `${prefijo}.${SUFIJO}@test.controltech`;
  const r = await call('/usuarios', { method: 'POST', token: admin.token, body: { nombre: 'Ulises', apellido: prefijo, email, contrasena: 'Clave2026x', id_rol: await idRol('DOCENTE'), laboratorios: labsIds } });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  return { ...r.data, email, clave: 'Clave2026x' };
}

test('bloquear un usuario: no ingresa y su sesión abierta se cierra en el momento', async () => {
  const u = await usuarioNuevo('bloqueo', [await idLab('Laboratorio 4-1')]);
  const s = await login(u.email, u.clave);
  const ventana = escuchar(s.token);
  assert.ok(await esperar(() => ventana.eventos.some((e) => e.ev === 'conectado')), 'la ventana del usuario está conectada');

  const maria = await login('maria@suiza26.edu', 'demo123');
  assert.equal((await call(`/usuarios/${u.id_usuario}/bloqueo`, { method: 'PATCH', token: maria.token, body: { bloqueado: true } })).status, 403);
  assert.equal((await call(`/usuarios/${u.id_usuario}/bloqueo`, { method: 'PATCH', token: admin.token, body: { bloqueado: 'si' } })).status, 400);
  assert.equal((await call(`/usuarios/${adminAntes.id_usuario}/bloqueo`, { method: 'PATCH', token: admin.token, body: { bloqueado: true } })).status, 403, 'el administrador no se bloquea');

  const b = await call(`/usuarios/${u.id_usuario}/bloqueo`, { method: 'PATCH', token: admin.token, body: { bloqueado: true } });
  assert.equal(b.status, 200, JSON.stringify(b.data));
  const aviso = await esperar(() => ventana.eventos.find((e) => e.ev === 'sesion'));
  assert.ok(aviso, 'la ventana abierta recibe el cierre de sesión');
  assert.match(aviso.datos.motivo, /bloqueada/);
  ventana.cerrar();

  const peticion = await call('/laboratorios', { token: s.token });
  assert.equal(peticion.status, 401);
  assert.match(peticion.data.error, /bloqueada/);
  const otraVez = await call('/auth/login', { method: 'POST', body: { email: u.email, contrasena: u.clave } });
  assert.equal(otraVez.status, 403);
  assert.match(otraVez.data.error, /Tu cuenta está bloqueada/);
  const malaClave = await call('/auth/login', { method: 'POST', body: { email: u.email, contrasena: 'otra-cosa' } });
  assert.equal(malaClave.status, 401, 'con contraseña incorrecta no se revela el bloqueo');
  const lista = await call('/usuarios', { token: admin.token });
  assert.equal(lista.data.find((x) => x.id_usuario === u.id_usuario).bloqueado, true);

  const d = await call(`/usuarios/${u.id_usuario}/bloqueo`, { method: 'PATCH', token: admin.token, body: { bloqueado: false } });
  assert.equal(d.status, 200);
  assert.equal((await login(u.email, u.clave)).usuario.email, u.email, 'desbloqueado vuelve a ingresar');
});

test('eliminar usuarios: sin historial se eliminan; con historial se propone bloquear', async () => {
  const labU = await call('/laboratorios', { method: 'POST', token: admin.token, body: { nombre: `Lab Usuarios ${SUFIJO}`, capacidad_equipos: CMIN } });
  const u = await usuarioNuevo('baja', [labU.data.id_laboratorio]);
  const eq = await call('/equipos', { method: 'POST', token: admin.token, body: { identificador: `PC-RESP-${SUFIJO}`, nro_serie: `SRESP-${SUFIJO}`, marca: 'HP', id_laboratorio: labU.data.id_laboratorio, id_responsable: u.id_usuario } });
  assert.equal(eq.status, 201, JSON.stringify(eq.data));
  const s = await login(u.email, u.clave);
  const ventana = escuchar(s.token);
  await esperar(() => ventana.eventos.some((e) => e.ev === 'conectado'));

  assert.equal((await call(`/usuarios/${adminAntes.id_usuario}`, { method: 'DELETE', token: admin.token })).status, 403);
  const maria = await login('maria@suiza26.edu', 'demo123');
  assert.equal((await call(`/usuarios/${u.id_usuario}`, { method: 'DELETE', token: maria.token })).status, 403);

  const r = await call(`/usuarios/${u.id_usuario}`, { method: 'DELETE', token: admin.token });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.equipos_sin_responsable, 1);
  const [[q]] = await db.query('SELECT COUNT(*) AS n FROM usuarios WHERE id_usuario = ?', [u.id_usuario]);
  assert.equal(Number(q.n), 0);
  const [[ul]] = await db.query('SELECT COUNT(*) AS n FROM usuario_laboratorio WHERE id_usuario = ?', [u.id_usuario]);
  assert.equal(Number(ul.n), 0);
  const [[e]] = await db.query('SELECT id_responsable FROM equipos WHERE id_equipo = ?', [eq.data.id_equipo]);
  assert.equal(e.id_responsable, null);
  assert.ok(await esperar(() => ventana.eventos.find((x) => x.ev === 'sesion')), 'su ventana abierta se cierra');
  ventana.cerrar();
  assert.equal((await call('/auth/login', { method: 'POST', body: { email: u.email, contrasena: u.clave } })).status, 401);
  const [[h]] = await db.query("SELECT detalle FROM historial_acciones WHERE entidad = 'Usuario' AND accion = 'Eliminar' AND id_registro = ?", [u.id_usuario]);
  assert.match(h.detalle, /^Baja del usuario baja\./);

  // Con historial: el técnico registró un mantenimiento en una prueba anterior.
  const [[tec]] = await db.query('SELECT id_usuario FROM usuarios WHERE email = ?', [`tecnico.${SUFIJO}@test.controltech`]);
  const conHist = await call(`/usuarios/${tec.id_usuario}`, { method: 'DELETE', token: admin.token });
  assert.equal(conHist.status, 409);
  assert.match(conHist.data.error, /Bloqueá la cuenta/);
  assert.ok(conHist.data.detalles.mantenimientos >= 1);
  const [[sigue]] = await db.query('SELECT COUNT(*) AS n FROM usuarios WHERE id_usuario = ?', [tec.id_usuario]);
  assert.equal(Number(sigue.n), 1, 'no se eliminó');
});

// ---------------- Alertas de mantenimiento en tiempo real ----------------
test('dos ventanas abiertas: el reporte de un docente le llega al administrador al instante', async () => {
  const pedro = await login('pedro@suiza26.edu', 'demo123'); // Laboratorio 4-1
  const maria = await login('maria@suiza26.edu', 'demo123'); // Laboratorios 4-2 y 4-3
  const vAdmin = escuchar(admin.token);
  const vMaria = escuchar(maria.token);
  await esperar(() => vAdmin.eventos.some((e) => e.ev === 'conectado') && vMaria.eventos.some((e) => e.ev === 'conectado'));

  const eq = await equipo('PC-4A-06');
  const t0 = Date.now();
  const rep = await call('/mantenimientos/problemas', { method: 'POST', token: pedro.token, body: { id_equipo: eq.id_equipo, titulo: `Requiere mantenimiento ${SUFIJO}`, descripcion: 'Hace ruido el ventilador.', severidad: 'Media' } });
  assert.equal(rep.status, 201, JSON.stringify(rep.data));
  const llego = await esperar(() => vAdmin.eventos.find((e) => e.ev === 'alerta' && e.datos.id_alerta === rep.data.id_alerta));
  assert.ok(llego, 'el administrador recibe la alerta');
  assert.ok(Date.now() - t0 < 2000, 'llega en menos de 2 segundos');
  assert.equal(llego.datos.equipo, 'PC-4A-06');
  assert.equal(llego.datos.laboratorio, 'Laboratorio 4-1');
  assert.equal(llego.datos.reportado_por, 'Pedro Lopez');
  assert.equal(llego.datos.origen, 'usuario');
  await new Promise((ok) => setTimeout(ok, 300));
  assert.ok(!vMaria.eventos.some((e) => e.ev === 'alerta' && e.datos.id_alerta === rep.data.id_alerta), 'otro laboratorio no la recibe');

  const lista = await call('/alertas', { token: admin.token });
  assert.ok(lista.data.some((a) => a.id_alerta === rep.data.id_alerta && a.reportado_por === 'Pedro Lopez'));
  assert.equal((await call('/alertas', { token: pedro.token })).status, 403, 'el docente reporta pero no gestiona alertas');
  const deMaria = await call('/alertas', { token: maria.token });
  assert.ok(deMaria.data.every((a) => ['Laboratorio 4-2', 'Laboratorio 4-3'].includes(a.laboratorio)));
  const res = await call('/alertas/resumen', { token: admin.token });
  assert.ok(res.data.activas >= 1);

  const resuelta = await call(`/mantenimientos/problemas/${rep.data.id_alerta}/resolver`, { method: 'PATCH', token: admin.token, body: {} });
  assert.equal(resuelta.status, 200);
  assert.ok(await esperar(() => vAdmin.eventos.find((e) => e.ev === 'alerta-resuelta' && e.datos.id_alerta === rep.data.id_alerta)), 'las ventanas se enteran de que se resolvió');
  vAdmin.cerrar();
  vMaria.cerrar();
});

test('una sola ventana: el reporte queda guardado y el administrador lo ve al entrar', async () => {
  const pedro = await login('pedro@suiza26.edu', 'demo123');
  const eq = await equipo('PC-4A-08');
  const rep = await call('/mantenimientos/problemas', { method: 'POST', token: pedro.token, body: { id_equipo: eq.id_equipo, titulo: `Pantalla parpadea ${SUFIJO}`, descripcion: 'Parpadea al encender.' } });
  assert.equal(rep.status, 201);
  const adminLuego = await login('admin@controltech.com', 'Administrador1234');
  const lista = await call('/alertas', { token: adminLuego.token });
  assert.ok(lista.data.some((a) => a.id_alerta === rep.data.id_alerta && a.estado === 'Activa'));
  await call(`/mantenimientos/problemas/${rep.data.id_alerta}/resolver`, { method: 'PATCH', token: admin.token, body: {} });
});

test('alertas automáticas: preventivo vencido y mantenimiento programado sin realizar', async () => {
  const lab = await call('/laboratorios', { method: 'POST', token: admin.token, body: { nombre: `Lab Alertas ${SUFIJO}`, capacidad_equipos: CMIN } });
  const nuevoEq = async (n) => (await call('/equipos', { method: 'POST', token: admin.token, body: { identificador: `PC-AL${n}-${SUFIJO}`, nro_serie: `SAL${n}-${SUFIJO}`, marca: 'Dell', id_laboratorio: lab.data.id_laboratorio } })).data;
  const viejo = await nuevoEq(1);
  const nuevo = await nuevoEq(2);
  const atrasado = await nuevoEq(3);
  await db.query('UPDATE equipos SET fecha_registro = DATE_SUB(NOW(), INTERVAL 200 DAY) WHERE id_equipo = ?', [viejo.id_equipo]);
  const m = await call('/mantenimientos', { method: 'POST', token: admin.token, body: { id_equipo: atrasado.id_equipo, fecha_mantenimiento: '2026-10-01', tipo: 'Correctivo', detalle: `Cambio de disco ${SUFIJO}` } });
  assert.equal(m.status, 201);

  const pedro = await login('pedro@suiza26.edu', 'demo123');
  assert.equal((await call('/alertas/verificar', { method: 'POST', token: pedro.token })).status, 403);
  const vAdmin = escuchar(admin.token);
  await esperar(() => vAdmin.eventos.some((e) => e.ev === 'conectado'));

  const r = await call('/alertas/verificar', { method: 'POST', token: admin.token });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const prev = r.data.alertas.find((a) => a.id_equipo === viejo.id_equipo);
  assert.ok(prev, 'detecta el preventivo vencido');
  assert.equal(prev.titulo, 'Mantenimiento preventivo vencido');
  assert.equal(prev.origen, 'sistema');
  assert.match(prev.descripcion, /hace 200 días/);
  const prog = r.data.alertas.find((a) => a.id_equipo === atrasado.id_equipo);
  assert.ok(prog, 'detecta el mantenimiento programado sin realizar');
  assert.equal(prog.titulo, 'Mantenimiento programado sin realizar');
  assert.equal(prog.severidad, 'Alta');
  assert.ok(!r.data.alertas.some((a) => a.id_equipo === nuevo.id_equipo), 'un equipo recién dado de alta no genera alerta');
  assert.ok(await esperar(() => vAdmin.eventos.find((e) => e.ev === 'alerta' && e.datos.id_alerta === prev.id_alerta)), 'la alerta automática llega en vivo');
  vAdmin.cerrar();

  const r2 = await call('/alertas/verificar', { method: 'POST', token: admin.token });
  assert.ok(!r2.data.alertas.some((a) => [viejo.id_equipo, atrasado.id_equipo].includes(a.id_equipo)), 'no se duplican');

  // Al hacer el preventivo se resuelve la alerta y no vuelve a aparecer.
  const hecho = await call('/mantenimientos', { method: 'POST', token: admin.token, body: { id_equipo: viejo.id_equipo, fecha_mantenimiento: new Date().toISOString().slice(0, 10), tipo: 'Preventivo', detalle: `Limpieza ${SUFIJO}`, estado: 'Completado', resolver_problemas: true } });
  assert.equal(hecho.status, 201, JSON.stringify(hecho.data));
  const [[a]] = await db.query('SELECT estado FROM alertas WHERE id_alerta = ?', [prev.id_alerta]);
  assert.equal(a.estado, 'Resuelta');
  const r3 = await call('/alertas/verificar', { method: 'POST', token: admin.token });
  assert.ok(!r3.data.alertas.some((x) => x.id_equipo === viejo.id_equipo));
});

// ---------------- Recuperacion de contraseña ----------------
test('¿Olvidaste tu contraseña?: respuesta que no revela cuentas, una solicitud por usuario y aviso en vivo al administrador', async () => {
  const u = await usuarioNuevo('olvido', [await idLab('Laboratorio 4-1')]);
  const vAdmin = escuchar(admin.token);
  const maria = await login('maria@suiza26.edu', 'demo123');
  const vMaria = escuchar(maria.token);
  await esperar(() => vAdmin.eventos.some((e) => e.ev === 'conectado') && vMaria.eventos.some((e) => e.ev === 'conectado'));

  assert.equal((await call('/auth/recuperar', { method: 'POST', body: { email: 'no-es-email' } })).status, 400);
  const inexistente = await call('/auth/recuperar', { method: 'POST', body: { email: `nadie.${SUFIJO}@test.controltech` } });
  const deAdmin = await call('/auth/recuperar', { method: 'POST', body: { email: 'ADMIN@controltech.com' } });
  const valido = await call('/auth/recuperar', { method: 'POST', body: { email: u.email.toUpperCase(), mensaje: 'No recuerdo la clave' } });
  for (const r of [inexistente, deAdmin, valido]) assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(inexistente.data.mensaje, valido.data.mensaje, 'la misma respuesta exista o no la cuenta');
  assert.equal(deAdmin.data.mensaje, valido.data.mensaje);
  const [[adm]] = await db.query("SELECT COUNT(*) AS n FROM solicitudes_contrasena s JOIN usuarios x USING (id_usuario) WHERE x.email = 'admin@controltech.com'");
  assert.equal(Number(adm.n), 0, 'el administrador no genera solicitudes');

  const llego = await esperar(() => vAdmin.eventos.find((e) => e.ev === 'solicitud-contrasena' && e.datos.email === u.email));
  assert.ok(llego, 'el administrador recibe la solicitud al instante');
  assert.equal(llego.datos.mensaje, 'No recuerdo la clave');
  await new Promise((ok) => setTimeout(ok, 200));
  assert.ok(!vMaria.eventos.some((e) => e.ev === 'solicitud-contrasena'), 'solo los administradores reciben las solicitudes');

  const otra = await call('/auth/recuperar', { method: 'POST', body: { email: u.email, mensaje: 'Sigo sin poder entrar' } });
  assert.equal(otra.status, 200);
  const [pend] = await db.query("SELECT mensaje FROM solicitudes_contrasena WHERE id_usuario = ? AND estado = 'Pendiente'", [u.id_usuario]);
  assert.equal(pend.length, 1, 'una sola solicitud pendiente por usuario');
  assert.equal(pend[0].mensaje, 'Sigo sin poder entrar');
  const limite = await call('/auth/recuperar', { method: 'POST', body: { email: u.email } });
  assert.equal(limite.status, 200);
  const bloqueadoPorLimite = await call('/auth/recuperar', { method: 'POST', body: { email: u.email } });
  assert.equal(bloqueadoPorLimite.status, 429, 'más de 3 solicitudes del mismo email en 15 minutos');

  const lista = await call('/usuarios/solicitudes', { token: admin.token });
  assert.equal(lista.status, 200);
  assert.ok(lista.data.some((x) => x.id_usuario === u.id_usuario && x.estado === 'Pendiente'));
  assert.equal((await call('/usuarios/solicitudes', { token: maria.token })).status, 403);
  const usuarios = await call('/usuarios', { token: admin.token });
  assert.ok(usuarios.data.find((x) => x.id_usuario === u.id_usuario).solicitud_pendiente, 'la tabla de usuarios marca la solicitud');
  vAdmin.cerrar();
  vMaria.cerrar();
});

test('el administrador cambia la contraseña: la nueva funciona, la anterior no y la sesión abierta se cierra', async () => {
  const u = await usuarioNuevo('cambio', [await idLab('Laboratorio 4-2')]);
  const sesion = await login(u.email, u.clave);
  const ventana = escuchar(sesion.token);
  const vAdmin = escuchar(admin.token);
  await esperar(() => ventana.eventos.some((e) => e.ev === 'conectado') && vAdmin.eventos.some((e) => e.ev === 'conectado'));
  await call('/auth/recuperar', { method: 'POST', body: { email: u.email } });
  const [[sol]] = await db.query("SELECT id_solicitud FROM solicitudes_contrasena WHERE id_usuario = ? AND estado = 'Pendiente'", [u.id_usuario]);

  const maria = await login('maria@suiza26.edu', 'demo123');
  assert.equal((await call(`/usuarios/${u.id_usuario}/contrasena`, { method: 'PATCH', token: maria.token, body: { generar: true } })).status, 403);
  assert.equal((await call(`/usuarios/${adminAntes.id_usuario}/contrasena`, { method: 'PATCH', token: admin.token, body: { generar: true } })).status, 403, 'no desde este panel para el administrador');
  assert.equal((await call(`/usuarios/${u.id_usuario}/contrasena`, { method: 'PATCH', token: admin.token, body: { contrasena: 'corta' } })).status, 400);

  const r = await call(`/usuarios/${u.id_usuario}/contrasena`, { method: 'PATCH', token: admin.token, body: { generar: true } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const temporal = r.data.contrasena_temporal;
  assert.match(temporal, /^[A-Za-z]{4}-\d{4}-[A-Za-z]{2}$/);
  assert.equal(r.data.solicitudes_atendidas, 1);

  const cierre = await esperar(() => ventana.eventos.find((e) => e.ev === 'sesion'));
  assert.ok(cierre, 'la ventana abierta del usuario se cierra');
  assert.match(cierre.datos.motivo, /contraseña fue cambiada/);
  ventana.cerrar();
  assert.ok(await esperar(() => vAdmin.eventos.find((e) => e.ev === 'solicitud-atendida' && e.datos.id_solicitud === sol.id_solicitud)), 'las ventanas del administrador se actualizan');
  vAdmin.cerrar();

  const vieja = await call('/laboratorios', { token: sesion.token });
  assert.equal(vieja.status, 401, 'la sesión anterior ya no sirve');
  assert.match(vieja.data.error, /contraseña fue cambiada/);
  assert.equal((await call('/auth/login', { method: 'POST', body: { email: u.email, contrasena: u.clave } })).status, 401, 'la contraseña anterior no funciona');
  assert.equal((await login(u.email, temporal)).usuario.email, u.email, 'la nueva sí');
  const [[guardada]] = await db.query('SELECT contrasena FROM usuarios WHERE id_usuario = ?', [u.id_usuario]);
  assert.match(guardada.contrasena, /^\$2[aby]\$10\$/, 'se guarda con bcrypt');
  assert.ok(!guardada.contrasena.includes(temporal));
  const [[est]] = await db.query('SELECT estado, id_atendida_por FROM solicitudes_contrasena WHERE id_solicitud = ?', [sol.id_solicitud]);
  assert.equal(est.estado, 'Atendida');
  assert.equal(est.id_atendida_por, adminAntes.id_usuario);

  // Contraseña escrita por el administrador.
  const r2 = await call(`/usuarios/${u.id_usuario}/contrasena`, { method: 'PATCH', token: admin.token, body: { contrasena: 'NuevaClave2026' } });
  assert.equal(r2.status, 200);
  assert.equal(r2.data.contrasena_temporal, undefined, 'una contraseña escrita no se devuelve');
  assert.ok((await login(u.email, 'NuevaClave2026')).token);
});

test('descartar una solicitud no cambia la contraseña; borrar el usuario borra sus solicitudes', async () => {
  const u = await usuarioNuevo('descarte', [await idLab('Laboratorio 5-1')]);
  await call('/auth/recuperar', { method: 'POST', body: { email: u.email } });
  const [[sol]] = await db.query("SELECT id_solicitud FROM solicitudes_contrasena WHERE id_usuario = ? AND estado = 'Pendiente'", [u.id_usuario]);
  const d = await call(`/usuarios/solicitudes/${sol.id_solicitud}/descartar`, { method: 'PATCH', token: admin.token, body: {} });
  assert.equal(d.status, 200);
  assert.equal((await call(`/usuarios/solicitudes/${sol.id_solicitud}/descartar`, { method: 'PATCH', token: admin.token, body: {} })).status, 409);
  assert.ok((await login(u.email, u.clave)).token, 'la contraseña no cambió');

  await call('/auth/recuperar', { method: 'POST', body: { email: u.email } });
  const del = await call(`/usuarios/${u.id_usuario}`, { method: 'DELETE', token: admin.token });
  assert.equal(del.status, 200, JSON.stringify(del.data));
  const [[q]] = await db.query('SELECT COUNT(*) AS n FROM solicitudes_contrasena WHERE id_usuario = ?', [u.id_usuario]);
  assert.equal(Number(q.n), 0);
});

// ---------------- Conservacion de datos ----------------
test('se conservan los mantenimientos anteriores y la cuenta del administrador', async () => {
  const [despues] = await db.query('SELECT * FROM mantenimientos WHERE id_mantenimiento IN (?) ORDER BY id_mantenimiento', [mantenimientosAntes.map((m) => m.id_mantenimiento)]);
  assert.deepEqual(despues, mantenimientosAntes);
  const [[adminDespues]] = await db.query("SELECT * FROM usuarios WHERE email = 'admin@controltech.com'");
  assert.deepEqual(adminDespues, adminAntes);
  const [labs] = await db.query('SELECT id_laboratorio FROM usuario_laboratorio WHERE id_usuario = ? AND id_laboratorio <= 6', [adminAntes.id_usuario]);
  assert.equal(labs.length, 6);
});

test('se conservan los laboratorios y equipos originales', async () => {
  const [labs] = await db.query('SELECT * FROM laboratorios WHERE id_laboratorio <= 6 ORDER BY id_laboratorio');
  assert.deepEqual(labs, laboratoriosAntes);
  const [eqs] = await db.query("SELECT * FROM equipos WHERE nro_serie LIKE 'CT26-%' AND identificador NOT IN ('PC-4B-03','PC-4D-04') ORDER BY id_equipo");
  assert.deepEqual(eqs, equiposAntes);
});
