const SUPPORTED_COMMANDS = [
  '\uac80\uc0c9\ub7c9',
  '\uc870\ud68c',
  '\ud0a4\uc6cc\ub4dc\uac80\uc0c9\ub7c9',
];

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

module.exports = {
  parseKeywordFromKakaoRequest,
};
