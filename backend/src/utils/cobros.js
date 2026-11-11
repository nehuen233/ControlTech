// Cobro del abono de cada institucion (modulo de pagos de la plataforma).
//
// El proceso periodico (procesar) hace, en este orden y de forma idempotente:
//   1. Generar la cuota del mes en curso de cada institucion con abono cargado que este Activa
//      o Suspendida por falta de pago (asi la deuda refleja todos los meses adeudados). Las
//      instituciones en Prueba o suspendidas a mano no generan cuotas. El UNIQUE
//      (id_institucion, periodo, concepto) impide duplicar. Si la cuota se genera despues de su
//      dia de vencimiento (por ejemplo, al activar un colegio el dia 20), vence ese mismo dia.
//   2. Vencer: Pendiente con vencimiento anterior a hoy -> Vencido.
//   3. Suspender: institucion Activa con algun pago Vencido hace mas de dias_gracia dias ->
//      Suspendida por 'Falta de pago'; se cortan sus sesiones abiertas y queda en el historial.
//   4. Reactivar: Suspendida por 'Falta de pago' sin pagos Vencidos -> Activa. Una suspension
//      'Manual' nunca se levanta sola.
// "Hoy" es la fecha de Argentina (no la del servidor de base de datos).
const { query } = require('../config/db');
const { cerrarSesionesInstitucion } = require('./eventos');

const ZONA = process.env.ZONA_HORARIA || 'America/Argentina/Buenos_Aires';
const MENSAJE_CORTE_PAGO = 'El acceso de tu institución fue suspendido por un pago pendiente.';

