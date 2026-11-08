// Alertas de mantenimiento (tabla `alertas`). Avisan al administrador cuando un equipo
// requiere mantenimiento, para actuar antes de que falle. Origenes:
//   * usuario: alguien reporta que el equipo requiere mantenimiento (Reportar problema).
//   * sistema: la verificacion periodica detecta
//       - mantenimiento preventivo vencido (sin preventivo completado hace ALERTA_PREVENTIVO_DIAS dias)
//       - un mantenimiento programado cuya fecha paso y sigue Pendiente.
// Cada alerta nueva o resuelta se envia en tiempo real (SSE) a las ventanas abiertas.
const { query } = require('../config/db');
const { HttpError } = require('../utils/httpError');
const { laboratoriosPermitidos, filtroLaboratorios } = require('../utils/acceso');
const { emitirAlerta, suscribir } = require('../utils/eventos');

const TITULO_PREVENTIVO = 'Mantenimiento preventivo vencido';
const TITULO_PROGRAMADO = 'Mantenimiento programado sin realizar';
const TITULOS_SISTEMA = [TITULO_PREVENTIVO, TITULO_PROGRAMADO];
const diasPreventivo = () => {
  const n = Number(process.env.ALERTA_PREVENTIVO_DIAS || 180);
  return Number.isInteger(n) && n > 0 ? n : 180;
};

const SELECT_ALERTA = `
  SELECT a.id_alerta, a.id_equipo, a.titulo, a.descripcion, a.severidad, a.fecha_creacion, a.fecha_limite, a.estado,
         e.identificador AS equipo, e.estado AS estado_equipo, e.id_laboratorio, e.id_institucion, l.nombre AS laboratorio,
         (SELECT CONCAT(u.nombre, ' ', u.apellido) FROM historial_acciones h JOIN usuarios u ON u.id_usuario = h.id_usuario
           WHERE h.entidad = 'Alerta' AND h.accion = 'Crear' AND h.id_registro = a.id_alerta
           ORDER BY h.id_accion LIMIT 1) AS reportado_por,
         (a.estado = 'Activa' AND a.fecha_limite IS NOT NULL AND a.fecha_limite < CURDATE()) AS vencida
    FROM alertas a
    JOIN equipos e ON e.id_equipo = a.id_equipo
    JOIN laboratorios l ON l.id_laboratorio = e.id_laboratorio`;

function formatear(a) {
  return {
    ...a,
    vencida: Boolean(Number(a.vencida)),
    origen: TITULOS_SISTEMA.includes(a.titulo) && !a.reportado_por ? 'sistema' : 'usuario',
  };
}

// idInstitucion opcional: si se indica, una alerta de otra institucion no se devuelve.
async function obtenerAlerta(id, idInstitucion) {
  const [a] = idInstitucion
    ? await query(`${SELECT_ALERTA} WHERE a.id_alerta = ? AND e.id_institucion = ?`, [id, idInstitucion])
    : await query(`${SELECT_ALERTA} WHERE a.id_alerta = ?`, [id]);
  return a ? formatear(a) : null;
}

// Envia una alerta nueva (o resuelta) a las ventanas abiertas que pueden verla.
async function notificarAlerta(id, evento = 'alerta') {
  const a = await obtenerAlerta(id);
  if (a) emitirAlerta(evento, a);
  return a;
}

function notificarResueltas(alertas) {
  for (const a of alertas) emitirAlerta('alerta-resuelta', { id_alerta: a.id_alerta, id_laboratorio: a.id_laboratorio, id_institucion: a.id_institucion, equipo: a.equipo });
}

const ORDEN = "ORDER BY FIELD(a.estado, 'Activa', 'Resuelta'), FIELD(a.severidad, 'Critica', 'Alta', 'Media', 'Baja'), a.fecha_creacion DESC, a.id_alerta DESC";

