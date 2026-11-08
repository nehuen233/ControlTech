// Datos de DEMOSTRACION de ControlTech: 5 laboratorios con sus computadoras (propias de cada
// laboratorio), software y licencias, usuarios de ejemplo de cada rol y algunos
// mantenimientos y alertas. NO se cargan al iniciar el servidor: se cargan a pedido en una
// institucion puntual con "npm run db:demo" (institucion "Demo") y los usan las pruebas
// automaticas para poblar las instituciones que crean.
//
// Reglas (CLAUDE.md):
//   * Todo se crea dentro de la institucion indicada; nada toca otras instituciones.
//   * Solo se agrega lo que falta: se puede ejecutar varias veces sin duplicar ni borrar.
//   * Los usuarios que ya existen no se modifican (ni su contraseña).
const { query, withTransaction } = require('./db');
const { hashContrasena, generarTemporal } = require('../utils/password');
const { capacidadEfectiva } = require('../utils/capacidad');
const { ROLES } = require('../utils/roles');
const { slugDisponible } = require('./migracion003');

const SLUG_DEMO = 'demo';
const NOMBRE_DEMO = 'Colegio Demo';
const DOMINIO_DEMO = 'demo.controltech';
const FECHA_INSTALACION = '2026-09-01';

const SOFTWARE = Object.freeze([
  { nombre_software: 'Google Chrome', version: 'Version estable', proveedor: 'Google', descripcion: 'Navegador utilizado para acceder a Classroom y recursos educativos.', licencia: 'Gratuita' },
  { nombre_software: 'Microsoft Office 365', version: 'Version institucional', proveedor: 'Microsoft', descripcion: 'Herramientas para documentos, presentaciones y trabajos escolares.', licencia: 'Pago' },
  { nombre_software: 'Visual Studio Code', version: 'Version instalada', proveedor: 'Microsoft', descripcion: 'Editor de codigo utilizado en actividades de programacion.', licencia: 'Gratuita' },
  { nombre_software: 'Visual Studio 2022', version: '2022', proveedor: 'Microsoft', descripcion: 'Entorno de desarrollo utilizado en las materias de programacion.', licencia: 'Prueba' },
  { nombre_software: 'GitHub Desktop', version: 'Version estable', proveedor: 'GitHub (Microsoft)', descripcion: 'Interfaz grafica de Git utilizada para gestionar repositorios y subir codigo desde Visual Studio Code.', licencia: null },
  { nombre_software: 'XAMPP', version: 'Version estable', proveedor: 'Apache Friends', descripcion: 'Paquete de desarrollo web que incluye Apache, MariaDB y PHP para practicas locales.', licencia: null },
]);

const LAB_BASE = { edificio: 'Edificio principal', capacidad_equipos: 30, estado: 'Activo' };
const DESC_4 = 'Laboratorio del cuarto piso para clases y actividades educativas con computadoras';
const DESC_5 = 'Laboratorio del quinto piso para clases y actividades educativas con computadoras';

