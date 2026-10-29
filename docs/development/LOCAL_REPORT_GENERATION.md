# 기기에서 HWPX·HTML 생성

웹과 모바일의 HWPX 다운로드는 `/api/local-reports/progress/{id}` 또는
`/api/local-reports/compiled/{id}`에서 자료와 사진 경로를 받은 뒤 사용자 기기에서 실행한다.
사진 원본과 업무 기록은 기존 서버 저장소에 유지한다. 사용자가 직접 저장·공유하는 완성 HWPX 안에는 사진이 포함된다.
HTML 미리보기·저장은 `/api/local-reports/{progress|compiled}/{id}/html-data`에서 JSON과 사진 경로를 받아
같은 생성기 화면의 JavaScript로 조립한다. HTML에는 Python을 불러오지 않는다.

## 실행 환경

- 기존 Python 양식(app.py/compiled_report.py)을 Pyodide의 Web Worker에서 실행한다.
- HTML은 기기의 Canvas로 사진을 최대 960px JPEG로 축소하고 본문에 data URI로 넣는다.
  기존 사진 확대, 위치 표·정적 핀에서 항목 이동, 카카오 지도 스크립트와 반응형/인쇄 스타일을 유지한다.
- 웹은 iframe, 모바일은 React Native WebView로 같은 생성기를 사용한다.
- 사진은 기존 로그인 세션으로 한 장씩 요청하고 메모리의 가상 파일시스템에만 넣는다.
- 사진 응답에는 `Cache-Control: no-store`를 지정한다. 사진을 localStorage/IndexedDB/갤러리/개별 캐시 파일로 쓰지 않는다.
- 완료·실패·취소 시 iframe/WebView를 제거하여 worker와 작업 파일을 해제한다. 모바일에서 백그라운드로 가면 취소한다.
- Gemini 코드는 유지한다. 기기 실행 경로에서는 Gemini 모듈을 불러오거나 API를 호출하지 않는다.
- API 키·로그인 토큰을 생성기에 전달하지 않는다. 부모 앱이 인증된 사진 요청만 대신한다.
- 입력 사진은 한 장 15MB, 합계 100MB, 자산 202개, 결과 HWPX 64MB, 전체 작업 5분으로 제한한다.
  서버 업로드 경로에서 사진을 이미 축소하며, 생성기에서도 한 장씩 축소한다. 제한 초과·필수 사진 누락 시 전체 작업을 실패시킨다.
- 위치도는 기기의 Canvas가 원본 배경 타일을 이어 붙이고 번호·작성자 색상의 핀을 그려 JPEG로 만든다.
  전체 위치도는 보고서 순번(좌표 없는 항목도 번호는 유지)·작성자별 테두리 색상·겹침 방지 배치를 유지한다.
  현장에 저장된 위치도 캡처는 다시 그리지 않고 그대로 사용한다. 없는 경우 기존과 같은 1번 핀을 기기에서 그린다.
  좌표가 없으면 위치도를 생략하며, 유효한 좌표의 타일 요청이 실패하면 빈 지도 대신 재시도 오류를 표시한다.
