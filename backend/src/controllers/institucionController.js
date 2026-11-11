// Datos de la institucion del usuario (GET para cualquier usuario del colegio; PUT y
// configuracion inicial solo el administrador) y administracion de la PLATAFORMA (solo el
// SUPERADMIN: alta de instituciones con su primer administrador y cambio de estado).
// La institucion propia sale SIEMPRE de req.user.idInstitucion, nunca del cliente.
const { query, withTransaction } = require('../config/db');
const { HttpError } = require('../utils/httpError');
const { texto, enteroPositivo, fechaValida } = require('../utils/validacion');
const { hashContrasena } = require('../utils/password');
const { ROLES } = require('../utils/roles');
const { registrarAccion } = require('../utils/historial');
const { cerrarSesionesInstitucion } = require('../utils/eventos');
const { slugDisponible } = require('../config/migracion003');
const { estado: esquema } = require('../config/esquema');
const cobros = require('../utils/cobros');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ESTADOS = ['Prueba', 'Activa', 'Suspendida'];
const LIMITES = { nombre: 150, cuit: 13, direccion: 200, localidad: 100, provincia: 100, email_contacto: 150, telefono: 50, logo_url: 300 };
const CAMPOS_EDITABLES = Object.keys(LIMITES);

const CAMPOS_PUBLICOS = `i.id_institucion, i.nombre, i.slug, i.cuit, i.direccion, i.localidad, i.provincia,
  i.email_contacto, i.telefono, i.logo_url, i.estado, i.fecha_fin_prueba, i.configurada, i.fecha_alta`;

const formatear = (i) => ({ ...i, configurada: Number(i.configurada) });

// Lee y valida los datos editables de una institucion. "email" se acepta como alias de email_contacto.
function leerDatos(body, parcial) {
  const b = { ...(body || {}) };
  if (b.email !== undefined && b.email_contacto === undefined) b.email_contacto = b.email;
  const out = {};
  const errores = [];
  for (const k of CAMPOS_EDITABLES) {
    if (b[k] === undefined) continue;
    if (b[k] !== null && typeof b[k] !== 'string') { errores.push(`El campo ${k.replace('_', ' ')} no es válido.`); continue; }
    out[k] = texto(b[k] ?? '') || null;
  }
  if (!parcial || out.nombre !== undefined) {
    if (!out.nombre) errores.push('El nombre de la institución es obligatorio.');
  }
  for (const [k, max] of Object.entries(LIMITES)) {
    if (out[k] && out[k].length > max) errores.push(`El campo ${k.replace('_', ' ')} admite hasta ${max} caracteres.`);
  }
  if (out.cuit && !/^\d{2}-?\d{8}-?\d$/.test(out.cuit)) errores.push('El CUIT debe tener 11 dígitos (por ejemplo 30-12345678-9).');
  if (out.email_contacto && !EMAIL_RE.test(out.email_contacto)) errores.push('El email de contacto no es válido.');
  if (out.logo_url && !/^https?:\/\/\S+$/i.test(out.logo_url)) errores.push('El logo debe ser una dirección web (http:// o https://).');
  if (errores.length) throw new HttpError(400, errores[0], errores);
  return out;
}

async function obtener(idInstitucion) {
  const [i] = await query(`SELECT ${CAMPOS_PUBLICOS} FROM instituciones i WHERE i.id_institucion = ?`, [idInstitucion]);
  if (!i) throw new HttpError(404, 'La institución no existe.');
  return formatear(i);
}

// ---------- Institucion propia ----------

async function ver(req, res) {
  res.json(await obtener(req.user.idInstitucion));
}

// Edita los datos del colegio. Nunca el estado ni el slug (los maneja la plataforma).
async function actualizar(req, res) {
  for (const k of ['estado', 'slug', 'id_institucion', 'fecha_fin_prueba']) {
    if (req.body?.[k] !== undefined) throw new HttpError(400, `El campo ${k} no se puede modificar desde aquí.`);
  }
  const datos = leerDatos(req.body, true);
  if (!Object.keys(datos).length) throw new HttpError(400, 'No se indicaron cambios.');
  await withTransaction(async (conn) => {
    await conn.query('UPDATE instituciones SET ? WHERE id_institucion = ?', [datos, req.user.idInstitucion]);
    await registrarAccion(conn, {
      idUsuario: req.user.id, accion: 'Modificar', entidad: 'Institucion', idRegistro: req.user.idInstitucion,
      detalle: `Datos de la institución actualizados (${Object.keys(datos).join(', ')}).`,
    });
  });
  res.json(await obtener(req.user.idInstitucion));
}

