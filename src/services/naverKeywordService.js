const cacheService = require('./cacheService');
const statsService = require('./statsService');
const { generateSignature } = require('../utils/signature');

const NAVER_SEARCH_AD_BASE_URL = 'https://api.searchad.naver.com';
const KEYWORD_TOOL_URI = '/keywordstool';
const CACHE_TTL_SECONDS = 600;
const NAVER_FETCH_TIMEOUT_MS = 3500; // 네이버 API 호출 제한 (카카오 5초 제한 고려)
const GENERIC_ERROR_MESSAGE =
  '검색량 조회 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.';
const NOT_FOUND_MESSAGE =
  '검색량 데이터를 찾지 못했습니다.';

/**
 * 네이버 검색광고 API 인증 정보를 환경변수에서 읽어 반환합니다.
 * @returns {{ customerId: string, apiKey: string, secretKey: string } | null}
 */
function getNaverCredentials() {
  const customerId =
    process.env.NAVER_CUSTOMER_ID || process.env.NAVER_SEARCHAD_CUSTOMER_ID;
  const apiKey =
    process.env.NAVER_API_KEY || process.env.NAVER_SEARCHAD_API_KEY;
  const secretKey =
    process.env.NAVER_SECRET_KEY || process.env.NAVER_SEARCHAD_SECRET_KEY;

  if (!customerId || !apiKey || !secretKey) return null;
  return { customerId, apiKey, secretKey };
}

function createAppError(message, statusCode, code, cause) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  error.cause = cause;
  return error;
}

function normalizeCacheKey(value) {
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

  const normalizedKeyword = normalizeCacheKey(keyword);

  return (
    keywordList.find((item) => {
      return normalizeCacheKey(item.relKeyword) === normalizedKeyword;
    }) || keywordList[0]
  );
}

async function requestKeywordTool(keyword) {
  const trimmedKeyword = String(keyword || '').trim();
  if (!trimmedKeyword) {
    throw createAppError('검색어를 입력해주세요.', 400, 'EMPTY_KEYWORD');
  }

  const credentials = getNaverCredentials();
  if (!credentials) {
    throw createAppError(GENERIC_ERROR_MESSAGE, 500, 'CONFIG_MISSING');
  }

  const { customerId, apiKey, secretKey } = credentials;
  const timestamp = String(Date.now());
  const method = 'GET';
  const params = new URLSearchParams({
    hintKeywords: trimmedKeyword,
    showDetail: '1',
  });
  const signature = generateSignature({
    timestamp,
    method,
    uri: KEYWORD_TOOL_URI,
    secretKey,
  });

  const fetchStart = Date.now();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), NAVER_FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(
      `${NAVER_SEARCH_AD_BASE_URL}${KEYWORD_TOOL_URI}?${params.toString()}`,
      {
        method,
        headers: {
          'X-Timestamp': timestamp,
          'X-API-KEY': apiKey,
          'X-CUSTOMER': customerId,
          'X-Signature': signature,
        },
        signal: controller.signal,
      }
    );

    if (!response.ok) {
      let payload = null;
      try { payload = await response.json(); } catch (_) { /* ignore */ }

      const code = (response.status === 401 || response.status === 403) ? 'NAVER_AUTH_ERROR'
        : (response.status === 429 || response.status >= 500) ? 'NAVER_TEMPORARY_ERROR'
        : 'NAVER_API_ERROR';
      throw createAppError(GENERIC_ERROR_MESSAGE, 502, code, payload);
    }

    clearTimeout(timeoutId);
    statsService.trackApiCall('searchAd');
    const data = await response.json();
    console.log(`[TIMING] 네이버 API: ${Date.now() - fetchStart}ms (keyword: ${trimmedKeyword})`);
    return data;
  } catch (error) {
    clearTimeout(timeoutId);
    const elapsed = Date.now() - fetchStart;

    // 이미 createAppError로 만들어진 에러는 그대로 전파
    if (error.statusCode) throw error;

    console.error(`[TIMING] 네이버 API 실패: ${elapsed}ms`, error.name);

    if (error.name === 'AbortError') {
      throw createAppError(
        '네이버 API 응답 지연으로 조회에 실패했습니다. 잠시 후 다시 시도해주세요.',
        504,
        'NAVER_TIMEOUT'
      );
    }

    throw createAppError(GENERIC_ERROR_MESSAGE, 502, 'NAVER_NETWORK_ERROR', error);
  }
}

/**
 * 키워드 검색량과 연관 키워드 목록을 함께 반환합니다.
 * @param {string} keyword - 검색 키워드
 * @param {number} relatedLimit - 연관 키워드 제한 개수 (기본: 10)
 * @returns {Promise<object>} 검색량 + 연관 키워드 + 경쟁 데이터
 */
