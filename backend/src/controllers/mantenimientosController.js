// Seccion unificada MANTENIMIENTOS.
// Reune en una sola API lo que antes eran "equipos con problemas" y "mantenimientos",
// reutilizando las tablas existentes sin combinarlas:
//   - equipos.estado            -> equipos fuera de servicio / en mantenimiento
//   - alertas                   -> problema detectado, severidad, proxima revision (fecha_limite)
//   - mantenimientos            -> intervenciones preventivas, correctivas y actualizaciones
//   - historial_acciones        -> fecha de registro y trazabilidad de cada intervencion
const { query, withTransaction } = require('../config/db');
const { HttpError } = require('../utils/httpError');
const { ROLES_GESTION_MANTENIMIENTO } = require('../utils/roles');
const { laboratoriosPermitidos, filtroLaboratorios, obtenerEquipoAutorizado } = require('../utils/acceso');
const { registrarAccion } = require('../utils/historial');
const {
  ESTADOS_EQUIPO, ESTADOS_PROBLEMA_EQUIPO, TIPOS_MANTENIMIENTO, ESTADOS_MANTENIMIENTO, SEVERIDADES,
  texto, enteroPositivo, fechaValida, enumOpcional,
} = require('../utils/validacion');

const SELECT_MANTENIMIENTO = `
  SELECT m.id_mantenimiento, m.id_equipo, m.id_usuario, m.fecha_mantenimiento, m.tipo, m.detalle,
         m.costo, m.notas_adicionales, m.estado,
         e.identificador AS equipo, e.estado AS estado_equipo, e.id_laboratorio, l.nombre AS laboratorio,
         CONCAT(u.nombre, ' ', u.apellido) AS responsable,
         (SELECT MIN(h.fecha_hora) FROM historial_acciones h
           WHERE h.entidad = 'Mantenimiento' AND h.accion = 'Crear' AND h.id_registro = m.id_mantenimiento) AS fecha_registro,
         (SELECT GROUP_CONCAT(a.titulo ORDER BY a.fecha_creacion SEPARATOR '; ') FROM alertas a
           WHERE a.id_equipo = m.id_equipo AND a.estado = 'Activa') AS problema_detectado,
         (SELECT MIN(a.fecha_limite) FROM alertas a
           WHERE a.id_equipo = m.id_equipo AND a.estado = 'Activa') AS proxima_revision
    FROM mantenimientos m
    JOIN equipos e ON e.id_equipo = m.id_equipo
    JOIN laboratorios l ON l.id_laboratorio = e.id_laboratorio
    JOIN usuarios u ON u.id_usuario = m.id_usuario`;

const puedeGestionar = (user) => ROLES_GESTION_MANTENIMIENTO.includes(user.rol);

function filtrosComunes(req, labs, where, params) {
  filtroLaboratorios(labs, 'e.id_laboratorio', where, params);
  if (req.query.laboratorio) {
    where.push('e.id_laboratorio = ?');
    params.push(enteroPositivo(req.query.laboratorio, 'El laboratorio'));
  }
  if (req.query.equipo) {
    where.push('e.id_equipo = ?');
    params.push(enteroPositivo(req.query.equipo, 'El equipo'));
  }
}

// ---------- Consultas ----------

