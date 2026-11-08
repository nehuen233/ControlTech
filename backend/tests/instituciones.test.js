// Pruebas de AISLAMIENTO entre instituciones (CLAUDE.md, regla 7) y de la plataforma.
// Crea dos instituciones nuevas (A y B) por la API del SUPERADMIN, cada una con su
// administrador, un docente, un laboratorio, un equipo, software y un mantenimiento, y
// verifica que un usuario de una no puede listar, ver, crear, modificar ni borrar nada de
// la otra. Requiere el backend corriendo y SUPERADMIN_EMAIL / SUPERADMIN_PASSWORD en backend/.env.
require('dotenv').config({ quiet: true });
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const mysql = require('mysql2/promise');

const API = process.env.API_URL || `http://localhost:${process.env.PORT || 4000}/api`;
const SUFIJO = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
const CLAVE = 'Clave-Prueba-2026';
let db;
let superadmin;
const A = {};
const B = {};

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

const ok = (r, status, msg) => { assert.equal(r.status, status, `${msg || ''} ${JSON.stringify(r.data)}`); return r.data; };

// Eventos en tiempo real de una sesion (como una ventana abierta).
function escuchar(token) {
  const ctrl = new AbortController();
  const eventos = [];
  let cerrado = false;
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
    cerrado = true;
  })();
  return { eventos, cerrar: () => ctrl.abort(), estaCerrado: () => cerrado };
}
async function esperar(fn, ms = 4000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const r = fn();
    if (r) return r;
    await new Promise((res) => setTimeout(res, 50));
  }
  return fn();
}

before(async () => {
  db = await mysql.createConnection({
    host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306), user: process.env.DB_USER,
    password: process.env.DB_PASSWORD, database: process.env.DB_NAME, dateStrings: true,
  });
  assert.ok(process.env.SUPERADMIN_EMAIL && process.env.SUPERADMIN_PASSWORD, 'Configurá SUPERADMIN_EMAIL y SUPERADMIN_PASSWORD en backend/.env para correr las pruebas.');
  superadmin = await login(process.env.SUPERADMIN_EMAIL, process.env.SUPERADMIN_PASSWORD);
  assert.equal(superadmin.usuario.rol, 'SUPERADMIN');
  assert.equal(superadmin.institucion, null);
});

after(async () => { await db?.end(); });

test('el SUPERADMIN crea dos instituciones con su primer administrador', async () => {
  for (const [I, l] of [[A, 'a'], [B, 'b']]) {
    I.adminEmail = `admin.${l}.${SUFIJO}@inst-${l}.test`;
    const inst = ok(await call('/plataforma/instituciones', {
      method: 'POST', token: superadmin.token,
      body: { nombre: `Institución ${l.toUpperCase()} ${SUFIJO}`, fecha_fin_prueba: '2027-03-31', administrador: { nombre: 'Admin', apellido: l.toUpperCase(), email: I.adminEmail, contrasena: CLAVE } },
    }), 201, 'alta de institución');
    assert.equal(inst.estado, 'Prueba');
    assert.equal(inst.configurada, 0);
    assert.equal(inst.fecha_fin_prueba, '2027-03-31');
    assert.equal(inst.administrador.email, I.adminEmail);
    I.id = inst.id_institucion;
    I.admin = await login(I.adminEmail, CLAVE);
    assert.equal(I.admin.institucion.id, I.id);
    assert.equal(I.admin.institucion.configurada, 0);
    assert.equal(I.admin.usuario.rol, 'ADMINISTRADOR');
  }
  // Alta invalida: email ya usado (unico en toda la plataforma), sin nombre, o queriendo fijar el estado.
  const dup = await call('/plataforma/instituciones', { method: 'POST', token: superadmin.token, body: { nombre: `Otra ${SUFIJO}`, administrador: { nombre: 'X', apellido: 'Y', email: A.adminEmail, contrasena: CLAVE } } });
  assert.equal(dup.status, 409);
  assert.equal((await call('/plataforma/instituciones', { method: 'POST', token: superadmin.token, body: { administrador: { nombre: 'X', apellido: 'Y', email: `z.${SUFIJO}@x.test`, contrasena: CLAVE } } })).status, 400);
  assert.equal((await call('/plataforma/instituciones', { method: 'POST', token: superadmin.token, body: { nombre: `Z ${SUFIJO}`, estado: 'Activa', administrador: { nombre: 'X', apellido: 'Y', email: `z.${SUFIJO}@x.test`, contrasena: CLAVE } } })).status, 400);
  const [[sinInst]] = await db.query('SELECT COUNT(*) AS n FROM usuarios WHERE email = ?', [`z.${SUFIJO}@x.test`]);
  assert.equal(Number(sinInst.n), 0, 'un alta rechazada no deja usuarios sueltos');
});

