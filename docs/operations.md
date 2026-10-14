# 운영·복구 안내

## 자동화 (GitHub Actions, 저장소 rolex0331-cloud/yeonchagak)

| 워크플로 | 실행 | 하는 일 | 실패 시 |
|---|---|---|---|
| `test-and-deploy` | main에 push, 수동 | 단위·데이터·사이트 테스트 → 생성 페이지 최신 확인 → 로컬 브라우저 E2E → 배포 → 배포 사이트 E2E | 테스트 실패면 **배포 안 함**(기존 버전 유지). 배포 후 E2E 실패는 Actions에 빨간 표시 |
| `weekly-ops` | 매주 월 09:00 KST, 수동 | ① 공개 공휴일 캘린더와 데이터 비교 ② 운영 사이트 E2E | ① 차이 → 이슈 생성/댓글 (사이트는 자동 변경 안 함) ② 실패 → 이슈 생성. 네트워크 실패는 경고만 |

주의: GitHub는 공개 저장소에 **60일간 활동이 없으면 예약 워크플로를 자동 중지**한다. 중지되면 Actions 탭에서 다시 켜거나 아무 커밋이나 push하면 된다.

## 연 1회 작업: 다음 해 공휴일 추가 (매년 6월 말 월력요항 발표 후)
`weekly-ops`가 6월 이후 공개 캘린더에 다음 해 데이터가 보이면 이슈로 알린다.
1. 우주항공청 월력요항 보도와 공개 캘린더를 대조해 `assets/holidays.js`에 연도 추가, `DATA_VERIFIED_AT` 갱신
2. `tests/site.test.mjs`에 해당 연도 개수 검증 추가(선택)
3. `npm run build` (새 연도 콘텐츠 페이지·sitemap 생성) → `npm test` → push
4. 홈 링크(nav)의 연도 페이지 링크를 새 연도로 교체

임시공휴일 발표 시: 같은 방식으로 해당 날짜를 추가(kind `'holiday'`)하고 push.

## 되돌리기
- 코드: `git revert <커밋>` 후 push → 테스트 통과 시 이전 상태로 재배포
- 긴급: Actions → test-and-deploy → 정상이던 과거 실행 → "Re-run all jobs" (그 커밋 기준으로 재배포)
- 사이트는 정적 파일뿐이라 데이터 백업이 필요 없다. 원본은 Git 저장소와 전달 ZIP에 있다.

## 제휴 연결 (승인 후)
1. 트립닷컴 제휴 대시보드에서 아무 검색 페이지의 제휴 링크를 생성
2. 링크의 추적 쿼리 파라미터(예: `Allianceid`, `SID` 등 대시보드가 붙이는 값)를 `assets/config.js`의 `AFFILIATE.params`에 그대로 입력
3. push → 모든 페이지 하단 제휴 고지가 자동 표시되고, 링크에 `rel="sponsored"`가 붙는다
4. 소개 페이지의 "현재는 제휴 링크가 아닌 일반 검색 링크입니다" 문장 수정

## 측정 연결 (선택)
1. GoatCounter 계정 생성(사용자) → 사이트 코드를 `ANALYTICS.goatcounterCode`에 입력
2. 소개 페이지 개인정보 안내의 "현재는 통계 도구를 사용하지 않습니다"를 사용 중으로 수정
3. `tests/e2e.test.mjs` 첫 테스트의 '외부 요청 없음' 검사에 `gc.zgo.at`, `goatcounter.com` 허용 추가
4. 집계 이벤트: `plan_run`(직접 조건 변경 계산, 방문당 1회), `ics_download`, `copy_request`, `share`, `outbound_flight`, `outbound_hotel`. 입력값·날짜는 보내지 않는다(E2E로 검증).

## 다른 호스트로 이전 (예: Cloudflare Pages)
`npm run build:site` → `_site` 폴더를 그대로 업로드. 404.html과 일부 링크가 `/yeonchagak/` 경로를 가정하므로 루트 도메인으로 옮기면 `404.html`·`sitemap.xml`·`canonical`·`SITE.url`의 주소를 바꾼다.

## 로컬 실행
```
npm ci
npm test
npm run test:e2e      # Chrome 필요 (CHROME_PATH)
npm run serve         # http://127.0.0.1:8080/yeonchagak/
```
