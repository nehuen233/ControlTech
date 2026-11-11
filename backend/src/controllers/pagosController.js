// Pagos del abono de cada institucion. La tabla `pagos` es de la PLATAFORMA: solo el SUPERADMIN
// crea, corrige o anula pagos; el administrador de un colegio solo lee los de su institucion
// (GET /api/institucion/plan). Sin pasarela de pago todavia: el campo `medio` y la `referencia`
// quedan listos para Mercado Pago (Etapa 3B).
const { query, withTransaction } = require('../config/db');
const { HttpError } = require('../utils/httpError');
const { texto, enteroPositivo, fechaValida } = require('../utils/validacion');
const { registrarAccion } = require('../utils/historial');
const { estado: esquema, asegurarEsquemaUnaVez } = require('../config/esquema');
const cobros = require('../utils/cobros');

const PLANES = ['Basico', 'Estandar', 'Institucional'];
const CONCEPTOS = ['Abono', 'Implementacion', 'Anual', 'Otro'];
const MEDIOS = ['Transferencia', 'Mercado Pago', 'Efectivo', 'Otro'];
const ESTADOS = ['Pendiente', 'Pagado', 'Vencido', 'Anulado'];
const PERIODO_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

async function exigirPagos() {
  await asegurarEsquemaUnaVez();
  if (!esquema.pagos) throw new HttpError(503, esquema.errores.pagos || 'El módulo de pagos no está disponible.', { codigo: 'MIGRACION_PENDIENTE' });
}

const SELECT_PAGO = `
  SELECT p.id_pago, p.id_institucion, i.nombre AS institucion, p.periodo, p.concepto, p.monto, p.fecha_vencimiento,
         p.fecha_pago, p.estado, p.medio, p.referencia, p.nro_factura, p.notas, p.fecha_registro,
         CONCAT(u.nombre, ' ', u.apellido) AS registrado_por
    FROM pagos p
    JOIN instituciones i ON i.id_institucion = p.id_institucion
    LEFT JOIN usuarios u ON u.id_usuario = p.id_registrado_por`;
const formatear = (p) => ({ ...p, monto: Number(p.monto) });

function monto(v, obligatorio) {
  if (v === undefined || v === null || v === '') {
    if (obligatorio) throw new HttpError(400, 'Indicá el monto.');
    return undefined;
  }
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0 || n >= 1e10) throw new HttpError(400, 'El monto debe ser un número mayor a 0.');
  return Math.round(n * 100) / 100;
}
const opcional = (v, max, campo) => {
  if (v === undefined) return undefined;
  const t = texto(v ?? '');
  if (t.length > max) throw new HttpError(400, `${campo} admite hasta ${max} caracteres.`);
  return t || null;
};
async function obtenerPago(id) {
  const [p] = await query(`${SELECT_PAGO} WHERE p.id_pago = ?`, [id]);
  if (!p) throw new HttpError(404, 'El pago no existe.');
  return formatear(p);
}
async function obtenerInstitucion(id) {
  const [i] = await query('SELECT id_institucion, nombre, estado, motivo_suspension, abono_mensual, dia_vencimiento, dias_gracia FROM instituciones WHERE id_institucion = ?', [id]);
  if (!i) throw new HttpError(404, 'La institución no existe.');
  return i;
}

// ---------- Plataforma (SUPERADMIN) ----------

async function listar(req, res) {
  await exigirPagos();
  const where = [];
  const params = [];
  if (req.query.estado) {
    if (!ESTADOS.includes(req.query.estado)) throw new HttpError(400, `El estado debe ser uno de: ${ESTADOS.join(', ')}.`);
    where.push('p.estado = ?'); params.push(req.query.estado);
  }
  if (req.query.institucion) { where.push('p.id_institucion = ?'); params.push(enteroPositivo(req.query.institucion, 'La institución')); }
  for (const [k, op] of [['desde', '>='], ['hasta', '<=']]) {
    if (!req.query[k]) continue;
    if (!fechaValida(req.query[k])) throw new HttpError(400, `La fecha "${k}" no es válida (AAAA-MM-DD).`);
    where.push(`p.fecha_vencimiento ${op} ?`); params.push(req.query[k]);
  }
  const rows = await query(
    `${SELECT_PAGO} ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY p.periodo DESC, i.nombre, p.concepto LIMIT 1000`,
    params,
  );
  res.json(rows.map(formatear));
}