async function getKeywordVolumeWithRelated(keyword, relatedLimit = 10) {
  const normalizedKeyword = normalizeCacheKey(keyword);

  // API 결과는 한 번만 캐싱하고, relatedLimit에 따라 slice만 다르게 적용
  const baseCacheKey = `${normalizedKeyword}_base`;
  let base = cacheService.get(baseCacheKey);

  if (!base) {
    const payload = await requestKeywordTool(keyword);
    const keywordList = payload.keywordList || [];
    const selectedKeyword = pickKeywordItem(keywordList, keyword);

    if (!selectedKeyword) {
      throw createAppError(NOT_FOUND_MESSAGE, 404, 'KEYWORD_NOT_FOUND');
    }

    const pcSearches = toNumber(selectedKeyword.monthlyPcQcCnt);
    const mobileSearches = toNumber(selectedKeyword.monthlyMobileQcCnt);

    // 연관 키워드 전체 추출 (본 키워드 제외, 검색량순 정렬)
    const allRelated = keywordList
      .filter((item) => normalizeCacheKey(item.relKeyword) !== normalizedKeyword)
      .map((item) => {
        const pc = toNumber(item.monthlyPcQcCnt);
        const mobile = toNumber(item.monthlyMobileQcCnt);
        const total = pc + mobile;
        return {
          keyword: item.relKeyword,
          pcSearches: pc,
          mobileSearches: mobile,
          totalSearches: total,
          totalSearchesText: total.toLocaleString('ko-KR'),
          compIdx: item.compIdx || 'N/A',
        };
      })
      .sort((a, b) => b.totalSearches - a.totalSearches);

    const monthlyData = extractMonthlyData(selectedKeyword);

    base = {
      keyword: selectedKeyword.relKeyword || keyword,
      pcSearches,
      mobileSearches,
      totalSearches: pcSearches + mobileSearches,
      pcSearchesText: formatSearchCount(selectedKeyword.monthlyPcQcCnt),
      mobileSearchesText: formatSearchCount(selectedKeyword.monthlyMobileQcCnt),
      totalSearchesText: (pcSearches + mobileSearches).toLocaleString('ko-KR'),
      compIdx: selectedKeyword.compIdx || 'N/A',
      plAvgDepth: toNumber(selectedKeyword.plAvgDepth),
      monthlyPcClkCnt: toNumber(selectedKeyword.monthlyPcClkCnt),
      monthlyMobileClkCnt: toNumber(selectedKeyword.monthlyMobileClkCnt),
      monthlyAvePcClkCnt: toNumber(selectedKeyword.monthlyAvePcClkCnt),
      monthlyAveMobileClkCnt: toNumber(selectedKeyword.monthlyAveMobileClkCnt),
      pcCtr: pcSearches > 0 ? (toNumber(selectedKeyword.monthlyPcClkCnt) / pcSearches * 100).toFixed(2) : '0.00',
      mobileCtr: mobileSearches > 0 ? (toNumber(selectedKeyword.monthlyMobileClkCnt) / mobileSearches * 100).toFixed(2) : '0.00',
      monthlyData,
      allRelated,
    };

    cacheService.set(baseCacheKey, base, CACHE_TTL_SECONDS);
  }

  const { allRelated, ...rest } = base;
  return {
    ...rest,
    relatedKeywords: relatedLimit > 0 ? allRelated.slice(0, relatedLimit) : [],
  };
}

/**
 * 문자열 기반 간이 해시 (결정적 시뮬레이션용)
 */
function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

/**
 * 월별 검색량 데이터 추출 (최근 12개월)
 * 네이버 API가 월별 데이터를 직접 제공하지 않으므로,
 * 여기서는 결정적 시뮬레이션 데이터를 생성합니다.
 * 실제 구현시 네이버 트렌드 API 연동 필요
 */
function extractMonthlyData(keywordItem) {
  const now = new Date();
  const monthlyData = [];
  const baseValue = toNumber(keywordItem.monthlyPcQcCnt) + toNumber(keywordItem.monthlyMobileQcCnt);
  const keyword = String(keywordItem.relKeyword || '');

  for (let i = 11; i >= 0; i--) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const year = date.getFullYear().toString().slice(2);
    const month = String(date.getMonth() + 1).padStart(2, '0');

    // 키워드+월 기반 결정적 변동 (동일 키워드·월이면 항상 같은 값)
    const seed = simpleHash(`${keyword}_${year}.${month}`);
    const seasonFactor = 0.7 + (seed % 600) / 1000; // 0.7 ~ 1.3
    const value = Math.round(baseValue * seasonFactor);

    monthlyData.push({
      period: `${year}.${month}`,
      value,
      valueText: value.toLocaleString('ko-KR'),
    });
  }

  return monthlyData;
}

/**
 * 네이버 API 연결 상태를 확인합니다.
 * @returns {Promise<{ reachable: boolean, latencyMs: number, status: number|null, error: string|null }>}
 */
async function checkNaverApiHealth() {
  const result = { reachable: false, latencyMs: null, status: null, error: null };

  const credentials = getNaverCredentials();
  if (!credentials) {
    result.error = 'ENV_MISSING';
    return result;
  }

  const { customerId, apiKey, secretKey } = credentials;
  const timestamp = String(Date.now());
  const method = 'GET';
  const signature = generateSignature({ timestamp, method, uri: KEYWORD_TOOL_URI, secretKey });
  const params = new URLSearchParams({ hintKeywords: '테스트', showDetail: '1' });

  const start = Date.now();
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(
      `${NAVER_SEARCH_AD_BASE_URL}${KEYWORD_TOOL_URI}?${params.toString()}`,
      {
        method,
        headers: {
          'X-Timestamp': timestamp,
          'X-API-KEY': apiKey,
          'X-CUSTOMER': customerId,
          'X-Signature': signature,
        },
        signal: controller.signal,
      }
    );

    clearTimeout(timeoutId);
    result.latencyMs = Date.now() - start;
    result.status = response.status;
    result.reachable = response.ok;

    if (!response.ok) {
      try { result.error = await response.json(); } catch (_) { result.error = `HTTP ${response.status}`; }
    }
  } catch (error) {
    result.latencyMs = Date.now() - start;
    result.error = error.name === 'AbortError' ? 'TIMEOUT (5s)' : error.message;
  }

  return result;
}

module.exports = {
  getKeywordVolumeWithRelated,
  checkNaverApiHealth,
};
