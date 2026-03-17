const NAVER_SEARCH_API_DAILY_LIMIT = 25000;
const NAVER_SEARCHAD_API_DAILY_LIMIT = 100000;

class StatsService {
  constructor() {
    this.startedAt = new Date();
    this._resetDaily();
    this._resetMonthly();
  }

  _todayKey() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  }

  _monthKey() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }

  _resetDaily() {
    this.today = this._todayKey();
    this.daily = {
      apiCalls: { searchAd: 0, search: 0 },
      commands: {},
      users: new Set(),
    };
  }

  _resetMonthly() {
    this.month = this._monthKey();
    this.monthly = {
      apiCalls: { searchAd: 0, search: 0 },
      commands: {},
      users: new Set(),
    };
  }

  _checkRollover() {
    const today = this._todayKey();
    if (this.today !== today) {
      this._resetDaily();
    }
    const month = this._monthKey();
    if (this.month !== month) {
      this._resetMonthly();
    }
  }

  trackApiCall(type) {
    this._checkRollover();
    if (this.daily.apiCalls[type] !== undefined) {
      this.daily.apiCalls[type]++;
      this.monthly.apiCalls[type]++;
    }
  }

  trackCommand(commandType, userId) {
    this._checkRollover();
    this.daily.commands[commandType] = (this.daily.commands[commandType] || 0) + 1;
    this.monthly.commands[commandType] = (this.monthly.commands[commandType] || 0) + 1;
    if (userId) {
      this.daily.users.add(userId);
      this.monthly.users.add(userId);
    }
  }

  getStats() {
    this._checkRollover();

    const dailyTotal = Object.values(this.daily.commands).reduce((s, v) => s + v, 0);
    const monthlyTotal = Object.values(this.monthly.commands).reduce((s, v) => s + v, 0);

    const uptimeMs = Date.now() - this.startedAt.getTime();
    const uptimeHours = Math.floor(uptimeMs / 3600000);
    const uptimeMinutes = Math.floor((uptimeMs % 3600000) / 60000);

    return {
      date: this.today,
      month: this.month,
      uptime: uptimeHours > 0 ? `${uptimeHours}시간 ${uptimeMinutes}분` : `${uptimeMinutes}분`,
      api: {
        searchAd: {
          used: this.daily.apiCalls.searchAd,
          limit: NAVER_SEARCHAD_API_DAILY_LIMIT,
          percent: ((this.daily.apiCalls.searchAd / NAVER_SEARCHAD_API_DAILY_LIMIT) * 100).toFixed(1),
        },
        search: {
          used: this.daily.apiCalls.search,
          limit: NAVER_SEARCH_API_DAILY_LIMIT,
          percent: ((this.daily.apiCalls.search / NAVER_SEARCH_API_DAILY_LIMIT) * 100).toFixed(1),
        },
      },
      daily: {
        users: this.daily.users.size,
        totalCommands: dailyTotal,
        commandBreakdown: { ...this.daily.commands },
      },
      monthly: {
        users: this.monthly.users.size,
        totalCommands: monthlyTotal,
        commandBreakdown: { ...this.monthly.commands },
      },
    };
  }
}

module.exports = new StatsService();
