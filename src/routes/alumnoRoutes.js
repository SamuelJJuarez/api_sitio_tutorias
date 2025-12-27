const express = require('express');
const router = express.Router();
const alumnoController = require('../controllers/alumnoController');
const { authenticateToken } = require('../middleware/authMiddleware');

// Rutas públicas (no requieren autenticación)
router.post('/register', alumnoController.register);
router.post('/login', alumnoController.login);

// Rutas protegidas (requieren autenticación)
router.post('/logout', authenticateToken, alumnoController.logout);
router.get('/verify', alumnoController.verifyToken);

module.exports = router;