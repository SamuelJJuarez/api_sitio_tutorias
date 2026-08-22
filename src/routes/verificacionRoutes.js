const express = require('express');
const router = express.Router();
const verificacionController = require('../controllers/verificacionController');

router.post('/verificar', verificacionController.verifyRegistration);
router.get('/status/:registroId', verificacionController.checkRegistrationStatus);
router.get('/entrevista/:token', verificacionController.getEntrevistaPorToken);
router.post('/entrevista/responder', verificacionController.responderEntrevista);

module.exports = router;