test('mismos nombres en las dos instituciones: las unicidades son por institución', async () => {
  const [[rolDocLab]] = await db.query("SELECT id_rol FROM roles WHERE nombre_rol = 'DOCENTE DE LABORATORIO'");
  for (const [I, l] of [[A, 'a'], [B, 'b']]) {
    I.lab = ok(await call('/laboratorios', { method: 'POST', token: I.admin.token, body: { nombre: 'Laboratorio 1', capacidad_equipos: 20 } }), 201, `lab ${l}`);
    I.lab2 = ok(await call('/laboratorios', { method: 'POST', token: I.admin.token, body: { nombre: 'Laboratorio 2', capacidad_equipos: 20 } }), 201, `lab2 ${l}`);
    I.docenteEmail = `docente.${l}.${SUFIJO}@inst-${l}.test`;
    I.docente = ok(await call('/usuarios', {
      method: 'POST', token: I.admin.token,
      body: { nombre: 'Docente', apellido: l.toUpperCase(), email: I.docenteEmail, contrasena: CLAVE, id_rol: rolDocLab.id_rol, laboratorios: [I.lab.id_laboratorio] },
    }), 201, `docente ${l}`);
    I.sesionDocente = await login(I.docenteEmail, CLAVE);
    I.equipo = ok(await call('/equipos', {
      method: 'POST', token: I.admin.token,
      body: { identificador: 'PC-01', nro_serie: 'SERIE-0001', marca: 'Dell', id_laboratorio: I.lab.id_laboratorio, id_responsable: I.docente.id_usuario },
    }), 201, `equipo ${l}`);
    const sw = ok(await call(`/laboratorios/${I.lab.id_laboratorio}/software`, {
      method: 'POST', token: I.admin.token,
      body: { software: { nombre_software: 'Editor Común', version: '1.0' }, licencia: { tipo_licencia: 'Pago', numero_licencia: 'LIC-0001' }, equipos: 'todos' },
    }), 201, `software ${l}`);
    I.idSoftware = sw.id_software;
    I.mant = ok(await call('/mantenimientos', {
      method: 'POST', token: I.admin.token,
      body: { id_equipo: I.equipo.id_equipo, fecha_mantenimiento: '2026-11-05', tipo: 'Preventivo', detalle: `Control ${l}` },
    }), 201, `mantenimiento ${l}`);
    I.alerta = ok(await call('/mantenimientos/problemas', {
      method: 'POST', token: I.sesionDocente.token,
      body: { id_equipo: I.equipo.id_equipo, titulo: 'No enciende', descripcion: `Problema ${l}` },
    }), 201, `problema ${l}`);
  }
  // Dentro de la misma institucion siguen sin poder repetirse.
  assert.equal((await call('/laboratorios', { method: 'POST', token: A.admin.token, body: { nombre: 'laboratorio 1', capacidad_equipos: 20 } })).status, 409);
  assert.equal((await call('/equipos', { method: 'POST', token: A.admin.token, body: { identificador: 'PC-01', nro_serie: 'OTRA', marca: 'HP', id_laboratorio: A.lab.id_laboratorio } })).status, 409);
  assert.equal((await call('/equipos', { method: 'POST', token: A.admin.token, body: { identificador: 'PC-02', nro_serie: 'SERIE-0001', marca: 'HP', id_laboratorio: A.lab.id_laboratorio } })).status, 409);
  assert.equal((await call(`/laboratorios/${A.lab2.id_laboratorio}/software`, {
    method: 'POST', token: A.admin.token, body: { software: { nombre_software: 'Editor Común', version: '1.0' }, equipos: 'todos' },
  })).status, 409);
  // La base guarda cada registro en su institucion.
  const [[eqA]] = await db.query('SELECT id_institucion FROM equipos WHERE id_equipo = ?', [A.equipo.id_equipo]);
  const [[eqB]] = await db.query('SELECT id_institucion FROM equipos WHERE id_equipo = ?', [B.equipo.id_equipo]);
  assert.deepEqual([eqA.id_institucion, eqB.id_institucion], [A.id, B.id]);
  const [[ul]] = await db.query('SELECT id_institucion FROM usuario_laboratorio WHERE id_usuario = ?', [B.docente.id_usuario]);
  assert.equal(ul.id_institucion, B.id);
  const [[h]] = await db.query("SELECT id_institucion FROM historial_acciones WHERE entidad = 'Equipo' AND accion = 'Crear' AND id_registro = ?", [B.equipo.id_equipo]);
  assert.equal(h.id_institucion, B.id, 'el historial queda en la institución de quien actúa');
});

