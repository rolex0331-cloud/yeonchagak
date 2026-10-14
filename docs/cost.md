# 비용 검증 (확인일 2026-10-14)

## 현재 추가 비용: 0원
신규 결제·카드 등록·유료 API·도메인 구매 없음. 사용 서비스는 아래뿐이다.

| 서비스 | 용도 | 요금 | 공식 근거 |
|---|---|---|---|
| GitHub Pages | 정적 호스팅 | 무료 (공개 저장소) | https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits |
| GitHub Actions | 테스트·배포·주간 점검 | 공개 저장소의 표준 러너 무료 | https://docs.github.com/en/actions/concepts/billing-and-usage |
| Google 공개 공휴일 캘린더(ICS) | 주 1회 데이터 차이 점검 (운영 데이터 아님) | 무료 공개 피드 | 키 불필요 |
| 트립닷컴 검색 링크 | 사용자가 누를 때만 이동 | 무료, 제휴 승인 시 수수료 '수취' | https://www.trip.com/partners/ |
| (선택) GoatCounter | 쿠키 없는 방문 측정 | 무료, "small-to-medium business" 허용 | https://www.goatcounter.com/ |

서버·DB·AI 호출이 없다. 계산은 방문자 브라우저 안에서 일어나므로 방문자가 늘어도 연산 비용이 생기지 않는다.

## GitHub Pages 한도와 초과 시 동작 [공식 문서]
- 게시 사이트 1GB 이하 (현재 약 150KB)
- 대역폭 **월 100GB 소프트 한도**, 배포 10분 타임아웃
- 초과 시: 서비스가 안 되거나 GitHub 지원팀 이메일(제3자 CDN 등 권고). **자동 과금은 없다.**
- 금지: "free web-hosting service to run your online business". [판단] 연차각은 무료 계획 도구이고 여행 링크는 외부 사이트로 보내는 부가 기능이라 '거래 중개 사이트'가 아니라고 보지만, 회색지대다. 제휴 수익이 의미 있는 규모가 되면 Cloudflare Pages(무료, 상업 이용 허용) 이전을 권장한다(정적 파일 그대로 이전 가능, 운영 문서 참고).

## 다른 프로젝트와의 공유 한도
- 이 계정의 다른 저장소: premove, tidraq-ops, tidraq-c1-engine(비공개), my-stock-calculator(공개, Pages 사용).
- Pages 한도는 사이트별이라 서로 영향이 없다.
- Actions: 비공개 저장소는 무료 플랜의 월 분 한도를 쓰지만, 연차각은 **공개 저장소라 그 한도를 소모하지 않는다**.

## 트래픽 가정별 사용량 (가정치, 관측값 아님)
측정값: 계산기 1회 로드 전송량 약 23KB(gzip, 2026-10-14 배포본), 콘텐츠 페이지 약 3~6KB 추가. 방문당 35KB(재방문 캐시 없음 가정)로 계산.

| 일 방문 | 월 전송량 | 100GB 대비 | 서버 요청 | 저장량 |
|---|---|---|---|---|
| 100 | 약 0.1GB | 0.1% | 정적 파일만 | 0 (방문자 기기 localStorage 수 KB) |
| 1,000 | 약 1.1GB | 1% | 정적 파일만 | 0 |
| 10,000 | 약 10.5GB | 11% | 정적 파일만 | 0 |
| 약 95,000 | 약 100GB | 한도 도달 | | |

Actions: 배포 1회 약 3~4분, 주간 점검 약 2~3분 → 공개 저장소라 무료.

## 한도 접근 시 대응 (승인 없이 유료 전환하지 않음)
1. 정적 파일 캐시 정책·용량 축소(이미 23KB 수준)
2. og.png 등 비필수 파일 제거
3. Cloudflare Pages(무료) 등으로 이전 — 계정 생성은 사용자 작업
