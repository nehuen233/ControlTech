// Eventos en tiempo real con Server-Sent Events (SSE): cada ventana abierta mantiene una
// conexion y el servidor le envia lo que le corresponde segun su rol y sus laboratorios.
//   alerta           -> nueva alerta de mantenimiento (admin, directivo y roles de gestion)
//   alerta-resuelta  -> una alerta dejo de estar activa
//   sesion           -> la cuenta fue bloqueada o eliminada: la ventana debe cerrar sesion
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

// labs: null = todos los laboratorios, o lista de ids.
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

const recibeAlertas = (c) => ROLES_TODOS_LOS_LABS.includes(c.user.rol) || ROLES_GESTION_MANTENIMIENTO.includes(c.user.rol);
const veLaboratorio = (c, idLab) => c.labs === null || c.labs.includes(Number(idLab));

function emitirAlerta(evento, alerta) {
  for (const c of clientes) {
    if (recibeAlertas(c) && veLaboratorio(c, alerta.id_laboratorio)) enviar(c, evento, alerta);
  }
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

const conectados = () => [...clientes].map((c) => ({ usuario: c.user.id, rol: c.user.rol }));

module.exports = { suscribir, emitirAlerta, cerrarSesionesDe, conectados, ROLES };
