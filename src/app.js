console.log('[STARTUP] Express 앱 로드됨');

const express = require('express');

const kakaoRouter = require('./routes/kakao');
const errorHandler = require('./middlewares/errorHandler');
const { checkNaverApiHealth } = require('./services/naverKeywordService');

const app = express();

app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ ok: true, timestamp: new Date().toISOString() });
});

/**
 * 상세 진단 엔드포인트
 * - 환경변수 설정 여부, 네이버 API 연결 상태, 응답 시간을 확인합니다.
 * - HEALTH_CHECK_TOKEN 환경변수로 접근을 제한합니다.
 */
app.get('/health/detail', async (req, res) => {
  const token = process.env.HEALTH_CHECK_TOKEN;
  if (token && req.query.token !== token) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  try {
    const report = {
      timestamp: new Date().toISOString(),
      env: {
        NAVER_CUSTOMER_ID: !!(process.env.NAVER_CUSTOMER_ID || process.env.NAVER_SEARCHAD_CUSTOMER_ID),
        NAVER_API_KEY: !!(process.env.NAVER_API_KEY || process.env.NAVER_SEARCHAD_API_KEY),
        NAVER_SECRET_KEY: !!(process.env.NAVER_SECRET_KEY || process.env.NAVER_SEARCHAD_SECRET_KEY),
      },
      naverApi: await checkNaverApiHealth(),
    };

    const allOk = report.env.NAVER_CUSTOMER_ID
      && report.env.NAVER_API_KEY
      && report.env.NAVER_SECRET_KEY
      && report.naverApi.reachable;

    res.status(allOk ? 200 : 503).json({ ok: allOk, ...report });
  } catch (error) {
    console.error('[ERROR] /health/detail 실패:', error.message);
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.use('/kakao', kakaoRouter);

app.use(errorHandler);

module.exports = app;
