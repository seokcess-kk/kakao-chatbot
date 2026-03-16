const { buildSimpleTextResponse } = require('../utils/kakaoResponse');

function errorHandler(error, req, res, next) {
  if (res.headersSent) {
    return next(error);
  }

  // 에러 코드와 메시지를 구조화하여 로깅
  console.error('[ERROR]', {
    code: error.code || 'UNKNOWN',
    status: error.statusCode || 500,
    message: error.message,
    ...(error.cause ? { cause: error.cause } : {}),
  });

  // 카카오 스킬서버는 항상 HTTP 200으로 응답해야 함
  // 비-200 응답은 카카오가 폴백 블록을 표시하므로 에러 메시지가 사용자에게 전달되지 않음
  const userMessage = error.statusCode
    ? error.message
    : '검색량 조회 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.';

  return res.status(200).json(buildSimpleTextResponse(userMessage));
}

module.exports = errorHandler;
