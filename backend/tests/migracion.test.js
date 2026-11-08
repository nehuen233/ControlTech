// Pruebas de la migracion 003 (multi-institucion) sobre bases descartables:
//   1) una base del esquema ANTERIOR con sus datos (tests/fixtures/v1_*.sql) se migra sin
//      perder nada, todo queda en la institucion 1, y una segunda pasada no hace nada;
//   2) una instalacion NUEVA con "BD CONTROLTECH.sql" queda igual y sin instituciones.
// Necesita un usuario de MySQL que pueda crear bases "ct_prueba_*":
//   TEST_MYSQL_ADMIN_USER / TEST_MYSQL_ADMIN_PASSWORD en backend/.env
//   (por ejemplo: CREATE USER 'ct_pruebas'@'localhost' IDENTIFIED BY '...';
//    GRANT ALL PRIVILEGES ON `ct\_prueba\_%`.* TO 'ct_pruebas'@'localhost';)
// Sin esas variables, las pruebas se omiten.
require('dotenv').config({ quiet: true });
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const mysql = require('mysql2/promise');

const USER = process.env.TEST_MYSQL_ADMIN_USER;
const PASS = process.env.TEST_MYSQL_ADMIN_PASSWORD || '';
const omitir = USER ? false : 'definí TEST_MYSQL_ADMIN_USER / TEST_MYSQL_ADMIN_PASSWORD para probar la migración';
const SUFIJO = Date.now().toString(36);
const RAIZ = path.join(__dirname, '..');
const SUPER = { email: `super.${SUFIJO}@plataforma.test`, clave: 'Super-Migracion-2026' };
const creadas = [];
const conexiones = [];

async function conectar(database, extra = {}) {
  const c = await mysql.createConnection({
    host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306), user: USER, password: PASS,
    database, dateStrings: true, ...extra,
  });
  conexiones.push(c);
  return c;
}

// Crea la base y ejecuta un archivo SQL (sin sus CREATE DATABASE / USE).
async function crearBase(nombre, archivos) {
  const c = await conectar(undefined, { multipleStatements: true });
  await c.query(`CREATE DATABASE \`${nombre}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  creadas.push(nombre);
  await c.query(`USE \`${nombre}\``);
  for (const a of archivos) {
    const sql = fs.readFileSync(a, 'utf8')
      .replace(/^\s*CREATE DATABASE[^;]*;/gim, '')
      .replace(/^\s*USE [^;]*;/gim, '');
    await c.query(sql);
  }
  await c.end();
}

// Corre las migraciones del backend contra esa base, en un proceso aparte (como al iniciar).
function migrar(nombre) {
  const codigo = `
    require('./src/config/esquema').asegurarEsquema()
      .then((r) => { const e = require('./src/config/esquema').estado;
        process.stdout.write(JSON.stringify({ agregadas: r.agregadas, errores: r.errores, avisos: e.avisos, multi: e.multi })); })
      .catch((err) => { process.stdout.write(JSON.stringify({ fatal: err.message })); })
      .finally(() => require('./src/config/db').pool.end());`;
  const salida = execFileSync(process.execPath, ['-e', codigo], {
    cwd: RAIZ,
    env: {
      ...process.env, DB_NAME: nombre, DB_USER: USER, DB_PASSWORD: PASS, DOTENV_CONFIG_QUIET: 'true',
      SUPERADMIN_EMAIL: SUPER.email, SUPERADMIN_PASSWORD: SUPER.clave, INSTITUCION_INICIAL_NOMBRE: 'Colegio Migrado',
    },
  }).toString();
  return JSON.parse(salida.slice(salida.indexOf('{')));
}

after(async () => {
  for (const c of conexiones) await c.end().catch(() => {});
  if (!creadas.length) return;
  const c = await conectar();
  for (const n of creadas) await c.query(`DROP DATABASE IF EXISTS \`${n}\``);
  await c.end();
});