test('aislamiento: los listados solo muestran datos de la propia institución', async () => {
  for (const [yo, otro] of [[A, B], [B, A]]) {
    for (const sesion of [yo.admin, yo.sesionDocente]) {
      const labs = ok(await call('/laboratorios', { token: sesion.token }), 200);
      assert.ok(!labs.some((l) => [otro.lab.id_laboratorio, otro.lab2.id_laboratorio].includes(l.id_laboratorio)), 'laboratorios');
      const eqs = ok(await call('/equipos', { token: sesion.token }), 200);
      assert.ok(eqs.length > 0 && !eqs.some((e) => e.id_equipo === otro.equipo.id_equipo), 'equipos');
      const sw = ok(await call('/software', { token: sesion.token }), 200);
      assert.ok(!sw.some((s) => s.id_software === otro.idSoftware), 'catálogo de software');
      const mants = ok(await call('/mantenimientos', { token: sesion.token }), 200);
      assert.ok(mants.length > 0 && !mants.some((m) => m.id_mantenimiento === otro.mant.id_mantenimiento), 'mantenimientos');
      const prob = ok(await call('/mantenimientos/equipos-con-problemas', { token: sesion.token }), 200);
      assert.ok(!prob.some((e) => e.id_equipo === otro.equipo.id_equipo), 'equipos con problemas');
      const al = ok(await call('/alertas', { token: sesion.token }), 200);
      assert.ok(al.length > 0 && al.every((a) => a.id_institucion === yo.id), 'alertas');
      // Un filtro con un id de la otra institucion no devuelve nada.
      assert.deepEqual(ok(await call(`/equipos?laboratorio=${otro.lab.id_laboratorio}`, { token: sesion.token }), 200), []);
      assert.deepEqual(ok(await call(`/mantenimientos?equipo=${otro.equipo.id_equipo}`, { token: sesion.token }), 200), []);
    }
    const res = ok(await call('/mantenimientos/resumen', { token: yo.admin.token }), 200);
    assert.equal(res.mantenimientos.total, 1, 'el resumen cuenta solo lo propio');
    const al = ok(await call('/alertas/resumen', { token: yo.admin.token }), 200);
    assert.equal(al.activas, 1);
    const us = ok(await call('/usuarios', { token: yo.admin.token }), 200);
    assert.deepEqual(us.map((u) => u.email).sort(), [yo.adminEmail, yo.docenteEmail].sort(), 'usuarios');
    assert.equal(ok(await call('/institucion', { token: yo.sesionDocente.token }), 200).id_institucion, yo.id);
  }
});

