const express = require('express');
const router = express.Router();
const maestroController = require('../controllers/maestroController');
const { verifyToken } = require('../middleware/authMiddleware');

// Rutas públicas (no requieren autenticación)
router.post('/register', maestroController.register);
router.post('/login', maestroController.login);

// Rutas protegidas (requieren autenticación)
router.post('/logout', verifyToken, maestroController.logout);
router.get('/verify', maestroController.verifyToken);
router.get('/grupos', verifyToken, maestroController.getGrupos);
router.get('/alumnos/:indice_grupo', verifyToken, maestroController.getAlumnosPorGrupo);
router.get('/entrevistas/:num_control_alum', verifyToken, maestroController.getEntrevistasAlumno);
router.post('/entrevista', verifyToken, maestroController.createEntrevista);
router.put('/entrevista/resumen', verifyToken, maestroController.updateResumen); // Editar Resumen
router.put('/entrevista/reprogramar', verifyToken, maestroController.reprogramarEntrevista); // Reprogramar
router.delete('/entrevista/:id_entrevista', verifyToken, maestroController.deleteEntrevista); // Eliminar

module.exports = router;