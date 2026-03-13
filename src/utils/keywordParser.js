const SUPPORTED_COMMANDS = [
  '검색량',
  '조회',
  '키워드검색량',
];

// 커맨드 타입 정의
const COMMAND_TYPES = {
  ANALYZE: 'ANALYZE',
  SEARCH_VOLUME: 'SEARCH_VOLUME',
  TREND: 'TREND',
  COMPETITION: 'COMPETITION',
  SEASON: 'SEASON',
  RELATED: 'RELATED',
  HELP: 'HELP',
};

// 커맨드 키워드 매핑
const COMMAND_KEYWORDS = {
  '분석': COMMAND_TYPES.ANALYZE,
  '검색량': COMMAND_TYPES.SEARCH_VOLUME,
  '조회': COMMAND_TYPES.SEARCH_VOLUME,
  '트렌드': COMMAND_TYPES.TREND,
  '추이': COMMAND_TYPES.TREND,
  '경쟁': COMMAND_TYPES.COMPETITION,
  '경쟁강도': COMMAND_TYPES.COMPETITION,
  '시즌': COMMAND_TYPES.SEASON,
  '계절': COMMAND_TYPES.SEASON,
  '월별': COMMAND_TYPES.SEASON,
  '연관': COMMAND_TYPES.RELATED,
  '연관키워드': COMMAND_TYPES.RELATED,
  '도움말': COMMAND_TYPES.HELP,
  '?': COMMAND_TYPES.HELP,
  'help': COMMAND_TYPES.HELP,
};

function createValidationError(message, code) {
  const error = new Error(message);
  error.statusCode = 400;
  error.code = code;
  return error;
}

function normalizeKeyword(keyword) {
  return String(keyword || '')
    .trim()
    .replace(/\s+/g, ' ');
}

function stripCommandFromUtterance(utterance) {
  const trimmed = normalizeKeyword(utterance);

  if (!trimmed) {
    return '';
  }

  const matchedCommand = SUPPORTED_COMMANDS.find((command) => {
    return trimmed === command || trimmed.startsWith(`${command} `);
  });

  if (!matchedCommand) {
    throw createValidationError(
      '\uc870\ud68c\ud560 \uac80\uc0c9\uc5b4\ub97c \uc785\ub825\ud574\uc8fc\uc138\uc694. \uc608: \uac80\uc0c9\ub7c9 \ub2e4\uc774\uc5b4\ud2b8\ud55c\uc57d',
      'INVALID_COMMAND'
    );
  }

  return normalizeKeyword(trimmed.slice(matchedCommand.length));
}

function validateKeyword(keyword) {
  if (!keyword) {
    throw createValidationError(
      '\uc870\ud68c\ud560 \uac80\uc0c9\uc5b4\ub97c \uc785\ub825\ud574\uc8fc\uc138\uc694. \uc608: \uac80\uc0c9\ub7c9 \ub2e4\uc774\uc5b4\ud2b8\ud55c\uc57d',
      'KEYWORD_EMPTY'
    );
  }

  if (keyword.length < 2 || keyword.length > 50) {
    throw createValidationError(
      '\uac80\uc0c9\uc5b4 \ud615\uc2dd\uc774 \uc62c\ubc14\ub974\uc9c0 \uc54a\uc2b5\ub2c8\ub2e4. 2\uc790 \uc774\uc0c1 50\uc790 \uc774\ud558\ub85c \uc785\ub825\ud574\uc8fc\uc138\uc694.',
      'KEYWORD_LENGTH_INVALID'
    );
  }

  return keyword;
}

function parseKeywordFromKakaoRequest(body) {
  const paramKeyword = body?.action?.params?.keyword;
  const sourceKeyword =
    typeof paramKeyword === 'string' && paramKeyword.trim()
      ? normalizeKeyword(paramKeyword)
      : stripCommandFromUtterance(body?.userRequest?.utterance || '');

  return validateKeyword(sourceKeyword);
}

/**
 * 커맨드 타입을 파싱합니다.
 * @param {string} utterance - 사용자 발화
 * @returns {string} 커맨드 타입 (ANALYZE, SEARCH_VOLUME, TREND, COMPETITION, SEASON, RELATED, HELP)
 */
function parseCommandType(utterance) {
  const normalized = normalizeKeyword(utterance);

  if (!normalized) {
    return COMMAND_TYPES.HELP;
  }

  // 발화에서 첫 단어 추출
  const firstWord = normalized.split(' ')[0];

  // 커맨드 키워드 매핑에서 찾기
  if (COMMAND_KEYWORDS[firstWord]) {
    return COMMAND_KEYWORDS[firstWord];
  }

  // 기본값: 분석
  return COMMAND_TYPES.ANALYZE;
}

/**
 * 키워드와 커맨드 타입을 함께 파싱합니다.
 * @param {object} body - 카카오 요청 body
 * @returns {{ keyword: string, commandType: string }}
 */
function parseKeywordAndCommand(body) {
  const utterance = body?.userRequest?.utterance || '';
  const paramKeyword = body?.action?.params?.keyword;
  const commandType = parseCommandType(utterance);

  // 도움말인 경우 키워드 불필요
  if (commandType === COMMAND_TYPES.HELP) {
    return { keyword: '', commandType };
  }

  // 파라미터에서 키워드가 있으면 사용
  if (typeof paramKeyword === 'string' && paramKeyword.trim()) {
    return { keyword: normalizeKeyword(paramKeyword), commandType };
  }

  // 발화에서 커맨드 키워드 제거 후 키워드 추출
  const normalized = normalizeKeyword(utterance);
  const words = normalized.split(' ');
  const firstWord = words[0];

  // 첫 단어가 커맨드 키워드이면 나머지를 키워드로 사용
  if (COMMAND_KEYWORDS[firstWord]) {
    const keyword = words.slice(1).join(' ').trim();
    return { keyword: validateKeyword(keyword), commandType };
  }

  // 커맨드 키워드가 없으면 전체를 키워드로 사용
  return { keyword: validateKeyword(normalized), commandType };
}

module.exports = {
  parseKeywordFromKakaoRequest,
  parseCommandType,
  parseKeywordAndCommand,
  COMMAND_TYPES,
};
