// Datos con los que ControlTech arranca: laboratorios, computadoras de cada laboratorio,
// software y licencias. Se aplican al iniciar el backend y con "npm run db:cargar".
//
// Cada laboratorio tiene sus propias computadoras (marca, modelo, especificaciones,
// cantidad, estados y software segun su uso): no se repite el mismo equipamiento en
// todos los laboratorios, como ocurria en "CONTROL TECH INSERTS.sql".
//
// Reglas de seguridad:
//   * Solo se agrega lo que falta; nada se borra ni se duplica.
//   * Las computadoras de un laboratorio se cargan solo si ese laboratorio no tiene
//     equipos propios cargados a mano (para no mezclar con los del usuario).
//   * Las computadoras de demostracion anteriores (identicas en todos los laboratorios)
//     se actualizan con los datos nuevos SOLO si nadie las modifico: conservan su id,
//     por lo que sus mantenimientos, alertas e historial siguen vinculados.
const { withTransaction } = require('./db');
const { capacidadEfectiva } = require('../utils/capacidad');
const { asegurarLaboratoriosIniciales } = require('./laboratoriosIniciales');
const demoOriginal = require('./equiposDemoOriginales.json').equipos;

const FECHA_INSTALACION = '2026-09-01';

const SOFTWARE = Object.freeze([
  { nombre_software: 'Google Chrome', version: 'Version estable', proveedor: 'Google', descripcion: 'Navegador utilizado para acceder a Classroom y recursos educativos.', licencia: 'Gratuita' },
  { nombre_software: 'Microsoft Office 365', version: 'Version institucional', proveedor: 'Microsoft', descripcion: 'Herramientas para documentos, presentaciones y trabajos escolares.', licencia: 'Pago' },
  { nombre_software: 'Visual Studio Code', version: 'Version instalada', proveedor: 'Microsoft', descripcion: 'Editor de codigo utilizado en actividades de programacion.', licencia: 'Gratuita' },
  { nombre_software: 'Visual Studio 2022', version: '2022', proveedor: 'Microsoft', descripcion: 'Entorno de desarrollo utilizado en las materias de programacion.', licencia: 'Prueba' },
  { nombre_software: 'GitHub Desktop', version: 'Version estable', proveedor: 'GitHub (Microsoft)', descripcion: 'Interfaz grafica de Git utilizada para gestionar repositorios y subir codigo desde Visual Studio Code.', licencia: null },
  { nombre_software: 'XAMPP', version: 'Version estable', proveedor: 'Apache Friends', descripcion: 'Paquete de desarrollo web que incluye Apache, MariaDB y PHP para practicas locales.', licencia: null },
]);

