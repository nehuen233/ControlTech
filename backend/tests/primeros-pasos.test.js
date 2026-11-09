// Pruebas de lo que agrega el asistente "Primeros pasos":
//   - POST /api/equipos/lote: alta de varias computadoras de un laboratorio en una transaccion,
//     con errores por fila, control de capacidad e institucion.
//   - POST /api/usuarios con generar: true: contraseña inicial generada por el sistema.
// Crea sus propias instituciones (A y B) por la API del SUPERADMIN. Requiere el backend
// corriendo y SUPERADMIN_EMAIL / SUPERADMIN_PASSWORD en backend/.env.
require('dotenv').config({ quiet: true });
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const mysql = require('mysql2/promise');
const { CAPACIDAD_MIN, CAPACIDAD_MAX } = require('../src/utils/capacidad');

const API = process.env.API_URL || `http://localhost:${process.env.PORT || 4000}/api`;
const SUFIJO = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
const CLAVE = 'Clave-Lote-2026';
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
const ok = (r, status, msg) => { assert.equal(r.status, status, `${msg || ''} ${JSON.stringify(r.data)}`); return r.data; };
async function login(email, contrasena) {
  return ok(await call('/auth/login', { method: 'POST', body: { email, contrasena } }), 200, `login ${email}`);
}
const contar = async (idLab) => Number((await db.query('SELECT COUNT(*) AS n FROM equipos WHERE id_laboratorio = ?', [idLab]))[0][0].n);
const serie = (prefijo, n, extra = {}) => Array.from({ length: n }, (_, i) => ({
  identificador: `${prefijo}-${String(i + 1).padStart(2, '0')}`, nro_serie: `S-${prefijo}-${i + 1}`, marca: 'Dell', modelo: 'OptiPlex 3090', ...extra,
}));

before(async () => {
  db = await mysql.createConnection({
    host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306), user: process.env.DB_USER,
    password: process.env.DB_PASSWORD, database: process.env.DB_NAME,
  });
  assert.ok(process.env.SUPERADMIN_EMAIL && process.env.SUPERADMIN_PASSWORD, 'Configurá SUPERADMIN_EMAIL y SUPERADMIN_PASSWORD en backend/.env.');
  superadmin = await login(process.env.SUPERADMIN_EMAIL, process.env.SUPERADMIN_PASSWORD);
  for (const [I, l] of [[A, 'a'], [B, 'b']]) {
    I.email = `admin.lote.${l}.${SUFIJO}@pp-${l}.test`;
    ok(await call('/plataforma/instituciones', {
      method: 'POST', token: superadmin.token,
      body: { nombre: `Lote ${l.toUpperCase()} ${SUFIJO}`, administrador: { nombre: 'Admin', apellido: l.toUpperCase(), email: I.email, contrasena: CLAVE } },
    }), 201);
    I.admin = await login(I.email, CLAVE);
    I.lab = ok(await call('/laboratorios', { method: 'POST', token: I.admin.token, body: { nombre: 'Laboratorio 1', capacidad_equipos: CAPACIDAD_MIN } }), 201);
  }
});

after(async () => { await db?.end(); });

test('lote: crea varias computadoras en una sola operación y deja historial', async () => {
  const r = ok(await call('/equipos/lote', { method: 'POST', token: A.admin.token, body: { id_laboratorio: A.lab.id_laboratorio, equipos: serie('PC-L1', 5, { ram: '8 GB' }) } }), 201);
  assert.equal(r.creados, 5);
  assert.deepEqual(r.equipos.map((e) => e.identificador), ['PC-L1-01', 'PC-L1-02', 'PC-L1-03', 'PC-L1-04', 'PC-L1-05']);
  assert.ok(r.equipos.every((e) => e.id_laboratorio === A.lab.id_laboratorio && e.estado === 'Operativo'));
  assert.equal(await contar(A.lab.id_laboratorio), 5);
  const [[{ n }]] = await db.query("SELECT COUNT(*) AS n FROM historial_acciones WHERE entidad = 'Equipo' AND accion = 'Crear' AND id_registro IN (?) AND id_institucion = ?", [r.equipos.map((e) => e.id_equipo), A.admin.institucion.id]);
  assert.equal(Number(n), 5, 'una acción de historial por computadora, en la institución');
  // La misma serie de identificadores en OTRA institucion es valida.
  ok(await call('/equipos/lote', { method: 'POST', token: B.admin.token, body: { id_laboratorio: B.lab.id_laboratorio, equipos: serie('PC-L1', 2) } }), 201);
});

