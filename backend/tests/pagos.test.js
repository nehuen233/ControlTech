// Pruebas del módulo de pagos (Etapa 3A): cuotas, vencimientos, suspensión y reactivación
// automáticas, registro manual, y aislamiento entre instituciones. Crea sus propias
// instituciones (A y B) por la API del SUPERADMIN. Las fechas se mueven corrigiendo el
// vencimiento de los pagos (como lo haría el SUPERADMIN), sin tocar el reloj del servidor.
require('dotenv').config({ quiet: true });
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const mysql = require('mysql2/promise');
const { hoyAR, periodoDe, vencimientoDe, sumarDias } = require('../src/utils/cobros');

const API = process.env.API_URL || `http://localhost:${process.env.PORT || 4000}/api`;
const SUFIJO = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
const CLAVE = 'Clave-Pagos-2026';
const HOY = hoyAR();
const PERIODO = periodoDe(HOY);
let db;
let superadmin;
const A = {};
const B = {};

async function call(path, { method = 'GET', token, body } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, data: await res.json().catch(() => null) };
}
const ok = (r, status, msg) => { assert.equal(r.status, status, `${msg || ''} ${JSON.stringify(r.data)}`); return r.data; };
const login = async (email, contrasena = CLAVE) => ok(await call('/auth/login', { method: 'POST', body: { email, contrasena } }), 200, `login ${email}`);
const sa = (path, opts = {}) => call(path, { ...opts, token: superadmin.token });
const estadoInst = async (I) => (await db.query('SELECT estado, motivo_suspension FROM instituciones WHERE id_institucion = ?', [I.id]))[0][0];
const pagosDe = async (I) => (await db.query('SELECT * FROM pagos WHERE id_institucion = ? ORDER BY id_pago', [I.id]))[0];
const procesar = async () => ok(await sa('/plataforma/pagos/procesar', { method: 'POST', body: {} }), 200);

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
          const bloque = buf.slice(0, i); buf = buf.slice(i + 2);
          let ev = 'message'; let d = '';
          for (const l of bloque.split('\n')) { if (l.startsWith('event:')) ev = l.slice(6).trim(); else if (l.startsWith('data:')) d += l.slice(5).trim(); }
          if (d) eventos.push({ ev, datos: JSON.parse(d) });
        }
      }
    } catch { /* cerrada */ }
  })();
  return { eventos, cerrar: () => ctrl.abort() };
}
async function esperar(fn, ms = 4000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { const r = fn(); if (r) return r; await new Promise((res) => setTimeout(res, 50)); }
  return fn();
}

before(async () => {
  db = await mysql.createConnection({
    host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306), user: process.env.DB_USER,
    password: process.env.DB_PASSWORD, database: process.env.DB_NAME, dateStrings: true,
  });
  assert.ok(process.env.SUPERADMIN_EMAIL && process.env.SUPERADMIN_PASSWORD, 'Configurá SUPERADMIN_EMAIL y SUPERADMIN_PASSWORD en backend/.env.');
  superadmin = await login(process.env.SUPERADMIN_EMAIL, process.env.SUPERADMIN_PASSWORD);
  for (const [I, l] of [[A, 'a'], [B, 'b']]) {
    I.email = `admin.pagos.${l}.${SUFIJO}@pg-${l}.test`;
    const inst = ok(await sa('/plataforma/instituciones', { method: 'POST', body: { nombre: `Pagos ${l.toUpperCase()} ${SUFIJO}`, administrador: { nombre: 'Admin', apellido: l.toUpperCase(), email: I.email, contrasena: CLAVE } } }), 201);
    I.id = inst.id_institucion;
    I.admin = await login(I.email);
  }
  // Un docente de A, para verificar que no ve "Mi plan".
  const lab = ok(await call('/laboratorios', { method: 'POST', token: A.admin.token, body: { nombre: 'Lab Pagos', capacidad_equipos: 20 } }), 201);
  const [[rol]] = await db.query("SELECT id_rol FROM roles WHERE nombre_rol = 'DOCENTE'");
  A.docenteEmail = `docente.pagos.${SUFIJO}@pg-a.test`;
  ok(await call('/usuarios', { method: 'POST', token: A.admin.token, body: { nombre: 'Doc', apellido: 'Pagos', email: A.docenteEmail, contrasena: CLAVE, id_rol: rol.id_rol, laboratorios: [lab.id_laboratorio] } }), 201);
  A.docente = await login(A.docenteEmail);
});

after(async () => { await db?.end(); });

