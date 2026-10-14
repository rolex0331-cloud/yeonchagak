# 연차각

남은 연차를 공휴일·대체공휴일·주말 사이 어디에 넣어야 가장 길게 쉬는지 계산하는 무료 정적 웹 도구.

- 운영 주소: https://rolex0331-cloud.github.io/yeonchagak/
- 대상: 내년 연차 계획을 짜는 한국 직장인 (5인 미만·공휴일 근무 조건도 지원)
- 결과: 추천 연차 플랜, 연차 효율 순위, 달력, .ics 캘린더 파일, 연차 신청 문구, 공유 링크, 해당 날짜 항공권·숙소 검색

## 구조
```
index.html              계산기
2027-holidays/          연도별 공휴일·꿀조합 (scripts/build-content.mjs가 엔진 결과로 생성)
guide/ about/           규칙 안내, 소개·개인정보 (생성)
assets/engine.js        최적화 엔진 (DOM 없음, Node 테스트 가능)
assets/holidays.js      공휴일 데이터 (출처·확인일 포함)
assets/config.js        제휴·측정 설정 (비밀값 없음)
assets/app.js           화면
scripts/                콘텐츠 생성, 로컬 서버, 공휴일 점검, 배포 폴더 구성, 스크린샷
tests/                  단위·데이터·사이트(27) + 브라우저 E2E(11)
.github/workflows/      테스트·배포, 주간 점검
docs/                   시장·경쟁 조사, 비용, 운영·복구, 검증 결과, 스크린샷
PROJECT_STATE.md        결정·상태·차단 요인 기록
```

## 명령
```
npm ci                 # 의존성 (puppeteer-core 1개, 테스트 전용)
npm test               # 단위·데이터·사이트 점검
npm run test:e2e       # 브라우저 E2E (Chrome 필요, BASE_URL 지정 시 배포 사이트 대상)
npm run build          # 콘텐츠 페이지·sitemap 재생성
npm run check:holidays # 공개 공휴일 캘린더와 데이터 비교
npm run serve          # 로컬 서버 http://127.0.0.1:8080/yeonchagak/
```
Node 22 (`.nvmrc`). 운영 코드에는 외부 라이브러리가 없다.

## 배포
main에 push하면 GitHub Actions가 테스트 → 배포 → 배포 사이트 E2E를 수행한다. 테스트가 실패하면 배포하지 않는다. 자세한 내용은 [docs/operations.md](docs/operations.md).

## 라이선스
비공개 사용 (UNLICENSED). 공휴일 날짜는 사실 정보이며 출처는 `assets/holidays.js`와 docs에 기록.
