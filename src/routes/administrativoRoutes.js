const express = require('express');
const router = express.Router();
const administrativoController = require('../controllers/administrativoController');
const { verifyToken } = require('../middleware/authMiddleware');

// Rutas públicas (no requieren autenticación)
router.post('/register', administrativoController.register);
router.post('/login', administrativoController.login);

// Rutas protegidas (requieren autenticación)
router.post('/logout', verifyToken, administrativoController.logout);
router.get('/verify', administrativoController.verifyToken);

// Rutas de resultados y filtros (todas protegidas)
router.get('/filtros', verifyToken, administrativoController.getCarrerasYPeriodos);
router.get('/grupos', verifyToken, administrativoController.getGruposPorCarreraYPeriodo);
router.get('/resultados/generales', verifyToken, administrativoController.getResultadosGenerales);
router.get('/resultados/grupo', verifyToken, administrativoController.getResultadosPorGrupo);
router.get('/maestros', verifyToken, administrativoController.getMaestros);
router.post('/grupos/bulk', verifyToken, administrativoController.bulkCreateGrupos);

module.exports = router;