test('una institución en prueba no genera cuotas, aunque tenga abono', async () => {
  ok(await sa(`/plataforma/instituciones/${B.id}/plan`, { method: 'PUT', body: { plan: 'Basico', abono_mensual: 30000 } }), 200);
  await procesar();
  assert.equal((await pagosDe(B)).length, 0);
  assert.equal((await estadoInst(B)).estado, 'Prueba');
  // Prueba terminada sin plan: aviso al administrador, sin suspensión.
  ok(await sa(`/plataforma/instituciones/${B.id}/plan`, { method: 'PUT', body: { plan: null, abono_mensual: null } }), 200);
  ok(await sa(`/plataforma/instituciones/${B.id}/estado`, { method: 'PATCH', body: { estado: 'Prueba', fecha_fin_prueba: sumarDias(HOY, -1) } }), 200);
  await procesar();
  const plan = ok(await call('/institucion/plan', { token: B.admin.token }), 200);
  assert.equal(plan.prueba_finalizada, true);
  assert.equal(plan.aviso.tipo, 'prueba');
  assert.equal((await estadoInst(B)).estado, 'Prueba', 'no se suspende automáticamente');
});

test('cuota del mes: se genera al cargar el plan de una institución activa y no se duplica', async () => {
  ok(await sa(`/plataforma/instituciones/${A.id}/estado`, { method: 'PATCH', body: { estado: 'Activa' } }), 200);
  const cuenta = ok(await sa(`/plataforma/instituciones/${A.id}/plan`, { method: 'PUT', body: { plan: 'Estandar', abono_mensual: 50000, dia_vencimiento: 10, dias_gracia: 5 } }), 200);
  assert.equal(cuenta.plan, 'Estandar');
  const pagos = await pagosDe(A);
  assert.equal(pagos.length, 1);
  const venc = vencimientoDe(PERIODO, 10);
  assert.deepEqual(
    { periodo: pagos[0].periodo, concepto: pagos[0].concepto, monto: pagos[0].monto, estado: pagos[0].estado, venc: pagos[0].fecha_vencimiento },
    { periodo: PERIODO, concepto: 'Abono', monto: '50000.00', estado: 'Pendiente', venc: venc < HOY ? HOY : venc },
    'si la cuota se genera después del día 10, vence ese mismo día',
  );
  A.idCuota = pagos[0].id_pago;
  // Proceso periódico idempotente: dos corridas más no cambian nada.
  const antes = JSON.stringify(await pagosDe(A));
  await procesar(); await procesar();
  assert.equal(JSON.stringify(await pagosDe(A)), antes);
  // Cambiar el abono no modifica la cuota ya generada.
  ok(await sa(`/plataforma/instituciones/${A.id}/plan`, { method: 'PUT', body: { abono_mensual: 60000 } }), 200);
  assert.equal((await pagosDe(A))[0].monto, '50000.00');
});

test('vencimiento y días de gracia: aviso con la fecha exacta de suspensión', async () => {
  const ayer = sumarDias(HOY, -1);
  const p = ok(await sa(`/plataforma/pagos/${A.idCuota}`, { method: 'PATCH', body: { fecha_vencimiento: ayer } }), 200);
  assert.equal(p.estado, 'Vencido');
  assert.equal((await estadoInst(A)).estado, 'Activa', 'dentro de la gracia sigue activa');
  const plan = ok(await call('/institucion/plan', { token: A.admin.token }), 200);
  assert.equal(plan.estado_cuenta, 'Vencido');
  assert.equal(plan.deuda, 50000);
  assert.equal(plan.aviso.tipo, 'urgente');
  assert.equal(plan.aviso.fecha_suspension, sumarDias(ayer, 6), 'vencido ayer + 5 días de gracia → se suspende el día siguiente al último');
});

