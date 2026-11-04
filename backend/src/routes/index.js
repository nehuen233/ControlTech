const { Router } = require('express');
const { asyncHandler: h } = require('../utils/httpError');
const { autenticar, permitirRoles } = require('../middlewares/auth');
const { ROLES, ROLES_GESTION_MANTENIMIENTO, ROLES_REPORTE_PROBLEMAS } = require('../utils/roles');
const auth = require('../controllers/authController');
const usuarios = require('../controllers/usuariosController');
const laboratorios = require('../controllers/laboratoriosController');
const equipos = require('../controllers/equiposController');
const mant = require('../controllers/mantenimientosController');
const { pool } = require('../config/db');
const { explicarErrorMySQL } = require('../config/diagnostico');

const r = Router();

r.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true, db: 'conectada' });
  } catch (err) {
    res.status(503).json({ ok: false, db: 'sin conexión', error: explicarErrorMySQL(err) });
  }
});

// Autenticacion
r.post('/auth/login', h(auth.login));
r.get('/auth/me', autenticar, h(auth.me));

// Usuarios y roles: solo el administrador
const soloAdmin = [autenticar, permitirRoles(ROLES.ADMIN)];
r.get('/roles/asignables', soloAdmin, h(usuarios.rolesAsignables));
r.get('/usuarios', soloAdmin, h(usuarios.listar));
r.post('/usuarios', soloAdmin, h(usuarios.crear));
r.patch('/usuarios/:id/rol', soloAdmin, h(usuarios.actualizarRol));

// Laboratorios (filtrados por los laboratorios del usuario; alta y edicion solo el administrador)
r.get('/laboratorios', autenticar, h(laboratorios.listar));
r.post('/laboratorios', soloAdmin, h(laboratorios.crear));
r.get('/laboratorios/:id', autenticar, h(laboratorios.detalle));
r.put('/laboratorios/:id', soloAdmin, h(laboratorios.actualizar));
r.get('/laboratorios/:id/responsables', autenticar, permitirRoles(ROLES_GESTION_MANTENIMIENTO), h(laboratorios.responsables));

// Equipos (alta y edicion: administrador y roles de gestion, en sus laboratorios)
r.get('/software', autenticar, h(equipos.catalogoSoftware));
r.get('/equipos', autenticar, h(equipos.listar));
r.post('/equipos', autenticar, permitirRoles(ROLES_GESTION_MANTENIMIENTO), h(equipos.crear));
r.get('/equipos/:id', autenticar, h(equipos.detalle));
r.put('/equipos/:id', autenticar, permitirRoles(ROLES_GESTION_MANTENIMIENTO), h(equipos.actualizar));

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
