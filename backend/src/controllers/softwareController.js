// Software de cada laboratorio. No existe una relacion directa laboratorio-software en el
// modelo: el software de un laboratorio es el instalado en sus equipos (`equipo_software`).
// Las licencias salen de la tabla `licencias` (una por software: se usa la activa o la mas reciente).
const { query, withTransaction } = require('../config/db');
const { HttpError } = require('../utils/httpError');
const { ROLES, ROLES_GESTION_MANTENIMIENTO } = require('../utils/roles');
const { verificarAccesoLaboratorio } = require('../utils/acceso');
const { registrarAccion } = require('../utils/historial');
const { texto, enteroPositivo, fechaValida } = require('../utils/validacion');

const TIPOS_LICENCIA = ['Gratuita', 'Pago', 'Prueba'];
const ESTADOS_LICENCIA = ['Activa', 'Vencida', 'Suspendida'];

const esAdmin = (user) => user.rol === ROLES.ADMIN;
const puedeVerClave = (user) => ROLES_GESTION_MANTENIMIENTO.includes(user.rol);

// Licencia vigente de cada software: la activa con vencimiento mas lejano, o la mas reciente.
const JOIN_LICENCIA = `
  LEFT JOIN licencias li ON li.id_licencia = (
    SELECT l2.id_licencia FROM licencias l2 WHERE l2.id_software = s.id_software
     ORDER BY FIELD(l2.estado, 'Activa') DESC, l2.fecha_vencimiento IS NULL, l2.fecha_vencimiento DESC, l2.id_licencia DESC
     LIMIT 1)`;

function formatear(row, user) {
  const out = {
    id_software: row.id_software,
    nombre_software: row.nombre_software,
    version: row.version,
    proveedor: row.proveedor,
    descripcion: row.descripcion,
    licencia: row.id_licencia ? {
      id_licencia: row.id_licencia,
      tipo_licencia: row.tipo_licencia,
      numero_licencia: row.numero_licencia,
      fecha_vencimiento: row.fecha_vencimiento,
      estado: row.estado_licencia,
    } : null,
  };
  if (out.licencia && !puedeVerClave(user)) delete out.licencia.numero_licencia;
  if ('instalaciones' in row) {
    out.instalaciones = Number(row.instalaciones || 0);
    out.equipos = row.equipos ? row.equipos.split(',').map(Number) : [];
    out.ultima_instalacion = row.ultima_instalacion;
  }
  return out;
}

async function obtenerLaboratorio(user, idLab) {
  const [lab] = await query('SELECT id_laboratorio, nombre, estado FROM laboratorios WHERE id_laboratorio = ?', [idLab]);
  if (!lab) throw new HttpError(404, 'El laboratorio no existe.');
  await verificarAccesoLaboratorio(user, idLab);
  return lab;
}

async function softwareDelLaboratorio(idLab, user, idSoftware) {
  const rows = await query(
    `SELECT s.id_software, s.nombre_software, s.version, s.proveedor, s.descripcion,
            li.id_licencia, li.tipo_licencia, li.numero_licencia, li.fecha_vencimiento, li.estado AS estado_licencia,
            COUNT(DISTINCT e.id_equipo) AS instalaciones,
            GROUP_CONCAT(DISTINCT e.id_equipo ORDER BY e.id_equipo) AS equipos,
            MAX(es.fecha_instalacion) AS ultima_instalacion
       FROM equipo_software es
       JOIN equipos e ON e.id_equipo = es.id_equipo
       JOIN software s ON s.id_software = es.id_software
       ${JOIN_LICENCIA}
      WHERE e.id_laboratorio = ? ${idSoftware ? 'AND s.id_software = ?' : ''}
      GROUP BY s.id_software, li.id_licencia
      ORDER BY s.nombre_software, s.version`,
    idSoftware ? [idLab, idSoftware] : [idLab],
  );
  return rows.map((r) => formatear(r, user));
}

// ---------- Consultas ----------

async function catalogo(req, res) {
  const rows = await query(
    `SELECT s.id_software, s.nombre_software, s.version, s.proveedor, s.descripcion,
            li.id_licencia, li.tipo_licencia, li.numero_licencia, li.fecha_vencimiento, li.estado AS estado_licencia
       FROM software s ${JOIN_LICENCIA}
      ORDER BY s.nombre_software, s.version`,
  );
  res.json(rows.map((r) => {
    const f = formatear(r, req.user);
    // Compatibilidad con el formulario de equipos.
    f.tipo_licencia = f.licencia?.tipo_licencia || null;
    return f;
  }));
}

