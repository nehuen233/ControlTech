// Registra una accion en `historial_acciones` usando la conexion de la transaccion actual.
async function registrarAccion(conn, { idUsuario, accion, entidad, idRegistro, detalle }) {
  await conn.query(
    'INSERT INTO historial_acciones (id_usuario, accion, entidad, id_registro, detalle) VALUES (?, ?, ?, ?, ?)',
    [idUsuario, accion, entidad, idRegistro ?? null, detalle ?? null],
  );
}

module.exports = { registrarAccion };
