const express = require('express');

const { handleKeywordVolume, handleCommand } = require('../controllers/kakaoController');

const router = express.Router();

router.post('/keyword-volume', handleKeywordVolume);
router.post('/command', handleCommand);

module.exports = router;
