# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 프로젝트 개요

카카오톡 챗봇 스킬 서버. 사용자가 키워드를 입력하면 네이버 Search AD API(`GET /keywordstool`)로 검색량·경쟁도·트렌드를 조회해 카카오 v2.0 simpleText 형식으로 응답한다.

## 개발 명령어

```bash
npm install          # 의존성 설치
npm run dev          # 개발 서버 (--watch 모드, 포트 3000)
npm start            # 프로덕션 실행
```

테스트 프레임워크·린터는 미설정 상태.

## 아키텍처

**런타임:** Node.js 18+, Express 4, CommonJS, 순수 JavaScript (TypeScript 없음)
**배포:** Vercel Serverless (`vercel.json` → `src/app.js`)

### 요청 흐름

```
카카오 챗봇 → POST /kakao/command
  → kakaoController.handleCommand()
    → keywordParser로 명령어 타입 + 키워드 분리
    → 타입별 핸들러 실행 (7종: ANALYZE, SEARCH_VOLUME, TREND, COMPETITION, SEASON, RELATED, HELP)
    → naverKeywordService로 네이버 API 호출 (HMAC-SHA256 인증)
    → kakaoResponse.simpleText()로 응답 포맷팅
```

### 타임아웃 계층

카카오 스킬서버는 **5초 제한**이 있으므로 아래 계층을 반드시 지켜야 한다:
- 네이버 API fetch: 3.5초 (`AbortController`)
- 핸들러 전체: 4.5초 (`withTimeout` 래퍼)

### 캐싱

`cacheService.js` — Map 기반 인메모리 캐시, TTL 600초(10분). 서버 재시작 시 소멸.

### 에러 처리 규칙

카카오 스킬서버는 **HTTP 200이 아니면 폴백 블록**을 표시하므로, 에러 시에도 반드시 200 + simpleText 형태의 사용자 친화적 메시지를 반환해야 한다. `errorHandler.js` 참조.

## 환경 변수

`.env.example` 참조. 필수 4개:
- `PORT`, `NAVER_API_KEY`, `NAVER_SECRET_KEY`, `NAVER_CUSTOMER_ID`

레거시 변수명(`NAVER_SEARCHAD_*`)도 호환됨.

## 로컬 테스트

```bash
curl -X POST http://localhost:3000/kakao/command \
  -H "Content-Type: application/json" \
  -d '{"userRequest":{"utterance":"분석 다이어트"},"action":{"params":{}}}'
```

헬스체크: `GET /health`, `GET /health/detail`