// 'AAAA-MM-DD' en la zona horaria de Argentina.
function hoyAR(fecha = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit' }).format(fecha)
}
const periodoDe = (fecha) => fecha.slice(0, 7);
// Dia de vencimiento dentro del mes (un 31 en febrero pasa al ultimo dia del mes).
function vencimientoDe(periodo, dia) {
  const [a, m] = periodo.split('-').map(Number);
  const ultimo = new Date(Date.UTC(a, m, 0)).getUTCDate();
  return `${periodo}-${String(Math.min(Number(dia) || 10, ultimo)).padStart(2, '0')}`;
}
function sumarDias(fecha, dias) {
  const d = new Date(`${fecha}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + Number(dias));
  return d.toISOString().slice(0, 10);
}
function periodoSiguiente(periodo) {
  const [a, m] = periodo.split('-').map(Number);
  return m === 12 ? `${a + 1}-01` : `${a}-${String(m + 1).padStart(2, '0')}`;
}
// Fecha en que se suspende una institucion por un pago vencido: el dia siguiente al ultimo de gracia.
const fechaSuspension = (vencimiento, diasGracia) => sumarDias(vencimiento, Number(diasGracia) + 1);

// Las acciones automaticas quedan en el historial a nombre del SUPERADMIN (el historial exige
// un usuario), con la institucion afectada.
async function registrarAutomatico(idInstitucion, detalle) {
  const [sa] = await query("SELECT u.id_usuario FROM usuarios u JOIN roles r ON r.id_rol = u.id_rol WHERE r.nombre_rol = 'SUPERADMIN' ORDER BY u.id_usuario LIMIT 1");
  if (!sa) return;
  await query(
    "INSERT INTO historial_acciones (id_usuario, accion, entidad, id_registro, detalle, id_institucion) VALUES (?, 'Modificar', 'Institucion', ?, ?, ?)",
    [sa.id_usuario, idInstitucion, detalle, idInstitucion],
  );
}

async function generarCuotas(hoy, idInstitucion) {
  const periodo = periodoDe(hoy);
  const inst = await query(
    `SELECT id_institucion, abono_mensual, dia_vencimiento FROM instituciones
      WHERE abono_mensual > 0
        AND (estado = 'Activa' OR (estado = 'Suspendida' AND motivo_suspension = 'Falta de pago'))
        ${idInstitucion ? 'AND id_institucion = ?' : ''}`,
    idInstitucion ? [idInstitucion] : [],
  );
  let n = 0;
  for (const i of inst) {
    const venc = vencimientoDe(periodo, i.dia_vencimiento);
    const r = await query(
      "INSERT IGNORE INTO pagos (id_institucion, periodo, concepto, monto, fecha_vencimiento) VALUES (?, ?, 'Abono', ?, ?)",
      [i.id_institucion, periodo, i.abono_mensual, venc < hoy ? hoy : venc],
    );
    n += r.affectedRows;
  }
  return n;
}

async function vencer(hoy, idInstitucion) {
  const r = await query(
    `UPDATE pagos SET estado = 'Vencido' WHERE estado = 'Pendiente' AND fecha_vencimiento < ? ${idInstitucion ? 'AND id_institucion = ?' : ''}`,
    idInstitucion ? [hoy, idInstitucion] : [hoy],
  );
  return r.affectedRows;
}

async function suspender(hoy, idInstitucion) {
  const inst = await query(
    `SELECT i.id_institucion, i.nombre, MIN(p.fecha_vencimiento) AS vencimiento, i.dias_gracia
       FROM instituciones i JOIN pagos p ON p.id_institucion = i.id_institucion AND p.estado = 'Vencido'
      WHERE i.estado = 'Activa' AND DATE_ADD(p.fecha_vencimiento, INTERVAL i.dias_gracia DAY) < ?
        ${idInstitucion ? 'AND i.id_institucion = ?' : ''}
      GROUP BY i.id_institucion`,
    idInstitucion ? [hoy, idInstitucion] : [hoy],
  );
  const hechas = [];
  for (const i of inst) {
    const r = await query(
      "UPDATE instituciones SET estado = 'Suspendida', motivo_suspension = 'Falta de pago' WHERE id_institucion = ? AND estado = 'Activa'",
      [i.id_institucion],
    );
    if (!r.affectedRows) continue;
    cerrarSesionesInstitucion(i.id_institucion, MENSAJE_CORTE_PAGO);
    await registrarAutomatico(i.id_institucion, `Suspensión automática por falta de pago: abono vencido el ${i.vencimiento} y ${i.dias_gracia} día(s) de gracia cumplidos.`);
    hechas.push({ id_institucion: i.id_institucion, nombre: i.nombre });
  }
  return hechas;
}

async function reactivar(idInstitucion) {
  const inst = await query(
    `SELECT i.id_institucion, i.nombre FROM instituciones i
      WHERE i.estado = 'Suspendida' AND i.motivo_suspension = 'Falta de pago'
        AND NOT EXISTS (SELECT 1 FROM pagos p WHERE p.id_institucion = i.id_institucion AND p.estado = 'Vencido')
        ${idInstitucion ? 'AND i.id_institucion = ?' : ''}`,
    idInstitucion ? [idInstitucion] : [],
  );
  const hechas = [];
  for (const i of inst) {
    const r = await query(
      "UPDATE instituciones SET estado = 'Activa', motivo_suspension = NULL WHERE id_institucion = ? AND estado = 'Suspendida' AND motivo_suspension = 'Falta de pago'",
      [i.id_institucion],
    );
    if (!r.affectedRows) continue;
    await registrarAutomatico(i.id_institucion, 'Reactivación automática: ya no hay pagos vencidos.');
    hechas.push({ id_institucion: i.id_institucion, nombre: i.nombre });
  }
  return hechas;
}

// Corre los pasos para todas las instituciones o solo para una. Correrlo dos veces seguidas no
// cambia nada.
async function procesar({ hoy = hoyAR(), idInstitucion = null } = {}) {
  const generadas = await generarCuotas(hoy, idInstitucion);
  const vencidas = await vencer(hoy, idInstitucion);
  const suspendidas = await suspender(hoy, idInstitucion);
  const reactivadas = await reactivar(idInstitucion);
  return { hoy, generadas, vencidas, suspendidas, reactivadas };
}

// ---------- Estado de cuenta ----------

const ESTADO_CUENTA = { SUSPENDIDA: 'Suspendida', VENCIDO: 'Vencido', PENDIENTE: 'Pendiente', AL_DIA: 'Al día', PRUEBA: 'En prueba', SIN_PLAN: 'Sin plan' };

// Estado de cuenta de una o de todas las instituciones (sin el SUPERADMIN, que no tiene).
async function estadoDeCuenta({ hoy = hoyAR(), idInstitucion = null } = {}) {
  const rows = await query(
    `SELECT i.id_institucion, i.nombre, i.estado, i.motivo_suspension, i.plan, i.abono_mensual, i.dia_vencimiento,
            i.dias_gracia, i.fecha_fin_prueba,
            COALESCE(SUM(CASE WHEN p.estado = 'Vencido' THEN p.monto END), 0) AS deuda,
            COALESCE(SUM(CASE WHEN p.estado = 'Pendiente' THEN p.monto END), 0) AS pendiente,
            MIN(CASE WHEN p.estado IN ('Pendiente','Vencido') THEN p.fecha_vencimiento END) AS vencimiento_abierto,
            MIN(CASE WHEN p.estado = 'Vencido' THEN p.fecha_vencimiento END) AS vencido_mas_viejo,
            MAX(CASE WHEN p.estado = 'Pagado' THEN p.fecha_pago END) AS ultimo_pago,
            MAX(CASE WHEN p.estado = 'Pagado' AND p.concepto = 'Abono' THEN p.periodo END) AS ultimo_periodo_pagado,
            SUM(p.estado = 'Vencido') AS cant_vencidos
       FROM instituciones i LEFT JOIN pagos p ON p.id_institucion = i.id_institucion
      ${idInstitucion ? 'WHERE i.id_institucion = ?' : ''}
      GROUP BY i.id_institucion
      ORDER BY i.nombre`,
    idInstitucion ? [idInstitucion] : [],
  );
  return rows.map((r) => {
    const deuda = Number(r.deuda);
    const pendiente = Number(r.pendiente);
    const conPlan = Number(r.abono_mensual) > 0;
    let estado
    if (r.estado === 'Suspendida') estado = ESTADO_CUENTA.SUSPENDIDA;
    else if (deuda > 0) estado = ESTADO_CUENTA.VENCIDO;
    else if (pendiente > 0) estado = ESTADO_CUENTA.PENDIENTE;
    else if (r.estado === 'Prueba') estado = ESTADO_CUENTA.PRUEBA;
    else if (!conPlan) estado = ESTADO_CUENTA.SIN_PLAN;
    else estado = ESTADO_CUENTA.AL_DIA;
    // Proximo vencimiento: el del pago abierto mas viejo o, si esta todo pago, la cuota que viene.
    let proximo = r.vencimiento_abierto || null;
    if (!proximo && conPlan && r.estado !== 'Prueba') {
      const actual = periodoDe(hoy);
      const base = r.ultimo_periodo_pagado && r.ultimo_periodo_pagado >= actual ? periodoSiguiente(r.ultimo_periodo_pagado) : actual;
      proximo = vencimientoDe(base, r.dia_vencimiento);
    }
    const suspensionPrevista = r.estado === 'Activa' && r.vencido_mas_viejo ? fechaSuspension(r.vencido_mas_viejo, r.dias_gracia) : null;
    return {
      id_institucion: r.id_institucion,
      nombre: r.nombre,
      estado_institucion: r.estado,
      motivo_suspension: r.motivo_suspension,
      plan: r.plan,
      abono_mensual: r.abono_mensual === null ? null : Number(r.abono_mensual),
      dia_vencimiento: r.dia_vencimiento,
      dias_gracia: r.dias_gracia,
      estado_cuenta: estado,
      deuda,
      pendiente,
      pagos_vencidos: Number(r.cant_vencidos || 0),
      ultimo_pago: r.ultimo_pago,
      proximo_vencimiento: proximo,
      fecha_suspension: suspensionPrevista,
      // Prueba terminada sin plan cargado: se avisa, pero no se suspende automáticamente.
      prueba_finalizada: r.estado === 'Prueba' && Boolean(r.fecha_fin_prueba) && String(r.fecha_fin_prueba).slice(0, 10) < hoy && !conPlan,
    };
  });
}

// Datos para pagar (de backend/.env), los mismos para todos los colegios.
const datosDePago = () => ({
  alias: process.env.PAGO_ALIAS || null,
  cbu: process.env.PAGO_CBU || null,
  titular: process.env.PAGO_TITULAR || null,
  link: process.env.PAGO_LINK || null,
  contacto: process.env.PAGO_CONTACTO || null,
});

// Proceso periodico (lo inicia server.js).
function iniciarCobroPeriodico() {
  const minutos = Math.max(Number(process.env.PAGOS_INTERVALO_MIN || 60), 1);
  const correr = () => procesar()
    .then((r) => {
      const partes = [];
      if (r.generadas) partes.push(`${r.generadas} cuota(s) generada(s)`);
      if (r.vencidas) partes.push(`${r.vencidas} vencida(s)`);
      if (r.suspendidas.length) partes.push(`suspendidas por falta de pago: ${r.suspendidas.map((i) => i.nombre).join(', ')}`);
      if (r.reactivadas.length) partes.push(`reactivadas: ${r.reactivadas.map((i) => i.nombre).join(', ')}`);
      if (partes.length) console.log(`Pagos: ${partes.join('; ')}.`);
    })
    .catch((err) => console.warn(`No se pudo verificar los pagos: ${err.message}`));
  setTimeout(correr, 3000).unref();
  setInterval(correr, minutos * 60000).unref();
}

module.exports = {
  hoyAR, periodoDe, vencimientoDe, sumarDias, fechaSuspension, procesar, reactivar, estadoDeCuenta, datosDePago,
  iniciarCobroPeriodico, ESTADO_CUENTA, MENSAJE_CORTE_PAGO,
};
