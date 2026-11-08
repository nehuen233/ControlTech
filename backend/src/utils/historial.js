// Registra una accion en `historial_acciones` usando la conexion de la transaccion actual.
// La institucion se toma del usuario que actua (NULL para el SUPERADMIN): nunca del cliente.
async function registrarAccion(conn, { idUsuario, accion, entidad, idRegistro, detalle }) {
  await conn.query(
    `INSERT INTO historial_acciones (id_usuario, accion, entidad, id_registro, detalle, id_institucion)
     SELECT ?, ?, ?, ?, ?, u.id_institucion FROM usuarios u WHERE u.id_usuario = ?`,
    [idUsuario, accion, entidad, idRegistro ?? null, detalle ?? null, idUsuario],
  );
}

module.exports = { registrarAccion };