test('aislamiento: un recurso de otra institución responde 404 (no se revela que existe)', async () => {
  const t = B.admin.token;
  const rutas = [
    `/laboratorios/${A.lab.id_laboratorio}`,
    `/laboratorios/${A.lab.id_laboratorio}/software`,
    `/laboratorios/${A.lab.id_laboratorio}/responsables`,
    `/equipos/${A.equipo.id_equipo}`,
    `/mantenimientos/${A.mant.id_mantenimiento}`,
    `/mantenimientos/historial/${A.equipo.id_equipo}`,
  ];
  for (const r of rutas) assert.equal((await call(r, { token: t })).status, 404, `GET ${r}`);
  // Un laboratorio de la MISMA institucion que el docente no tiene asignado: 403.
  assert.equal((await call(`/laboratorios/${B.lab2.id_laboratorio}`, { token: B.sesionDocente.token })).status, 403);
  assert.equal((await call(`/laboratorios/${A.lab2.id_laboratorio}`, { token: B.sesionDocente.token })).status, 404);
});

test('aislamiento: no se puede modificar ni borrar nada de otra institución', async () => {
  const t = B.admin.token;
  const [[rolDoc]] = await db.query("SELECT id_rol FROM roles WHERE nombre_rol = 'DOCENTE'");
  const intentos = [
    ['PUT', `/laboratorios/${A.lab.id_laboratorio}`, { ubicacion: 'x' }],
    ['DELETE', `/laboratorios/${A.lab2.id_laboratorio}`, {}],
    ['PUT', `/equipos/${A.equipo.id_equipo}`, { marca: 'X' }],
    ['DELETE', `/equipos/${A.equipo.id_equipo}`, { confirmar_historial: true }],
    ['PUT', `/laboratorios/${B.lab.id_laboratorio}/software/${A.idSoftware}`, { equipos: 'todos' }],
    ['DELETE', `/laboratorios/${B.lab.id_laboratorio}/software/${A.idSoftware}`, undefined],
    ['PUT', `/mantenimientos/${A.mant.id_mantenimiento}`, { detalle: 'x' }],
    ['PATCH', `/mantenimientos/${A.mant.id_mantenimiento}/estado`, { estado: 'Completado' }],
    ['PATCH', `/mantenimientos/problemas/${A.alerta.id_alerta}/resolver`, {}],
    ['PATCH', `/usuarios/${A.docente.id_usuario}/rol`, { id_rol: rolDoc.id_rol }],
    ['PATCH', `/usuarios/${A.docente.id_usuario}/bloqueo`, { bloqueado: true }],
    ['PATCH', `/usuarios/${A.docente.id_usuario}/contrasena`, { generar: true }],
    ['DELETE', `/usuarios/${A.docente.id_usuario}`, undefined],
  ];
  for (const [method, ruta, body] of intentos) {
    assert.equal((await call(ruta, { method, token: t, body })).status, 404, `${method} ${ruta}`);
  }
  // Nada cambio en A.
  const [[eq]] = await db.query('SELECT marca, id_laboratorio FROM equipos WHERE id_equipo = ?', [A.equipo.id_equipo]);
  assert.deepEqual(eq, { marca: 'Dell', id_laboratorio: A.lab.id_laboratorio });
  const [[m]] = await db.query('SELECT detalle, estado FROM mantenimientos WHERE id_mantenimiento = ?', [A.mant.id_mantenimiento]);
  assert.deepEqual(m, { detalle: 'Control a', estado: 'Pendiente' });
  const [[al]] = await db.query('SELECT estado FROM alertas WHERE id_alerta = ?', [A.alerta.id_alerta]);
  assert.equal(al.estado, 'Activa');
  const [[u]] = await db.query('SELECT bloqueado, contrasena FROM usuarios WHERE id_usuario = ?', [A.docente.id_usuario]);
  assert.equal(u.bloqueado, 0);
  assert.ok((await login(A.docenteEmail, CLAVE)).token, 'la contraseña del docente de A no cambió');
  const [[lab]] = await db.query('SELECT COUNT(*) AS n FROM laboratorios WHERE id_laboratorio = ?', [A.lab2.id_laboratorio]);
  assert.equal(Number(lab.n), 1);
  const [[sw]] = await db.query('SELECT COUNT(*) AS n FROM equipo_software WHERE id_software = ?', [A.idSoftware]);
  assert.equal(Number(sw.n), 1);
});