async function resumen(req, res) {
  const labs = await laboratoriosPermitidos(req.user);
  const where = [];
  const params = [];
  filtrosComunes(req, labs, where, params);
  const w = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const [eq] = await query(
    `SELECT SUM(e.estado = 'Fuera de servicio') AS fuera_de_servicio,
            SUM(e.estado = 'En mantenimiento') AS en_mantenimiento,
            SUM(EXISTS (SELECT 1 FROM alertas a WHERE a.id_equipo = e.id_equipo AND a.estado = 'Activa')) AS con_problemas_activos
       FROM equipos e ${w}`,
    params,
  );
  const [mt] = await query(
    `SELECT SUM(m.estado = 'Pendiente') AS pendientes, SUM(m.estado = 'En proceso') AS en_proceso,
            SUM(m.estado = 'Completado') AS finalizados, SUM(m.tipo = 'Preventivo') AS preventivos,
            SUM(m.tipo = 'Correctivo') AS correctivos, SUM(m.tipo = 'Actualizacion') AS actualizaciones,
            COUNT(*) AS total
       FROM mantenimientos m JOIN equipos e ON e.id_equipo = m.id_equipo ${w}`,
    params,
  );
  const num = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, Number(v || 0)]));
  res.json({ equipos: num(eq), mantenimientos: num(mt) });
}

// Equipos con problemas: fuera de servicio, en mantenimiento, con alertas activas
// o con un mantenimiento correctivo sin finalizar (necesitan reparacion).
async function equiposConProblemas(req, res) {
  const labs = await laboratoriosPermitidos(req.user);
  const where = [];
  const params = [];
  filtrosComunes(req, labs, where, params);
  where.push(`(e.estado IN (?)
      OR EXISTS (SELECT 1 FROM alertas a WHERE a.id_equipo = e.id_equipo AND a.estado = 'Activa')
      OR EXISTS (SELECT 1 FROM mantenimientos m WHERE m.id_equipo = e.id_equipo
                  AND m.tipo = 'Correctivo' AND m.estado <> 'Completado'))`);
  params.push(ESTADOS_PROBLEMA_EQUIPO);

  const equipos = await query(
    `SELECT e.id_equipo, e.identificador, e.marca, e.modelo, e.estado, e.fecha_registro,
            e.id_laboratorio, l.nombre AS laboratorio, CONCAT(u.nombre, ' ', u.apellido) AS responsable
       FROM equipos e
       JOIN laboratorios l ON l.id_laboratorio = e.id_laboratorio
       LEFT JOIN usuarios u ON u.id_usuario = e.id_responsable
      WHERE ${where.join(' AND ')}
      ORDER BY FIELD(e.estado, 'En mantenimiento', 'Fuera de servicio') DESC, l.nombre, e.identificador`,
    params,
  );
  if (!equipos.length) return res.json([]);

  const ids = equipos.map((e) => e.id_equipo);
  const alertas = await query(
    `SELECT id_alerta, id_equipo, titulo, descripcion, severidad, fecha_creacion, fecha_limite, estado
       FROM alertas WHERE id_equipo IN (?) AND estado = 'Activa'
      ORDER BY FIELD(severidad, 'Critica', 'Alta', 'Media', 'Baja'), fecha_creacion`,
    [ids],
  );
  const abiertos = await query(
    `${SELECT_MANTENIMIENTO} WHERE m.id_equipo IN (?) AND m.estado <> 'Completado' ORDER BY m.fecha_mantenimiento DESC`,
    [ids],
  );

  const categoria = (e, a, m) => {
    if (e.estado === 'Fuera de servicio') return 'Fuera de servicio';
    if (e.estado === 'En mantenimiento') return 'En mantenimiento';
    if (a.length || m.some((x) => x.tipo === 'Correctivo')) return 'Necesita reparación';
    return 'Con problemas';
  };

  let resultado = equipos.map((e) => {
    const a = alertas.filter((x) => x.id_equipo === e.id_equipo);
    const m = abiertos.filter((x) => x.id_equipo === e.id_equipo);
    return {
      ...e,
      categoria: categoria(e, a, m),
      problemas: a,
      mantenimientos_abiertos: m,
      proxima_revision: a.map((x) => x.fecha_limite).filter(Boolean).sort()[0] || null,
    };
  });
  if (req.query.categoria) resultado = resultado.filter((e) => e.categoria === req.query.categoria);
  res.json(resultado);
}

