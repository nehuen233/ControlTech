// Equipos: listado, ficha completa, alta y edicion (tablas `equipos`, `equipo_software`,
// `software` y `licencias`).
const { query, withTransaction } = require('../config/db');
const { HttpError } = require('../utils/httpError');
const { laboratoriosPermitidos, filtroLaboratorios, verificarAccesoLaboratorio, obtenerEquipoAutorizado } = require('../utils/acceso');
const { registrarAccion } = require('../utils/historial');
const { ESTADOS_EQUIPO, enumOpcional, texto, enteroPositivo, fechaValida } = require('../utils/validacion');

const LIMITES = {
  identificador: 50, nro_serie: 100, tipo: 80, marca: 80, modelo: 100, procesador: 100, ram: 50, almacenamiento: 100,
};
const ETIQUETAS = {
  identificador: 'El identificador', nro_serie: 'El número de serie', tipo: 'El tipo', marca: 'La marca',
  modelo: 'El modelo', procesador: 'El procesador', ram: 'La memoria RAM', almacenamiento: 'El almacenamiento',
};

const SELECT_EQUIPO = `
  SELECT e.id_equipo, e.identificador, e.nro_serie, e.tipo, e.marca, e.modelo, e.procesador, e.ram,
         e.almacenamiento, e.estado, e.fecha_registro, e.id_laboratorio, l.nombre AS laboratorio,
         e.id_responsable, CONCAT(u.nombre, ' ', u.apellido) AS responsable
    FROM equipos e
    JOIN laboratorios l ON l.id_laboratorio = e.id_laboratorio
    LEFT JOIN usuarios u ON u.id_usuario = e.id_responsable`;

async function listar(req, res) {
  const labs = await laboratoriosPermitidos(req.user);
  const where = [];
  const params = [];
  filtroLaboratorios(labs, 'e.id_laboratorio', where, params);
  if (req.query.laboratorio) { where.push('e.id_laboratorio = ?'); params.push(enteroPositivo(req.query.laboratorio, 'El laboratorio')); }
  const estado = enumOpcional(req.query.estado, ESTADOS_EQUIPO, 'El estado');
  if (estado) { where.push('e.estado = ?'); params.push(estado); }
  const q = texto(req.query.q);
  if (q) { where.push('(e.identificador LIKE ? OR e.nro_serie LIKE ? OR e.marca LIKE ? OR e.modelo LIKE ?)'); params.push(...Array(4).fill(`%${q}%`)); }
  const rows = await query(
    `${SELECT_EQUIPO} ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY l.nombre, e.identificador`,
    params,
  );
  res.json(rows);
}

async function obtenerFicha(id) {
  const [equipo] = await query(`${SELECT_EQUIPO} WHERE e.id_equipo = ?`, [id]);
  const software = await query(
    `SELECT s.id_software, s.nombre_software, s.version, s.proveedor, es.fecha_instalacion,
            li.tipo_licencia, li.estado AS estado_licencia, li.fecha_vencimiento
       FROM equipo_software es
       JOIN software s ON s.id_software = es.id_software
       LEFT JOIN licencias li ON li.id_licencia = (
         SELECT l2.id_licencia FROM licencias l2 WHERE l2.id_software = s.id_software
          ORDER BY FIELD(l2.estado, 'Activa') DESC, l2.fecha_vencimiento DESC LIMIT 1)
      WHERE es.id_equipo = ?
      ORDER BY s.nombre_software`,
    [id],
  );
  const [mant] = await query(
    `SELECT COUNT(*) AS total, SUM(estado <> 'Completado') AS abiertos, MAX(fecha_mantenimiento) AS ultimo
       FROM mantenimientos WHERE id_equipo = ?`,
    [id],
  );
  const recientes = await query(
    `SELECT m.id_mantenimiento, m.fecha_mantenimiento, m.tipo, m.estado, m.detalle,
            CONCAT(u.nombre, ' ', u.apellido) AS responsable
       FROM mantenimientos m JOIN usuarios u ON u.id_usuario = m.id_usuario
      WHERE m.id_equipo = ? ORDER BY m.fecha_mantenimiento DESC, m.id_mantenimiento DESC LIMIT 5`,
    [id],
  );
  const problemas = await query(
    "SELECT id_alerta, titulo, severidad, fecha_creacion, fecha_limite FROM alertas WHERE id_equipo = ? AND estado = 'Activa' ORDER BY fecha_creacion DESC",
    [id],
  );
  return {
    ...equipo,
    software,
    mantenimientos: {
      total: Number(mant.total || 0), abiertos: Number(mant.abiertos || 0), ultimo: mant.ultimo, recientes,
    },
    problemas_activos: problemas,
  };
}

