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
- `POST /kakao/keyword-volume`

## Request Rules

- `action.params.keyword`가 있으면 우선 사용합니다.
- 없으면 `userRequest.utterance`에서 명령어를 제거하고 키워드를 추출합니다.
- 지원 명령어: `검색량`, `조회`, `키워드검색량`
- 키워드는 trim 및 연속 공백 정리를 거칩니다.
- 2자 미만 또는 50자 초과면 오류를 반환합니다.

## Example Request

```json
{
  "userRequest": {
    "utterance": "검색량 다이어트한약"
  },
  "action": {
    "params": {}
  }
}
```

## Example Response

```json
{
  "version": "2.0",
  "template": {
    "outputs": [
      {
        "simpleText": {
          "text": "[키워드 검색량 조회]\n검색어: 다이어트한약\nPC 검색량: 12,300\n모바일 검색량: 45,100\n총 검색량: 57,400"
        }
      }
    ]
  }
}
```

## Local Test

```powershell
$body = @'
{
  "userRequest": {
    "utterance": "검색량 다이어트한약"
  },
  "action": {
    "params": {}
  }
}
'@

Invoke-RestMethod `
  -Method Post `
  -Uri http://localhost:3000/kakao/keyword-volume `
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
