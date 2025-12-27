const express = require('express');
const router = express.Router();
const grupoController = require('../controllers/grupoController');
const { authenticateToken } = require('../middleware/authMiddleware');

// Rutas públicas (no requieren autenticación)
router.post('/register', grupoController.register);

// Rutas protegidas (requieren autenticación)
//router.post('/logout', authenticateToken, alumnoController.logout);

module.exports = router;