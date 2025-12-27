const express = require('express');
const router = express.Router();
const maestroController = require('../controllers/maestroController');
const { authenticateToken } = require('../middleware/authMiddleware');

// Rutas públicas (no requieren autenticación)
router.post('/register', maestroController.register);
router.post('/login', maestroController.login);

// Rutas protegidas (requieren autenticación)
router.post('/logout', authenticateToken, maestroController.logout);
router.get('/verify', maestroController.verifyToken);

module.exports = router;