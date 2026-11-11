const { Router } = require('express');
const { asyncHandler: h } = require('../utils/httpError');
const { autenticar: autenticarBase, requiereInstitucion, permitirRoles } = require('../middlewares/auth');
const { ROLES, ROLES_GESTION_MANTENIMIENTO, ROLES_REPORTE_PROBLEMAS } = require('../utils/roles');
const auth = require('../controllers/authController');
const usuarios = require('../controllers/usuariosController');
const laboratorios = require('../controllers/laboratoriosController');
const equipos = require('../controllers/equiposController');
const software = require('../controllers/softwareController');
const alertas = require('../controllers/alertasController');
const mant = require('../controllers/mantenimientosController');
const inst = require('../controllers/institucionController');
const pagos = require('../controllers/pagosController');
const { pool } = require('../config/db');
const { explicarErrorMySQL } = require('../config/diagnostico');

const r = Router();

r.get('/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true, db: 'conectada' });
  } catch (err) {
    res.status(503).json({ ok: false, db: 'sin conexión', error: explicarErrorMySQL(err) });
  }
});

// Autenticacion
r.post('/auth/login', h(auth.login));
r.post('/auth/recuperar', h(auth.recuperar));
r.get('/auth/me', autenticarBase, h(auth.me));

// Todo lo que sigue son rutas de un colegio: exigen un usuario de una institucion (el
// SUPERADMIN no ve datos internos). La institucion sale de la base, nunca del cliente.
const autenticar = [autenticarBase, requiereInstitucion];

// Plataforma: solo el SUPERADMIN (alta y estado de instituciones)
const soloSuperadmin = [autenticarBase, permitirRoles(ROLES.SUPERADMIN)];
r.get('/plataforma/instituciones', soloSuperadmin, h(inst.listarInstituciones));
r.post('/plataforma/instituciones', soloSuperadmin, h(inst.crearInstitucion));
r.patch('/plataforma/instituciones/:id/estado', soloSuperadmin, h(inst.cambiarEstado));
r.put('/plataforma/instituciones/:id/plan', soloSuperadmin, h(pagos.actualizarPlan));
r.get('/plataforma/pagos', soloSuperadmin, h(pagos.listar));
r.get('/plataforma/pagos/resumen', soloSuperadmin, h(pagos.resumen));
r.post('/plataforma/pagos', soloSuperadmin, h(pagos.registrar));
r.post('/plataforma/pagos/procesar', soloSuperadmin, h(pagos.procesarAhora));
r.patch('/plataforma/pagos/:id', soloSuperadmin, h(pagos.actualizar));

// Institucion del usuario: la ven todos; la edita el administrador
r.get('/institucion', autenticar, h(inst.ver));
r.put('/institucion', autenticar, permitirRoles(ROLES.ADMIN), h(inst.actualizar));
r.patch('/institucion/configurada', autenticar, permitirRoles(ROLES.ADMIN), h(inst.marcarConfigurada));
// Plan y pagos del colegio: solo lectura, y solo el administrador.
r.get('/institucion/plan', autenticar, permitirRoles(ROLES.ADMIN), h(pagos.miPlan));

// Usuarios y roles: solo el administrador
const soloAdmin = [autenticar, permitirRoles(ROLES.ADMIN)];
r.get('/roles/asignables', soloAdmin, h(usuarios.rolesAsignables));
r.get('/usuarios', soloAdmin, h(usuarios.listar));
r.get('/usuarios/solicitudes', soloAdmin, h(usuarios.listarSolicitudes));
r.patch('/usuarios/solicitudes/:id/descartar', soloAdmin, h(usuarios.descartarSolicitud));
r.patch('/usuarios/:id/contrasena', soloAdmin, h(usuarios.cambiarContrasena));
r.post('/usuarios', soloAdmin, h(usuarios.crear));
r.patch('/usuarios/:id/rol', soloAdmin, h(usuarios.actualizarRol));
r.patch('/usuarios/:id/bloqueo', soloAdmin, h(usuarios.cambiarBloqueo));
r.delete('/usuarios/:id', soloAdmin, h(usuarios.eliminar));

