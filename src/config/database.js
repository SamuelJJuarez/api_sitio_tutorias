const postgres = require('postgres');
require('dotenv').config();

// Creamos la conexión usando la URL del .env
const sql = postgres(process.env.DATABASE_URL);

// Función para verificar la conexión
const testConnection = async () => {
    try {
        await sql`SELECT 1`;
        console.log('Conexión exitosa a la base de datos PostgreSQL');
        return true;
    } catch (error) {
        console.error('Error al conectar con la base de datos:', error.message);
        return false;
    }
};

module.exports = {
    pool: sql, // Lo exportamos como pool para que no rompan las importaciones existentes
    testConnection
};