test('lote: si una fila tiene errores no se guarda ninguna y se informa cada fila', async () => {
  const antes = await contar(A.lab.id_laboratorio);
  const equipos = [
    ...serie('PC-OK', 2),
    { identificador: 'PC-SIN-SERIE', marca: 'HP' },
    { identificador: 'PC-OK-01', nro_serie: 'OTRA', marca: 'HP' },
    { identificador: 'PC-L1-01', nro_serie: 'NUEVA', marca: 'HP' },
    { identificador: 'PC-ESTADO', nro_serie: 'S-EST', marca: 'HP', estado: 'Rota' },
  ];
  const r = await call('/equipos/lote', { method: 'POST', token: A.admin.token, body: { id_laboratorio: A.lab.id_laboratorio, equipos } });
  assert.equal(r.status, 400);
  assert.match(r.data.error, /4 filas con errores/);
  assert.deepEqual(r.data.detalles.map((d) => d.fila), [3, 4, 5, 6]);
  assert.match(r.data.detalles[0].error, /número de serie es obligatorio/);
  assert.match(r.data.detalles[1].error, /se repite en la fila 1/);
  assert.match(r.data.detalles[2].error, /Ya existe un equipo con el identificador PC-L1-01/);
  assert.match(r.data.detalles[3].error, /estado debe ser/);
  assert.equal(await contar(A.lab.id_laboratorio), antes, 'no se guardó ninguna fila');
});

test('lote: no supera la capacidad del laboratorio y valida el pedido', async () => {
  const libres = CAPACIDAD_MIN - await contar(A.lab.id_laboratorio);
  const r = await call('/equipos/lote', { method: 'POST', token: A.admin.token, body: { id_laboratorio: A.lab.id_laboratorio, equipos: serie('PC-CAP', libres + 1) } });
  assert.equal(r.status, 409);
  assert.match(r.data.error, new RegExp(`lugar para ${libres} computadora`));
  assert.equal(r.data.detalles.libres, libres);
  assert.equal((await call('/equipos/lote', { method: 'POST', token: A.admin.token, body: { id_laboratorio: A.lab.id_laboratorio, equipos: [] } })).status, 400);
  assert.equal((await call('/equipos/lote', { method: 'POST', token: A.admin.token, body: { id_laboratorio: A.lab.id_laboratorio, equipos: serie('PC-MAX', CAPACIDAD_MAX + 1) } })).status, 400);
  // Justo hasta completar la capacidad
  ok(await call('/equipos/lote', { method: 'POST', token: A.admin.token, body: { id_laboratorio: A.lab.id_laboratorio, equipos: serie('PC-CAP', libres) } }), 201);
  assert.equal(await contar(A.lab.id_laboratorio), CAPACIDAD_MIN);
});

test('lote: aislamiento entre instituciones', async () => {
  const antes = await contar(A.lab.id_laboratorio);
  // B no puede cargar en un laboratorio de A: no existe para B.
  const r = await call('/equipos/lote', { method: 'POST', token: B.admin.token, body: { id_laboratorio: A.lab.id_laboratorio, equipos: serie('PC-X', 1) } });
  assert.equal(r.status, 404);
  assert.equal(await contar(A.lab.id_laboratorio), antes);
  // La institucion de las filas nunca se toma del cliente.
  const [[uB]] = await db.query('SELECT id_institucion FROM usuarios WHERE email = ?', [B.email]);
  const c = ok(await call('/equipos/lote', { method: 'POST', token: B.admin.token, body: { id_laboratorio: B.lab.id_laboratorio, equipos: serie('PC-Y', 1, { id_institucion: A.admin.institucion.id, id_laboratorio: A.lab.id_laboratorio }) } }), 201);
  const [[e]] = await db.query('SELECT id_institucion, id_laboratorio FROM equipos WHERE id_equipo = ?', [c.equipos[0].id_equipo]);
  assert.deepEqual(e, { id_institucion: uB.id_institucion, id_laboratorio: B.lab.id_laboratorio });
  // Un responsable de A en un lote de B se rechaza por fila.
  const [[adminA]] = await db.query('SELECT id_usuario FROM usuarios WHERE email = ?', [A.email]);
  const x = await call('/equipos/lote', { method: 'POST', token: B.admin.token, body: { id_laboratorio: B.lab.id_laboratorio, equipos: serie('PC-Z', 1, { id_responsable: adminA.id_usuario }) } });
  assert.equal(x.status, 400);
  assert.equal(x.data.detalles[0].fila, 1);
});

test('alta de usuario con contraseña generada por el sistema', async () => {
  const [[rol]] = await db.query("SELECT id_rol FROM roles WHERE nombre_rol = 'TECNICO'");
  const email = `tecnico.${SUFIJO}@pp-a.test`;
  const r = ok(await call('/usuarios', { method: 'POST', token: A.admin.token, body: { nombre: 'Tec', apellido: 'Nico', email, generar: true, id_rol: rol.id_rol, laboratorios: [A.lab.id_laboratorio] } }), 201);
  assert.ok(typeof r.contrasena_temporal === 'string' && r.contrasena_temporal.length >= 8, 'devuelve la contraseña una vez');
  assert.ok((await login(email, r.contrasena_temporal)).token, 'la contraseña generada permite ingresar');
  const [[u]] = await db.query('SELECT contrasena FROM usuarios WHERE email = ?', [email]);
  assert.match(u.contrasena, /^\$2[aby]\$/, 'se guarda con bcrypt');
  // Con contraseña escrita no se devuelve nada.
  const r2 = ok(await call('/usuarios', { method: 'POST', token: A.admin.token, body: { nombre: 'Doc', apellido: 'Ente', email: `doc.${SUFIJO}@pp-a.test`, contrasena: CLAVE, id_rol: rol.id_rol, laboratorios: [A.lab.id_laboratorio] } }), 201);
  assert.equal(r2.contrasena_temporal, undefined);
});
