const cacheService = require('./cacheService');
const statsService = require('./statsService');

const NAVER_SEARCH_API_URL = 'https://openapi.naver.com/v1/search/blog.json';
const SEARCH_FETCH_TIMEOUT_MS = 2000;
const CACHE_TTL_SECONDS = 600;

/**
 * 네이버 검색 API 인증 정보를 환경변수에서 읽어 반환합니다.
 */
function getSearchCredentials() {
  const clientId = process.env.NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

/**
 * 키워드의 블로그 총 문서 수를 조회합니다.
 * @param {string} keyword
 * @returns {Promise<number>} 총 문서 수
 */
async function getBlogDocCount(keyword) {
  const cacheKey = `blog_doc_${keyword.toLowerCase().trim()}`;
  const cached = cacheService.get(cacheKey);
  if (cached !== null) return cached;

  const credentials = getSearchCredentials();
  if (!credentials) return null;

  const { clientId, clientSecret } = credentials;
  const params = new URLSearchParams({ query: keyword, display: '1' });

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), SEARCH_FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(`${NAVER_SEARCH_API_URL}?${params.toString()}`, {
      headers: {
        'X-Naver-Client-Id': clientId,
        'X-Naver-Client-Secret': clientSecret,
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) return null;

    statsService.trackApiCall('search');
    const data = await response.json();
    const total = data.total || 0;
    cacheService.set(cacheKey, total, CACHE_TTL_SECONDS);
    return total;
  } catch (error) {
    clearTimeout(timeoutId);
    console.error(`[naverSearch] 문서 수 조회 실패: ${keyword}`, error.name);
    return null;
  }
}

/**
 * 여러 키워드의 문서 수를 병렬로 조회합니다.
 * @param {string[]} keywords
 * @returns {Promise<Map<string, number>>} 키워드 → 문서 수 맵
 */
async function getBlogDocCountBatch(keywords) {
  const results = await Promise.allSettled(
    keywords.map(async (kw) => ({ keyword: kw, count: await getBlogDocCount(kw) }))
  );

  const map = new Map();
  for (const result of results) {
    if (result.status === 'fulfilled') {
      map.set(result.value.keyword, result.value.count);
    }
  }
  return map;
}

module.exports = {
  getBlogDocCount,
  getBlogDocCountBatch,
};
