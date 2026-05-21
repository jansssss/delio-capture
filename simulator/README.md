# 북마클릿 회귀 테스트 시뮬레이터

실제 deliobt.kr과 동일한 응답 헤더(X-Frame-Options: DENY 등)를 가진 모의 서버를 띄우고, Playwright로 헤드리스 Chromium을 통해 [../bookmarklet-source.js](../bookmarklet-source.js)를 실행해 ZIP 다운로드까지 검증합니다.

## 설치

```sh
cd simulator
npm install
npx playwright install chromium
```

## 실행

두 개의 터미널이 필요합니다.

**터미널 1 - 모의 서버:**
```sh
npm run server
```

**터미널 2 - 테스트:**
```sh
npm test
```

성공 시 `PASS: true` 출력과 함께 `captured.zip` 생성. 시각적으로 확인하려면 `extracted_ETH_page_*.png` 파일을 열어보세요.

## 헤드풀 모드

브라우저를 직접 보면서 디버깅하려면:
```sh
HEADLESS=0 npm test
```