async function detalle(req, res) {
  const id = enteroPositivo(req.params.id, 'El equipo');
  await obtenerEquipoAutorizado(req.user, id);
  res.json(await obtenerFicha(id));
}

// ---------- Alta y edicion ----------

function leerCampos(body, parcial) {
  const out = {};
  const errores = [];
  const presente = (k) => body[k] !== undefined;

  for (const k of ['identificador', 'nro_serie', 'marca']) {
    if (!parcial || presente(k)) {
      const v = texto(body[k]);
      if (!v) errores.push(k === 'marca' ? 'La marca es obligatoria.' : `${ETIQUETAS[k]} es obligatorio.`);
      else out[k] = k === 'marca' ? v : v.toUpperCase();
    }
  }
  if (!parcial || presente('tipo')) out.tipo = texto(body.tipo) || 'Computadora';
  for (const k of ['modelo', 'procesador', 'ram', 'almacenamiento']) {
    if (presente(k)) out[k] = texto(body[k]) || null;
  }
  for (const [k, max] of Object.entries(LIMITES)) {
    if (out[k] && out[k].length > max) errores.push(`${ETIQUETAS[k]} admite hasta ${max} caracteres.`);
  }
  if (!parcial || presente('estado')) {
    const e = body.estado === undefined || body.estado === '' ? (parcial ? undefined : 'Operativo') : body.estado;
    if (!ESTADOS_EQUIPO.includes(e)) errores.push(`El estado debe ser uno de: ${ESTADOS_EQUIPO.join(', ')}.`);
    else out.estado = e;
  }
  if (!parcial || presente('id_laboratorio')) {
    const n = Number(body.id_laboratorio);
    if (!Number.isInteger(n) || n <= 0) errores.push('Seleccioná el laboratorio del equipo.');
    else out.id_laboratorio = n;
  }
  if (presente('id_responsable')) {
    if (body.id_responsable === null || body.id_responsable === '') out.id_responsable = null;
    else {
      const n = Number(body.id_responsable);
      if (!Number.isInteger(n) || n <= 0) errores.push('El responsable no es válido.');
      else out.id_responsable = n;
    }
  }

  let software;
  if (presente('software')) {
    if (!Array.isArray(body.software)) errores.push('La lista de software no es válida.');
    else {
      software = [];
      const vistos = new Set();
      for (const item of body.software) {
        const idS = Number(item?.id_software);
        if (!Number.isInteger(idS) || idS <= 0) { errores.push('Algún software indicado no es válido.'); break; }
        if (vistos.has(idS)) continue;
        vistos.add(idS);
        const f = item.fecha_instalacion || null;
        if (f && !fechaValida(f)) { errores.push('La fecha de instalación del software no es válida.'); break; }
        software.push([idS, f]);
      }
    }
  }
  if (errores.length) throw new HttpError(400, errores[0], errores);
  return { campos: out, software };
}

// idLab: laboratorio de destino. validarLab: true cuando el equipo entra a ese laboratorio
// (alta o traslado), para controlar acceso, estado y capacidad.
async function validarReferencias(user, { idLab, validarLab, idResponsable, software, idEquipo }) {
  if (validarLab) {
    const [lab] = await query(
      `SELECT l.id_laboratorio, l.nombre, l.estado, l.capacidad_equipos,
              (SELECT COUNT(*) FROM equipos e WHERE e.id_laboratorio = l.id_laboratorio AND e.id_equipo <> ?) AS ocupados
         FROM laboratorios l WHERE l.id_laboratorio = ?`,
      [idEquipo || 0, idLab],
    );
    if (!lab) throw new HttpError(400, 'El laboratorio indicado no existe.');
    await verificarAccesoLaboratorio(user, lab.id_laboratorio);
    if (lab.estado !== 'Activo') throw new HttpError(400, `El ${lab.nombre} está inactivo; no se le pueden asignar equipos.`);
    if (lab.capacidad_equipos != null && Number(lab.ocupados) >= lab.capacidad_equipos) {
      throw new HttpError(409, `El ${lab.nombre} alcanzó su capacidad máxima (${lab.capacidad_equipos} equipos).`);
    }
  }
  if (idResponsable && !(await asignadoAlLaboratorio(idResponsable, idLab))) {
    throw new HttpError(400, 'El responsable debe ser un usuario asignado al laboratorio del equipo.');
  }
  if (software?.length) {
    const ids = software.map(([idS]) => idS);
    const rows = await query('SELECT id_software FROM software WHERE id_software IN (?)', [ids]);
    if (rows.length !== ids.length) throw new HttpError(400, 'Algún software indicado no existe.');
  }
}