async function listar(req, res) {
  const labs = await laboratoriosPermitidos(req.user);
  const where = ['e.id_institucion = ?'];
  const params = [req.user.idInstitucion];
  filtroLaboratorios(labs, 'e.id_laboratorio', where, params);
  const estado = req.query.estado || 'Activa';
  if (estado !== 'todas') {
    if (!['Activa', 'Resuelta'].includes(estado)) throw new HttpError(400, 'El estado debe ser Activa, Resuelta o todas.');
    where.push('a.estado = ?');
    params.push(estado);
  }
  const limite = Math.min(Math.max(Number(req.query.limite) || 200, 1), 500);
  const rows = await query(`${SELECT_ALERTA} ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ${ORDEN} LIMIT ${limite}`, params);
  res.json(rows.map(formatear));
}

async function resumen(req, res) {
  const labs = await laboratoriosPermitidos(req.user);
  const where = ["a.estado = 'Activa'", 'e.id_institucion = ?'];
  const params = [req.user.idInstitucion];
  filtroLaboratorios(labs, 'e.id_laboratorio', where, params);
  const [r] = await query(
    `SELECT COUNT(*) AS activas, SUM(a.severidad IN ('Alta', 'Critica')) AS urgentes,
            SUM(a.fecha_limite IS NOT NULL AND a.fecha_limite < CURDATE()) AS vencidas,
            SUM(a.titulo IN (?)) AS del_sistema
       FROM alertas a JOIN equipos e ON e.id_equipo = a.id_equipo WHERE ${where.join(' AND ')}`,
    [TITULOS_SISTEMA, ...params],
  );
  res.json(Object.fromEntries(Object.entries(r).map(([k, v]) => [k, Number(v || 0)])));
}

async function stream(req, res) {
  suscribir(req, res, await laboratoriosPermitidos(req.user));
}

// ---------- Deteccion automatica ----------

async function insertarSiNoExiste(idEquipo, titulo, descripcion, severidad, diasLimite) {
  const r = await query(
    `INSERT INTO alertas (id_equipo, titulo, descripcion, severidad, fecha_limite)
     SELECT ?, ?, ?, ?, DATE_ADD(CURDATE(), INTERVAL ? DAY) FROM DUAL
      WHERE NOT EXISTS (SELECT 1 FROM alertas WHERE id_equipo = ? AND titulo = ? AND estado = 'Activa')`,
    [idEquipo, titulo, descripcion, severidad, diasLimite, idEquipo, titulo],
  );
  return r.affectedRows ? r.insertId : null;
}

const fechaTexto = (d) => { const s = String(d).slice(0, 10); return `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}`; };

