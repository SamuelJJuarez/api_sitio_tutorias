const express = require('express');
const router = express.Router();
const passwordController = require('../controllers/passwordController');

router.post('/forgot', passwordController.requestPasswordReset);
router.post('/verify', passwordController.verifyPasswordReset);

module.exports = router;