// Perfil de cada laboratorio. "modelos" se reparte por tramos: { desde: n, ... } aplica desde
// la computadora n en adelante. "estados" indica las que no estan Operativas. "responsable" es
// la clave de un usuario de USUARIOS.
const PERFILES = Object.freeze([
  {
    laboratorio: { nombre: 'Laboratorio 4-1', piso: '4to piso', ubicacion: 'Sector 4-1', descripcion: DESC_4 },
    prefijo: '4A', cantidad: 12, responsable: 'carlos',
    modelos: [
      { desde: 1, marca: 'Dell', modelo: 'OptiPlex 3090 Micro', procesador: 'Intel Core i5-10500T', ram: '8 GB', almacenamiento: '256 GB SSD' },
      { desde: 9, marca: 'Dell', modelo: 'OptiPlex 3080', procesador: 'Intel Core i3-10100', ram: '8 GB', almacenamiento: '256 GB SSD' },
    ],
    estados: { 4: 'En uso', 5: 'En uso', 6: 'En uso', 9: 'Disponible', 11: 'En mantenimiento', 12: 'Fuera de servicio' },
    software: ['Google Chrome', 'Microsoft Office 365'],
  },
  {
    laboratorio: { nombre: 'Laboratorio 4-2', piso: '4to piso', ubicacion: 'Sector 4-2', descripcion: DESC_4 },
    prefijo: '4B', cantidad: 14, responsable: 'carlos',
    modelos: [
      { desde: 1, marca: 'HP', modelo: 'ProDesk 400 G7 SFF', procesador: 'Intel Core i5-10500', ram: '16 GB', almacenamiento: '512 GB SSD' },
      { desde: 11, marca: 'HP', modelo: 'EliteDesk 800 G6', procesador: 'Intel Core i7-10700', ram: '16 GB', almacenamiento: '512 GB SSD' },
    ],
    estados: { 2: 'Disponible', 3: 'Disponible', 8: 'En uso', 9: 'En uso', 12: 'En mantenimiento' },
    software: ['Google Chrome', 'Microsoft Office 365', 'Visual Studio Code'],
  },
  {
    laboratorio: { nombre: 'Laboratorio 4-3', piso: '4to piso', ubicacion: 'Sector 4-3', descripcion: DESC_4 },
    prefijo: '4C', cantidad: 12, responsable: 'carlos',
    modelos: [
      { desde: 1, marca: 'Lenovo', modelo: 'ThinkCentre M720q', procesador: 'Intel Core i5-8500T', ram: '8 GB', almacenamiento: '256 GB SSD' },
      { desde: 9, marca: 'Lenovo', modelo: 'ThinkCentre M70q Gen 2', procesador: 'Intel Core i5-11400T', ram: '16 GB', almacenamiento: '512 GB SSD' },
    ],
    estados: { 1: 'En uso', 7: 'Disponible', 8: 'Disponible', 10: 'Disponible', 12: 'Fuera de servicio' },
    software: ['Google Chrome', 'Microsoft Office 365'],
  },
  {
    laboratorio: { nombre: 'Laboratorio 5-1', piso: '5to piso', ubicacion: 'Ala izquierda', descripcion: DESC_5 },
    prefijo: '5A', cantidad: 15, responsable: 'diego',
    modelos: [
      { desde: 1, marca: 'Dell', modelo: 'OptiPlex 7090 Tower', procesador: 'Intel Core i7-11700', ram: '16 GB', almacenamiento: '512 GB SSD NVMe' },
    ],
    estados: { 2: 'En uso', 3: 'En uso', 4: 'En uso', 5: 'En uso', 13: 'Disponible', 11: 'En mantenimiento', 15: 'Fuera de servicio' },
    software: ['Google Chrome', 'Visual Studio Code', 'GitHub Desktop', 'XAMPP'],
  },
  {
    laboratorio: { nombre: 'Laboratorio 5-2', piso: '5to piso', ubicacion: 'Ala derecha', descripcion: DESC_5 },
    prefijo: '5B', cantidad: 13, responsable: 'diego',
    modelos: [
      { desde: 1, marca: 'Lenovo', modelo: 'ThinkCentre M90t Gen 3', procesador: 'Intel Core i7-12700', ram: '32 GB', almacenamiento: '1 TB SSD NVMe' },
      { desde: 11, marca: 'Lenovo', modelo: 'ThinkStation P350', procesador: 'Intel Core i9-11900', ram: '64 GB', almacenamiento: '2 TB SSD NVMe' },
    ],
    estados: { 6: 'En mantenimiento', 9: 'Disponible', 10: 'Disponible', 12: 'Fuera de servicio' },
    software: ['Google Chrome', 'Microsoft Office 365', 'Visual Studio Code', 'Visual Studio 2022', 'GitHub Desktop'],
  },
].map((p) => Object.freeze({ ...p, laboratorio: Object.freeze({ ...LAB_BASE, ...p.laboratorio }) })));

// Usuarios de ejemplo (el email se arma con el dominio de la institucion).
const USUARIOS = Object.freeze([
  { clave: 'carlos', nombre: 'Carlos', apellido: 'Gómez', rol: ROLES.TECNICO, labs: ['Laboratorio 4-1', 'Laboratorio 4-2', 'Laboratorio 4-3'] },
  { clave: 'diego', nombre: 'Diego', apellido: 'Fernández', rol: ROLES.TECNICO, labs: ['Laboratorio 5-1', 'Laboratorio 5-2'] },
  { clave: 'pedro', nombre: 'Pedro', apellido: 'López', rol: ROLES.DOCENTE, labs: ['Laboratorio 4-1'] },
  { clave: 'maria', nombre: 'María', apellido: 'Rodríguez', rol: ROLES.DOCENTE_LAB, labs: ['Laboratorio 4-2', 'Laboratorio 4-3'] },
  { clave: 'sofia', nombre: 'Sofía', apellido: 'Martínez', rol: ROLES.DOCENTE_LAB, labs: ['Laboratorio 5-1', 'Laboratorio 5-2'] },
]);