test('migración 003 sobre una base del esquema anterior: conserva todo en la institución 1', { skip: omitir }, async () => {
  const nombre = `ct_prueba_v1_${SUFIJO}`;
  await crearBase(nombre, [path.join(__dirname, 'fixtures/v1_esquema.sql'), path.join(__dirname, 'fixtures/v1_datos.sql')]);
  const c = await conectar(nombre);
  const contar = async (t) => Number((await c.query(`SELECT COUNT(*) AS n FROM ${t}`))[0][0].n);
  const TABLAS = ['usuarios', 'laboratorios', 'equipos', 'software', 'licencias', 'equipo_software', 'usuario_laboratorio', 'mantenimientos', 'alertas', 'historial_acciones', 'reportes'];
  const antes = {};
  for (const t of TABLAS) antes[t] = await contar(t);
  const [[adminAntes]] = await c.query("SELECT * FROM usuarios WHERE email = 'admin@controltech.com'");
  const [mantAntes] = await c.query('SELECT * FROM mantenimientos ORDER BY id_mantenimiento');

  const r = migrar(nombre);
  assert.equal(r.fatal, undefined, r.fatal);
  assert.equal(r.multi, true, JSON.stringify(r));
  assert.deepEqual(r.errores, []);

  const [inst] = await c.query('SELECT id_institucion, nombre, estado, configurada FROM instituciones');
  assert.deepEqual(inst, [{ id_institucion: 1, nombre: 'Colegio Migrado', estado: 'Activa', configurada: 1 }]);
  for (const t of TABLAS) {
    const extra = t === 'usuarios' ? 1 : 0; // el SUPERADMIN
    assert.equal(await contar(t), antes[t] + extra, `${t}: no se pierde ni se duplica nada`);
  }
  for (const t of ['laboratorios', 'equipos', 'software', 'usuario_laboratorio', 'reportes']) {
    const [[x]] = await c.query(`SELECT COUNT(*) AS n FROM ${t} WHERE id_institucion IS NULL OR id_institucion <> 1`);
    assert.equal(Number(x.n), 0, `${t}: todo en la institución 1`);
  }
  const [[sinInst]] = await c.query("SELECT COUNT(*) AS n FROM usuarios u JOIN roles r USING (id_rol) WHERE r.nombre_rol <> 'SUPERADMIN' AND NOT (u.id_institucion <=> 1)");
  assert.equal(Number(sinInst.n), 0);
  const [[adminDespues]] = await c.query("SELECT * FROM usuarios WHERE email = 'admin@controltech.com'");
  // Las migraciones 001 y 003 solo le agregan columnas (bloqueado, id_institucion).
  assert.deepEqual(adminDespues, { ...adminAntes, bloqueado: 0, id_institucion: 1 }, 'el administrador conserva credenciales y rol');
  const [mantDespues] = await c.query('SELECT * FROM mantenimientos ORDER BY id_mantenimiento');
  assert.deepEqual(mantDespues, mantAntes);
  const [[sa]] = await c.query("SELECT u.id_institucion, r.nombre_rol FROM usuarios u JOIN roles r USING (id_rol) WHERE u.email = ?", [SUPER.email]);
  assert.deepEqual(sa, { id_institucion: null, nombre_rol: 'SUPERADMIN' });

  // Unicidad por institucion y claves compuestas: otra institucion puede repetir un
  // identificador, pero un equipo no puede quedar en un laboratorio de otra institucion.
  await c.query("INSERT INTO instituciones (id_institucion, nombre, slug) VALUES (2, 'Otra', 'otra')");
  const [[eq]] = await c.query('SELECT identificador, nro_serie, id_laboratorio FROM equipos LIMIT 1');
  await assert.rejects(c.query("INSERT INTO equipos (identificador, nro_serie, marca, id_laboratorio, id_institucion) VALUES ('Z-1', 'Z-1', 'HP', ?, 2)", [eq.id_laboratorio]), /foreign key/i);
  const [lab2] = await c.query("INSERT INTO laboratorios (nombre, id_institucion) VALUES ('Laboratorio 4-1', 2)");
  await c.query("INSERT INTO equipos (identificador, nro_serie, marca, id_laboratorio, id_institucion) VALUES (?, ?, 'HP', ?, 2)", [eq.identificador, eq.nro_serie, lab2.insertId]);
  await assert.rejects(c.query("INSERT INTO equipos (identificador, nro_serie, marca, id_laboratorio, id_institucion) VALUES (?, 'Z-2', 'HP', ?, 1)", [eq.identificador, eq.id_laboratorio]), /Duplicate/);

  // Idempotente: una segunda pasada no cambia nada.
  const r2 = migrar(nombre);
  assert.deepEqual(r2.agregadas, [], JSON.stringify(r2));
  assert.equal(r2.multi, true);
  await c.end();
});

test('instalación nueva con "BD CONTROLTECH.sql": nace sin instituciones y la migración solo crea el SUPERADMIN', { skip: omitir }, async () => {
  const nombre = `ct_prueba_nueva_${SUFIJO}`;
  await crearBase(nombre, [path.join(RAIZ, '..', 'BD CONTROLTECH.sql')]);
  const r = migrar(nombre);
  assert.equal(r.multi, true, JSON.stringify(r));
  assert.deepEqual(r.errores, []);
  const c = await conectar(nombre);
  const [[i]] = await c.query('SELECT COUNT(*) AS n FROM instituciones');
  assert.equal(Number(i.n), 0, 'sin colegios: los da de alta el SUPERADMIN');
  const [u] = await c.query('SELECT u.email, u.id_institucion, r.nombre_rol FROM usuarios u JOIN roles r USING (id_rol)');
  assert.deepEqual(u, [{ email: SUPER.email, id_institucion: null, nombre_rol: 'SUPERADMIN' }]);
  await c.end();
});