test('aislamiento: no se pueden crear relaciones con registros de otra institución', async () => {
  const t = B.admin.token;
  const [[rolDoc]] = await db.query("SELECT id_rol FROM roles WHERE nombre_rol = 'DOCENTE'");
  // Equipo en un laboratorio de A
  assert.equal((await call('/equipos', { method: 'POST', token: t, body: { identificador: `X-${SUFIJO}`, nro_serie: `X-${SUFIJO}`, marca: 'HP', id_laboratorio: A.lab.id_laboratorio } })).status, 404);
  // Equipo propio con responsable de A
  assert.equal((await call('/equipos', { method: 'POST', token: t, body: { identificador: `Y-${SUFIJO}`, nro_serie: `Y-${SUFIJO}`, marca: 'HP', id_laboratorio: B.lab.id_laboratorio, id_responsable: A.docente.id_usuario } })).status, 400);
  // Equipo propio con software de A
  assert.equal((await call('/equipos', { method: 'POST', token: t, body: { identificador: `Z-${SUFIJO}`, nro_serie: `Z-${SUFIJO}`, marca: 'HP', id_laboratorio: B.lab.id_laboratorio, software: [{ id_software: A.idSoftware }] } })).status, 400);
  // Mover un equipo propio a un laboratorio de A
  assert.equal((await call(`/equipos/${B.equipo.id_equipo}`, { method: 'PUT', token: t, body: { id_laboratorio: A.lab.id_laboratorio } })).status, 404);
  // Usuario asignado a un laboratorio de A
  const u = await call('/usuarios', { method: 'POST', token: t, body: { nombre: 'X', apellido: 'Y', email: `cruce.${SUFIJO}@inst-b.test`, contrasena: CLAVE, id_rol: rolDoc.id_rol, laboratorios: [A.lab.id_laboratorio] } });
  assert.equal(u.status, 400);
  assert.equal((await call(`/usuarios/${B.docente.id_usuario}/rol`, { method: 'PATCH', token: t, body: { id_rol: rolDoc.id_rol, laboratorios: [A.lab.id_laboratorio] } })).status, 400);
  // Instalar software de A en un laboratorio propio
  assert.equal((await call(`/laboratorios/${B.lab.id_laboratorio}/software`, { method: 'POST', token: t, body: { id_software: A.idSoftware, equipos: 'todos' } })).status, 404);
  // Trasladar los equipos de un laboratorio propio a uno de A al eliminarlo
  assert.equal((await call(`/laboratorios/${B.lab.id_laboratorio}`, { method: 'DELETE', token: t, body: { destino: A.lab.id_laboratorio } })).status, 404);
  // Mantenimiento y problema sobre un equipo de A
  assert.equal((await call('/mantenimientos', { method: 'POST', token: t, body: { id_equipo: A.equipo.id_equipo, fecha_mantenimiento: '2026-11-05', tipo: 'Correctivo', detalle: 'x' } })).status, 404);
  assert.equal((await call('/mantenimientos/problemas', { method: 'POST', token: B.sesionDocente.token, body: { id_equipo: A.equipo.id_equipo, titulo: 'x', descripcion: 'x' } })).status, 404);
  // El email es unico en toda la plataforma, sin revelar de que institucion es.
  const dup = await call('/usuarios', { method: 'POST', token: t, body: { nombre: 'X', apellido: 'Y', email: A.docenteEmail, contrasena: CLAVE, id_rol: rolDoc.id_rol, laboratorios: [B.lab.id_laboratorio] } });
  assert.equal(dup.status, 409);
  assert.equal(dup.data.error, 'Ese email ya está en uso.');
  // La institucion nunca se toma del cliente: un id_institucion en el cuerpo se ignora.
  const lab = ok(await call('/laboratorios', { method: 'POST', token: t, body: { nombre: `Intruso ${SUFIJO}`, capacidad_equipos: 20, id_institucion: A.id } }), 201);
  const [[l]] = await db.query('SELECT id_institucion FROM laboratorios WHERE id_laboratorio = ?', [lab.id_laboratorio]);
  assert.equal(l.id_institucion, B.id);
  const [[cnt]] = await db.query('SELECT COUNT(*) AS n FROM equipos WHERE identificador IN (?)', [[`X-${SUFIJO}`, `Y-${SUFIJO}`, `Z-${SUFIJO}`]]);
  assert.equal(Number(cnt.n), 0, 'ningún intento cruzado creó equipos');
});

