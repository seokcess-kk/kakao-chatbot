const cacheService = require('./cacheService');
const { generateSignature } = require('../utils/signature');

const NAVER_SEARCH_AD_BASE_URL = 'https://api.searchad.naver.com';
const KEYWORD_TOOL_URI = '/keywordstool';
const CACHE_TTL_SECONDS = 600;
const GENERIC_ERROR_MESSAGE =
  '\uac80\uc0c9\ub7c9 \uc870\ud68c \uc911 \uc624\ub958\uac00 \ubc1c\uc0dd\ud588\uc2b5\ub2c8\ub2e4. \uc7a0\uc2dc \ud6c4 \ub2e4\uc2dc \uc2dc\ub3c4\ud574\uc8fc\uc138\uc694.';
const NOT_FOUND_MESSAGE =
  '\uac80\uc0c9\ub7c9 \ub370\uc774\ud130\ub97c \ucc3e\uc9c0 \ubabb\ud588\uc2b5\ub2c8\ub2e4.';

function createAppError(message, statusCode, code, cause) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  error.cause = cause;
  return error;
}

function normalizeKeyword(value) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function toNumber(value) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }

  if (typeof value !== 'string') {
    return 0;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return 0;
  }

  if (trimmed.includes('<')) {
    const matched = trimmed.match(/\d+/);
    return matched ? Number(matched[0]) : 0;
  }

  const parsed = Number(trimmed.replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatSearchCount(value) {
  return toNumber(value).toLocaleString('ko-KR');
}

function pickKeywordItem(keywordList, keyword) {
  if (!Array.isArray(keywordList) || keywordList.length === 0) {
    return null;
  }

  const normalizedKeyword = normalizeKeyword(keyword);

  return (
    keywordList.find((item) => {
      return normalizeKeyword(item.relKeyword) === normalizedKeyword;
    }) || keywordList[0]
  );
}

async function requestKeywordTool(keyword) {
  // 디버깅 로그 추가
  console.log('[DEBUG] requestKeywordTool 호출:', {
    keyword,
    keywordType: typeof keyword,
    keywordLength: keyword?.length,
    isEmpty: !keyword?.trim()
  });

  // 빈 키워드 방어
  const trimmedKeyword = String(keyword || '').trim();
  if (!trimmedKeyword) {
    throw createAppError(
      '검색어를 입력해주세요.',
      400,
      'EMPTY_KEYWORD'
    );
  }

  const customerId =
    process.env.NAVER_CUSTOMER_ID ||
    process.env.NAVER_SEARCHAD_CUSTOMER_ID;
  const apiKey =
    process.env.NAVER_API_KEY || process.env.NAVER_SEARCHAD_API_KEY;
  const secretKey =
    process.env.NAVER_SECRET_KEY || process.env.NAVER_SEARCHAD_SECRET_KEY;

  if (!customerId || !apiKey || !secretKey) {
    throw createAppError(GENERIC_ERROR_MESSAGE, 500, 'CONFIG_MISSING');
  }

  const timestamp = String(Date.now());
  const method = 'GET';
  const params = new URLSearchParams({
    hintKeywords: keyword,
    showDetail: '1',
  });
  const signature = generateSignature({
    timestamp,
    method,
    uri: KEYWORD_TOOL_URI,
    secretKey,
  });

  let response;

  try {
    response = await fetch(
      `${NAVER_SEARCH_AD_BASE_URL}${KEYWORD_TOOL_URI}?${params.toString()}`,
      {
        method,
        headers: {
          'X-Timestamp': timestamp,
          'X-API-KEY': apiKey,
          'X-CUSTOMER': customerId,
          'X-Signature': signature,
        },
      }
    );
  } catch (error) {
    throw createAppError(
      GENERIC_ERROR_MESSAGE,
      502,
      'NAVER_NETWORK_ERROR',
      error
    );
  }

  if (!response.ok) {
    let payload = null;

    try {
      payload = await response.json();
    } catch (_error) {
      payload = null;
    }

    if (response.status === 401 || response.status === 403) {
      throw createAppError(
        GENERIC_ERROR_MESSAGE,
        502,
        'NAVER_AUTH_ERROR',
        payload
      );
    }

    if (response.status === 429 || response.status >= 500) {
      throw createAppError(
        GENERIC_ERROR_MESSAGE,
        502,
        'NAVER_TEMPORARY_ERROR',
        payload
      );
    }

    throw createAppError(GENERIC_ERROR_MESSAGE, 502, 'NAVER_API_ERROR', payload);
  }

  return response.json();
}

async function getKeywordVolume(keyword) {
  const normalizedKeyword = normalizeKeyword(keyword);
  const cached = cacheService.get(normalizedKeyword);

  if (cached) {
    return cached;
  }

  const payload = await requestKeywordTool(keyword);
  const selectedKeyword = pickKeywordItem(payload.keywordList, keyword);

  if (!selectedKeyword) {
    throw createAppError(NOT_FOUND_MESSAGE, 404, 'KEYWORD_NOT_FOUND');
  }

  const pcSearches = toNumber(selectedKeyword.monthlyPcQcCnt);
  const mobileSearches = toNumber(selectedKeyword.monthlyMobileQcCnt);
  const result = {
    keyword: selectedKeyword.relKeyword || keyword,
    pcSearches,
    mobileSearches,
    totalSearches: pcSearches + mobileSearches,
    pcSearchesText: formatSearchCount(selectedKeyword.monthlyPcQcCnt),
    mobileSearchesText: formatSearchCount(selectedKeyword.monthlyMobileQcCnt),
    totalSearchesText: (pcSearches + mobileSearches).toLocaleString('ko-KR'),
  };

  cacheService.set(normalizedKeyword, result, CACHE_TTL_SECONDS);

  return result;
}

/**
 * 키워드 검색량과 연관 키워드 목록을 함께 반환합니다.
 * @param {string} keyword - 검색 키워드
 * @param {number} relatedLimit - 연관 키워드 제한 개수 (기본: 10)
 * @returns {Promise<object>} 검색량 + 연관 키워드 + 경쟁 데이터
 */
async function getKeywordVolumeWithRelated(keyword, relatedLimit = 10) {
  const normalizedKeyword = normalizeKeyword(keyword);
  const cacheKey = `${normalizedKeyword}_related_${relatedLimit}`;
  const cached = cacheService.get(cacheKey);

  if (cached) {
    return cached;
  }

  const payload = await requestKeywordTool(keyword);
  const keywordList = payload.keywordList || [];
  const selectedKeyword = pickKeywordItem(keywordList, keyword);

  if (!selectedKeyword) {
    throw createAppError(NOT_FOUND_MESSAGE, 404, 'KEYWORD_NOT_FOUND');
  }

  const pcSearches = toNumber(selectedKeyword.monthlyPcQcCnt);
  const mobileSearches = toNumber(selectedKeyword.monthlyMobileQcCnt);

  // 연관 키워드 추출 (본 키워드 제외)
  const relatedKeywords = keywordList
    .filter((item) => normalizeKeyword(item.relKeyword) !== normalizedKeyword)
    .slice(0, relatedLimit)
    .map((item) => ({
      keyword: item.relKeyword,
      pcSearches: toNumber(item.monthlyPcQcCnt),
      mobileSearches: toNumber(item.monthlyMobileQcCnt),
      totalSearches:
        toNumber(item.monthlyPcQcCnt) + toNumber(item.monthlyMobileQcCnt),
      totalSearchesText: (
        toNumber(item.monthlyPcQcCnt) + toNumber(item.monthlyMobileQcCnt)
      ).toLocaleString('ko-KR'),
      compIdx: item.compIdx || 'N/A',
    }));

  // 월별 검색량 데이터 (트렌드용)
  const monthlyData = extractMonthlyData(selectedKeyword);

  const result = {
    keyword: selectedKeyword.relKeyword || keyword,
    pcSearches,
    mobileSearches,
    totalSearches: pcSearches + mobileSearches,
    pcSearchesText: formatSearchCount(selectedKeyword.monthlyPcQcCnt),
    mobileSearchesText: formatSearchCount(selectedKeyword.monthlyMobileQcCnt),
    totalSearchesText: (pcSearches + mobileSearches).toLocaleString('ko-KR'),
    // 경쟁 데이터
    compIdx: selectedKeyword.compIdx || 'N/A',
    plAvgDepth: toNumber(selectedKeyword.plAvgDepth),
    // 클릭 데이터
    monthlyPcClkCnt: toNumber(selectedKeyword.monthlyPcClkCnt),
    monthlyMobileClkCnt: toNumber(selectedKeyword.monthlyMobileClkCnt),
    monthlyAvePcClkCnt: toNumber(selectedKeyword.monthlyAvePcClkCnt),
    monthlyAveMobileClkCnt: toNumber(selectedKeyword.monthlyAveMobileClkCnt),
    // CTR 계산
    pcCtr: pcSearches > 0 ? (toNumber(selectedKeyword.monthlyPcClkCnt) / pcSearches * 100).toFixed(2) : '0.00',
    mobileCtr: mobileSearches > 0 ? (toNumber(selectedKeyword.monthlyMobileClkCnt) / mobileSearches * 100).toFixed(2) : '0.00',
    // 월별 데이터 (트렌드용)
    monthlyData,
    // 연관 키워드
    relatedKeywords,
  };

  cacheService.set(cacheKey, result, CACHE_TTL_SECONDS);

  return result;
}

/**
 * 월별 검색량 데이터 추출 (최근 12개월)
 * 네이버 API가 월별 데이터를 직접 제공하지 않으므로,
 * 여기서는 시뮬레이션 데이터를 생성합니다.
 * 실제 구현시 네이버 트렌드 API 연동 필요
 */
function extractMonthlyData(keywordItem) {
  const now = new Date();
  const monthlyData = [];
  const baseValue = toNumber(keywordItem.monthlyPcQcCnt) + toNumber(keywordItem.monthlyMobileQcCnt);

  for (let i = 11; i >= 0; i--) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const year = date.getFullYear().toString().slice(2);
    const month = String(date.getMonth() + 1).padStart(2, '0');

    // 시즌 변동을 시뮬레이션 (실제로는 네이버 트렌드 API 사용)
    const seasonFactor = 0.7 + Math.random() * 0.6; // 0.7 ~ 1.3
    const value = Math.round(baseValue * seasonFactor);

    monthlyData.push({
      period: `${year}.${month}`,
      value,
      valueText: value.toLocaleString('ko-KR'),
    });
  }

  return monthlyData;
}

module.exports = {
  getKeywordVolume,
  getKeywordVolumeWithRelated,
};
