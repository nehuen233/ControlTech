// Traduce los errores de conexion de MySQL a mensajes con la causa y como resolverla.
function explicarErrorMySQL(err) {
  const host = `${process.env.DB_HOST || 'localhost'}:${process.env.DB_PORT || 3306}`;
  const usuario = process.env.DB_USER || 'root';
  const base = process.env.DB_NAME || 'controltecchh';
  switch (err.code) {
    case 'ECONNREFUSED':
      return `MySQL no responde en ${host}. Iniciá el servicio MySQL (en XAMPP: botón "Start" de MySQL) y revisá DB_HOST/DB_PORT en backend/.env.`;
    case 'ENOTFOUND':
    case 'EAI_AGAIN':
      return `No se encuentra el host "${process.env.DB_HOST}". Usá DB_HOST=localhost (o 127.0.0.1) en backend/.env.`;
    case 'ETIMEDOUT':
      return `Se agotó el tiempo al conectar con ${host}. Revisá DB_HOST/DB_PORT y que MySQL esté iniciado.`;
    case 'ER_ACCESS_DENIED_ERROR':
      return `MySQL rechazó al usuario "${usuario}" (usuario o contraseña incorrectos). Revisá DB_USER y DB_PASSWORD en backend/.env. En XAMPP el usuario por defecto es root con contraseña vacía (DB_PASSWORD=).`;
    case 'ER_BAD_DB_ERROR':
      return `La base "${base}" no existe en este servidor. Ejecutá "BD CONTROLTECH.sql" o poné en DB_NAME el nombre real de tu base (por ejemplo controltech).`;
    case 'ER_DBACCESS_DENIED_ERROR':
    case 'ER_TABLEACCESS_DENIED_ERROR':
      return `La base "${base}" no existe o el usuario "${usuario}" no tiene permisos sobre ella. Revisá DB_NAME en backend/.env (según BD CONTROLTECH.sql es controltecchh) o ejecutá: GRANT SELECT, INSERT, UPDATE, DELETE ON ${base}.* TO '${usuario}'@'localhost';`;
    case 'ER_NOT_SUPPORTED_AUTH_MODE':
    case 'AUTH_SWITCH_PLUGIN_ERROR':
      return `El método de autenticación del usuario "${usuario}" no es compatible. Ejecutá: ALTER USER '${usuario}'@'localhost' IDENTIFIED WITH mysql_native_password BY 'tu_clave';`;
    case 'ER_NO_SUCH_TABLE':
      return `Falta una tabla en "${base}": ${err.message}. Verificá que DB_NAME apunte a la base creada con "BD CONTROLTECH.sql".`;
    default:
      return `${err.code || 'Error'}: ${err.message}`;
  }
}

module.exports = { explicarErrorMySQL };
