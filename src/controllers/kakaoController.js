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
      '[키워드 검색량 조회]',
      `검색어: ${volume.keyword}`,
      `PC 검색량: ${volume.pcSearchesText}`,
      `모바일 검색량: ${volume.mobileSearchesText}`,
      `총 검색량: ${volume.totalSearchesText}`,
    ].join('\n');

    res.json(buildSimpleTextResponse(text));
  } catch (error) {
    next(error);
  }
}

module.exports = {
  handleKeywordVolume,
};
