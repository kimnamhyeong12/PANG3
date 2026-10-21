# 프로젝트 · 통합 보고서 (2026-10-22)

`feature/project-report` 브랜치에서 들어온 기능을 정리했다. 풀 받은 사람이 **무엇이 바뀌었는지**, **따로 할 일이 있는지**를 빠르게 확인하는 용도다.

## 한 줄 요약

- 그룹 리더가 **프로젝트**를 만들고, 팀원들의 건별 보고서를 묶어 **통합 보고서**(HTML·HWPX)를 만든다. 편집은 웹, 보기와 받기는 앱.
- 앱 보고서 탭과 그룹 탭을 정리했다. 받은 보고서는 폴더 열기, 고쳐진 보고서는 다시 받기, 카드를 누르면 미리보기.
- **풀 받은 뒤 새로 설치할 것은 없다.** npm·pip·Maven 의존성 추가 없음. DB 변경은 서버가 켜질 때 자동으로 적용된다.

## 풀 받은 뒤 할 일

| 대상 | 할 일 |
|---|---|
| 앱(frontend) | 없음. 늘 하던 `npm install`이면 충분 (새 패키지 없음) |
| 웹(web) | 없음. 새 패키지 없음 |
| 백엔드 | 없음. 새 라이브러리 없음. DB 테이블은 켜질 때 자동 생성 |
| 보고서 엔진(ai) | 없음. `requirements.txt`에서 `python-hwpx`의 최대 버전만 막음(`<7`, 7.0에서 쓰던 함수가 없어짐) |
| 운영 서버 | main에 올리면 기존 GitHub Actions(deploy.yml)가 이미지를 빌드하고 재시작한다. 따로 할 일 없음 |
| DB 관리자 | 없음. 아래 "DB 변경" 참고 |

새 키(환경변수)도 꼭 필요하지 않다.

- 보고서 위치도는 `VWORLD_API_KEY`가 있으면 VWorld 지도를 쓰고, 없으면 OpenStreetMap을 쓴다.
- 행정동 자동 채움은 원래 쓰던 `kakao.rest-api-key`를 그대로 쓴다.

## DB 변경 (자동 적용)

- 새 테이블 4개: `projects`, `project_tasks`, `compiled_reports`, `compiled_report_items`.
- 기존 테이블(`users`, `task`, `task_progress` 등)은 **바꾸지 않는다.** 기존 회원·업무·보고서는 그대로 쓰인다.
- 서버가 켜질 때 `config/ProjectReportSchema.java`가 `src/main/resources/db/project_report_schema.sql`을 실행한다.
  - Hibernate(`ddl-auto=update`)보다 먼저 실행되어서, Hibernate가 만들지 못하는 두 가지도 챙긴다.
    - "초안은 하나만" 부분 유니크 인덱스
    - 보고서를 지우면 같이 지워지는 ON DELETE CASCADE
  - 모든 문장이 `IF NOT EXISTS`라서 재시작할 때마다 실행돼도 안전하다.
  - PostgreSQL에서만 실행된다. 로컬 H2 테스트에서는 Hibernate가 만든다.
  - 완전히 새 DB(기본 테이블이 아직 없음)라면 건너뛴다. Hibernate가 먼저 만들고, 다음 재시작 때 인덱스가 붙는다.
- 직접 넣고 싶은 DB 관리자는 `backend/sql/project_report_migration.sql`을 쓰면 된다(같은 내용 + BEGIN/COMMIT). **필수 아님.**
- 운영 반영 전에 DB 백업을 권장한다. 바꾸는 것은 새 테이블 추가뿐이지만, 백업은 원래 하던 습관대로 한다.

검증: 임베디드 PostgreSQL로 "기존 운영 DB(프로젝트 테이블 없음) → 새 서버 기동 → 재기동"을 해 봤다. 테이블·인덱스·CASCADE가 생기고, 기존 회원 행은 유지되고, 두 번째 기동도 정상이었다.

## 서버 이미지(backend/Dockerfile) 변경

- `ai/hwpx_images.py` 복사 추가: HWPX 그림이 잘리지 않게 고친다.
- `fontconfig fonts-dejavu-core` 설치 추가: 보고서 위치도에 핀 번호를 그릴 때 필요하다. slim 이미지에는 글꼴이 없다.

## 기능별 위치

| 기능 | 백엔드 | 웹 | 앱 |
|---|---|---|---|
| 프로젝트·업무 연결 | `ProjectController`, `ProjectService` | `ProjectsPage`, `ProjectsDetailPage` | `ProjectScreen` |
| 통합 보고서 편집·확정·버전 | `CompiledReportController/Service` | `ReportEditorPage`(지도+카드) | `CompiledReportViewScreen`(읽기) |
| 통합 HWPX | `CompiledReportHwpxService` → `ai/compiled_report.py` | 편집 화면 HWPX 버튼 | 보기 화면 HWPX 받기 |
| 건별 보고서 수정 | `ProgressReportEditController/Service` | `ProjectsProgressEditPage`(HWPX·**HTML 저장**) | 기존 보고서 수정 화면 |
| 건별 HTML(미리보기) | `GET /api/progress-reports/{id}/html` | HTML 저장 | 카드 누르기 → 미리보기 |
| 위치도 이미지 | `StaticMapService` | — | — |
| 행정동 자동 채움 | `AdminDongService` | — | — |

## 앱 화면에서 바뀐 것

- **보고서 탭 → '보고서 작성(개인)'** (`ReportListScreen`)
  - 그룹 바꾸기가 제목 아래로 갔다.
  - 검색할 수 있고, 목록이 '쓸 것 / 끝난 것'으로 나뉜다.
  - 체크박스가 처음부터 보이고, 고르면 아래에 'N건 받기'가 뜬다.
  - 카드 버튼은 상태에 따라 하나만 보인다.
    - ⬇ 받기: 처음 받는 보고서
    - 📂 폴더 열기: 받은 그대로인 보고서
    - 노란 ⬇ 다시 받기: 받은 뒤 고쳐진 보고서
  - 받은 기록은 기존 다운로드 화면과 같은 기록을 쓴다(이 폰 기준).
  - iOS는 기존 다운로드 화면으로 넘어간다.
- **그룹 탭**: 대시보드 · 업무 이관 · 프로젝트 · 관리.
  - 프로젝트 탭 안에 '프로젝트 | 건별 보고서'가 있다.
  - 건별 보고서의 폴더 안 카드는 위와 같은 카드다. 수정 버튼은 **현재 담당자**인 건에만 있다.
  - 관리 탭의 '그룹 보고서 전체보기'는 빠졌다. 건별 보고서로 옮겨 갔다.
- **보고서 양식 작성**: '보고서에도 담기'를 뺐다. 프로젝트에 담기는 웹에서 한다.
- 공용 부품: `components/ReportFileCard.js`(카드·아래 바), `utils/useReportDownloads.js`(받기 상태), `utils/reportDownloadState.js`(받기 기록).

## 테스트

- 백엔드: `mvn test` (로컬에서는 `AWS_REGION=ap-northeast-2` 필요)
- 보고서 엔진: `python ai/test_report_export.py`
- 웹: `npm run build`
- 앱: `node frontend/scripts/report-selection-test.cjs`, `project-navigation-test.cjs` 등
  - header-calendar, photo-markup, place-screen, report-download, report-files, route-viewport, single-place-map 7개는 main에서도 실패하던 테스트다. 이번 변경과는 무관하다.