test('eventos en tiempo real: solo llegan a la misma institución', async () => {
  const sA = escuchar(A.admin.token);
  const sB = escuchar(B.admin.token);
  await esperar(() => sA.eventos.some((e) => e.ev === 'conectado') && sB.eventos.some((e) => e.ev === 'conectado'));
  const r = ok(await call('/mantenimientos/problemas', {
    method: 'POST', token: A.sesionDocente.token, body: { id_equipo: A.equipo.id_equipo, titulo: `Pantalla ${SUFIJO}`, descripcion: 'Parpadea' },
  }), 201);
  assert.ok(await esperar(() => sA.eventos.find((e) => e.ev === 'alerta' && e.datos.id_alerta === r.id_alerta)), 'A recibe su alerta');
  // Pedido de cambio de contraseña del docente de A: solo para el administrador de A.
  ok(await call('/auth/recuperar', { method: 'POST', body: { email: A.docenteEmail } }), 200);
  assert.ok(await esperar(() => sA.eventos.find((e) => e.ev === 'solicitud-contrasena' && e.datos.email === A.docenteEmail)), 'A recibe la solicitud');
  await new Promise((res) => setTimeout(res, 300));
  assert.ok(!sB.eventos.some((e) => e.ev === 'alerta' || e.ev === 'solicitud-contrasena'), `B no recibe nada de A: ${JSON.stringify(sB.eventos)}`);
  const solB = ok(await call('/usuarios/solicitudes', { token: B.admin.token }), 200);
  assert.ok(!solB.some((s) => s.email === A.docenteEmail), 'B no ve la solicitud de A');
  assert.ok(ok(await call('/usuarios/solicitudes', { token: A.admin.token }), 200).some((s) => s.email === A.docenteEmail));
  sA.cerrar();
  sB.cerrar();
});

test('el SUPERADMIN no ve datos internos de los colegios', async () => {
  for (const r of ['/laboratorios', '/equipos', '/usuarios', '/mantenimientos', '/alertas', '/software', '/institucion', `/equipos/${A.equipo.id_equipo}`]) {
    const x = await call(r, { token: superadmin.token });
    assert.equal(x.status, 403, `GET ${r}`);
  }
  assert.equal((await call('/laboratorios', { method: 'POST', token: superadmin.token, body: { nombre: `SA ${SUFIJO}`, capacidad_equipos: 20 } })).status, 403);
  const lista = ok(await call('/plataforma/instituciones', { token: superadmin.token }), 200);
  const a = lista.find((i) => i.id_institucion === A.id);
  assert.equal(a.usuarios, 2);
  assert.equal(a.laboratorios, 2);
  assert.equal(a.equipos, 1);
  // Las rutas de la plataforma son solo del SUPERADMIN.
  assert.equal((await call('/plataforma/instituciones', { token: A.admin.token })).status, 403);
  assert.equal((await call(`/plataforma/instituciones/${B.id}/estado`, { method: 'PATCH', token: A.admin.token, body: { estado: 'Suspendida' } })).status, 403);
  assert.equal((await call('/plataforma/instituciones', { method: 'POST', token: A.admin.token, body: {} })).status, 403);
});

