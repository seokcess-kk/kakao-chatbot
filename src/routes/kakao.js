const express = require('express');

const { handleKeywordVolume } = require('../controllers/kakaoController');

const router = express.Router();

router.post('/keyword-volume', handleKeywordVolume);

module.exports = router;