// Alertas de mantenimiento: listado, resumen, eventos en tiempo real y verificacion manual
const verAlertas = [autenticar, permitirRoles(ROLES.ADMIN, ROLES.DIRECTIVO, ROLES_GESTION_MANTENIMIENTO)];
r.get('/alertas', verAlertas, h(alertas.listar));
r.get('/alertas/resumen', verAlertas, h(alertas.resumen));
// El stream acepta tambien al SUPERADMIN (no recibe eventos de ningun colegio).
r.get('/alertas/stream', autenticarBase, h(alertas.stream));
r.post('/alertas/verificar', soloAdmin, h(alertas.verificar));

// Laboratorios (filtrados por los laboratorios del usuario; alta y edicion solo el administrador)
r.get('/laboratorios', autenticar, h(laboratorios.listar));
r.post('/laboratorios', soloAdmin, h(laboratorios.crear));
r.get('/laboratorios/:id', autenticar, h(laboratorios.detalle));
r.put('/laboratorios/:id', soloAdmin, h(laboratorios.actualizar));
r.delete('/laboratorios/:id', soloAdmin, h(laboratorios.eliminar));
r.get('/laboratorios/:id/responsables', autenticar, permitirRoles(ROLES_GESTION_MANTENIMIENTO), h(laboratorios.responsables));

// Software de cada laboratorio (instalado en sus equipos)
const gestionLab = [autenticar, permitirRoles(ROLES_GESTION_MANTENIMIENTO)];
r.get('/laboratorios/:id/software', autenticar, h(software.listarDeLaboratorio));
r.post('/laboratorios/:id/software', gestionLab, h(software.agregarALaboratorio));
r.put('/laboratorios/:id/software/:idSoftware', gestionLab, h(software.actualizarEnLaboratorio));
r.delete('/laboratorios/:id/software/:idSoftware', gestionLab, h(software.quitarDeLaboratorio));

// Equipos (alta y edicion: administrador y roles de gestion, en sus laboratorios)
r.get('/software', autenticar, h(software.catalogo));
r.get('/equipos', autenticar, h(equipos.listar));
r.post('/equipos', autenticar, permitirRoles(ROLES_GESTION_MANTENIMIENTO), h(equipos.crear));
r.post('/equipos/lote', autenticar, permitirRoles(ROLES_GESTION_MANTENIMIENTO), h(equipos.crearLote));
r.get('/equipos/:id', autenticar, h(equipos.detalle));
r.put('/equipos/:id', autenticar, permitirRoles(ROLES_GESTION_MANTENIMIENTO), h(equipos.actualizar));
r.delete('/equipos/:id', soloAdmin, h(equipos.eliminar));

// Seccion unificada MANTENIMIENTOS
const gestion = permitirRoles(ROLES_GESTION_MANTENIMIENTO);
r.get('/mantenimientos/resumen', autenticar, h(mant.resumen));
r.get('/mantenimientos/equipos-con-problemas', autenticar, h(mant.equiposConProblemas));
r.get('/mantenimientos/historial/:idEquipo', autenticar, h(mant.historialEquipo));
r.post('/mantenimientos/problemas', autenticar, permitirRoles(ROLES_REPORTE_PROBLEMAS), h(mant.reportarProblema));
r.patch('/mantenimientos/problemas/:id/resolver', autenticar, gestion, h(mant.resolverProblema));
r.get('/mantenimientos', autenticar, h(mant.listar));
r.post('/mantenimientos', autenticar, gestion, h(mant.crear));
r.get('/mantenimientos/:id', autenticar, h(mant.detalle));
r.put('/mantenimientos/:id', autenticar, gestion, h(mant.actualizar));
r.patch('/mantenimientos/:id/estado', autenticar, gestion, h(mant.cambiarEstado));

module.exports = r;
