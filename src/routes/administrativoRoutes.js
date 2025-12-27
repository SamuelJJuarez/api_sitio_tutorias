const express = require('express');
const router = express.Router();
const administrativoController = require('../controllers/administrativoController');
const { authenticateToken } = require('../middleware/authMiddleware');

// Rutas públicas (no requieren autenticación)
router.post('/register', administrativoController.register);
router.post('/login', administrativoController.login);

// Rutas protegidas (requieren autenticación)
router.post('/logout', authenticateToken, administrativoController.logout);
router.get('/verify', administrativoController.verifyToken);

module.exports = router;