async function listarDeLaboratorio(req, res) {
  const idLab = enteroPositivo(req.params.id, 'El laboratorio');
  await obtenerLaboratorio(req.user, idLab);
  res.json(await softwareDelLaboratorio(idLab, req.user));
}

// ---------- Validaciones ----------

function leerDatosSoftware(d, parcial) {
  const out = {};
  const errores = [];
  const presente = (k) => d[k] !== undefined;
  if (!parcial || presente('nombre_software')) {
    const n = texto(d.nombre_software);
    if (!n) errores.push('El nombre del software es obligatorio.');
    else if (n.length > 100) errores.push('El nombre admite hasta 100 caracteres.');
    else out.nombre_software = n;
  }
  for (const [k, max] of [['version', 50], ['proveedor', 100]]) {
    if (presente(k)) {
      const v = texto(d[k]) || null;
      if (v && v.length > max) errores.push(`El campo ${k} admite hasta ${max} caracteres.`);
      else out[k] = v;
    }
  }
  if (presente('descripcion')) out.descripcion = texto(d.descripcion) || null;
  return { datos: out, errores };
}

function leerLicencia(l) {
  if (l === undefined) return { licencia: undefined, errores: [] };
  if (l === null) return { licencia: null, errores: [] };
  const errores = [];
  const out = {};
  if (!TIPOS_LICENCIA.includes(l.tipo_licencia)) errores.push('El tipo de licencia debe ser Gratuita, Pago o Prueba.');
  else out.tipo_licencia = l.tipo_licencia;
  const numero = texto(l.numero_licencia) || null;
  if (numero && numero.length > 150) errores.push('La clave de licencia admite hasta 150 caracteres.');
  out.numero_licencia = numero;
  if (l.fecha_vencimiento && !fechaValida(l.fecha_vencimiento)) errores.push('La fecha de vencimiento de la licencia no es válida.');
  out.fecha_vencimiento = l.fecha_vencimiento || null;
  const estado = l.estado || 'Activa';
  if (!ESTADOS_LICENCIA.includes(estado)) errores.push('El estado de la licencia debe ser Activa, Vencida o Suspendida.');
  else out.estado = estado;
  return { licencia: out, errores };
}

// equipos: lista de IDs del laboratorio, o "todos".
async function resolverEquipos(idLab, equipos) {
  const delLab = await query('SELECT id_equipo FROM equipos WHERE id_laboratorio = ? ORDER BY id_equipo', [idLab]);
  const ids = delLab.map((e) => e.id_equipo);
  if (equipos === 'todos' || equipos === undefined) return ids;
  if (!Array.isArray(equipos)) throw new HttpError(400, 'La lista de equipos no es válida.');
  const pedidos = [...new Set(equipos.map((v) => enteroPositivo(v, 'El equipo')))];
  const ajenos = pedidos.filter((id) => !ids.includes(id));
  if (ajenos.length) throw new HttpError(400, 'Algún equipo indicado no pertenece a este laboratorio.');
  return pedidos;
}

async function verificarClaveUnica(conn, numero, idLicenciaPropia) {
  if (!numero) return;
  const [rows] = await conn.query(
    'SELECT id_licencia FROM licencias WHERE numero_licencia = ? AND id_licencia <> ?',
    [numero, idLicenciaPropia || 0],
  );
  if (rows.length) throw new HttpError(409, 'Esa clave de licencia ya está registrada en otro software.');
}

async function guardarLicencia(conn, idSoftware, licencia) {
  if (licencia === undefined) return;
  const [[actual]] = await conn.query(
    `SELECT li.id_licencia FROM software s ${JOIN_LICENCIA} WHERE s.id_software = ?`,
    [idSoftware],
  );
  if (licencia === null) return; // No se eliminan licencias registradas.
  await verificarClaveUnica(conn, licencia.numero_licencia, actual?.id_licencia);
  if (actual?.id_licencia) {
    await conn.query('UPDATE licencias SET ? WHERE id_licencia = ?', [licencia, actual.id_licencia]);
  } else {
    await conn.query('INSERT INTO licencias SET ?', [{ ...licencia, id_software: idSoftware }]);
  }
}

// ---------- Alta: elegir del catalogo o crear uno nuevo, e instalarlo en equipos del laboratorio ----------

