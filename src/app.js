const express = require('express');

const kakaoRouter = require('./routes/kakao');
const errorHandler = require('./middlewares/errorHandler');

const app = express();

app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ ok: true });
});

app.use('/kakao', kakaoRouter);

app.use(errorHandler);

module.exports = app;
