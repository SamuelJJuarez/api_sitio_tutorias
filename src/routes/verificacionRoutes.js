const express = require('express');
const router = express.Router();
const verificacionController = require('../controllers/verificacionController');

router.post('/verificar', verificacionController.verifyRegistration);
router.get('/status/:registroId', verificacionController.checkRegistrationStatus);

module.exports = router;