async function marcarConfigurada(req, res) {
  const valor = req.body?.configurada === undefined ? true : req.body.configurada;
  if (typeof valor !== 'boolean') throw new HttpError(400, 'Indicá configurada: true o false.');
  await withTransaction(async (conn) => {
    await conn.query('UPDATE instituciones SET configurada = ? WHERE id_institucion = ?', [valor ? 1 : 0, req.user.idInstitucion]);
    await registrarAccion(conn, {
      idUsuario: req.user.id, accion: 'Modificar', entidad: 'Institucion', idRegistro: req.user.idInstitucion,
      detalle: valor ? 'Configuración inicial completada.' : 'Configuración inicial marcada como pendiente.',
    });
  });
  res.json(await obtener(req.user.idInstitucion));
}

// ---------- Plataforma (SUPERADMIN) ----------

async function listarInstituciones(_req, res) {
  const rows = await query(
    `SELECT ${CAMPOS_PUBLICOS},
            ${esquema.pagos ? 'i.plan, i.abono_mensual, i.dia_vencimiento, i.dias_gracia, i.motivo_suspension,' : ''}
            (SELECT COUNT(*) FROM usuarios u WHERE u.id_institucion = i.id_institucion) AS usuarios,
            (SELECT COUNT(*) FROM laboratorios l WHERE l.id_institucion = i.id_institucion) AS laboratorios,
            (SELECT COUNT(*) FROM equipos e WHERE e.id_institucion = i.id_institucion) AS equipos,
            (SELECT GROUP_CONCAT(u.email ORDER BY u.id_usuario SEPARATOR ', ') FROM usuarios u JOIN roles r ON r.id_rol = u.id_rol
              WHERE u.id_institucion = i.id_institucion AND r.nombre_rol = ?) AS administradores
       FROM instituciones i ORDER BY i.nombre`,
    [ROLES.ADMIN],
  );
  res.json(rows.map((i) => ({
    ...formatear(i), usuarios: Number(i.usuarios), laboratorios: Number(i.laboratorios), equipos: Number(i.equipos),
    ...(i.abono_mensual !== undefined ? { abono_mensual: i.abono_mensual === null ? null : Number(i.abono_mensual) } : {}),
  })));
}