// Perfil de cada laboratorio. "modelos" se reparte por tramos: { desde: n, ... } aplica
// desde la computadora n en adelante. "estados" indica las que no estan Operativas.
const PERFILES = Object.freeze([
  {
    laboratorio: 'Laboratorio 4-1', prefijo: '4A', cantidad: 12, responsable: 'carlos@suiza26.edu',
    uso: 'Aula general: ofimática y navegación',
    modelos: [
      { desde: 1, marca: 'Dell', modelo: 'OptiPlex 3090 Micro', procesador: 'Intel Core i5-10500T', ram: '8 GB', almacenamiento: '256 GB SSD' },
      { desde: 9, marca: 'Dell', modelo: 'OptiPlex 3080', procesador: 'Intel Core i3-10100', ram: '8 GB', almacenamiento: '256 GB SSD' },
    ],
    estados: { 4: 'En uso', 5: 'En uso', 6: 'En uso', 9: 'Disponible', 11: 'En mantenimiento', 12: 'Fuera de servicio' },
    software: ['Google Chrome', 'Microsoft Office 365'],
  },
  {
    laboratorio: 'Laboratorio 4-2', prefijo: '4B', cantidad: 14, responsable: 'carlos@suiza26.edu',
    uso: 'Informática básica y programación inicial',
    modelos: [
      { desde: 1, marca: 'HP', modelo: 'ProDesk 400 G7 SFF', procesador: 'Intel Core i5-10500', ram: '16 GB', almacenamiento: '512 GB SSD' },
      { desde: 11, marca: 'HP', modelo: 'EliteDesk 800 G6', procesador: 'Intel Core i7-10700', ram: '16 GB', almacenamiento: '512 GB SSD' },
    ],
    estados: { 2: 'Disponible', 3: 'Disponible', 8: 'En uso', 9: 'En uso', 12: 'En mantenimiento' },
    software: ['Google Chrome', 'Microsoft Office 365', 'Visual Studio Code'],
  },
  {
    laboratorio: 'Laboratorio 4-3', prefijo: '4C', cantidad: 12, responsable: 'carlos@suiza26.edu',
    uso: 'Aula general con equipos compactos',
    modelos: [
      { desde: 1, marca: 'Lenovo', modelo: 'ThinkCentre M720q', procesador: 'Intel Core i5-8500T', ram: '8 GB', almacenamiento: '256 GB SSD' },
      { desde: 9, marca: 'Lenovo', modelo: 'ThinkCentre M70q Gen 2', procesador: 'Intel Core i5-11400T', ram: '16 GB', almacenamiento: '512 GB SSD' },
    ],
    estados: { 1: 'En uso', 7: 'Disponible', 8: 'Disponible', 10: 'Disponible', 12: 'Fuera de servicio' },
    software: ['Google Chrome', 'Microsoft Office 365'],
  },
  {
    laboratorio: 'Laboratorio 5-1', prefijo: '5A', cantidad: 15, responsable: 'diego@suiza26.edu',
    uso: 'Programación y desarrollo web',
    modelos: [
      { desde: 1, marca: 'Dell', modelo: 'OptiPlex 7090 Tower', procesador: 'Intel Core i7-11700', ram: '16 GB', almacenamiento: '512 GB SSD NVMe' },
    ],
    estados: { 2: 'En uso', 3: 'En uso', 4: 'En uso', 5: 'En uso', 13: 'Disponible', 11: 'En mantenimiento', 15: 'Fuera de servicio' },
    software: ['Google Chrome', 'Visual Studio Code', 'GitHub Desktop', 'XAMPP'],
  },
  {
    laboratorio: 'Laboratorio 5-2', prefijo: '5B', cantidad: 13, responsable: 'diego@suiza26.edu',
    uso: 'Desarrollo de software avanzado',
    modelos: [
      { desde: 1, marca: 'Lenovo', modelo: 'ThinkCentre M90t Gen 3', procesador: 'Intel Core i7-12700', ram: '32 GB', almacenamiento: '1 TB SSD NVMe' },
      { desde: 11, marca: 'Lenovo', modelo: 'ThinkStation P350', procesador: 'Intel Core i9-11900', ram: '64 GB', almacenamiento: '2 TB SSD NVMe' },
    ],
    estados: { 6: 'En mantenimiento', 9: 'Disponible', 10: 'Disponible', 12: 'Fuera de servicio' },
    software: ['Google Chrome', 'Microsoft Office 365', 'Visual Studio Code', 'Visual Studio 2022', 'GitHub Desktop'],
  },
].map((p) => Object.freeze(p)));

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

const EQUIPOS_INICIALES = Object.freeze(
  PERFILES.flatMap((p) => equiposDelPerfil(p).map((e) => Object.freeze({ ...e, laboratorio: p.laboratorio }))),
);

const DEMO_POR_ID = new Map(demoOriginal.map((e) => [e.identificador, e]));
const CAMPOS_EQUIPO = ['nro_serie', 'tipo', 'marca', 'modelo', 'procesador', 'ram', 'almacenamiento', 'estado'];
// Software que el script original instalaba en cada computadora de demostracion.
const softwareDemoOriginal = (lab) => ['Google Chrome', 'Microsoft Office 365', 'Visual Studio Code',
  ...(['Laboratorio 4-4', 'Laboratorio 5-2'].includes(lab) ? ['Visual Studio 2022'] : [])].sort();

// ---------- Aplicacion ----------