async function resumen(_req, res) {
  await exigirPagos();
  const hoy = cobros.hoyAR();
  const periodo = cobros.periodoDe(hoy);
  const [t] = await query(
    `SELECT COALESCE(SUM(CASE WHEN estado = 'Pagado' AND DATE_FORMAT(fecha_pago, '%Y-%m') = ? THEN monto END), 0) AS cobrado,
            COALESCE(SUM(CASE WHEN estado = 'Pendiente' THEN monto END), 0) AS pendiente,
            COALESCE(SUM(CASE WHEN estado = 'Vencido' THEN monto END), 0) AS vencido
       FROM pagos`,
    [periodo],
  );
  res.json({
    hoy,
    mes: { periodo, cobrado: Number(t.cobrado), pendiente: Number(t.pendiente), vencido: Number(t.vencido) },
    instituciones: await cobros.estadoDeCuenta({ hoy }),
  });
}

// Registra un pago. Si ya existe el de ese periodo y concepto (pendiente, vencido o anulado),
// lo marca como Pagado en lugar de duplicarlo. Despues se reactiva la institucion si ya no debe.
async function registrar(req, res) {
  await exigirPagos();
  const b = req.body || {};
  const idInst = enteroPositivo(b.id_institucion, 'La institución');
  const inst = await obtenerInstitucion(idInst);
  const periodo = texto(b.periodo);
  if (!PERIODO_RE.test(periodo)) throw new HttpError(400, 'El período debe tener el formato AAAA-MM (por ejemplo 2026-11).');
  const concepto = b.concepto || 'Abono';
  if (!CONCEPTOS.includes(concepto)) throw new HttpError(400, `El concepto debe ser uno de: ${CONCEPTOS.join(', ')}.`);
  const fechaPago = b.fecha_pago || cobros.hoyAR();
  if (!fechaValida(fechaPago)) throw new HttpError(400, 'La fecha de pago no es válida (AAAA-MM-DD).');
  if (!MEDIOS.includes(b.medio)) throw new HttpError(400, `Indicá el medio de pago: ${MEDIOS.join(', ')}.`);
  const datos = {
    fecha_pago: fechaPago, medio: b.medio, estado: 'Pagado', id_registrado_por: req.user.id,
    referencia: opcional(b.referencia, 150, 'La referencia') ?? null,
    nro_factura: opcional(b.nro_factura, 50, 'El número de factura') ?? null,
    notas: opcional(b.notas, 300, 'Las notas') ?? null,
  };
  const montoIndicado = monto(b.monto, false);

  const [existente] = await query('SELECT id_pago, estado, monto FROM pagos WHERE id_institucion = ? AND periodo = ? AND concepto = ?', [idInst, periodo, concepto]);
  if (existente?.estado === 'Pagado') {
    throw new HttpError(409, `El ${concepto.toLowerCase()} de ${periodo} de ${inst.nombre} ya está registrado como pagado (pago N.º ${existente.id_pago}).`, { id_pago: existente.id_pago });
  }
  const id = await withTransaction(async (conn) => {
    let idPago;
    if (existente) {
      await conn.query('UPDATE pagos SET ? WHERE id_pago = ?', [{ ...datos, ...(montoIndicado ? { monto: montoIndicado } : {}) }, existente.id_pago]);
      idPago = existente.id_pago;
    } else {
      const m = montoIndicado ?? (concepto === 'Abono' && Number(inst.abono_mensual) > 0 ? Number(inst.abono_mensual) : undefined);
      if (!m) throw new HttpError(400, 'Indicá el monto.');
      const venc = concepto === 'Abono' ? cobros.vencimientoDe(periodo, inst.dia_vencimiento) : fechaPago;
      const [r] = await conn.query('INSERT INTO pagos SET ?', [{ ...datos, id_institucion: idInst, periodo, concepto, monto: m, fecha_vencimiento: venc }]);
      idPago = r.insertId;
    }
    await registrarAccion(conn, {
      idUsuario: req.user.id, accion: existente ? 'Modificar' : 'Crear', entidad: 'Pago', idRegistro: idPago,
      detalle: `Pago registrado: ${inst.nombre}, ${concepto} ${periodo} (${b.medio}${datos.referencia ? `, ref. ${datos.referencia}` : ''}).`,
    });
    return idPago;
  });
  // Al registrar un pago se reactiva en el momento si ya no quedan pagos vencidos.
  const reactivadas = await cobros.reactivar(idInst);
  res.status(existente ? 200 : 201).json({ ...(await obtenerPago(id)), reactivada: reactivadas.length > 0 });
}

