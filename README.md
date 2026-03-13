# Kakao Chatbot Keyword Volume MVP

카카오톡 챗봇 스킬 서버가 사용자의 검색어를 받아 네이버 Search AD API `GET /keywordstool`로 월간 검색량을 조회하고, 카카오 스킬 응답 형식으로 반환합니다.

## Requirements

- Node.js 18+
- 네이버 검색광고 API 인증 정보

## Environment Variables

`.env.example`를 참고해 `.env`를 작성합니다.

- `PORT`
- `NAVER_API_KEY`
- `NAVER_SECRET_KEY`
- `NAVER_CUSTOMER_ID`

레거시 변수명인 `NAVER_SEARCHAD_API_KEY`, `NAVER_SEARCHAD_SECRET_KEY`, `NAVER_SEARCHAD_CUSTOMER_ID`도 호환됩니다.

## Run

```bash
npm install
copy .env.example .env
npm run dev
```

## Endpoints

- `GET /health`
- `POST /kakao/command` - 통합 명령어 처리

## 지원 명령어

| 명령어 | 설명 | 예시 |
|--------|------|------|
| 분석 | 통합 분석 (기본) | `분석 다이어트` |
| 검색량 | 검색량 + 연관 키워드 | `검색량 캠핑` |
| 트렌드 | 12개월 추이 | `트렌드 맛집` |
| 경쟁 | 경쟁 강도 분석 | `경쟁 여행` |
| 시즌 | 시즌별 패턴 | `시즌 크리스마스` |
| 연관 | 연관 키워드 25개 | `연관 운동` |
| 도움말 | 사용법 안내 | `도움말` |

키워드만 입력하면 자동으로 통합 분석이 수행됩니다.

## Example Request

```json
{
  "userRequest": {
    "utterance": "분석 다이어트한약"
  },
  "action": {
    "params": {}
  }
}
```

## Local Test

```powershell
$body = @'
{
  "userRequest": {
    "utterance": "분석 다이어트한약"
  },
  "action": {
    "params": {}
  }
}
'@

Invoke-RestMethod `
  -Method Post `
  -Uri http://localhost:3000/kakao/command `
  -ContentType "application/json; charset=utf-8" `
  -Body $body
```

## Structure

```text
src/
  app.js
  server.js
  routes/
    kakao.js
  controllers/
    kakaoController.js
  services/
    cacheService.js
    naverKeywordService.js
  utils/
    kakaoResponse.js
    keywordParser.js
    signature.js
  middlewares/
    errorHandler.js
```