async function asegurarSoftware(conn) {
  for (const s of SOFTWARE) {
    await conn.query(
      `INSERT INTO software (nombre_software, version, proveedor, descripcion)
       SELECT ?, ?, ?, ? FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM software WHERE nombre_software = ?)`,
      [s.nombre_software, s.version, s.proveedor, s.descripcion, s.nombre_software],
    );
    if (s.licencia) {
      await conn.query(
        `INSERT INTO licencias (id_software, tipo_licencia, estado)
         SELECT s.id_software, ?, 'Activa' FROM software s
          WHERE s.nombre_software = ? AND NOT EXISTS (SELECT 1 FROM licencias li WHERE li.id_software = s.id_software)
          ORDER BY s.id_software LIMIT 1`,
        [s.licencia, s.nombre_software],
      );
    }
  }
  const [rows] = await conn.query('SELECT id_software, nombre_software FROM software WHERE nombre_software IN (?) ORDER BY id_software', [SOFTWARE.map((s) => s.nombre_software)]);
  const ids = new Map();
  for (const r of rows) if (!ids.has(r.nombre_software)) ids.set(r.nombre_software, r.id_software);
  return ids;
}

async function instalar(conn, idEquipo, nombres, idsSoftware) {
  const filas = nombres.filter((n) => idsSoftware.has(n)).map((n) => [idEquipo, idsSoftware.get(n), FECHA_INSTALACION]);
  if (filas.length) await conn.query('INSERT IGNORE INTO equipo_software (id_equipo, id_software, fecha_instalacion) VALUES ?', [filas]);
  return filas.length;
}

// Un equipo de demostracion "intacto" tiene exactamente los valores del script original.
function esDemoIntacto(row, labNombre) {
  const o = DEMO_POR_ID.get(row.identificador);
  return Boolean(o) && o.laboratorio === labNombre && CAMPOS_EQUIPO.every((k) => row[k] === o[k]);
}

async function softwareDemoIntacto(conn, idEquipo, labNombre) {
  const [rows] = await conn.query(
    `SELECT s.nombre_software, es.fecha_instalacion FROM equipo_software es
       JOIN software s ON s.id_software = es.id_software WHERE es.id_equipo = ?`,
    [idEquipo],
  );
  const nombres = rows.map((r) => r.nombre_software).sort();
  const fechas = rows.every((r) => String(r.fecha_instalacion).slice(0, 10) === FECHA_INSTALACION);
  return fechas && JSON.stringify(nombres) === JSON.stringify(softwareDemoOriginal(labNombre));
}