// Alta de una institucion y de su primer administrador, en una sola transaccion.
async function crearInstitucion(req, res) {
  const b = req.body || {};
  for (const k of ['estado', 'slug', 'configurada']) {
    if (b[k] !== undefined) throw new HttpError(400, `El campo ${k} no se indica al crear: la institución empieza en Prueba y sin configurar.`);
  }
  const datos = leerDatos(b, false);
  const fin = b.fecha_fin_prueba || null;
  if (fin && !fechaValida(fin)) throw new HttpError(400, 'La fecha de fin de la prueba no es válida (AAAA-MM-DD).');

  const a = b.administrador || {};
  const admin = {
    nombre: texto(a.nombre), apellido: texto(a.apellido), email: texto(a.email).toLowerCase(),
    contrasena: typeof a.contrasena === 'string' ? a.contrasena : '',
  };
  const errores = [];
  if (!admin.nombre || !admin.apellido) errores.push('Indicá el nombre y el apellido del administrador.');
  if (admin.nombre.length > 80 || admin.apellido.length > 80) errores.push('Nombre y apellido admiten hasta 80 caracteres.');
  if (!EMAIL_RE.test(admin.email) || admin.email.length > 150) errores.push('Ingresá un email válido para el administrador.');
  if (admin.contrasena.length < 8) errores.push('La contraseña del administrador debe tener al menos 8 caracteres.');
  if (admin.contrasena.length > 72) errores.push('La contraseña admite hasta 72 caracteres.');
  if (errores.length) throw new HttpError(400, errores[0], errores);

  const [existe] = await query('SELECT id_usuario FROM usuarios WHERE LOWER(email) = ?', [admin.email]);
  if (existe) throw new HttpError(409, 'Ese email ya está en uso.');
  const [rol] = await query('SELECT id_rol FROM roles WHERE nombre_rol = ?', [ROLES.ADMIN]);
  if (!rol) throw new HttpError(500, 'No existe el rol ADMINISTRADOR en la base.');

  const hash = await hashContrasena(admin.contrasena);
  const slug = await slugDisponible(datos.nombre);
  const id = await withTransaction(async (conn) => {
    const [r] = await conn.query('INSERT INTO instituciones SET ?', [{
      ...datos, slug, estado: 'Prueba', fecha_fin_prueba: fin, configurada: 0,
    }]);
    const [u] = await conn.query(
      'INSERT INTO usuarios (nombre, apellido, email, contrasena, id_rol, id_institucion) VALUES (?, ?, ?, ?, ?, ?)',
      [admin.nombre, admin.apellido, admin.email, hash, rol.id_rol, r.insertId],
    );
    await registrarAccion(conn, {
      idUsuario: req.user.id, accion: 'Crear', entidad: 'Institucion', idRegistro: r.insertId,
      detalle: `Alta de la institución "${datos.nombre}" (${slug}) con su administrador ${admin.email} (usuario ${u.insertId}).`,
    });
    return r.insertId;
  });
  const inst = await obtener(id);
  const [u] = await query('SELECT id_usuario, nombre, apellido, email FROM usuarios WHERE LOWER(email) = ?', [admin.email]);
  res.status(201).json({ ...inst, administrador: u });
}

async function cambiarEstado(req, res) {
  const id = enteroPositivo(req.params.id, 'La institución');
  const estado = req.body?.estado;
  if (!ESTADOS.includes(estado)) throw new HttpError(400, 'El estado debe ser Prueba, Activa o Suspendida.');
  const fin = req.body?.fecha_fin_prueba;
  if (fin !== undefined && fin !== null && !fechaValida(fin)) throw new HttpError(400, 'La fecha de fin de la prueba no es válida (AAAA-MM-DD).');
  const actual = await obtener(id);
  const cambios = { estado, ...(fin !== undefined ? { fecha_fin_prueba: fin } : {}) };
  // Una suspension hecha por la plataforma es "Manual": el cobro automatico no la levanta.
  if (esquema.pagos) cambios.motivo_suspension = estado === 'Suspendida' ? 'Manual' : null;
  await withTransaction(async (conn) => {
    await conn.query('UPDATE instituciones SET ? WHERE id_institucion = ?', [cambios, id]);
    await registrarAccion(conn, {
      idUsuario: req.user.id, accion: 'Modificar', entidad: 'Institucion', idRegistro: id,
      detalle: `Estado de "${actual.nombre}": ${actual.estado} → ${estado}.`,
    });
  });
  // Al suspender se cortan en el momento las ventanas abiertas de esa institucion; las
  // peticiones siguientes ya responden 403 porque autenticar lee el estado de la base.
  if (estado === 'Suspendida') cerrarSesionesInstitucion(id, 'El acceso de tu institución fue suspendido. Comunicate con ControlTech para reactivarlo.');
  // Activada con pagos vencidos fuera de la gracia: el cobro automatico la vuelve a suspender.
  let aviso = null;
  if (esquema.pagos && estado === 'Activa') {
    const [c] = await cobros.estadoDeCuenta({ idInstitucion: id });
    if (c?.fecha_suspension && c.fecha_suspension <= cobros.hoyAR()) {
      aviso = `Tiene pagos vencidos fuera de los días de gracia: la próxima verificación la va a suspender otra vez. Registrá el pago o corregí la fecha de vencimiento en Pagos.`;
    }
  }
  res.json({ ...(await obtener(id)), aviso });
}

module.exports = { ver, actualizar, marcarConfigurada, listarInstituciones, crearInstitucion, cambiarEstado };