test('suspensión al pasar la gracia: corta la sesión abierta y el login explica cómo pagar', async () => {
  const sesion = escuchar(A.docente.token);
  await esperar(() => sesion.eventos.some((e) => e.ev === 'conectado'));
  ok(await sa(`/plataforma/pagos/${A.idCuota}`, { method: 'PATCH', body: { fecha_vencimiento: sumarDias(HOY, -6) } }), 200);
  assert.deepEqual(await estadoInst(A), { estado: 'Suspendida', motivo_suspension: 'Falta de pago' });
  assert.ok(await esperar(() => sesion.eventos.find((e) => e.ev === 'sesion')), 'la ventana abierta recibe el cierre de sesión');
  sesion.cerrar();
  const x = await call('/laboratorios', { token: A.admin.token });
  assert.equal(x.status, 403);
  assert.equal(x.data.detalles.motivo, 'Falta de pago');
  const l = await call('/auth/login', { method: 'POST', body: { email: A.email, contrasena: CLAVE } });
  assert.equal(l.status, 403);
  assert.match(l.data.error, /pago pendiente/);
  assert.equal(l.data.detalles.codigo, 'INSTITUCION_SUSPENDIDA');
  assert.equal(l.data.detalles.deuda, 50000);
  assert.ok('datos_pago' in l.data.detalles);
  assert.equal((await call('/auth/login', { method: 'POST', body: { email: A.email, contrasena: 'otra' } })).status, 401, 'sin la contraseña correcta no se dice nada');
  const [[h]] = await db.query("SELECT detalle, id_institucion FROM historial_acciones WHERE entidad = 'Institucion' AND id_registro = ? AND detalle LIKE 'Suspensión automática%' ORDER BY id_accion DESC LIMIT 1", [A.id]);
  assert.equal(h.id_institucion, A.id);
  // Idempotente: otra corrida no repite la suspensión.
  const r = await procesar();
  assert.ok(!r.suspendidas.some((i) => i.id_institucion === A.id));
});

test('registrar el pago reactiva en el momento; no se registra dos veces', async () => {
  const r = ok(await sa('/plataforma/pagos', { method: 'POST', body: { id_institucion: A.id, periodo: PERIODO, medio: 'Transferencia', referencia: `OP-${SUFIJO}`, nro_factura: 'A-0001-00000123' } }), 200);
  assert.equal(r.id_pago, A.idCuota, 'marca como pagada la cuota existente');
  assert.equal(r.estado, 'Pagado');
  assert.equal(r.reactivada, true);
  assert.deepEqual(await estadoInst(A), { estado: 'Activa', motivo_suspension: null });
  ok(await call('/laboratorios', { token: A.admin.token }), 200);
  const dup = await sa('/plataforma/pagos', { method: 'POST', body: { id_institucion: A.id, periodo: PERIODO, medio: 'Efectivo' } });
  assert.equal(dup.status, 409);
  const [[h]] = await db.query("SELECT COUNT(*) AS n FROM historial_acciones WHERE entidad = 'Institucion' AND id_registro = ? AND detalle LIKE 'Reactivación automática%'", [A.id]);
  assert.equal(Number(h.n), 1);
  const plan = ok(await call('/institucion/plan', { token: A.admin.token }), 200);
  assert.equal(plan.estado_cuenta, 'Al día');
  assert.equal(plan.aviso, null);
});

test('una suspensión manual no se reactiva sola', async () => {
  ok(await sa(`/plataforma/instituciones/${A.id}/estado`, { method: 'PATCH', body: { estado: 'Suspendida' } }), 200);
  assert.deepEqual(await estadoInst(A), { estado: 'Suspendida', motivo_suspension: 'Manual' });
  await procesar();
  assert.deepEqual(await estadoInst(A), { estado: 'Suspendida', motivo_suspension: 'Manual' }, 'sin deuda, pero sigue suspendida');
  const l = await call('/auth/login', { method: 'POST', body: { email: A.email, contrasena: CLAVE } });
  assert.equal(l.data.detalles.motivo, 'Manual');
  assert.doesNotMatch(l.data.error, /pago/);
  ok(await sa(`/plataforma/instituciones/${A.id}/estado`, { method: 'PATCH', body: { estado: 'Activa' } }), 200);
  assert.deepEqual(await estadoInst(A), { estado: 'Activa', motivo_suspension: null });
});

test('corregir y anular pagos; un pago sobre uno anulado lo reutiliza', async () => {
  const otro = ok(await sa('/plataforma/pagos', { method: 'POST', body: { id_institucion: A.id, periodo: PERIODO, concepto: 'Implementacion', monto: 120000, medio: 'Mercado Pago', fecha_pago: HOY } }), 201);
  assert.equal(otro.monto, 120000);
  assert.equal((await sa(`/plataforma/pagos/${otro.id_pago}`, { method: 'PATCH', body: { estado: 'Anulado' } })).status, 400, 'anular exige una nota');
  const anulado = ok(await sa(`/plataforma/pagos/${otro.id_pago}`, { method: 'PATCH', body: { estado: 'Anulado', notas: 'Cargado por error' } }), 200);
  assert.equal(anulado.estado, 'Anulado');
  assert.equal((await sa(`/plataforma/pagos/${otro.id_pago}`, { method: 'PATCH', body: { estado: 'Vencido' } })).status, 400);
  const de_nuevo = ok(await sa('/plataforma/pagos', { method: 'POST', body: { id_institucion: A.id, periodo: PERIODO, concepto: 'Implementacion', monto: 100000, medio: 'Transferencia' } }), 200);
  assert.equal(de_nuevo.id_pago, otro.id_pago);
  assert.equal(de_nuevo.estado, 'Pagado');
  assert.equal(de_nuevo.monto, 100000);
  // Validaciones
  assert.equal((await sa('/plataforma/pagos', { method: 'POST', body: { id_institucion: A.id, periodo: '2026-13', medio: 'Transferencia', monto: 1 } })).status, 400);
  assert.equal((await sa('/plataforma/pagos', { method: 'POST', body: { id_institucion: A.id, periodo: '2026-01', concepto: 'Otro', medio: 'Cheque', monto: 1 } })).status, 400);
  assert.equal((await sa('/plataforma/pagos', { method: 'POST', body: { id_institucion: 999999999, periodo: '2026-01', medio: 'Efectivo', monto: 1 } })).status, 404);
  assert.equal((await sa(`/plataforma/instituciones/${A.id}/plan`, { method: 'PUT', body: { dia_vencimiento: 31 } })).status, 400);
});

