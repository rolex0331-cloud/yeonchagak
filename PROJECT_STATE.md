# PROJECT_STATE — 징검 (구 연차각) (마지막 갱신 2026-10-14)

다음 작업자는 처음부터 조사하지 말고 이 문서와 docs/에서 이어간다.

## 결정 사항
- 주제: 한국 공휴일 기준 **연차 최적화 플래너 '징검'** (2026-10-14 연차각에서 이름 변경, 주소 /yeonchagak/는 검색 등록 유지를 위해 그대로) (후보 10개 중 선정, 근거 docs/market-research.md)
- 핵심 고객: 내년 연차 계획을 세우는 한국 직장인 (10월~1월 수요)
- 첫 화면 한 문장: "남은 연차, 어디에 붙이면 가장 오래 쉴까?"
- 주 수익모델: 트립닷컴 여행 제휴 1개 (연휴 날짜 → 그 날짜 항공권·숙소 검색). 광고는 하지 않음
- 호스팅: GitHub Pages (공개 저장소 rolex0331-cloud/yeonchagak), 추가 비용 0원
- 구조: 서버·DB·로그인 없음. 계산은 브라우저 안. 운영 코드 외부 의존성 0, 테스트 의존성 puppeteer-core 25.11.0
- 기존 프로젝트(premove, tidraq-*, my-stock-calculator)는 건드리지 않음
- 대표 주소 저장소 rolex0331-cloud.github.io: 네이버 확인 태그 + 연차각 안내 첫 페이지 + robots.txt(연차각 sitemap 지정). 확인 태그를 지우면 네이버 소유 확인이 풀림

## 현재 상태
| 항목 | 상태 |
|---|---|
| 개발 | 완료 (계산기, 2027 콘텐츠, 규칙 안내, 소개·개인정보, 404, sitemap, robots, OG 이미지) |
| 배포 | 완료 — https://rolex0331-cloud.github.io/yeonchagak/ |
| 자동 테스트 | 단위 27 + E2E 11 통과 (로컬·Actions·운영 주소) |
| 자동 관리 | test-and-deploy(푸시 시), weekly-ops(매주 월, 수동 실행으로 동작 확인) 등록·가동 |
| 제휴 | **신청 완료·심사 중** (2026-10-14 트립닷컴 제휴 파트너·개인·콘텐츠 관련·CPS로 신청, USD 정산). 링크 미연결: config의 AFFILIATE.params 비어 있음, 고지 숨김 |
| 측정 | **미연결** (ANALYTICS.goatcounterCode 비어 있음, 요청 0건) |
| 검색 등록 | Google Search Console: URL 접두어 속성, HTML 태그를 index.html에 반영(2026-10-14). 네이버 서치어드바이저: 호스트 단위만 허용 → 대표 사이트 저장소 rolex0331-cloud.github.io 생성, 루트 index.html에 확인 태그, 소유확인·사이트맵 제출 완료(2026-10-14, 사용자 보고) |
| 실제 매출 | 없음 |

## 파일 지도
- `assets/engine.js` 최적화 엔진 / `assets/holidays.js` 공휴일 데이터 / `assets/config.js` 제휴·측정 설정
- `assets/app.js` 화면 / `assets/state.js` 공유 링크 / `assets/links.js` 여행 링크
- `scripts/build-content.mjs` → `2027-holidays/`, `guide/`, `about/`, `sitemap.xml` 생성 (생성물도 커밋함, CI가 최신 여부 검사)
- `scripts/check-holidays.mjs` 공개 캘린더 비교 (KNOWN_DIFF: 2027-02-06)
- `docs/` 시장조사, 비용, 운영·복구, 검증, 스크린샷

## 남은 차단 요인 (사용자만 가능)
1. 트립닷컴 제휴 승인 대기 중 → 승인 후 대시보드에서 제휴 링크 1개 생성해 전달 → 파라미터를 config에 입력 (docs/operations.md)
2. (선택) GoatCounter 계정 → 코드 입력

## 다음 할 일
- 2027-06 말 2028 월력요항 발표 → weekly-ops가 이슈로 알림 → holidays.js에 2028 추가, `npm run build`
- 측정 연결 후 4주 데이터로 유입 실험 판정 (기준 docs/market-research.md 5절)
- 반차(0.5일) 지원, 교대근무 패턴은 미구현 (수요 확인 후)
- GitHub Actions의 Node 20 액션 경고: checkout/setup-node/pages 액션을 Node 24 대응 버전으로 올리기 (현재는 강제 Node 24로 정상 동작)

## 알려진 한계
- 공개 저장소 60일 무활동 시 예약 워크플로 자동 중지
- GitHub Pages 약관상 '온라인 비즈니스 호스팅' 금지 조항 — 제휴 수익이 커지면 Cloudflare Pages 이전 권장 (docs/cost.md)
- 실기기(iOS/Android)·실제 캘린더 앱 가져오기 미검증 (docs/verification.md)
