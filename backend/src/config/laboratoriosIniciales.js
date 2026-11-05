// Laboratorios que deben figurar en el sistema desde que se inicializa.
// Datos tomados de "CONTROL TECH INSERTS.sql" (se excluye el Laboratorio 4-4).
const { query } = require('./db');

const LABORATORIOS_INICIALES = Object.freeze([
  { nombre: 'Laboratorio 4-1', piso: '4to piso', ubicacion: 'Sector 4-1', descripcion: 'Laboratorio del cuarto piso para clases y actividades educativas con computadoras' },
  { nombre: 'Laboratorio 4-2', piso: '4to piso', ubicacion: 'Sector 4-2', descripcion: 'Laboratorio del cuarto piso para clases y actividades educativas con computadoras' },
  { nombre: 'Laboratorio 4-3', piso: '4to piso', ubicacion: 'Sector 4-3', descripcion: 'Laboratorio del cuarto piso para clases y actividades educativas con computadoras' },
  { nombre: 'Laboratorio 5-1', piso: '5to piso', ubicacion: 'Ala izquierda', descripcion: 'Laboratorio del quinto piso para clases y actividades educativas con computadoras' },
  { nombre: 'Laboratorio 5-2', piso: '5to piso', ubicacion: 'Ala Derecha', descripcion: 'Laboratorio del quinto piso para clases y actividades educativas con computadoras' },
].map((l) => Object.freeze({ ...l, edificio: 'Edificio principal del colegio', capacidad_equipos: 15, estado: 'Activo' })));

// Crea los laboratorios iniciales que falten (se identifican por nombre: no se duplican
// ni se modifican los existentes) y da acceso a ellos al administrador.
// Devuelve la cantidad de laboratorios creados.
async function asegurarLaboratoriosIniciales() {
  let creados = 0;
  for (const l of LABORATORIOS_INICIALES) {
    const r = await query(
      `INSERT INTO laboratorios (nombre, descripcion, edificio, piso, ubicacion, capacidad_equipos, estado)
       SELECT ?, ?, ?, ?, ?, ?, ? FROM DUAL
        WHERE NOT EXISTS (SELECT 1 FROM laboratorios WHERE LOWER(TRIM(nombre)) = LOWER(?))`,
      [l.nombre, l.descripcion, l.edificio, l.piso, l.ubicacion, l.capacidad_equipos, l.estado, l.nombre],
    );
    creados += r.affectedRows;
  }
  await query(
    `INSERT IGNORE INTO usuario_laboratorio (id_usuario, id_laboratorio)
     SELECT u.id_usuario, l.id_laboratorio
       FROM usuarios u JOIN roles r ON r.id_rol = u.id_rol
      CROSS JOIN laboratorios l
      WHERE r.nombre_rol = 'ADMINISTRADOR' AND l.nombre IN (?)`,
    [LABORATORIOS_INICIALES.map((l) => l.nombre)],
  );
  return creados;
}

// Verifica una sola vez por proceso (al iniciar, o en la primera consulta si MySQL
// no estaba disponible al arrancar el servidor).
let verificado = false;
async function asegurarLaboratoriosUnaVez() {
  if (verificado) return 0;
  const creados = await asegurarLaboratoriosIniciales();
  verificado = true;
  return creados;
}

module.exports = { LABORATORIOS_INICIALES, asegurarLaboratoriosIniciales, asegurarLaboratoriosUnaVez };