async function listar(req, res) {
  const labs = await laboratoriosPermitidos(req.user);
  const where = [];
  const params = [];
  filtrosComunes(req, labs, where, params);
  const estado = enumOpcional(req.query.estado, ESTADOS_MANTENIMIENTO, 'El estado');
  if (estado) { where.push('m.estado = ?'); params.push(estado); }
  const tipo = enumOpcional(req.query.tipo, TIPOS_MANTENIMIENTO, 'El tipo de mantenimiento');
  if (tipo) { where.push('m.tipo = ?'); params.push(tipo); }
  if (req.query.desde) {
    if (!fechaValida(req.query.desde)) throw new HttpError(400, 'La fecha "desde" no es válida.');
    where.push('m.fecha_mantenimiento >= ?'); params.push(req.query.desde);
  }
  if (req.query.hasta) {
    if (!fechaValida(req.query.hasta)) throw new HttpError(400, 'La fecha "hasta" no es válida.');
    where.push('m.fecha_mantenimiento <= ?'); params.push(req.query.hasta);
  }
  const rows = await query(
    `${SELECT_MANTENIMIENTO} ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY FIELD(m.estado, 'Pendiente', 'En proceso', 'Completado'), m.fecha_mantenimiento DESC, m.id_mantenimiento DESC`,
    params,
  );
  res.json(rows);
}

async function obtenerMantenimientoAutorizado(user, id) {
  const rows = await query(`${SELECT_MANTENIMIENTO} WHERE m.id_mantenimiento = ?`, [id]);
  if (!rows.length) throw new HttpError(404, 'El mantenimiento no existe.');
  const labs = await laboratoriosPermitidos(user);
  if (labs !== null && !labs.includes(rows[0].id_laboratorio)) {
    throw new HttpError(403, 'No tenés acceso a ese laboratorio.');
  }
  return rows[0];
}

async function detalle(req, res) {
  res.json(await obtenerMantenimientoAutorizado(req.user, enteroPositivo(req.params.id, 'El mantenimiento')));
}

// Historial de intervenciones de un equipo: mantenimientos, problemas reportados y acciones registradas.
async function historialEquipo(req, res) {
  const id = enteroPositivo(req.params.idEquipo, 'El equipo');
  const equipo = await obtenerEquipoAutorizado(req.user, id);
  const [lab] = await query('SELECT nombre FROM laboratorios WHERE id_laboratorio = ?', [equipo.id_laboratorio]);
  const mantenimientos = await query(
    `${SELECT_MANTENIMIENTO} WHERE m.id_equipo = ? ORDER BY m.fecha_mantenimiento DESC, m.id_mantenimiento DESC`,
    [id],
  );
  const problemas = await query(
    'SELECT * FROM alertas WHERE id_equipo = ? ORDER BY fecha_creacion DESC',
    [id],
  );
  const idsM = mantenimientos.map((m) => m.id_mantenimiento);
  const idsA = problemas.map((a) => a.id_alerta);
  const acciones = await query(
    `SELECT h.id_accion, h.accion, h.entidad, h.id_registro, h.detalle, h.fecha_hora,
            CONCAT(u.nombre, ' ', u.apellido) AS usuario
       FROM historial_acciones h JOIN usuarios u ON u.id_usuario = h.id_usuario
      WHERE (h.entidad = 'Equipo' AND h.id_registro = ?)
         OR (h.entidad = 'Mantenimiento' AND h.id_registro IN (?))
         OR (h.entidad = 'Alerta' AND h.id_registro IN (?))
      ORDER BY h.fecha_hora DESC, h.id_accion DESC`,
    [id, idsM.length ? idsM : [0], idsA.length ? idsA : [0]],
  );
  res.json({
    equipo: {
      id_equipo: equipo.id_equipo, identificador: equipo.identificador, marca: equipo.marca,
      modelo: equipo.modelo, estado: equipo.estado, fecha_registro: equipo.fecha_registro,
      id_laboratorio: equipo.id_laboratorio, laboratorio: lab?.nombre,
    },
    mantenimientos, problemas, acciones,
  });
}