// Devuelve un resumen de lo realizado.
async function asegurarDatosIniciales({ reemplazarDemo = true } = {}) {
  const resumen = { laboratorios: 0, software: 0, equipos_agregados: 0, equipos_actualizados: 0, instalaciones: 0, omitidos: [] };
  resumen.laboratorios = await asegurarLaboratoriosIniciales();

  await withTransaction(async (conn) => {
    const [[antesSw]] = await conn.query('SELECT COUNT(*) AS n FROM software');
    const idsSoftware = await asegurarSoftware(conn);
    const [[despuesSw]] = await conn.query('SELECT COUNT(*) AS n FROM software');
    resumen.software = Number(despuesSw.n) - Number(antesSw.n);
    const [[admin]] = await conn.query(
      "SELECT u.id_usuario FROM usuarios u JOIN roles r ON r.id_rol = u.id_rol WHERE r.nombre_rol = 'ADMINISTRADOR' ORDER BY u.id_usuario LIMIT 1",
    );

    // Computadoras que el administrador elimino: no se vuelven a crear.
    const [bajas] = await conn.query(
      "SELECT detalle FROM historial_acciones WHERE entidad = 'Equipo' AND accion = 'Eliminar' AND detalle LIKE 'Baja del equipo %'",
    );
    const eliminados = new Set(bajas.map((b) => /^Baja del equipo "([^"]+)"/.exec(b.detalle)?.[1]).filter(Boolean));

    for (const p of PERFILES) {
      const [[lab]] = await conn.query('SELECT id_laboratorio, capacidad_equipos FROM laboratorios WHERE nombre = ? ORDER BY id_laboratorio LIMIT 1', [p.laboratorio]);
      if (!lab) continue;
      const [[resp]] = await conn.query('SELECT id_usuario FROM usuarios WHERE email = ?', [p.responsable]);
      const semilla = equiposDelPerfil(p);
      const idsSemilla = new Set(semilla.map((e) => e.identificador));
      const [delLab] = await conn.query('SELECT * FROM equipos WHERE id_laboratorio = ?', [lab.id_laboratorio]);
      const propios = delLab.filter((e) => !idsSemilla.has(e.identificador));
      let ocupados = delLab.length;

      for (const e of semilla) {
        if (eliminados.has(e.identificador)) continue;
        const [[existente]] = await conn.query('SELECT * FROM equipos WHERE identificador = ? OR nro_serie = ? LIMIT 1', [e.identificador, e.nro_serie]);
        if (!existente) {
          if (propios.length) { resumen.omitidos.push(`${p.laboratorio}: tiene equipos cargados a mano`); break; }
          if (ocupados >= capacidadEfectiva(lab.capacidad_equipos)) { resumen.omitidos.push(`${p.laboratorio}: capacidad completa`); break; }
          const [r] = await conn.query('INSERT INTO equipos SET ?', [{
            identificador: e.identificador, nro_serie: e.nro_serie, tipo: e.tipo, marca: e.marca, modelo: e.modelo,
            procesador: e.procesador, ram: e.ram, almacenamiento: e.almacenamiento, estado: e.estado,
            id_laboratorio: lab.id_laboratorio, id_responsable: resp?.id_usuario ?? null,
          }]);
          ocupados += 1;
          resumen.equipos_agregados += 1;
          resumen.instalaciones += await instalar(conn, r.insertId, p.software, idsSoftware);
          continue;
        }
        if (!reemplazarDemo || existente.id_laboratorio !== lab.id_laboratorio || !esDemoIntacto(existente, p.laboratorio)) continue;
        const cambios = Object.fromEntries(CAMPOS_EQUIPO.filter((k) => existente[k] !== e[k]).map((k) => [k, e[k]]));
        if (Object.keys(cambios).length) await conn.query('UPDATE equipos SET ? WHERE id_equipo = ?', [cambios, existente.id_equipo]);
        if (await softwareDemoIntacto(conn, existente.id_equipo, p.laboratorio)) {
          await conn.query('DELETE FROM equipo_software WHERE id_equipo = ?', [existente.id_equipo]);
          resumen.instalaciones += await instalar(conn, existente.id_equipo, p.software, idsSoftware);
        }
        resumen.equipos_actualizados += 1;
        if (admin) {
          await conn.query(
            "INSERT INTO historial_acciones (id_usuario, accion, entidad, id_registro, detalle) VALUES (?, 'Modificar', 'Equipo', ?, ?)",
            [admin.id_usuario, existente.id_equipo, `Datos iniciales: equipo de demostración actualizado con el equipamiento propio del ${p.laboratorio}.`],
          );
        }
      }
    }
  });
  return resumen;
}

// Asignaciones de los usuarios de demostracion (solo si existen). Solo con db:cargar.
const ASIGNACIONES_DEMO = Object.freeze([
  ['carlos@suiza26.edu', ['Laboratorio 4-1', 'Laboratorio 4-2', 'Laboratorio 4-3']],
  ['diego@suiza26.edu', ['Laboratorio 5-1', 'Laboratorio 5-2']],
  ['pedro@suiza26.edu', ['Laboratorio 4-1']],
  ['maria@suiza26.edu', ['Laboratorio 4-2', 'Laboratorio 4-3']],
  ['sofia@suiza26.edu', ['Laboratorio 5-1', 'Laboratorio 5-2']],
]);

async function asignarUsuariosDemo() {
  let n = 0;
  await withTransaction(async (conn) => {
    for (const [email, labs] of ASIGNACIONES_DEMO) {
      const [r] = await conn.query(
        `INSERT IGNORE INTO usuario_laboratorio (id_usuario, id_laboratorio)
         SELECT u.id_usuario, l.id_laboratorio FROM usuarios u CROSS JOIN laboratorios l
          WHERE u.email = ? AND l.nombre IN (?)`,
        [email, labs],
      );
      n += r.affectedRows;
    }
  });
  return n;
}

// Una sola vez por proceso: al iniciar, o en la primera consulta de laboratorios si
// MySQL no estaba disponible cuando arranco el servidor.
let aplicado = null;
async function asegurarDatosUnaVez() {
  if (aplicado) return aplicado;
  aplicado = await asegurarDatosIniciales();
  return aplicado;
}

module.exports = { PERFILES, SOFTWARE, EQUIPOS_INICIALES, asegurarDatosIniciales, asegurarDatosUnaVez, asignarUsuariosDemo };