async function agregarALaboratorio(req, res) {
  const idLab = enteroPositivo(req.params.id, 'El laboratorio');
  const lab = await obtenerLaboratorio(req.user, idLab);
  const b = req.body || {};
  const fecha = b.fecha_instalacion || null;
  if (fecha && !fechaValida(fecha)) throw new HttpError(400, 'La fecha de instalación no es válida.');

  let idSoftware = null;
  let nuevo = null;
  let licencia;
  if (b.id_software !== undefined && b.id_software !== null && b.id_software !== '') {
    idSoftware = enteroPositivo(b.id_software, 'El software');
    const [s] = await query('SELECT id_software FROM software WHERE id_software = ?', [idSoftware]);
    if (!s) throw new HttpError(400, 'El software elegido no existe en el catálogo.');
  } else {
    const r = leerDatosSoftware(b.software || {}, false);
    const l = leerLicencia(b.licencia === undefined ? undefined : b.licencia);
    const errores = [...r.errores, ...l.errores];
    if (errores.length) throw new HttpError(400, errores[0], errores);
    nuevo = r.datos;
    licencia = l.licencia;
    const [dup] = await query(
      'SELECT id_software FROM software WHERE LOWER(nombre_software) = LOWER(?) AND COALESCE(version, \'\') = COALESCE(?, \'\')',
      [nuevo.nombre_software, nuevo.version ?? null],
    );
    if (dup) throw new HttpError(409, `${nuevo.nombre_software}${nuevo.version ? ` ${nuevo.version}` : ''} ya existe en el catálogo: elegilo de la lista.`);
  }

  const equipos = await resolverEquipos(idLab, b.equipos);
  if (!equipos.length) throw new HttpError(400, 'Elegí al menos un equipo del laboratorio para instalar el software.');

  const resultado = await withTransaction(async (conn) => {
    if (nuevo) {
      const [r] = await conn.query('INSERT INTO software SET ?', [nuevo]);
      idSoftware = r.insertId;
      await guardarLicencia(conn, idSoftware, licencia);
      await registrarAccion(conn, {
        idUsuario: req.user.id, accion: 'Crear', entidad: 'Software', idRegistro: idSoftware,
        detalle: `Alta de ${nuevo.nombre_software} en el catálogo de software.`,
      });
    }
    const [r] = await conn.query(
      'INSERT IGNORE INTO equipo_software (id_equipo, id_software, fecha_instalacion) VALUES ?',
      [equipos.map((idE) => [idE, idSoftware, fecha])],
    );
    if (!r.affectedRows) throw new HttpError(409, 'Ese software ya estaba instalado en todos los equipos elegidos.');
    await registrarAccion(conn, {
      idUsuario: req.user.id, accion: 'Crear', entidad: 'Software', idRegistro: idSoftware,
      detalle: `Instalación en ${r.affectedRows} equipo(s) del ${lab.nombre}.`,
    });
    return r.affectedRows;
  });

  const [item] = await softwareDelLaboratorio(idLab, req.user, idSoftware);
  res.status(201).json({ ...item, instalados_ahora: resultado });
}

// ---------- Edicion: equipos donde esta instalado y (solo administrador) datos y licencia ----------

