const express = require('express');

const { handleCommand } = require('../controllers/kakaoController');

const router = express.Router();

router.post('/command', handleCommand);

module.exports = router;