test('datos de la institución: los ve cualquier usuario, los edita el administrador', async () => {
  assert.equal((await call('/institucion', { method: 'PUT', token: A.sesionDocente.token, body: { localidad: 'X' } })).status, 403);
  const ed = ok(await call('/institucion', { method: 'PUT', token: A.admin.token, body: { localidad: 'Rosario', cuit: '30-71234567-8', email: `info.${SUFIJO}@a.test` } }), 200);
  assert.equal(ed.localidad, 'Rosario');
  assert.equal(ed.email_contacto, `info.${SUFIJO}@a.test`);
  for (const campo of ['estado', 'slug', 'id_institucion']) {
    assert.equal((await call('/institucion', { method: 'PUT', token: A.admin.token, body: { [campo]: campo === 'id_institucion' ? B.id : 'Activa' } })).status, 400, campo);
  }
  assert.equal((await call('/institucion', { method: 'PUT', token: A.admin.token, body: { cuit: '123' } })).status, 400);
  assert.equal(ok(await call('/institucion/configurada', { method: 'PATCH', token: A.admin.token, body: {} }), 200).configurada, 1);
  assert.equal((await call('/auth/me', { token: A.admin.token })).data.institucion.configurada, 1);
  const [[b]] = await db.query('SELECT localidad, configurada FROM instituciones WHERE id_institucion = ?', [B.id]);
  assert.deepEqual(b, { localidad: null, configurada: 0 }, 'la otra institución no cambió');
});

test('institución suspendida: no ingresa y se corta la sesión abierta; al reactivarla vuelve', async () => {
  const sDoc = escuchar(A.sesionDocente.token);
  await esperar(() => sDoc.eventos.some((e) => e.ev === 'conectado'));
  const r = ok(await call(`/plataforma/instituciones/${A.id}/estado`, { method: 'PATCH', token: superadmin.token, body: { estado: 'Suspendida' } }), 200);
  assert.equal(r.estado, 'Suspendida');
  const corte = await esperar(() => sDoc.eventos.find((e) => e.ev === 'sesion'));
  assert.ok(corte, 'la ventana abierta recibe el cierre de sesión');
  assert.equal(corte.datos.codigo, 'INSTITUCION_SUSPENDIDA');
  assert.ok(await esperar(() => sDoc.estaCerrado()), 'la conexión en tiempo real se cierra');
  // Sesion abierta (token vigente): 403
  const x = await call('/laboratorios', { token: A.admin.token });
  assert.equal(x.status, 403);
  assert.equal(x.data.detalles.codigo, 'INSTITUCION_SUSPENDIDA');
  // Login: 403 con el codigo, solo con la contraseña correcta
  const l = await call('/auth/login', { method: 'POST', body: { email: A.adminEmail, contrasena: CLAVE } });
  assert.equal(l.status, 403);
  assert.equal(l.data.detalles.codigo, 'INSTITUCION_SUSPENDIDA');
  assert.equal((await call('/auth/login', { method: 'POST', body: { email: A.adminEmail, contrasena: 'incorrecta' } })).status, 401);
  // La otra institucion sigue funcionando
  assert.equal((await call('/laboratorios', { token: B.admin.token })).status, 200);
  // Reactivar
  ok(await call(`/plataforma/instituciones/${A.id}/estado`, { method: 'PATCH', token: superadmin.token, body: { estado: 'Activa' } }), 200);
  assert.equal((await call('/laboratorios', { token: A.admin.token })).status, 200);
  assert.ok((await login(A.docenteEmail, CLAVE)).token);
  sDoc.cerrar();
});

test('estados de institución válidos y alta solo con datos correctos', async () => {
  assert.equal((await call(`/plataforma/instituciones/${B.id}/estado`, { method: 'PATCH', token: superadmin.token, body: { estado: 'Borrada' } })).status, 400);
  assert.equal((await call('/plataforma/instituciones/999999999/estado', { method: 'PATCH', token: superadmin.token, body: { estado: 'Activa' } })).status, 404);
  const p = ok(await call(`/plataforma/instituciones/${B.id}/estado`, { method: 'PATCH', token: superadmin.token, body: { estado: 'Prueba', fecha_fin_prueba: '2027-01-15' } }), 200);
  assert.equal(p.fecha_fin_prueba, '2027-01-15');
  const [[h]] = await db.query("SELECT id_institucion FROM historial_acciones WHERE entidad = 'Institucion' AND id_registro = ? ORDER BY id_accion DESC LIMIT 1", [B.id]);
  assert.equal(h.id_institucion, null, 'las acciones del SUPERADMIN no quedan en ningún colegio');
});
