const {
  parseKeywordFromKakaoRequest,
} = require('../utils/keywordParser');
const {
  buildSimpleTextResponse,
} = require('../utils/kakaoResponse');
const { getKeywordVolume } = require('../services/naverKeywordService');

async function handleKeywordVolume(req, res, next) {
  // 채널 추가 여부 및 요청 구조 로깅
  console.log('[DEBUG] 카카오 요청:', {
    hasUser: !!req.body?.userRequest?.user,
    plusfriendUserKey: req.body?.userRequest?.user?.plusfriendUserKey || 'N/A',
    utterance: req.body?.userRequest?.utterance,
    params: req.body?.action?.params
  });

  try {
    const keyword = parseKeywordFromKakaoRequest(req.body);
    const volume = await getKeywordVolume(keyword);
    const text = [
      '[\ud0a4\uc6cc\ub4dc \uac80\uc0c9\ub7c9 \uc870\ud68c]',
      `\uac80\uc0c9\uc5b4: ${volume.keyword}`,
      `PC \uac80\uc0c9\ub7c9: ${volume.pcSearchesText}`,
      `\ubaa8\ubc14\uc77c \uac80\uc0c9\ub7c9: ${volume.mobileSearchesText}`,
      `\ucd1d \uac80\uc0c9\ub7c9: ${volume.totalSearchesText}`,
    ].join('\n');

    res.json(buildSimpleTextResponse(text));
  } catch (error) {
    next(error);
  }
}

module.exports = {
  handleKeywordVolume,
};