// Corrige datos de un pago o lo anula (con nota obligatoria). El estado "Vencido" lo pone el
// proceso de cobro: aca solo se elige Pendiente, Pagado o Anulado.
async function actualizar(req, res) {
  await exigirPagos();
  const id = enteroPositivo(req.params.id, 'El pago');
  const actual = await obtenerPago(id);
  const b = req.body || {};
  const cambios = {};
  const m = monto(b.monto, false);
  if (m !== undefined) cambios.monto = m;
  for (const k of ['fecha_vencimiento', 'fecha_pago']) {
    if (b[k] === undefined) continue;
    if (b[k] === null && k === 'fecha_pago') { cambios[k] = null; continue; }
    if (!fechaValida(b[k])) throw new HttpError(400, `La fecha ${k === 'fecha_pago' ? 'de pago' : 'de vencimiento'} no es válida (AAAA-MM-DD).`);
    cambios[k] = b[k];
  }
  if (b.medio !== undefined) {
    if (b.medio !== null && !MEDIOS.includes(b.medio)) throw new HttpError(400, `El medio debe ser uno de: ${MEDIOS.join(', ')}.`);
    cambios.medio = b.medio;
  }
  for (const [k, max, campo] of [['referencia', 150, 'La referencia'], ['nro_factura', 50, 'El número de factura'], ['notas', 300, 'Las notas']]) {
    const v = opcional(b[k], max, campo);
    if (v !== undefined) cambios[k] = v;
  }
  if (b.estado !== undefined) {
    if (!['Pendiente', 'Pagado', 'Anulado'].includes(b.estado)) throw new HttpError(400, 'El estado se puede cambiar a Pendiente, Pagado o Anulado.');
    cambios.estado = b.estado;
  }
  const final = { ...actual, ...cambios };
  if (cambios.estado === 'Anulado' && !final.notas) throw new HttpError(400, 'Para anular un pago escribí en las notas el motivo.');
  if (final.estado === 'Pagado' && (!final.fecha_pago || !final.medio)) throw new HttpError(400, 'Un pago marcado como pagado necesita fecha de pago y medio.');
  if (cambios.estado === 'Pendiente') { cambios.fecha_pago = null; cambios.medio = cambios.medio ?? null; }
  if (!Object.keys(cambios).length) throw new HttpError(400, 'No se indicaron cambios.');
  await withTransaction(async (conn) => {
    await conn.query('UPDATE pagos SET ? WHERE id_pago = ?', [cambios, id]);
    await registrarAccion(conn, {
      idUsuario: req.user.id, accion: 'Modificar', entidad: 'Pago', idRegistro: id,
      detalle: cambios.estado === 'Anulado'
        ? `Pago anulado: ${actual.institucion}, ${actual.concepto} ${actual.periodo}. Motivo: ${final.notas}`
        : `Pago corregido: ${actual.institucion}, ${actual.concepto} ${actual.periodo} (${Object.keys(cambios).join(', ')}).`,
    });
  });
  // Una corrección puede vencer, suspender o reactivar: se recalcula esa institución.
  const r = await cobros.procesar({ idInstitucion: actual.id_institucion });
  res.json({ ...(await obtenerPago(id)), reactivada: r.reactivadas.length > 0, suspendida: r.suspendidas.length > 0 });
}

async function procesarAhora(_req, res) {
  await exigirPagos();
  res.json(await cobros.procesar());
}

