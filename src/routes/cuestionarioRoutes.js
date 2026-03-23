const express = require('express');
const router = express.Router();
const controller = require('../controllers/cuestionarioController');
const { verifyToken } = require('../middleware/authMiddleware'); // <--- Importamos el middleware

// Aplicamos verifyToken a todas las rutas
// GET /api/cuestionario/estatus (Ya no requiere ID en la URL, lo saca del token)
router.get('/estatus', verifyToken, controller.getEstatusCuestionario);

// GET /api/cuestionario/seccion/:id_seccion
router.get('/seccion/:id_seccion', verifyToken, controller.getPreguntasPorSeccion);

// POST /api/cuestionario/guardar
router.post('/guardar', verifyToken, controller.saveSeccion);

router.get('/resultados', verifyToken, controller.getResultadosAlumno);

router.get('/resultados/:num_control', verifyToken, controller.getResultadosPorAlumnoId);

module.exports = router;