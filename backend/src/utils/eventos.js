// Eventos en tiempo real con Server-Sent Events (SSE): cada ventana abierta mantiene una
// conexion y el servidor le envia lo que le corresponde segun su INSTITUCION, su rol y sus
// laboratorios. Nunca se envia nada a un cliente de otra institucion.
//   alerta           -> nueva alerta de mantenimiento (admin, directivo y roles de gestion)
//   alerta-resuelta  -> una alerta dejo de estar activa
//   sesion           -> la cuenta fue bloqueada o eliminada, o cambio su contraseña: la ventana debe cerrar sesion
//   solicitud-contrasena / solicitud-atendida -> pedidos de "¿Olvidaste tu contraseña?" (solo administradores)
const { ROLES, ROLES_TODOS_LOS_LABS, ROLES_GESTION_MANTENIMIENTO } = require('./roles');

const clientes = new Set();
const LATIDO_MS = 25000;

function enviar(c, evento, datos) {
  try {
    c.res.write(`event: ${evento}\ndata: ${JSON.stringify(datos)}\n\n`);
  } catch {
    clientes.delete(c);
  }
}

// labs: lista de ids de laboratorios permitidos (de la institucion del usuario).
function suscribir(req, res, labs) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write('retry: 5000\n\n');
  const c = { res, user: req.user, labs };
  clientes.add(c);
  enviar(c, 'conectado', { usuario: req.user.id, rol: req.user.rol });
  const latido = setInterval(() => {
    try { res.write(': latido\n\n'); } catch { /* conexion cerrada */ }
  }, LATIDO_MS);
  req.on('close', () => { clearInterval(latido); clientes.delete(c); });
}

const mismaInstitucion = (c, idInstitucion) => Boolean(c.user.idInstitucion) && c.user.idInstitucion === Number(idInstitucion);
const recibeAlertas = (c) => ROLES_TODOS_LOS_LABS.includes(c.user.rol) || ROLES_GESTION_MANTENIMIENTO.includes(c.user.rol);
const veLaboratorio = (c, idLab) => Array.isArray(c.labs) && c.labs.includes(Number(idLab));

// La alerta debe traer id_institucion e id_laboratorio.
function emitirAlerta(evento, alerta) {
  for (const c of clientes) {
    if (mismaInstitucion(c, alerta.id_institucion) && recibeAlertas(c) && veLaboratorio(c, alerta.id_laboratorio)) enviar(c, evento, alerta);
  }
}

// Eventos solo para las ventanas de administradores de esa institucion.
function emitirAdmins(idInstitucion, evento, datos) {
  for (const c of clientes) if (c.user.rol === ROLES.ADMIN && mismaInstitucion(c, idInstitucion)) enviar(c, evento, datos);
}

// Avisa a todas las ventanas de un usuario y cierra sus conexiones.
function cerrarSesionesDe(idUsuario, motivo) {
  for (const c of clientes) {
    if (c.user.id === idUsuario) {
      enviar(c, 'sesion', { motivo });
      try { c.res.end(); } catch { /* ya cerrada */ }
      clientes.delete(c);
    }
  }
}

// Institucion suspendida: se cierran todas sus ventanas abiertas.
function cerrarSesionesInstitucion(idInstitucion, motivo) {
  for (const c of clientes) {
    if (mismaInstitucion(c, idInstitucion)) {
      enviar(c, 'sesion', { motivo, codigo: 'INSTITUCION_SUSPENDIDA' });
      try { c.res.end(); } catch { /* ya cerrada */ }
      clientes.delete(c);
    }
  }
}

const conectados = () => [...clientes].map((c) => ({ usuario: c.user.id, rol: c.user.rol }));

module.exports = { suscribir, emitirAlerta, emitirAdmins, cerrarSesionesDe, cerrarSesionesInstitucion, conectados, ROLES };