// ---------- Altas y modificaciones ----------

function leerCampos(body, parcial) {
  const out = {};
  const errores = [];
  const presente = (k) => body[k] !== undefined;

  if (!parcial || presente('fecha_mantenimiento')) {
    if (!fechaValida(body.fecha_mantenimiento)) errores.push('Indicá una fecha de mantenimiento válida (AAAA-MM-DD).');
    else out.fecha_mantenimiento = body.fecha_mantenimiento;
  }
  if (!parcial || presente('tipo')) {
    if (!TIPOS_MANTENIMIENTO.includes(body.tipo)) errores.push('Seleccioná el tipo: Preventivo, Correctivo o Actualizacion.');
    else out.tipo = body.tipo;
  }
  if (!parcial || presente('detalle')) {
    const d = texto(body.detalle);
    if (!d) errores.push('La descripción del mantenimiento es obligatoria.');
    else out.detalle = d;
  }
  if (presente('costo')) {
    if (body.costo === null || body.costo === '') out.costo = null;
    else {
      const c = Number(body.costo);
      if (!Number.isFinite(c) || c < 0 || c >= 1e8) errores.push('El costo debe ser un número mayor o igual a 0.');
      else out.costo = Math.round(c * 100) / 100;
    }
  }
  if (presente('notas_adicionales')) out.notas_adicionales = texto(body.notas_adicionales) || null;
  if (!parcial || presente('estado')) {
    const e = body.estado === undefined || body.estado === '' ? (parcial ? undefined : 'Pendiente') : body.estado;
    if (!ESTADOS_MANTENIMIENTO.includes(e)) errores.push('El estado debe ser Pendiente, En proceso o Completado.');
    else out.estado = e;
  }
  let estadoEquipo = null;
  try { estadoEquipo = enumOpcional(body.estado_equipo, ESTADOS_EQUIPO, 'El estado del equipo'); } catch (e) { errores.push(e.message); }

  if (errores.length) throw new HttpError(400, errores[0], errores);
  return { campos: out, estadoEquipo, resolverProblemas: body.resolver_problemas === true };
}

async function aplicarEfectosEnEquipo(conn, user, idEquipo, { estadoEquipo, resolverProblemas, estado }) {
  if (estadoEquipo) {
    await conn.query('UPDATE equipos SET estado = ? WHERE id_equipo = ?', [estadoEquipo, idEquipo]);
    await registrarAccion(conn, {
      idUsuario: user.id, accion: 'Modificar', entidad: 'Equipo', idRegistro: idEquipo,
      detalle: `Estado del equipo actualizado a "${estadoEquipo}" desde Mantenimientos.`,
    });
  }
  if (resolverProblemas) {
    if (estado !== 'Completado') {
      throw new HttpError(400, 'Solo se pueden marcar los problemas como resueltos al completar el mantenimiento.');
    }
    const [activas] = await conn.query("SELECT id_alerta FROM alertas WHERE id_equipo = ? AND estado = 'Activa'", [idEquipo]);
    for (const a of activas) {
      await conn.query("UPDATE alertas SET estado = 'Resuelta' WHERE id_alerta = ?", [a.id_alerta]);
      await registrarAccion(conn, {
        idUsuario: user.id, accion: 'Modificar', entidad: 'Alerta', idRegistro: a.id_alerta,
        detalle: 'Problema marcado como resuelto al completar el mantenimiento.',
      });
    }
  }
}