const pad = (n, w) => String(n).padStart(w, '0');

function equiposDelPerfil(p) {
  const out = [];
  for (let n = 1; n <= p.cantidad; n += 1) {
    const m = [...p.modelos].reverse().find((x) => n >= x.desde);
    out.push({
      identificador: `PC-${p.prefijo}-${pad(n, 2)}`,
      nro_serie: `CT26-${p.prefijo}-${pad(n, 3)}`,
      tipo: 'Computadora',
      marca: m.marca, modelo: m.modelo, procesador: m.procesador, ram: m.ram, almacenamiento: m.almacenamiento,
      estado: p.estados[n] || 'Operativo',
    });
  }
  return out;
}

const EQUIPOS = Object.freeze(PERFILES.flatMap((p) => equiposDelPerfil(p).map((e) => Object.freeze({ ...e, laboratorio: p.laboratorio.nombre }))));
const emailDe = (clave, dominio) => `${clave}@${dominio}`;

// ---------- Institucion Demo ----------

// Crea (si falta) la institucion "Demo" (slug "demo"). Devuelve { id, creada }.
async function asegurarInstitucionDemo() {
  const [i] = await query('SELECT id_institucion FROM instituciones WHERE slug = ?', [SLUG_DEMO]);
  if (i) return { id: i.id_institucion, creada: false };
  const r = await query(
    "INSERT INTO instituciones (nombre, slug, localidad, provincia, estado, configurada) VALUES (?, ?, 'Ciudad Demo', 'Buenos Aires', 'Activa', 1)",
    [NOMBRE_DEMO, await slugDisponible(SLUG_DEMO)],
  );
  return { id: r.insertId, creada: true };
}

// ---------- Carga ----------

async function idRol(conn, nombre) {
  const [[r]] = await conn.query('SELECT id_rol FROM roles WHERE nombre_rol = ?', [nombre]);
  if (r) return r.id_rol;
  const [ins] = await conn.query('INSERT INTO roles (nombre_rol) VALUES (?)', [nombre]);
  return ins.insertId;
}

// Crea el usuario si su email no existe en la plataforma. Devuelve { id, creado } o null si
// el email ya esta en uso en OTRA institucion (no se toca).
async function asegurarUsuario(conn, idInstitucion, { email, nombre, apellido, rol, contrasena }) {
  const [[u]] = await conn.query('SELECT id_usuario, id_institucion FROM usuarios WHERE LOWER(email) = ?', [email.toLowerCase()]);
  if (u) return u.id_institucion === idInstitucion ? { id: u.id_usuario, creado: false } : null;
  const [r] = await conn.query(
    'INSERT INTO usuarios (nombre, apellido, email, contrasena, id_rol, id_institucion) VALUES (?, ?, ?, ?, ?, ?)',
    [nombre, apellido, email.toLowerCase(), await hashContrasena(contrasena), await idRol(conn, rol), idInstitucion],
  );
  return { id: r.insertId, creado: true };
}

/**
 * Carga los datos de demostracion en la institucion indicada.
 * opciones:
 *   idInstitucion       institucion destino (obligatorio)
 *   dominio             dominio de los emails de ejemplo (por defecto demo.controltech)
 *   emailAdmin          administrador a crear si no existe (opcional)
 *   contrasenaAdmin     su contraseña; si falta se genera
 *   contrasenaUsuarios  contraseña de los usuarios de ejemplo nuevos; si falta se genera
 * Devuelve un resumen con lo agregado y las credenciales de los usuarios CREADOS ahora.
 */