async function asignadoAlLaboratorio(idUsuario, idLab) {
  const rows = await query('SELECT 1 FROM usuario_laboratorio WHERE id_usuario = ? AND id_laboratorio = ?', [idUsuario, idLab]);
  return rows.length > 0;
}

async function verificarUnicos(campos, idEquipo) {
  for (const k of ['identificador', 'nro_serie']) {
    if (!campos[k]) continue;
    const rows = await query(
      `SELECT identificador FROM equipos WHERE ${k} = ? AND id_equipo <> ?`,
      [campos[k], idEquipo || 0],
    );
    if (rows.length) {
      throw new HttpError(409, k === 'identificador'
        ? `Ya existe un equipo con el identificador ${campos[k]}.`
        : `El número de serie ${campos[k]} ya está registrado en el equipo ${rows[0].identificador}.`);
    }
  }
}

async function guardarSoftware(conn, idEquipo, software) {
  if (software === undefined) return;
  await conn.query('DELETE FROM equipo_software WHERE id_equipo = ?', [idEquipo]);
  if (software.length) {
    await conn.query(
      'INSERT INTO equipo_software (id_equipo, id_software, fecha_instalacion) VALUES ?',
      [software.map(([idS, f]) => [idEquipo, idS, f])],
    );
  }
}

async function crear(req, res) {
  const { campos, software } = leerCampos(req.body || {}, false);
  await validarReferencias(req.user, {
    idLab: campos.id_laboratorio, validarLab: true, idResponsable: campos.id_responsable, software,
  });
  await verificarUnicos(campos);
  const id = await withTransaction(async (conn) => {
    const [r] = await conn.query('INSERT INTO equipos SET ?', [campos]);
    await guardarSoftware(conn, r.insertId, software);
    await registrarAccion(conn, {
      idUsuario: req.user.id, accion: 'Crear', entidad: 'Equipo', idRegistro: r.insertId,
      detalle: `Alta del equipo ${campos.identificador}.`,
    });
    return r.insertId;
  });
  res.status(201).json(await obtenerFicha(id));
}

async function actualizar(req, res) {
  const id = enteroPositivo(req.params.id, 'El equipo');
  const actual = await obtenerEquipoAutorizado(req.user, id);
  const { campos, software } = leerCampos(req.body || {}, true);
  if (!Object.keys(campos).length && software === undefined) throw new HttpError(400, 'No se indicaron cambios.');

  const idLab = campos.id_laboratorio ?? actual.id_laboratorio;
  const cambiaLab = idLab !== actual.id_laboratorio;
  await validarReferencias(req.user, {
    idLab, validarLab: cambiaLab, idResponsable: campos.id_responsable, software, idEquipo: id,
  });
  // Al trasladar el equipo, si el responsable anterior no tiene acceso al nuevo laboratorio queda sin responsable.
  if (cambiaLab && campos.id_responsable === undefined && actual.id_responsable
      && !(await asignadoAlLaboratorio(actual.id_responsable, idLab))) {
    campos.id_responsable = null;
  }
  await verificarUnicos(campos, id);

  await withTransaction(async (conn) => {
    if (Object.keys(campos).length) await conn.query('UPDATE equipos SET ? WHERE id_equipo = ?', [campos, id]);
    await guardarSoftware(conn, id, software);
    const cambios = [...Object.keys(campos), ...(software !== undefined ? ['software'] : [])];
    await registrarAccion(conn, {
      idUsuario: req.user.id, accion: 'Modificar', entidad: 'Equipo', idRegistro: id,
      detalle: `Actualización de datos del equipo (${cambios.join(', ')}).`,
    });
  });
  res.json(await obtenerFicha(id));
}

module.exports = { listar, detalle, crear, actualizar };