async function crear(req, res) {
  const idEquipo = enteroPositivo(req.body?.id_equipo, 'El equipo');
  const { campos, estadoEquipo, resolverProblemas } = leerCampos(req.body || {}, false);
  await obtenerEquipoAutorizado(req.user, idEquipo);

  const dup = await query(
    'SELECT id_mantenimiento FROM mantenimientos WHERE id_equipo = ? AND fecha_mantenimiento = ? AND tipo = ? AND detalle = ?',
    [idEquipo, campos.fecha_mantenimiento, campos.tipo, campos.detalle],
  );
  if (dup.length) {
    throw new HttpError(409, `Ya existe un mantenimiento idéntico para este equipo (N.º ${dup[0].id_mantenimiento}).`);
  }

  const id = await withTransaction(async (conn) => {
    const [r] = await conn.query(
      `INSERT INTO mantenimientos (id_equipo, id_usuario, fecha_mantenimiento, tipo, detalle, costo, notas_adicionales, estado)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [idEquipo, req.user.id, campos.fecha_mantenimiento, campos.tipo, campos.detalle,
        campos.costo ?? null, campos.notas_adicionales ?? null, campos.estado],
    );
    await registrarAccion(conn, {
      idUsuario: req.user.id, accion: 'Crear', entidad: 'Mantenimiento', idRegistro: r.insertId,
      detalle: `Mantenimiento ${campos.tipo.toLowerCase()} registrado (${campos.estado}).`,
    });
    await aplicarEfectosEnEquipo(conn, req.user, idEquipo, { estadoEquipo, resolverProblemas, estado: campos.estado });
    return r.insertId;
  });
  res.status(201).json(await obtenerMantenimientoAutorizado(req.user, id));
}

async function actualizar(req, res) {
  const id = enteroPositivo(req.params.id, 'El mantenimiento');
  const actual = await obtenerMantenimientoAutorizado(req.user, id);
  if (req.body?.id_equipo !== undefined && Number(req.body.id_equipo) !== actual.id_equipo) {
    throw new HttpError(400, 'No se puede cambiar el equipo de un mantenimiento registrado.');
  }
  const { campos, estadoEquipo, resolverProblemas } = leerCampos(req.body || {}, true);
  if (!Object.keys(campos).length && !estadoEquipo && !resolverProblemas) {
    throw new HttpError(400, 'No se indicaron cambios.');
  }
  const final = { ...actual, ...campos };
  if (campos.fecha_mantenimiento || campos.tipo || campos.detalle) {
    const dup = await query(
      `SELECT id_mantenimiento FROM mantenimientos
        WHERE id_equipo = ? AND fecha_mantenimiento = ? AND tipo = ? AND detalle = ? AND id_mantenimiento <> ?`,
      [actual.id_equipo, final.fecha_mantenimiento, final.tipo, final.detalle, id],
    );
    if (dup.length) throw new HttpError(409, `Los cambios duplicarían el mantenimiento N.º ${dup[0].id_mantenimiento}.`);
  }

  await withTransaction(async (conn) => {
    if (Object.keys(campos).length) {
      await conn.query('UPDATE mantenimientos SET ? WHERE id_mantenimiento = ?', [campos, id]);
      const cambios = Object.keys(campos).map((k) => (k === 'estado' ? `estado: ${actual.estado} → ${campos.estado}` : k));
      await registrarAccion(conn, {
        idUsuario: req.user.id, accion: 'Modificar', entidad: 'Mantenimiento', idRegistro: id,
        detalle: `Actualización (${cambios.join(', ')}).`,
      });
    }
    await aplicarEfectosEnEquipo(conn, req.user, actual.id_equipo, { estadoEquipo, resolverProblemas, estado: final.estado });
  });
  res.json(await obtenerMantenimientoAutorizado(req.user, id));
}

async function cambiarEstado(req, res) {
  if (!ESTADOS_MANTENIMIENTO.includes(req.body?.estado)) {
    throw new HttpError(400, 'El estado debe ser Pendiente, En proceso o Completado.');
  }
  req.body = {
    estado: req.body.estado,
    estado_equipo: req.body.estado_equipo,
    resolver_problemas: req.body.resolver_problemas,
  };
  return actualizar(req, res);
}

// Reporte de un problema detectado en un equipo (tabla alertas).
async function reportarProblema(req, res) {
  const b = req.body || {};
  const idEquipo = enteroPositivo(b.id_equipo, 'El equipo');
  const titulo = texto(b.titulo);
  const descripcion = texto(b.descripcion);
  const errores = [];
  if (!titulo) errores.push('Indicá el problema detectado.');
  if (titulo.length > 150) errores.push('El problema admite hasta 150 caracteres.');
  if (!descripcion) errores.push('Describí el problema.');
  const severidad = b.severidad || 'Media';
  if (!SEVERIDADES.includes(severidad)) errores.push('La severidad debe ser Baja, Media, Alta o Critica.');
  if (b.fecha_limite && !fechaValida(b.fecha_limite)) errores.push('La fecha de próxima revisión no es válida.');
  let estadoEquipo = null;
  try { estadoEquipo = enumOpcional(b.estado_equipo, ESTADOS_EQUIPO, 'El estado del equipo'); } catch (e) { errores.push(e.message); }
  if (errores.length) throw new HttpError(400, errores[0], errores);
  if (estadoEquipo && !puedeGestionar(req.user)) {
    throw new HttpError(403, 'Tu rol puede reportar problemas, pero no cambiar el estado del equipo.');
  }

  await obtenerEquipoAutorizado(req.user, idEquipo);
  const dup = await query(
    "SELECT id_alerta FROM alertas WHERE id_equipo = ? AND estado = 'Activa' AND titulo = ?",
    [idEquipo, titulo],
  );
  if (dup.length) throw new HttpError(409, 'Ese problema ya está reportado y activo para este equipo.');

  const id = await withTransaction(async (conn) => {
    const [r] = await conn.query(
      'INSERT INTO alertas (id_equipo, titulo, descripcion, severidad, fecha_limite) VALUES (?, ?, ?, ?, ?)',
      [idEquipo, titulo, descripcion, severidad, b.fecha_limite || null],
    );
    await registrarAccion(conn, {
      idUsuario: req.user.id, accion: 'Crear', entidad: 'Alerta', idRegistro: r.insertId,
      detalle: `Problema reportado: ${titulo}.`,
    });
    await aplicarEfectosEnEquipo(conn, req.user, idEquipo, { estadoEquipo });
    return r.insertId;
  });
  const [alerta] = await query('SELECT * FROM alertas WHERE id_alerta = ?', [id]);
  res.status(201).json(alerta);
}

async function resolverProblema(req, res) {
  const id = enteroPositivo(req.params.id, 'El problema');
  const rows = await query('SELECT * FROM alertas WHERE id_alerta = ?', [id]);
  if (!rows.length) throw new HttpError(404, 'El problema no existe.');
  await obtenerEquipoAutorizado(req.user, rows[0].id_equipo);
  if (rows[0].estado === 'Resuelta') throw new HttpError(409, 'El problema ya estaba resuelto.');
  const estadoEquipo = enumOpcional(req.body?.estado_equipo, ESTADOS_EQUIPO, 'El estado del equipo');
  await withTransaction(async (conn) => {
    await conn.query("UPDATE alertas SET estado = 'Resuelta' WHERE id_alerta = ?", [id]);
    await registrarAccion(conn, {
      idUsuario: req.user.id, accion: 'Modificar', entidad: 'Alerta', idRegistro: id,
      detalle: 'Problema marcado como resuelto.',
    });
    await aplicarEfectosEnEquipo(conn, req.user, rows[0].id_equipo, { estadoEquipo });
  });
  const [alerta] = await query('SELECT * FROM alertas WHERE id_alerta = ?', [id]);
  res.json(alerta);
}

module.exports = {
  resumen, equiposConProblemas, listar, detalle, historialEquipo,
  crear, actualizar, cambiarEstado, reportarProblema, resolverProblema,
};