// Recorre los equipos de las instituciones que no estan suspendidas (o solo de idInstitucion,
// cuando un administrador pide la verificacion). Cada alerta se envia solo a su institucion.
async function generarAlertasAutomaticas(idInstitucion = null) {
  const creadas = [];
  const limite = diasPreventivo();
  const filtroInst = `AND EXISTS (SELECT 1 FROM instituciones i WHERE i.id_institucion = e.id_institucion AND i.estado <> 'Suspendida')${idInstitucion ? ' AND e.id_institucion = ?' : ''}`;
  const pInst = idInstitucion ? [idInstitucion] : [];

  // 1) Preventivo vencido: se cuenta desde el ultimo preventivo completado o, si nunca tuvo, desde el alta.
  const vencidos = await query(
    `SELECT x.* FROM (
       SELECT e.id_equipo, e.identificador, DATE(e.fecha_registro) AS alta,
              (SELECT MAX(m.fecha_mantenimiento) FROM mantenimientos m
                WHERE m.id_equipo = e.id_equipo AND m.tipo = 'Preventivo' AND m.estado = 'Completado') AS ultimo
         FROM equipos e JOIN laboratorios l ON l.id_laboratorio = e.id_laboratorio
        WHERE l.estado = 'Activo' AND e.estado <> 'Fuera de servicio' ${filtroInst}
          AND NOT EXISTS (SELECT 1 FROM mantenimientos m WHERE m.id_equipo = e.id_equipo AND m.tipo = 'Preventivo' AND m.estado <> 'Completado')
          AND NOT EXISTS (SELECT 1 FROM alertas a WHERE a.id_equipo = e.id_equipo AND a.titulo = ? AND a.estado = 'Activa')
     ) x
     WHERE DATEDIFF(CURDATE(), COALESCE(GREATEST(x.alta, x.ultimo), x.alta)) >= ?`,
    [...pInst, TITULO_PREVENTIVO, limite],
  );
  for (const v of vencidos) {
    const desde = v.ultimo && String(v.ultimo) > String(v.alta) ? v.ultimo : v.alta;
    const dias = Math.floor((Date.now() - Date.parse(`${String(desde).slice(0, 10)}T00:00:00`)) / 864e5);
    const descripcion = v.ultimo && desde === v.ultimo
      ? `El último mantenimiento preventivo fue el ${fechaTexto(v.ultimo)} (hace ${dias} días; se recomienda cada ${limite}). Programalo antes de que se produzca una falla.`
      : `No tiene mantenimiento preventivo registrado desde su alta, el ${fechaTexto(v.alta)} (hace ${dias} días; se recomienda cada ${limite}). Programalo antes de que se produzca una falla.`;
    const id = await insertarSiNoExiste(v.id_equipo, TITULO_PREVENTIVO, descripcion, dias >= 2 * limite ? 'Alta' : 'Media', 14);
    if (id) creadas.push(id);
  }

  // 2) Mantenimiento programado cuya fecha ya paso y sigue pendiente (uno por equipo, el mas antiguo).
  const atrasados = await query(
    `SELECT m.id_mantenimiento, m.id_equipo, m.tipo, m.detalle, m.fecha_mantenimiento
       FROM mantenimientos m
       JOIN equipos e ON e.id_equipo = m.id_equipo
       JOIN laboratorios l ON l.id_laboratorio = e.id_laboratorio
      WHERE m.estado = 'Pendiente' AND m.fecha_mantenimiento < CURDATE() AND l.estado = 'Activo' ${filtroInst}
        AND m.id_mantenimiento = (SELECT m2.id_mantenimiento FROM mantenimientos m2
                                   WHERE m2.id_equipo = m.id_equipo AND m2.estado = 'Pendiente' AND m2.fecha_mantenimiento < CURDATE()
                                   ORDER BY m2.fecha_mantenimiento, m2.id_mantenimiento LIMIT 1)`,
    pInst,
  );
  for (const m of atrasados) {
    const descripcion = `El mantenimiento ${m.tipo.toLowerCase()} N.º ${m.id_mantenimiento} estaba programado para el ${fechaTexto(m.fecha_mantenimiento)} y sigue pendiente: ${m.detalle}`;
    const id = await insertarSiNoExiste(m.id_equipo, TITULO_PROGRAMADO, descripcion.slice(0, 2000), 'Alta', 3);
    if (id) creadas.push(id);
  }

  for (const id of creadas) await notificarAlerta(id);
  return creadas;
}

async function verificar(req, res) {
  const creadas = await generarAlertasAutomaticas(req.user.idInstitucion);
  res.json({ creadas: creadas.length, alertas: await Promise.all(creadas.map((id) => obtenerAlerta(id, req.user.idInstitucion))) });
}

// Verificacion periodica (la inicia server.js).
function iniciarVerificacionPeriodica() {
  const minutos = Math.max(Number(process.env.ALERTAS_INTERVALO_MIN || 15), 1);
  const correr = () => generarAlertasAutomaticas()
    .then((ids) => { if (ids.length) console.log(`Alertas de mantenimiento: ${ids.length} nueva(s) detectada(s) por el sistema.`); })
    .catch((err) => console.warn(`No se pudo verificar las alertas de mantenimiento: ${err.message}`));
  setTimeout(correr, 5000).unref();
  setInterval(correr, minutos * 60000).unref();
}

module.exports = {
  listar, resumen, stream, verificar, generarAlertasAutomaticas, iniciarVerificacionPeriodica,
  notificarAlerta, notificarResueltas, obtenerAlerta, TITULO_PREVENTIVO, TITULO_PROGRAMADO,
};