async function cargarDatosDemo({
  idInstitucion, dominio = DOMINIO_DEMO, emailAdmin, contrasenaAdmin, contrasenaUsuarios,
} = {}) {
  if (!Number.isInteger(idInstitucion) || idInstitucion <= 0) throw new Error('Indicá la institución donde cargar los datos de demostración.');
  const [inst] = await query('SELECT id_institucion, nombre FROM instituciones WHERE id_institucion = ?', [idInstitucion]);
  if (!inst) throw new Error(`La institución ${idInstitucion} no existe.`);
  const claveUsuarios = contrasenaUsuarios || generarTemporal();
  const resumen = {
    institucion: inst.nombre, laboratorios: 0, equipos: 0, software: 0, licencias: 0, instalaciones: 0,
    asignaciones: 0, mantenimientos: 0, alertas: 0, usuarios_creados: [], omitidos: [],
  };

  await withTransaction(async (conn) => {
    // Laboratorios (por nombre, dentro de la institucion)
    const labs = new Map();
    for (const p of PERFILES) {
      const l = p.laboratorio;
      const [[ex]] = await conn.query('SELECT id_laboratorio, capacidad_equipos FROM laboratorios WHERE id_institucion = ? AND LOWER(TRIM(nombre)) = LOWER(?)', [idInstitucion, l.nombre]);
      if (ex) { labs.set(l.nombre, ex); continue; }
      const [r] = await conn.query('INSERT INTO laboratorios SET ?', [{ ...l, id_institucion: idInstitucion }]);
      labs.set(l.nombre, { id_laboratorio: r.insertId, capacidad_equipos: l.capacidad_equipos });
      resumen.laboratorios += 1;
    }

    // Software y licencias del catalogo de la institucion
    const idsSoftware = new Map();
    for (const s of SOFTWARE) {
      let [[ex]] = await conn.query('SELECT id_software FROM software WHERE id_institucion = ? AND nombre_software = ? ORDER BY id_software LIMIT 1', [idInstitucion, s.nombre_software]);
      if (!ex) {
        const [r] = await conn.query('INSERT INTO software SET ?', [{
          nombre_software: s.nombre_software, version: s.version, proveedor: s.proveedor, descripcion: s.descripcion, id_institucion: idInstitucion,
        }]);
        ex = { id_software: r.insertId };
        resumen.software += 1;
      }
      idsSoftware.set(s.nombre_software, ex.id_software);
      if (s.licencia) {
        const [r] = await conn.query(
          `INSERT INTO licencias (id_software, tipo_licencia, estado)
           SELECT ?, ?, 'Activa' FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM licencias WHERE id_software = ?)`,
          [ex.id_software, s.licencia, ex.id_software],
        );
        resumen.licencias += r.affectedRows;
      }
    }

    // Usuarios: administrador (opcional) y usuarios de ejemplo
    if (emailAdmin) {
      const clave = contrasenaAdmin || generarTemporal();
      const u = await asegurarUsuario(conn, idInstitucion, { email: emailAdmin, nombre: 'Administrador', apellido: 'Demo', rol: ROLES.ADMIN, contrasena: clave });
      if (!u) resumen.omitidos.push(`${emailAdmin}: el email ya está en uso en otra institución`);
      else if (u.creado) resumen.usuarios_creados.push({ email: emailAdmin.toLowerCase(), rol: ROLES.ADMIN, contrasena: clave });
    }
    const usuarios = new Map();
    for (const d of USUARIOS) {
      const email = emailDe(d.clave, dominio);
      const u = await asegurarUsuario(conn, idInstitucion, { email, nombre: d.nombre, apellido: d.apellido, rol: d.rol, contrasena: claveUsuarios });
      if (!u) { resumen.omitidos.push(`${email}: el email ya está en uso en otra institución`); continue; }
      usuarios.set(d.clave, u.id);
      if (u.creado) resumen.usuarios_creados.push({ email, rol: d.rol, contrasena: claveUsuarios });
    }

    // Asignaciones: los administradores de la institucion ven todos los laboratorios demo
    const asignar = async (idUsuario, nombresLabs) => {
      const filas = nombresLabs.filter((n) => labs.has(n)).map((n) => [idUsuario, labs.get(n).id_laboratorio, idInstitucion]);
      if (!filas.length) return;
      const [r] = await conn.query('INSERT IGNORE INTO usuario_laboratorio (id_usuario, id_laboratorio, id_institucion) VALUES ?', [filas]);
      resumen.asignaciones += r.affectedRows;
    };
    const [admins] = await conn.query(
      'SELECT u.id_usuario FROM usuarios u JOIN roles r ON r.id_rol = u.id_rol WHERE u.id_institucion = ? AND r.nombre_rol = ?',
      [idInstitucion, ROLES.ADMIN],
    );
    for (const a of admins) await asignar(a.id_usuario, [...labs.keys()]);
    for (const d of USUARIOS) if (usuarios.has(d.clave)) await asignar(usuarios.get(d.clave), d.labs);

    // Computadoras de cada laboratorio (identificador y serie son unicos por institucion)
    const nuevos = [];
    for (const p of PERFILES) {
      const lab = labs.get(p.laboratorio.nombre);
      const [[{ n }]] = await conn.query('SELECT COUNT(*) AS n FROM equipos WHERE id_laboratorio = ?', [lab.id_laboratorio]);
      let ocupados = Number(n);
      for (const e of equiposDelPerfil(p)) {
        const [[ex]] = await conn.query('SELECT id_equipo FROM equipos WHERE id_institucion = ? AND (identificador = ? OR nro_serie = ?) LIMIT 1', [idInstitucion, e.identificador, e.nro_serie]);
        if (ex) continue;
        if (ocupados >= capacidadEfectiva(lab.capacidad_equipos)) { resumen.omitidos.push(`${p.laboratorio.nombre}: capacidad completa`); break; }
        const [r] = await conn.query('INSERT INTO equipos SET ?', [{
          ...e, id_laboratorio: lab.id_laboratorio, id_responsable: usuarios.get(p.responsable) ?? null, id_institucion: idInstitucion,
        }]);
        ocupados += 1;
        resumen.equipos += 1;
        nuevos.push({ id: r.insertId, ...e, perfil: p });
        const filas = p.software.map((s) => [r.insertId, idsSoftware.get(s), FECHA_INSTALACION]);
        const [i] = await conn.query('INSERT IGNORE INTO equipo_software (id_equipo, id_software, fecha_instalacion) VALUES ?', [filas]);
        resumen.instalaciones += i.affectedRows;
      }
    }

    // Historial de ejemplo, solo para las computadoras creadas ahora: un preventivo completado
    // en cada una, y un correctivo en curso + una alerta en las que tienen problemas.
    for (const e of nuevos) {
      const tecnico = usuarios.get(e.perfil.responsable);
      if (!tecnico) continue;
      await conn.query(
        `INSERT INTO mantenimientos (id_equipo, id_usuario, fecha_mantenimiento, tipo, detalle, estado)
         VALUES (?, ?, DATE_SUB(CURDATE(), INTERVAL 60 DAY), 'Preventivo', 'Limpieza interna, actualización del sistema y control general.', 'Completado')`,
        [e.id, tecnico],
      );
      resumen.mantenimientos += 1;
      if (e.estado === 'En mantenimiento' || e.estado === 'Fuera de servicio') {
        const fuera = e.estado === 'Fuera de servicio';
        await conn.query(
          `INSERT INTO mantenimientos (id_equipo, id_usuario, fecha_mantenimiento, tipo, detalle, estado)
           VALUES (?, ?, CURDATE(), 'Correctivo', ?, ?)`,
          [e.id, tecnico, fuera ? 'Diagnóstico de falla: el equipo no enciende.' : 'Reemplazo de disco y reinstalación del sistema.', fuera ? 'Pendiente' : 'En proceso'],
        );
        await conn.query(
          'INSERT INTO alertas (id_equipo, titulo, descripcion, severidad, fecha_limite) VALUES (?, ?, ?, ?, DATE_ADD(CURDATE(), INTERVAL 7 DAY))',
          [e.id, fuera ? 'El equipo no enciende' : 'Disco con sectores dañados',
            fuera ? 'Reportado en clase: no da imagen ni enciende la fuente.' : 'El sistema tarda en iniciar y muestra errores de lectura.', fuera ? 'Alta' : 'Media'],
        );
        resumen.mantenimientos += 1;
        resumen.alertas += 1;
      }
    }
  });
  return resumen;
}

module.exports = {
  SLUG_DEMO, NOMBRE_DEMO, DOMINIO_DEMO, PERFILES, SOFTWARE, EQUIPOS, USUARIOS,
  asegurarInstitucionDemo, cargarDatosDemo, emailDe,
};
