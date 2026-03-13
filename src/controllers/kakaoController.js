const {
  parseKeywordAndCommand,
  COMMAND_TYPES,
} = require('../utils/keywordParser');
const {
  buildSimpleTextResponse,
} = require('../utils/kakaoResponse');
const { getKeywordVolumeWithRelated } = require('../services/naverKeywordService');

/**
 * 통합 커맨드 핸들러 - 커맨드 타입별로 분기
 */
async function handleCommand(req, res, next) {
  console.log('[DEBUG] handleCommand 호출:', {
    utterance: req.body?.userRequest?.utterance,
    params: req.body?.action?.params
  });

  try {
    const { keyword, commandType } = parseKeywordAndCommand(req.body);

    console.log('[DEBUG] 파싱 결과:', { keyword, commandType });

    switch (commandType) {
      case COMMAND_TYPES.HELP:
        return handleHelp(req, res);
      case COMMAND_TYPES.SEARCH_VOLUME:
        return handleSearchVolume(keyword, res);
      case COMMAND_TYPES.TREND:
        return handleTrend(keyword, res);
      case COMMAND_TYPES.COMPETITION:
        return handleCompetition(keyword, res);
      case COMMAND_TYPES.SEASON:
        return handleSeason(keyword, res);
      case COMMAND_TYPES.RELATED:
        return handleRelated(keyword, res);
      case COMMAND_TYPES.ANALYZE:
      default:
        return handleAnalyze(keyword, res);
    }
  } catch (error) {
    next(error);
  }
}

/**
 * 경쟁 수준 이모지 반환
 */
function getCompetitionEmoji(compIdx) {
  switch (compIdx) {
    case '높음':
      return '🔴';
    case '중간':
      return '🟡';
    case '낮음':
      return '🟢';
    default:
      return '⚪';
  }
}

/**
 * 경쟁 수준별 전략 조언
 */
function getCompetitionAdvice(compIdx) {
  switch (compIdx) {
    case '높음':
      return '💡 경쟁이 치열합니다. 롱테일 키워드나 틈새 시장을 노려보세요.';
    case '중간':
      return '💡 적절한 경쟁 수준입니다. 콘텐츠 품질로 승부하세요.';
    case '낮음':
      return '💡 경쟁이 적어 진입 기회입니다. 빠르게 선점하세요!';
    default:
      return '';
  }
}

/**
 * 막대 그래프 생성 (최대 10칸)
 */
function createBarGraph(value, maxValue, maxBars = 10) {
  if (maxValue === 0) return '';
  const ratio = value / maxValue;
  const bars = Math.round(ratio * maxBars);
  return '█'.repeat(bars) + '░'.repeat(maxBars - bars);
}

/**
 * ANALYZE 커맨드 - 통합 분석
 */
async function handleAnalyze(keyword, res) {
  const data = await getKeywordVolumeWithRelated(keyword, 10);
  const monthlyData = data.monthlyData.slice(-6); // 최근 6개월
  const maxValue = Math.max(...monthlyData.map((m) => m.value));

  // 트렌드 그래프
  const trendLines = monthlyData.map((m) => {
    const bar = createBarGraph(m.value, maxValue, 8);
    return `${m.period} ${bar} ${m.valueText}`;
  });

  // 연관 키워드 TOP 10
  const relatedLines = data.relatedKeywords
    .slice(0, 10)
    .map((r, i) => `${i + 1}. ${r.keyword} (${r.totalSearchesText})`);

  const text = [
    `[${data.keyword}] 키워드 분석`,
    '',
    '📊 검색량',
    `총 ${data.totalSearchesText}회/월 (PC ${data.pcSearchesText} | 모바일 ${data.mobileSearchesText})`,
    '',
    '📈 최근 6개월 트렌드',
    ...trendLines,
    '',
    `🎯 경쟁 강도: ${getCompetitionEmoji(data.compIdx)} ${data.compIdx}`,
    getCompetitionAdvice(data.compIdx),
    '',
    '🔗 연관 키워드 TOP 10',
    ...relatedLines,
  ].filter(Boolean).join('\n');

  res.json(buildSimpleTextResponse(text));
}

/**
 * SEARCH_VOLUME 커맨드 - 검색량 + 연관 TOP 10
 */
async function handleSearchVolume(keyword, res) {
  const data = await getKeywordVolumeWithRelated(keyword, 10);

  const relatedLines = data.relatedKeywords
    .slice(0, 10)
    .map((r, i) => `${i + 1}. ${r.keyword} (${r.totalSearchesText})`);

  const text = [
    '[키워드 검색량 조회]',
    `검색어: ${data.keyword}`,
    `PC: ${data.pcSearchesText} | 모바일: ${data.mobileSearchesText} | 총: ${data.totalSearchesText}`,
    '',
    '[연관 키워드 TOP 10]',
    ...relatedLines,
  ].join('\n');

  res.json(buildSimpleTextResponse(text));
}

/**
 * TREND 커맨드 - 12개월 검색 추이
 */