test('listado y resumen de la plataforma', async () => {
  const lista = ok(await sa(`/plataforma/pagos?institucion=${A.id}`), 200);
  assert.ok(lista.length >= 2 && lista.every((p) => p.id_institucion === A.id && p.institucion));
  assert.ok(ok(await sa('/plataforma/pagos?estado=Pagado'), 200).every((p) => p.estado === 'Pagado'));
  assert.equal((await sa('/plataforma/pagos?estado=Raro')).status, 400);
  const r = ok(await sa('/plataforma/pagos/resumen'), 200);
  assert.equal(r.mes.periodo, PERIODO);
  for (const k of ['cobrado', 'pendiente', 'vencido']) assert.equal(typeof r.mes[k], 'number');
  const a = r.instituciones.find((i) => i.id_institucion === A.id);
  assert.equal(a.estado_cuenta, 'Al día');
  assert.equal(a.plan, 'Estandar');
  assert.ok(a.ultimo_pago);
  assert.ok(a.proximo_vencimiento > HOY.slice(0, 7), 'el próximo vencimiento es el del mes siguiente');
});

test('aislamiento: los colegios solo leen sus pagos y no pueden modificarlos', async () => {
  const pagoB = ok(await sa('/plataforma/pagos', { method: 'POST', body: { id_institucion: B.id, periodo: PERIODO, concepto: 'Otro', monto: 5000, medio: 'Efectivo' } }), 201);
  const planA = ok(await call('/institucion/plan', { token: A.admin.token }), 200);
  assert.ok(planA.pagos.length > 0 && !planA.pagos.some((p) => p.id_pago === pagoB.id_pago), 'A no ve pagos de B');
  assert.equal(planA.id_institucion, A.id);
  const planB = ok(await call('/institucion/plan', { token: B.admin.token }), 200);
  assert.deepEqual(planB.pagos.map((p) => p.id_pago), [pagoB.id_pago]);
  for (const t of [A.admin.token, A.docente.token]) {
    assert.equal((await call('/plataforma/pagos', { token: t })).status, 403);
    assert.equal((await call('/plataforma/pagos/resumen', { token: t })).status, 403);
    assert.equal((await call('/plataforma/pagos', { method: 'POST', token: t, body: { id_institucion: A.id, periodo: PERIODO, medio: 'Efectivo', monto: 1 } })).status, 403);
    assert.equal((await call(`/plataforma/pagos/${pagoB.id_pago}`, { method: 'PATCH', token: t, body: { estado: 'Anulado', notas: 'x' } })).status, 403);
    assert.equal((await call(`/plataforma/pagos/${A.idCuota}`, { method: 'PATCH', token: t, body: { monto: 1 } })).status, 403);
    assert.equal((await call(`/plataforma/instituciones/${A.id}/plan`, { method: 'PUT', token: t, body: { abono_mensual: 1 } })).status, 403);
    assert.equal((await call('/plataforma/pagos/procesar', { method: 'POST', token: t, body: {} })).status, 403);
  }
  assert.equal((await call('/institucion/plan', { token: A.docente.token })).status, 403, 'un docente no ve Mi plan');
  assert.equal((await sa('/institucion/plan')).status, 403, 'el SUPERADMIN no tiene Mi plan');
  const [[b]] = await db.query('SELECT estado, monto FROM pagos WHERE id_pago = ?', [pagoB.id_pago]);
  assert.deepEqual(b, { estado: 'Pagado', monto: '5000.00' }, 'nada cambió');
});
