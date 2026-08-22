const postgres = require('postgres');
require('dotenv').config();

// Creamos la conexión usando la URL del .env
const sql = postgres(process.env.DATABASE_URL);

// Función para verificar la conexión
const testConnection = async () => {
    try {
        await sql`SELECT 1`;
        console.log('Conexión exitosa a la base de datos PostgreSQL');

        // Asegurar columnas de estado y token para entrevistas
        await sql`
            ALTER TABLE entrevistas 
            ADD COLUMN IF NOT EXISTS estado varchar(20) DEFAULT 'pendiente',
            ADD COLUMN IF NOT EXISTS motivo_rechazo text DEFAULT NULL,
            ADD COLUMN IF NOT EXISTS token_respuesta varchar(64) DEFAULT NULL;
        `;

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