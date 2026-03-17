const cacheService = require('./cacheService');
const statsService = require('./statsService');

const NAVER_SEARCH_BLOG_URL = 'https://openapi.naver.com/v1/search/blog.json';
const NAVER_SEARCH_WEB_URL = 'https://openapi.naver.com/v1/search/webkr.json';
const NAVER_DATALAB_URL = 'https://openapi.naver.com/v1/datalab/search';
const SEARCH_FETCH_TIMEOUT_MS = 2000;
const DATALAB_FETCH_TIMEOUT_MS = 3000;
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
 * 네이버 검색 API에서 총 문서 수를 조회합니다.
 * @param {string} url - API URL (blog 또는 webkr)
 * @param {string} keyword
 * @param {string} cachePrefix
 * @returns {Promise<number|null>}
 */
async function getDocCount(url, keyword, cachePrefix) {
  const cacheKey = `${cachePrefix}_${keyword.toLowerCase().trim()}`;
  const cached = cacheService.get(cacheKey);
  if (cached !== null) return cached;

  const credentials = getSearchCredentials();
  if (!credentials) return null;

  const { clientId, clientSecret } = credentials;
  const params = new URLSearchParams({ query: keyword, display: '1' });

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), SEARCH_FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(`${url}?${params.toString()}`, {
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
    console.error(`[naverSearch] ${cachePrefix} 조회 실패: ${keyword}`, error.name);
    return null;
  }
}

/**
 * 키워드의 블로그 + 웹문서 총 문서 수를 병렬 조회합니다.
 * @param {string} keyword
 * @returns {Promise<{ blog: number|null, web: number|null, total: number|null }>}
 */
async function getDocCounts(keyword) {
  const [blog, web] = await Promise.all([
    getDocCount(NAVER_SEARCH_BLOG_URL, keyword, 'blog_doc'),
    getDocCount(NAVER_SEARCH_WEB_URL, keyword, 'web_doc'),
  ]);

  if (blog === null && web === null) return { blog: null, web: null, total: null };

  return {
    blog: blog || 0,
    web: web || 0,
    total: (blog || 0) + (web || 0),
  };
}

/**
 * 여러 키워드의 문서 수를 병렬로 조회합니다 (블로그 + 웹문서).
 * @param {string[]} keywords
 * @returns {Promise<Map<string, { blog: number, web: number, total: number }>>}
 */
async function getDocCountsBatch(keywords) {
  const results = await Promise.allSettled(
    keywords.map(async (kw) => ({ keyword: kw, counts: await getDocCounts(kw) }))
  );

  const map = new Map();
  for (const result of results) {
    if (result.status === 'fulfilled' && result.value.counts.total !== null) {
      map.set(result.value.keyword, result.value.counts);
    }
  }
  return map;
}

/**
 * 네이버 DataLab 트렌드 API로 키워드들의 검색 트렌드를 조회합니다.
 * 한 번에 최대 5개 키워드 그룹을 비교할 수 있습니다.
 * @param {string[]} keywords - 최대 5개 키워드
 * @returns {Promise<Map<string, number>>} 키워드 → 트렌드 모멘텀 (-1.0 ~ +1.0)
 */
async function getTrendMomentum(keywords) {
  const map = new Map();

  // 캐시 체크 (원본 키워드를 Map 키로 사용)
  const uncached = [];
  for (const kw of keywords) {
    const cached = cacheService.get(`trend_${kw.toLowerCase().trim()}`);
    if (cached !== null) {
      map.set(kw, cached);
    } else {
      uncached.push(kw);
    }
  }

  if (uncached.length === 0) return map;

  // DataLab 응답의 title → 원본 키워드 매핑 (대소문자 보존)
  const titleToOriginal = new Map(uncached.map((kw) => [kw, kw]));

  const credentials = getSearchCredentials();
  if (!credentials) return map;

  const { clientId, clientSecret } = credentials;

  // DataLab은 1요청에 5그룹까지 가능
  const endDate = new Date();
  const startDate = new Date();
  startDate.setMonth(startDate.getMonth() - 6);

  const formatDate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;

  const keywordGroups = uncached.slice(0, 5).map((kw) => ({
    groupName: kw,
    keywords: [kw],
  }));

  const body = JSON.stringify({
    startDate: formatDate(startDate),
    endDate: formatDate(endDate),
    timeUnit: 'month',
    keywordGroups,
  });

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), DATALAB_FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(NAVER_DATALAB_URL, {
      method: 'POST',
      headers: {
        'X-Naver-Client-Id': clientId,
        'X-Naver-Client-Secret': clientSecret,
        'Content-Type': 'application/json',
      },
      body,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.error(`[datalab] API 응답 오류: ${response.status}`);
      return map;
    }

    statsService.trackApiCall('datalab');
    const data = await response.json();

    for (const result of (data.results || [])) {
      const kw = titleToOriginal.get(result.title) || result.title;
      const points = (result.data || []).map((d) => d.ratio);

      if (points.length < 4) continue;

      // 최근 3개월 vs 이전 3개월 평균 비교
      const recent = points.slice(-3);
      const previous = points.slice(-6, -3);

      const recentAvg = recent.reduce((s, v) => s + v, 0) / recent.length;
      const prevAvg = previous.length > 0
        ? previous.reduce((s, v) => s + v, 0) / previous.length
        : recentAvg;

      // 변화율: -1.0(급락) ~ +1.0(급상승) 범위로 정규화
      let momentum = 0;
      if (prevAvg > 0) {
        momentum = (recentAvg - prevAvg) / prevAvg;
        momentum = Math.max(-1, Math.min(1, momentum));
      }

      momentum = Math.round(momentum * 100) / 100;
      const normalizedKw = kw.toLowerCase().trim();
      map.set(kw, momentum);
      cacheService.set(`trend_${normalizedKw}`, momentum, CACHE_TTL_SECONDS);
    }
  } catch (error) {
    clearTimeout(timeoutId);
    console.error('[datalab] 트렌드 조회 실패:', error.name);
  }

  return map;
}

/**
 * 여러 키워드의 트렌드 모멘텀을 병렬로 조회합니다.
 * DataLab API는 1회에 5개까지이므로 5개씩 나눠 병렬 호출합니다.
 * @param {string[]} keywords
 * @returns {Promise<Map<string, number>>}
 */
async function getTrendMomentumBatch(keywords) {
  const chunks = [];
  for (let i = 0; i < keywords.length; i += 5) {
    chunks.push(keywords.slice(i, i + 5));
  }

  const results = await Promise.allSettled(
    chunks.map((chunk) => getTrendMomentum(chunk))
  );

  const merged = new Map();
  for (const result of results) {
    if (result.status === 'fulfilled') {
      for (const [k, v] of result.value) {
        merged.set(k, v);
      }
    }
  }
  return merged;
}

module.exports = {
  getDocCountsBatch,
  getTrendMomentumBatch,
};
