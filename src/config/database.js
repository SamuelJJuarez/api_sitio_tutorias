import postgres from 'postgres'
import 'dotenv/config'

// Creamos la conexión única usando la URL del .env
const sql = postgres(process.env.DATABASE_URL)

export default sql