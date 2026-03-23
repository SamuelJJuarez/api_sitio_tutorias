const express = require('express');
const router = express.Router();
const grupoController = require('../controllers/grupoController');

// Rutas públicas (no requieren autenticación)
router.post('/register', grupoController.register);
router.get('/recientes', grupoController.getGruposRecientesPorCarrera);

// Rutas protegidas (requieren autenticación)
//router.post('/logout', authenticateToken, alumnoController.logout);

module.exports = router;