async function handleTrend(keyword, res) {
  const data = await getKeywordVolumeWithRelated(keyword, 0);
  const monthlyData = data.monthlyData;
  const maxValue = Math.max(...monthlyData.map((m) => m.value));

  // 전월 대비 변화율 계산
  const lastMonth = monthlyData[monthlyData.length - 1]?.value || 0;
  const prevMonth = monthlyData[monthlyData.length - 2]?.value || 0;
  const changeRate = prevMonth > 0
    ? (((lastMonth - prevMonth) / prevMonth) * 100).toFixed(1)
    : '0.0';
  const changeSign = Number(changeRate) >= 0 ? '+' : '';

  const trendLines = monthlyData.map((m) => {
    const bar = createBarGraph(m.value, maxValue, 10);
    return `${m.period} ${bar} ${m.valueText}`;
  });

  const text = [
    `[키워드 트렌드: ${data.keyword}]`,
    '',
    '최근 12개월 검색 추이:',
    ...trendLines,
    '',
    `📈 전월 대비: ${changeSign}${changeRate}%`,
  ].join('\n');

  res.json(buildSimpleTextResponse(text));
}

/**
 * COMPETITION 커맨드 - 경쟁 강도 분석
 */
async function handleCompetition(keyword, res) {
  const data = await getKeywordVolumeWithRelated(keyword, 0);

  const text = [
    `[경쟁 강도 분석: ${data.keyword}]`,
    '',
    `경쟁 정도: ${data.compIdx} ${getCompetitionEmoji(data.compIdx)}`,
    `월평균 노출 광고수: ${data.plAvgDepth}개`,
    '',
    '클릭 현황:',
    `PC: 월 ${data.monthlyPcClkCnt.toLocaleString()}회 (CTR ${data.pcCtr}%)`,
    `모바일: 월 ${data.monthlyMobileClkCnt.toLocaleString()}회 (CTR ${data.mobileCtr}%)`,
    '',
    getCompetitionAdvice(data.compIdx),
  ].filter(Boolean).join('\n');

  res.json(buildSimpleTextResponse(text));
}

/**
 * SEASON 커맨드 - 시즌/월별 패턴 분석
 */
async function handleSeason(keyword, res) {
  const data = await getKeywordVolumeWithRelated(keyword, 0);
  const monthlyData = data.monthlyData;
  const maxValue = Math.max(...monthlyData.map((m) => m.value));
  const minValue = Math.min(...monthlyData.map((m) => m.value));
  const avgValue = monthlyData.reduce((sum, m) => sum + m.value, 0) / monthlyData.length;

  // 피크/비수기 판별 기준: 평균 대비 20% 이상/이하
  const peakThreshold = avgValue * 1.2;
  const lowThreshold = avgValue * 0.8;

  const peakMonths = [];
  const lowMonths = [];

  const trendLines = monthlyData.map((m) => {
    const bar = createBarGraph(m.value, maxValue, 8);
    let indicator = '';
    if (m.value >= peakThreshold) {
      indicator = ' 🔥피크';
      peakMonths.push(m.period.split('.')[1]);
    } else if (m.value <= lowThreshold) {
      indicator = ' 💤비수기';
      lowMonths.push(m.period.split('.')[1]);
    }
    return `${m.period} ${bar}${indicator}`;
  });

  const text = [
    `[시즌 분석] ${data.keyword}`,
    '',
    '📅 월별 검색 추이',
    ...trendLines,
    '',
    `🔥 피크: ${peakMonths.length > 0 ? peakMonths.join(', ') + '월' : '해당 없음'}`,
    `💤 비수기: ${lowMonths.length > 0 ? lowMonths.join(', ') + '월' : '해당 없음'}`,
  ].join('\n');

  res.json(buildSimpleTextResponse(text));
}

/**
 * RELATED 커맨드 - 연관 키워드 25개
 */
async function handleRelated(keyword, res) {
  const data = await getKeywordVolumeWithRelated(keyword, 25);

  const relatedLines = data.relatedKeywords.map((r, i) =>
    `${i + 1}. ${r.keyword} (${r.totalSearchesText})`
  );

  const text = [
    `[연관 키워드] ${data.keyword}`,
    '',
    `총 ${data.relatedKeywords.length}개 키워드`,
    ...relatedLines,
  ].join('\n');

  res.json(buildSimpleTextResponse(text));
}

/**
 * HELP 커맨드 - 도움말
 */
function handleHelp(req, res) {
  const text = [
    '[키워드 분석 도우미] 사용법',
    '',
    '📌 기본 명령어:',
    '• 분석 키워드 - 통합 분석 (기본)',
    '• 검색량 키워드 - 검색량 조회',
    '• 트렌드 키워드 - 12개월 추이',
    '• 경쟁 키워드 - 경쟁 강도',
    '• 시즌 키워드 - 시즌별 패턴',
    '• 연관 키워드 - 연관 키워드 25개',
    '',
    '📝 예시:',
    '• 분석 다이어트',
    '• 트렌드 캠핑',
    '• 연관 맛집',
    '',
    '💡 키워드만 입력하면 자동으로 통합 분석됩니다.',
  ].join('\n');

  res.json(buildSimpleTextResponse(text));
}

module.exports = {
  handleCommand,
};
