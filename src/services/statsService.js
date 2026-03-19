const { Redis } = require('@upstash/redis');

const NAVER_SEARCH_API_DAILY_LIMIT = 25000;
const NAVER_SEARCHAD_API_DAILY_LIMIT = 100000;
const NAVER_DATALAB_API_DAILY_LIMIT = 1000;

const API_TYPES = ['searchAd', 'search', 'datalab'];

let redis = null;

function getRedis() {
  if (!redis) {
    redis = new Redis({
      url: process.env.KV_REST_API_URL,
      token: process.env.KV_REST_API_TOKEN,
    });
  }
  return redis;
}

function todayKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function monthKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

/** 자정까지 남은 초 (TTL 용) */
function secondsUntilMidnight() {
  const now = new Date();
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);
  return Math.ceil((midnight - now) / 1000);
}

/** 이번 달 말까지 남은 초 */
function secondsUntilMonthEnd() {
  const now = new Date();
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return Math.ceil((endOfMonth - now) / 1000);
}

/**
 * Redis 키 규칙:
 *   api:{date}:{type}        — 일일 API 호출 수 (INCR)
 *   cmd:{date}:{commandType} — 일일 커맨드 수 (INCR)
 *   users:{date}             — 일일 고유 사용자 (SADD/SCARD)
 *   api:{month}:{type}       — 월간 API 호출 수
 *   cmd:{month}:{commandType}— 월간 커맨드 수
 *   users:{month}            — 월간 고유 사용자
 */

const statsService = {
  /** API 호출 추적 (fire-and-forget) */
  trackApiCall(type) {
    if (!API_TYPES.includes(type)) return;

    const r = getRedis();
    const day = todayKey();
    const mon = monthKey();
    const dayKey = `api:${day}:${type}`;
    const monKey = `api:${mon}:${type}`;

    const pipeline = r.pipeline();
    pipeline.incr(dayKey);
    pipeline.expire(dayKey, secondsUntilMidnight() + 60);
    pipeline.incr(monKey);
    pipeline.expire(monKey, secondsUntilMonthEnd() + 60);
    pipeline.exec().catch((err) => console.error('[stats] trackApiCall error:', err));
  },

  /** 커맨드 + 사용자 추적 (fire-and-forget) */
  trackCommand(commandType, userId) {
    const r = getRedis();
    const day = todayKey();
    const mon = monthKey();

    const pipeline = r.pipeline();

    // 커맨드 카운트
    const dayCmdKey = `cmd:${day}:${commandType}`;
    const monCmdKey = `cmd:${mon}:${commandType}`;
    pipeline.incr(dayCmdKey);
    pipeline.expire(dayCmdKey, secondsUntilMidnight() + 60);
    pipeline.incr(monCmdKey);
    pipeline.expire(monCmdKey, secondsUntilMonthEnd() + 60);

    // 고유 사용자
    if (userId) {
      const dayUserKey = `users:${day}`;
      const monUserKey = `users:${mon}`;
      pipeline.sadd(dayUserKey, userId);
      pipeline.expire(dayUserKey, secondsUntilMidnight() + 60);
      pipeline.sadd(monUserKey, userId);
      pipeline.expire(monUserKey, secondsUntilMonthEnd() + 60);
    }

    pipeline.exec().catch((err) => console.error('[stats] trackCommand error:', err));
  },

  /** 통계 조회 (await 필요) */
  async getStats() {
    const r = getRedis();
    const day = todayKey();
    const mon = monthKey();

    const pipeline = r.pipeline();

    // 일일 API 호출
    for (const type of API_TYPES) {
      pipeline.get(`api:${day}:${type}`);
    }
    // 월간 API 호출
    for (const type of API_TYPES) {
      pipeline.get(`api:${mon}:${type}`);
    }

    // 일일/월간 사용자 수
    pipeline.scard(`users:${day}`);
    pipeline.scard(`users:${mon}`);

    // 커맨드 키 목록 스캔을 위한 개별 조회 대신
    // 알려진 커맨드 타입들을 직접 조회
    const KNOWN_COMMANDS = [
      'ANALYZE', 'SEARCH_VOLUME', 'TREND', 'COMPETITION',
      'SEASON', 'RELATED', 'GOLDEN', 'USAGE', 'HELP',
    ];

    for (const cmd of KNOWN_COMMANDS) {
      pipeline.get(`cmd:${day}:${cmd}`);
    }
    for (const cmd of KNOWN_COMMANDS) {
      pipeline.get(`cmd:${mon}:${cmd}`);
    }

    const results = await pipeline.exec();
    let i = 0;

    // 일일 API
    const dailyApi = {};
    for (const type of API_TYPES) {
      dailyApi[type] = Number(results[i++]) || 0;
    }
    // 월간 API
    const monthlyApi = {};
    for (const type of API_TYPES) {
      monthlyApi[type] = Number(results[i++]) || 0;
    }

    // 사용자 수
    const dailyUsers = Number(results[i++]) || 0;
    const monthlyUsers = Number(results[i++]) || 0;

    // 일일 커맨드
    const dailyCommands = {};
    for (const cmd of KNOWN_COMMANDS) {
      const val = Number(results[i++]) || 0;
      if (val > 0) dailyCommands[cmd] = val;
    }
    // 월간 커맨드
    const monthlyCommands = {};
    for (const cmd of KNOWN_COMMANDS) {
      const val = Number(results[i++]) || 0;
      if (val > 0) monthlyCommands[cmd] = val;
    }

    const dailyTotal = Object.values(dailyCommands).reduce((s, v) => s + v, 0);
    const monthlyTotal = Object.values(monthlyCommands).reduce((s, v) => s + v, 0);

    const limits = {
      searchAd: NAVER_SEARCHAD_API_DAILY_LIMIT,
      search: NAVER_SEARCH_API_DAILY_LIMIT,
      datalab: NAVER_DATALAB_API_DAILY_LIMIT,
    };

    const api = {};
    for (const type of API_TYPES) {
      api[type] = {
        used: dailyApi[type],
        limit: limits[type],
        percent: ((dailyApi[type] / limits[type]) * 100).toFixed(1),
      };
    }

    return {
      date: day,
      month: mon,
      api,
      daily: {
        users: dailyUsers,
        totalCommands: dailyTotal,
        commandBreakdown: dailyCommands,
      },
      monthly: {
        users: monthlyUsers,
        totalCommands: monthlyTotal,
        commandBreakdown: monthlyCommands,
      },
    };
  },
};

module.exports = statsService;