- `/api/local-report-map/tiles/{z}/{x}/{y}`는 로그인 확인 후 원본 PNG 조각만 중계한다.
  지도 서비스 키는 서버에 남고, 서버는 이 경로에서 비트맵 디코딩·합성·핀 그리기를 수행하지 않는다.
  타일 범위(줌 7~17), 256px PNG, 1MB 이하, 동시 다운로드 4개를 제한한다.
  배경만 7일 캐시(서버는 압축 파일, 최대 512개/128MB)하고 기기의 작업 메모리 캐시는 48개/8MB로 제한한다.
  원본 현장 사진과 마커가 포함된 완성 위치도는 이 배경 캐시에 저장하지 않는다.
  [OSM 타일 정책](https://operations.osmfoundation.org/policies/tiles/)에 따라 식별 헤더·출처 표기·캐시를 유지하고,
  사용자가 요청한 보고서의 화면 범위에 필요한 조각만 받는다. VWorld 키가 있으면 기존 VWorld 배경을 사용한다.
- 모바일 HTML 미리보기는 디스크에 저장하지 않는다. 화면을 벗어나거나 다시 요청하면 이전 생성도 취소한다.

## 빌드와 배포

저장소 루트에서 먼저 실행한다.

```sh
python tools/build_report_runtime.py
cd backend
mvn package
```

Pyodide 0.27.7, Pillow 10.2.0, lxml 5.2.1, python-hwpx 6.10.0을 고정한다.
HWPX wheel과 Pyodide 패키지 wheel의 SHA-256을 확인한다. 업데이트 시 브라우저 생성 검증을 다시 실행한다.
공개 코드와 빈 양식만 번들에 넣으며 `.env`, uploads, output은 포함하지 않는다.
생성된 vendor/, python.zip, 공유 마커 배치 모듈의 복사본은 Git에서 제외한다. Dockerfile은 별도 단계에서 자동으로 준비한다.
브라우저가 제3자 CDN/PyPI에 접속하지 않도록 런타임과 패키지를 백엔드가 직접 제공한다.

웹을 별도 웹서버에서 호스팅하고 `VITE_API_BASE_URL`이 빈 값이면 `/report-runtime/`도 `/api/`처럼
백엔드로 프록시해야 한다. Vite 개발 설정에는 이 프록시가 포함되어 있다.
모바일은 업데이트된 JS가 포함된 빌드/배포가 필요하다. 기존 설치본은 이전 서버 생성 API를 계속 사용한다.
기존 서버 생성 API와 Python 엔진은 호환성을 위해 유지한다.

HWPX·HTML의 문서 조립·사진 축소·새 위치도 이미지 합성은 기기에서 수행한다. 서버는 권한 확인,
업무 기록·사진 저장/전달, 지도 배경 조각의 중계를 맡는다. 구버전 앱을 위해 기존 `/html`, `/map`, `/overview`
API와 서버 렌더러는 남겨두되, 새 웹·모바일 생성 경로에서는 해당 API를 호출하지 않는다.
서버의 CPU·메모리 부담을 줄이는 변경이며, 지도 중계 네트워크·디스크 I/O와 고정 서버 요금은 남는다.

## 검증

- `node frontend/scripts/local-report-protocol-test.cjs`: 바이너리 전송, URL·작업 격리, 취소·시간 초과, 사진 권한 오류
- `node frontend/scripts/report-files-test.cjs`: 모바일 다운로드가 서버 생성 API를 호출하지 않는지
- `node frontend/scripts/project-navigation-test.cjs`: 모바일 HTML 호출이 로컬 생성기로 연결되는지
- `tools/test_local_report_browser.cjs`: Playwright와 실제 브라우저 Python으로 건별/통합/네이티브 브리지 HWPX 생성
  (실행 전 backend/target/local-report-test/photo.jpg와 256px tile.png에 합성 이미지 준비. Playwright 패키지 및 Chromium 필요)
- `LocalReportServiceTest`, `LocalReportSecurityTest`: 확정 스냅샷 불변, 서버 경로 비공개, 인증·타 사용자 사진 접근 차단
- `LocalReportHtmlServiceTest`: HTML 데이터의 권한 검사, 스냅샷 불변, AI 텍스트 제외
- `LocalReportMapsTest`, `ReportMapTileServiceTest`: 번호·작성자 색상, 원본 타일 유지, 캐시·입력 제한·비밀키 비노출
- `node frontend/scripts/report-map-plan-test.cjs`: 기존 투영·확대 수준, 번호 유지·마커 겹침 방지·경도 경계 처리
- 브라우저 테스트는 HTML 기기 생성, 입력값 이스케이프, 사진 확대·표 이동, PC/휴대폰 폭 레이아웃,
  네이티브 메시지 브리지와 실제 위치도 합성도 확인한다. HTML 생성 시 Python·외부 CDN을 요청하지 않는지,
  위치도 생성 시 서버의 완성 지도 이미지 API를 호출하지 않는지 확인한다.

자동 브라우저 테스트는 실제 Android/iOS의 파일 저장과 한컴오피스 시각 검증을 대체하지 않는다.
배포 전 대상 휴대폰에서 생성·취소·저장·공유와 한글의 표/사진 표시를 확인한다.
