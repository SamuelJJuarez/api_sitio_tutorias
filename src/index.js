const express = require('express');
const cors = require('cors');
require('dotenv').config();

const { testConnection } = require('./config/database');
const alumnoRoutes = require('./routes/alumnoRoutes');
const grupoRoutes = require('./routes/grupoRoutes');
const maestroRoutes = require('./routes/maestroRoutes');
const administrativoRoutes = require('./routes/administrativoRoutes');

const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Ruta de prueba
app.get('/', (req, res) => {
  res.json({ 
    success: true,
    message: 'API de tutorías funcionando correctamente',
    version: '1.0.0'
  });
});

// Rutas
app.use('/api/alumno', alumnoRoutes);
app.use('/api/grupo', grupoRoutes);
app.use('/api/maestro', maestroRoutes);
app.use('/api/administrativo', administrativoRoutes);

// Manejo de rutas no encontradas
app.use((req, res) => {
  res.status(404).json({ 
    success: false,
    message: 'Ruta no encontrada' 
  });
});

// Manejo de errores global
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ 
    success: false,
    message: 'Error interno del servidor',
    error: err.message 
  });
});

// Iniciar servidor
const startServer = async () => {
  const isConnected = await testConnection();
  
  if (!isConnected) {
    console.error('No se pudo conectar a la base de datos. Verifica tu configuración.');
    process.exit(1);
  }

  app.listen(PORT, () => {
    console.log(`\nServidor corriendo en http://localhost:${PORT}`);
  });
};

startServer();