async function actualizarEnLaboratorio(req, res) {
  const idLab = enteroPositivo(req.params.id, 'El laboratorio');
  const idSoftware = enteroPositivo(req.params.idSoftware, 'El software');
  const lab = await obtenerLaboratorio(req.user, idLab);
  const [s] = await query('SELECT * FROM software WHERE id_software = ?', [idSoftware]);
  if (!s) throw new HttpError(404, 'El software no existe.');
  const b = req.body || {};

  const r = leerDatosSoftware(b.software || {}, true);
  const l = leerLicencia(b.licencia);
  const errores = [...r.errores, ...l.errores];
  if (errores.length) throw new HttpError(400, errores[0], errores);
  const cambiaCatalogo = Object.keys(r.datos).length > 0 || l.licencia !== undefined;
  if (cambiaCatalogo && !esAdmin(req.user)) {
    throw new HttpError(403, 'Solo el administrador puede modificar los datos o la licencia del software (afectan a todos los laboratorios).');
  }
  if (r.datos.nombre_software || r.datos.version !== undefined) {
    const nombre = r.datos.nombre_software ?? s.nombre_software;
    const version = r.datos.version !== undefined ? r.datos.version : s.version;
    const [dup] = await query(
      'SELECT id_software FROM software WHERE LOWER(nombre_software) = LOWER(?) AND COALESCE(version, \'\') = COALESCE(?, \'\') AND id_software <> ?',
      [nombre, version, idSoftware],
    );
    if (dup) throw new HttpError(409, `Ya existe ${nombre}${version ? ` ${version}` : ''} en el catálogo.`);
  }
  const fecha = b.fecha_instalacion || null;
  if (fecha && !fechaValida(fecha)) throw new HttpError(400, 'La fecha de instalación no es válida.');
  const equipos = b.equipos !== undefined ? await resolverEquipos(idLab, b.equipos) : undefined;
  if (!cambiaCatalogo && equipos === undefined) throw new HttpError(400, 'No se indicaron cambios.');

  await withTransaction(async (conn) => {
    if (Object.keys(r.datos).length) await conn.query('UPDATE software SET ? WHERE id_software = ?', [r.datos, idSoftware]);
    await guardarLicencia(conn, idSoftware, l.licencia);
    if (cambiaCatalogo) {
      await registrarAccion(conn, {
        idUsuario: req.user.id, accion: 'Modificar', entidad: 'Software', idRegistro: idSoftware,
        detalle: `Actualización de ${[...Object.keys(r.datos), ...(l.licencia !== undefined ? ['licencia'] : [])].join(', ')}.`,
      });
    }
    if (equipos !== undefined) {
      const [actuales] = await conn.query(
        `SELECT es.id_equipo FROM equipo_software es JOIN equipos e ON e.id_equipo = es.id_equipo
          WHERE es.id_software = ? AND e.id_laboratorio = ?`,
        [idSoftware, idLab],
      );
      const antes = actuales.map((x) => x.id_equipo);
      const quitar = antes.filter((id) => !equipos.includes(id));
      const agregar = equipos.filter((id) => !antes.includes(id));
      if (quitar.length) await conn.query('DELETE FROM equipo_software WHERE id_software = ? AND id_equipo IN (?)', [idSoftware, quitar]);
      if (agregar.length) {
        await conn.query('INSERT INTO equipo_software (id_equipo, id_software, fecha_instalacion) VALUES ?', [agregar.map((idE) => [idE, idSoftware, fecha])]);
      }
      if (quitar.length || agregar.length) {
        await registrarAccion(conn, {
          idUsuario: req.user.id, accion: 'Modificar', entidad: 'Software', idRegistro: idSoftware,
          detalle: `${lab.nombre}: instalado en ${agregar.length} equipo(s), desinstalado de ${quitar.length}.`,
        });
      }
    }
  });
  const [item] = await softwareDelLaboratorio(idLab, req.user, idSoftware);
  res.json(item || { id_software: idSoftware, instalaciones: 0, equipos: [] });
}

// ---------- Quitar del laboratorio: desinstala de todos sus equipos (el catalogo no se toca) ----------

async function quitarDeLaboratorio(req, res) {
  const idLab = enteroPositivo(req.params.id, 'El laboratorio');
  const idSoftware = enteroPositivo(req.params.idSoftware, 'El software');
  const lab = await obtenerLaboratorio(req.user, idLab);
  const [s] = await query('SELECT nombre_software FROM software WHERE id_software = ?', [idSoftware]);
  if (!s) throw new HttpError(404, 'El software no existe.');
  const quitados = await withTransaction(async (conn) => {
    const [r] = await conn.query(
      `DELETE es FROM equipo_software es JOIN equipos e ON e.id_equipo = es.id_equipo
        WHERE es.id_software = ? AND e.id_laboratorio = ?`,
      [idSoftware, idLab],
    );
    if (!r.affectedRows) throw new HttpError(404, `${s.nombre_software} no está instalado en el ${lab.nombre}.`);
    await registrarAccion(conn, {
      idUsuario: req.user.id, accion: 'Eliminar', entidad: 'Software', idRegistro: idSoftware,
      detalle: `${s.nombre_software} desinstalado de ${r.affectedRows} equipo(s) del ${lab.nombre}.`,
    });
    return r.affectedRows;
  });
  res.json({ id_software: idSoftware, desinstalado_de: quitados });
}

module.exports = { catalogo, listarDeLaboratorio, agregarALaboratorio, actualizarEnLaboratorio, quitarDeLaboratorio };