// Plan y condiciones de cobro de una institucion. Cambiar el abono no toca los pagos ya generados.
async function actualizarPlan(req, res) {
  await exigirPagos();
  const id = enteroPositivo(req.params.id, 'La institución');
  const inst = await obtenerInstitucion(id);
  const b = req.body || {};
  const cambios = {};
  if (b.plan !== undefined) {
    if (b.plan !== null && !PLANES.includes(b.plan)) throw new HttpError(400, `El plan debe ser uno de: ${PLANES.join(', ')}.`);
    cambios.plan = b.plan;
  }
  if (b.abono_mensual !== undefined) cambios.abono_mensual = b.abono_mensual === null || b.abono_mensual === '' ? null : monto(b.abono_mensual, true);
  if (b.dia_vencimiento !== undefined) {
    const d = Number(b.dia_vencimiento);
    if (!Number.isInteger(d) || d < 1 || d > 28) throw new HttpError(400, 'El día de vencimiento debe ser un número de 1 a 28.');
    cambios.dia_vencimiento = d;
  }
  if (b.dias_gracia !== undefined) {
    const d = Number(b.dias_gracia);
    if (!Number.isInteger(d) || d < 0 || d > 60) throw new HttpError(400, 'Los días de gracia deben ser un número de 0 a 60.');
    cambios.dias_gracia = d;
  }
  if (!Object.keys(cambios).length) throw new HttpError(400, 'No se indicaron cambios.');
  await withTransaction(async (conn) => {
    await conn.query('UPDATE instituciones SET ? WHERE id_institucion = ?', [cambios, id]);
    await registrarAccion(conn, {
      idUsuario: req.user.id, accion: 'Modificar', entidad: 'Institucion', idRegistro: id,
      detalle: `Plan y cobro de "${inst.nombre}" actualizados (${Object.entries(cambios).map(([k, v]) => `${k}: ${v ?? '—'}`).join(', ')}).`,
    });
  });
  // Con abono cargado y la institucion activa, la cuota del mes se genera en el momento.
  await cobros.procesar({ idInstitucion: id });
  const [cuenta] = await cobros.estadoDeCuenta({ idInstitucion: id });
  res.json(cuenta);
}

// ---------- Colegio (ADMINISTRADOR de la institucion) ----------

const ETIQUETA_PLAN = { Basico: 'Básico', Estandar: 'Estándar', Institucional: 'Institucional' };

// Aviso para la franja superior del sistema.
function avisoDe(cuenta, hoy) {
  if (cuenta.prueba_finalizada) return { tipo: 'prueba', texto: 'Tu período de prueba terminó. Comunicate con ControlTech para elegir un plan y seguir usando el sistema.' };
  if (cuenta.estado_cuenta === 'Vencido' && cuenta.fecha_suspension) {
    return { tipo: 'urgente', texto: 'Tenés un pago vencido.', fecha_suspension: cuenta.fecha_suspension };
  }
  if (cuenta.estado_cuenta === 'Pendiente' && cuenta.proximo_vencimiento && cuenta.proximo_vencimiento <= hoy) {
    return { tipo: 'pendiente', texto: 'Tenés un pago pendiente: vence hoy.' };
  }
  return null;
}

async function miPlan(req, res) {
  await exigirPagos();
  const hoy = cobros.hoyAR();
  const [cuenta] = await cobros.estadoDeCuenta({ hoy, idInstitucion: req.user.idInstitucion });
  if (!cuenta) throw new HttpError(404, 'La institución no existe.');
  const pagos = await query(
    `SELECT id_pago, periodo, concepto, monto, fecha_vencimiento, fecha_pago, estado, medio, nro_factura
       FROM pagos WHERE id_institucion = ? AND estado <> 'Anulado'
      ORDER BY periodo DESC, concepto LIMIT 12`,
    [req.user.idInstitucion],
  );
  res.json({
    ...cuenta,
    plan_etiqueta: cuenta.plan ? ETIQUETA_PLAN[cuenta.plan] : null,
    pagos: pagos.map(formatear),
    datos_pago: cobros.datosDePago(),
    aviso: avisoDe(cuenta, hoy),
  });
}

module.exports = { listar, resumen, registrar, actualizar, procesarAhora, actualizarPlan, miPlan, PLANES, CONCEPTOS, MEDIOS };
