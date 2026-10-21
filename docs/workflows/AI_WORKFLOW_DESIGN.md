# PANG3 에이전트 개발 워크플로우 설계

작성: 2026-10-18, Asia/Seoul. 상태: 아래는 전체 설계이며, 단일 작업 실행·검수 제출·QA 기록의 1차 구현을 추가했다. 사용법과 현재 한계는 [실행기 안내](../../tools/agent-workflow/README.md)를 기준으로 한다. 자동 AI 호출·교차 모델 검수·병렬 실행·CI 연동은 아직 구현하지 않았다.

## 1. 조사 범위와 결론

현재 로컬 소스, 패키지·빌드 설정, 테스트 일부, 로컬 실행 스크립트, 출시 검증 계획, 배포 workflow를 읽었다. 애플리케이션·테스트·Docker·기기는 실행하지 않았다. 과거 문서의 성공 기록은 이번 실행 결과로 취급하지 않는다.

적용 가능하다. 기존 프로젝트 바깥에 개발 운영 계층을 추가한다. 서비스의 `ai/`는 보고서 생성 엔진이므로 개발 에이전트 코드를 넣지 않는다. 초기에는 한 작업 흐름부터 검증하고, 역할·상태·증거 규칙이 작동한 후 교차 모델과 병렬 실행을 연결한다.

루트·하위 프로젝트에서 별도 AGENTS.md를 찾지 못했다. 일반 문서 안의 다른 에이전트 배포 지시는 이번 설계 작업의 실행 지시로 취급하지 않았다.

## 2. 실제 프로젝트 구조

| 영역 | 확인한 구현 | 설계에 미치는 영향 |
|---|---|---|
| `frontend/` | Expo 57 / React Native 0.86, `App.js`에서 화면·상태 관리 | 네이티브 앱 QA 필요. 웹 QA만으로 완료 불가 |
| `frontend/modules/kakao-navigation/` | Kotlin 기반 지도·안내·서비스·다운로드 모듈 | SDK 빌드 및 기기 검증 경로 필요 |
| `web/` | React 18 / Vite 5, React Router, 자체 인증·그룹 Context | 브라우저 QA 적용 가능 |
| `backend/` | Java 17 / Spring Boot 3.5.14, JPA·Security·Mail | Maven 테스트·API·권한·DB 검증 재사용 |
| `ai/` | Python, Pillow, python-hwpx, JSON 입력/파일 출력 | Java→Python payload 계약과 생성물 검증 필요 |
| `infra/`, Compose | EC2·SSM·S3 구성 및 로컬 DB 설정 | 로컬 검증과 실제 배포 단계 분리 |
| `.github/workflows/deploy.yml` | main push에서 이미지 빌드·배포 | 개발 작업 완료와 운영 배포를 동일 상태로 두지 않음 |
| 기존 MD 문서 | 출시·보안·지도·보고서 등 여러 시점의 기록 | 최신 소스와 대조한 Wiki 인덱스 필요 |

### 현재 재사용할 검증 자산

- `frontend/scripts/*-test.cjs`: 31개. 일부는 로직 실행, 일부는 소스 패턴·계약 검사. 모두 UI E2E인 것은 아니다.
- `backend/src/test/**/*Test.java`: 20개 클래스. 인증·파일 격리·업무·보고서·경로 등. 테스트 메서드 수와 다르다.
- `ai/test_report_export.py`, `ai/test_report_compression.py`: 합성 데이터 기반 파일 검증.
- `web/`: 소스 경로에서 test/spec 파일 및 package의 test 스크립트를 발견하지 못함. build 스크립트는 존재.
- `docs/release/APP_RELEASE_VALIDATION_PLAN.md`: V01~V26 시나리오와 E1/E2/E3 환경·네트워크 조건을 이미 정의. 이를 QA의 상위 목록으로 사용.
- `backend/scripts/start-release-local.ps1`: 격리 H2 또는 별도 PostgreSQL 로컬 실행, API 18081.
- `docker-compose.release-local.yml`: PostGIS 16-3.4, 로컬 15432의 별도 시험 DB.

### 코드와 설정에서 확인한 중요한 연결

1. `web/src/api/session.js`가 `frontend/utils/sessionClient.js`를 직접 import한다. 두 폴더는 완전히 독립적이지 않다.
2. `frontend/App.js` 1,684줄, `MapScreen.js` 3,069줄, `FieldActionScreen.js` 1,988줄. 단순 줄 수 기준이며, 이 파일들은 공유 편집 충돌 가능성이 큰 지점이다.
3. `AiReportService.java`가 Python에 JSON을 전달하고 결과를 읽는다. API 테스트와 Python 단독 테스트 사이의 실제 연동 검증이 필요하다.
4. `ai/app.py`는 `.hwpx`를 생성하며 `ENABLE_AI_ANALYSIS = False`다. README의 HWP/Gemini 설명을 현재 활성 동작으로 그대로 사용하지 않는다.
5. 웹 Vite `/api` 프록시는 8081, 로컬 검증 API는 18081이다. 웹 QA 전용 프록시 설정을 맞춰야 한다. 쿠키 인증·CORS도 함께 검증해야 한다.
6. `backend/Dockerfile`의 Maven 패키지는 `-DskipTests`를 사용한다. 현재 배포 workflow에는 별도 테스트 gate가 없다.
7. 루트 Dockerfile은 정적 `index.html`용 Nginx다. 현재 Java API 이미지 빌드 경로는 `backend/Dockerfile`이다. `backend/app.js`를 API 진입점으로 추정하지 않는다.
8. 루트 README와 AI·인프라 문서에 실행 방식·환경 파일·보고서 형식에 대한 시점 차이가 있다. 문서는 소스와 대조하고 출처·확인일을 남긴다.
9. 현재 PATH에 node/mvn/python/java/docker가 있지만 adb/claude는 발견되지 않았다. 별도 설치 경로·로그인·장치 연결 여부는 미확인이다. 명령 발견은 실행 준비나 서비스 가동의 증거가 아니다.

## 3. 목표 아키텍처

```text
사용자 ↔ Master
           ├─ 요청·제외 범위 확정
           ├─ 영향 분석 / 역할 배정 / 예산 / 예외 처리
           └─ 파일 기반 실행기
                 ├─ Planner ↔ Plan Reviewer
                 ├─ Developer ↔ Code Reviewer
                 ├─ QA Dispatcher
                 │    ├─ 기존 자동 회귀·API 검증
                 │    ├─ Web UI QA
                 │    ├─ Android UI/네이티브 QA
                 │    └─ 실기기·실주행·외부 연동 대기
                 └─ Wiki Writer ↔ Wiki Reviewer
                                      ↓
                            검증 범위가 명시된 결과
```

AI는 계획과 수정 제안을 수행한다. 실제 상태 전이는 실행기가 검수 결과·버전·증거를 검사해 처리한다. 에이전트가 문서에 APPROVED를 썼다는 사실만으로 다음 단계로 이동하지 않는다.

## 4. 역할·쓰기 권한

| 역할 | 읽기 | 쓰기 | 종료 결과 |
|---|---|---|---|
| Master | 요청·계획·diff·결과 | 요청 revision, 작업 배정, 결정 기록 | 계획 시작 / 재계획 / 범위 명시 보고 |
| Planner | 요청·코드·계약·Wiki | plan, 개발 TODO, QA 시나리오 | READY |
| Plan Reviewer | 명세·계획·코드 | 자신의 검수 응답만 | APPROVE / REQUEST_CHANGES |
| Developer | 승인 계획·필요 소스 | 배정한 소스·테스트, 완료 근거 | READY |
| Code Reviewer | 고정된 diff·명세·검증 결과 | 자신의 검수 응답만 | APPROVE / REQUEST_CHANGES |
| QA | 승인 시나리오·후보 빌드 | 격리 시험 데이터, 증거, 결함 보고 | PASS / FAIL / BLOCKED |
| Wiki Writer | 승인된 변경·QA | 관련 Wiki | READY |
| Wiki Reviewer | 최종 코드·Wiki | 자신의 검수 응답만 | APPROVE / REQUEST_CHANGES |
| 실행기 | 설정·결과·아티팩트 | 상태·이벤트·검증 manifest | 유효한 전이만 수행 |

검수자는 작업 소스를 수정하지 않는다. 검수 응답 파일 저장은 허용한다. QA의 쓰기는 테스트 환경 안의 데이터와 증거에 한정한다.

초기 권장 배치는 Codex 작업 + 연결 가능할 때 Claude 검수다. Claude 실행 경로·인증·기계 판독 결과·읽기 전용 제어가 실제 검증되기 전에는 연결됐다고 표시하지 않는다. 대체로 독립 세션 검수 또는 사람 검수를 쓸 수 있지만, 동일 모델 검수를 다른 모델 교차 검수로 기록하지 않는다.

## 5. 디렉터리 설계

다음은 전체 목표 구조다. 현재 구현은 `tools/agent-workflow/`의 실행기·설정·테스트·안내 및 `.agent-runs/` 기록이고, 나머지는 후속 설계다.

```text
tools/agent-workflow/
  runner.py                  # 표준 라이브러리 중심 상태·결과 검사
  workflow.json              # 단계·예산·adapter 연결
  checks.json                # 영역→실행 명령·위험·필수 증거
  commands.ps1               # Windows 로컬 검증 래퍼
  adapters/                  # Codex/Claude/수동 검수 연결부
  schemas/                   # request/plan/review/qa/result 형식
  prompts/                   # 역할별 지침
  templates/                 # 실행 문서 템플릿
docs/wiki/
  index.md
  architecture.md
  api-contracts.md
  auth-and-ownership.md
  mobile-navigation.md
  reports.md
  local-verification.md
  release-boundary.md
docs/workflow/examples/       # 합성 데이터로 만든 재현 예시만 추적
.agent-runs/<run-id>/         # Git 제외, 실제 실행 기록
  request.json
  plan.json
  state.json
  events.jsonl
  attempts/<stage>/<number>/  # 입력 revision·응답·검수·명령 결과
  evidence/<scenario-id>/     # 로그·스크린샷·다운로드·체크섬
  exchanges/                 # 노출 가능한 도구/모델 교환 기록
  result.md
```

`.agent-runs`는 backend/target 아래에 두지 않는다. Maven clean으로 실행 기록이 사라지는 것을 피한다. 기존 날짜별 보고서를 일괄 이동·삭제하지 않고 Wiki에서 링크로 연결한다.

## 6. 요청·TODO·검수의 계약

### 요청

필수 필드: `runId`, `revision`, 사용자 목표, 포함/제외 범위, 대상 플랫폼, 허용 시험 환경, acceptance ID, 외부 연동 범위, 필수 검증 등급.

개발자가 요청·합격 기준을 변경할 수 없다. 요구 변경이 필요하면 Master로 돌려보내 새 revision을 만들고 영향받은 승인만 무효화한다.

### 계획과 TODO

TODO마다 `id`, 연결 요구 ID, 담당 영역, 소유 파일·공유 자원, 선행 작업, 완료 조건, 실행할 check ID, QA ID를 둔다. Planner만 내용 revision을 변경하고 Developer는 별도 completion 레코드에 구현 근거를 제출한다. 체크 표시 자체를 권한 경계로 사용하지 않는다.

### 검수

`review.json`은 다음을 포함한다.

```json
{
  "stage": "development",
  "decision": "REQUEST_CHANGES",
  "inputRevision": "plan-2",
  "candidateDigest": "sha256-of-candidate-manifest",
  "reviewer": { "provider": "configured-adapter", "sessionId": "recorded-id" },
  "findings": [{
    "id": "R-001", "severity": "blocking", "requirementId": "AC-002",
    "file": "repository-relative-path", "line": 1,
    "reason": "관찰 가능한 문제", "expectedFix": "수정 요구"
  }]
}
```

실행기는 응답 schema, 역할, 대상 digest, 미해결 blocking finding을 확인한다. APPROVE 상태인데 blocking finding이 남아 있으면 결과 오류다. 검수 실패와 응답 형식 오류도 구분한다.

### 후보 버전 고정

- 기준 commit, 전체 변경 파일, 미추적 소스, 관련 계약·lockfile의 content hash를 manifest에 기록한다.
- QA 빌드에는 소스 digest, APK/웹 빌드·API jar digest, 빌드 시각·환경 설정의 비밀 아닌 식별자를 연결한다.
- source가 바뀌면 영향받은 코드 검수와 QA 승인을 다시 받아야 한다. 이전 스크린샷을 새 코드의 증거로 재사용하지 않는다.
- 리뷰 중 작업자 쓰기를 중지하거나 별도 고정 checkout을 사용한다. HEAD만 같다고 같은 코드로 판단하지 않는다.
- Wiki만 바뀐 경우 제품 QA를 무조건 다시 돌리지 않되, Wiki 승인 대상은 최종 제품 digest와 연결한다.

## 7. 상태와 예외 처리

기본 상태:

```text
INTAKE → PLANNING → PLAN_REVIEW → IMPLEMENTING → CODE_REVIEW
       → QA → WIKI → WIKI_REVIEW → VERIFIED
```

- 계획/코드/Wiki 반려: 해당 작업 단계로 복귀.
- QA 결함: 결함 ID와 재현 절차를 담은 복구 TODO → 필요 시 재계획 → 수정 → 코드 검수 → 해당 QA와 영향 회귀.
- `BLOCKED`: 기능 실패가 아니라 검증 수행 불가. 원인과 재개 조건을 필수 기록.
- `NEEDS_DECISION`: 요구 충돌, 같은 결함 두 번 반복, 범위 변경 등 Master 판단 필요.
- `LIMIT_REACHED`: 재검수 횟수·도구 호출·시간·비용 중 설정 한도 도달. 체크포인트를 보존하고 완료로 바꾸지 않는다.
- `CANCELLED`: 명시적 중단.

초기 예산 제안: 단계별 수정 최대 3회, 같은 finding 반복 2회 시 Master 판단, 전체 실행 시간 60분. 기기 빌드처럼 긴 작업은 시작 전에 별도 예산을 정한다. API 비용 정보가 제공되면 금액 한도를 추가하고, 구독 사용량을 달러로 임의 환산하지 않는다.

이벤트 유형 예: `CHECK_FAILED`, `REVIEW_REJECTED`, `DEVICE_UNAVAILABLE`, `DATABASE_UNAVAILABLE`, `DEPENDENCY_MISSING`, `PROVIDER_UNAVAILABLE`, `AUTH_REQUIRED`, `RATE_LIMITED`, `TIMEOUT`, `REQUIREMENT_CHANGED`, `ARTIFACT_STALE`.

재개는 마지막 상태, 입력 digest, 결과물 존재와 실제 프로세스 상태를 재확인한 뒤 수행한다. 쓰기 API의 timeout을 무조건 재실행하지 않고 중복 반영 여부부터 확인한다. 자동 예약은 별도 실행 환경이 실제 지원하고 사용자가 요청한 경우에 연결한다.

## 8. PANG3 전용 검증 매트릭스

| 영역 | 우선 재사용할 check | 추가로 필요한 증거 |
|---|---|---|
| 인증·세션 | `session-client-test.cjs`, `ReleaseAuthIntegrationTest`, `AuthRateLimitFilterTest` | 웹 쿠키/모바일 갱신, A 로그아웃→B 로그인 격리, 401/403 |
| 업무·양도 | `work-plan-test.cjs`, `transfer-history-test.cjs`, `TaskTransferNotificationTest`, `TaskTransferHistoryTest` | A/B 실제 수락, 중복 수락, C 접근 차단, PostgreSQL 동시성 |
| 현장기록·사진 | `report-upload-test.cjs`, `photo-markup-test.cjs`, `PhotoSlotsMemoTest`, `FileIsolationTest` | 앱 촬영/선택→저장→재조회, 타계정 사진 차단 |
| 보고서 | `report-files-test.cjs`, `report-download-test.cjs`, `ReportPreparationTest`, Python export/compression | Java→Python 호출, 파일별 내용, 다운로드, HWPX 뷰어 표시 |
| 지도·안내 | `route-session-test.cjs`, `route-progress-test.cjs`, `single-place-map-test.cjs`, 네이티브 compilation | 기기 지도 복귀·세션 복원·권한. 이동 GPS·음성·재탐색은 현장 검증 |
| 웹 화면 | `npm run build` | 새 브라우저 시나리오: 로그인·그룹·양도·보고서·권한 오류 |
| 푸시 | `push-registration-test.cjs`, `route-notification-test.cjs` | 실제 테스트 수신, 토큰 정리, 내비 foreground 알림과 구분 |
| DB·배포 구성 | Maven 회귀, 별도 PostGIS 환경, SQL 검토 | 마이그레이션·잠금·백업복원·Linux 이미지에서 실제 연동 |

명령 예시(해당 하위 디렉터리를 working directory로 지정):

- frontend: `node scripts/session-client-test.cjs`
- frontend: `node scripts/report-upload-test.cjs`
- backend: `mvn test` 또는 계획에서 고른 `mvn -Dtest=ReleaseAuthIntegrationTest test`
- web: `npm run build`
- ai: `python test_report_export.py`, `python test_report_compression.py`

이 명령들은 이번 설계에서 실행하지 않았다. 초기 도입 시 테스트별 실행 방식·필요 패키지·외부 호출 여부를 확인한 후 registry에 등록한다. 파일명 패턴을 전부 실행하는 방식은 채택하지 않는다.

### 환경 등급

- E1: 합성 데이터, 격리 H2/파일, 외부 발송 없는 빠른 검증.
- E2: 별도 PostgreSQL/PostGIS + 시험용 Linux 이미지·업로드·보고서. 외부 연동은 연결 여부를 각각 기록.
- E3: 기존 출시 계획의 승인된 운영형/내부 트랙 시험. 별도 권한과 시험 공간이 필요.
- D1: 연결 장치 UI; D2: 이동·현장 조건. DB 환경과 기기 검증 등급은 별도 필드다.

H2에서 통과해도 PostgreSQL JSONB·지리 데이터·잠금·마이그레이션 검증으로 승격하지 않는다. 기존 로컬 스크립트는 고정 포트와 공용 시험 파일을 쓰므로 병렬 run별 경로·포트 매개변수화 전에는 한 실행만 사용한다. 임의 자동 DDL의 성공을 SQL 마이그레이션 성공으로 기록하지 않는다.

웹 QA는 상대 `/api`와 쿠키 동작을 유지하는 전용 프록시 18081 구성을 우선 제안한다. 현재 8081 설정을 조용히 운영용으로 바꾸지 않고 QA 전용 실행 옵션으로 분리한다. 모바일은 `EXPO_PUBLIC_API_BASE_URL`을 프로세스 범위로 지정한다.

### QA 증거 형식

`scenarioId / requirementId / candidateDigest / artifactDigest / 환경 / 기기·OS / 네트워크 / 합성 역할 / 시작·종료 시각(KST) / 동작 / 기대값 / 실제값 / PASS·FAIL·BLOCKED / 증거 경로`.

브라우저 QA 성공을 Android QA 성공으로 기록하지 않는다. 화면 캡처만으로 서버 저장·권한·파일 내용 성공을 판정하지 않고 필요한 API/파일 검사 결과를 함께 연결한다.

## 9. 병렬화 규칙

초기에는 쓰기 작업 1개. 격리와 통합 검증이 준비된 뒤 동시 쓰기 작업 2개까지 시작한다.

| 공유 지점 | 기본 정책 |
|---|---|
| `frontend/App.js`, `MapScreen.js`, `FieldActionScreen.js` | 파일별 단일 작업자. 같은 파일을 나누어 맡기지 않음 |
| `frontend/utils/sessionClient.js` | 모바일·웹 양쪽 계약 잠금 |
| Controller/DTO/DB schema | API 계약을 먼저 확정. 계약 변경은 소비자 작업보다 선행 |
| Java report payload / Python parser | 계약 revision을 고정한 뒤 분리 작업 |
| 네이티브 모듈과 JS bridge | 메서드·이벤트 계약을 먼저 확정 |
| lockfile, Gradle 설정, Compose | 단일 작업자 |
| 장치, DB, 고정 포트, 업로드 디렉터리 | 자원 잠금. 병렬 QA 불가 또는 전용 자원 배정 |

작업별 branch/worktree 등 격리 checkout을 사용하고, 검수자는 고정된 후보를 읽는다. 단순 파일 잠금만으로 의미적 충돌이 방지되지는 않는다. 예를 들어 API 응답 필드를 바꾸면 다른 파일을 수정하는 웹 작업도 영향을 받는다.

통합 순서는 공통 계약 → 구현 결과 → 영향 회귀 → 결합된 앱·웹/API QA다. 충돌 해결로 내용이 바뀌면 검수·QA를 영향 범위에 맞춰 갱신한다. 현재 대화에서 병렬 작업이나 worktree를 실행한 것은 아니다.

## 10. Wiki와 Seed

처음 Wiki는 코드 전체 설명 대신 다음 질문의 답만 유지한다.

- architecture: 모바일·웹·API·보고서 엔진이 어떻게 연결되는가?
- api-contracts: 어떤 필드·상태·권한·파일 형식을 공유하는가?
- auth-and-ownership: 개인/그룹/담당자의 읽기·쓰기 규칙은 무엇인가?
- mobile-navigation: 안내 목적지·명시 종료·복원·지도 surface의 기준은 무엇인가?
- reports: JSON payload, HWPX, 사진 슬롯, 저장/다운로드 경로는 무엇인가?
- local-verification: 어떤 명령이 어떤 환경과 한계에서 검증하는가?
- release-boundary: 개발 검증과 운영 배포·마이그레이션의 관계는 무엇인가?

각 문서에 소스 경로·확인일·상태를 둔다. 역사적 성공 보고서를 현재 사실로 복사하지 않는다.

초기 Seed는 API 캐시/Fork에 의존하지 않는 작은 context manifest로 구현한다. 요청 revision, 후보 코드 digest, 관련 Wiki, 계약, 대상 파일 목록을 담는다. 작업자용과 검수자용 맥락을 분리하고, 검수자에게 작업자의 대화 전체 대신 요구·결과·근거를 제공한다.

실제 provider의 세션 분기·캐시 지원을 확인한 후 adapter 최적화로 추가한다. 캐시 히트율만으로 비용 절감률을 주장하지 않고 같은 작업의 호출·시간·과금 가능 지표와 비교한다.

## 11. 데이터와 권한 경계

- 개발 도구 실행기는 기존 앱의 사용자 기능이나 Spring 서비스로 노출하지 않는다.
- 모델이 제안한 임의 shell 문자열을 그대로 실행하지 않고 등록된 check ID와 검증된 인자만 실행한다.
- 검수 adapter는 읽기 전용 도구/작업 공간으로 제한한다. 사후 diff 확인만으로 읽기 전용 강제를 대체하지 않는다.
- 실제 .env·키·토큰·메일 주소·업무 사진을 context와 교환 로그에 자동 수집하지 않는다. 테스트 계정도 합성 ID로 표시하고 자격 증명은 결과에 남기지 않는다.
- exchanges는 노출 가능한 입력·응답·도구 결과다. 내부 추론 기록을 저장한다고 주장하지 않는다.
- 원문과 스크린샷은 로컬·Git 제외가 기본. 공유 결과는 가림 처리를 하고 프로젝트 담당자가 정한 보존 기간을 적용한다. 초기 제안은 성공 14일·실패 30일이며 자동 삭제는 별도 정책 확정 후에만 추가한다.
- main push는 배포 trigger다. 개발 완료 후 자동 push/merge/서버 SQL 실행을 기본 후속 행동으로 두지 않는다. 별도 배포 작업에 대상·백업·migration·이미지·복구 증거를 연결한다.

## 12. 첫 시범 작업 제안: 보고서 2건 개별 다운로드

실제 버그가 있다고 단정하는 작업이 아니라, 현재 동작을 명세와 증거로 검증하는 좁은 시범 과제다. 기존 V09와 테스트를 재사용하며 수정은 재현된 결함에 한정한다.

### 합격 기준

- AC-001: 다른 방문지·날짜·메모·합성 사진을 가진 완료 기록 2개를 각각 다운로드할 수 있다.
- AC-002: 두 HWPX의 내용이 각 기록과 일치하고 서로 덮어쓰지 않는다. 바이트가 다르다는 사실만으로 내용 일치를 대신하지 않는다.
- AC-003: 권한 없는 계정이 같은 사진·보고서에 접근할 수 없다.
- AC-004: 작업 전 기록은 다운로드 정책에 따라 차단된다.
- AC-005: 대상 클라이언트는 Android로 명시하고 저장·열기까지 확인한다. Web까지 포함하려면 별도 합격 기준과 시나리오를 추가한다.

### 흐름

1. Master가 Android 대상, HWPX 형식, AI 분석 비활성 상태 유지, E1/E2 범위를 기록.
2. Planner가 관련 모바일·API·Python 파일과 기존 check를 연결하고 합성 데이터 계획 작성.
3. Reviewer가 파일 형식·날짜·권한·다운로드 실패 조건 누락을 확인.
4. 기존 회귀 실행 및 결과 기록. 필요한 Java→Python 연동 시험은 추가 구현.
5. 결함이 재현되면 최소 변경으로 수정 후 코드 검수.
6. Android에서 목록→2건 선택→개별 다운로드→뷰어 열기, API 권한·파일 내용 검사를 함께 기록.
7. 기기/뷰어가 없으면 해당 항목 BLOCKED, 로컬 자동 검증만 통과했다고 보고.
8. reports Wiki를 소스와 맞추고 최종 digest·증거 인덱스를 제출.

처음부터 GPS·실주행·푸시·DB 변경을 한 과제에 묶지 않는다. 보고서 작업도 Python 패키지·뷰어·기기·Linux 검증이 필요하므로 실제 preflight 후 범위를 확정한다.

## 13. 도입 순서와 통과 조건

| 순서 | 구현할 것 | 다음 단계로 갈 조건 |
|---|---|---|
| 1 | Wiki 인덱스, check registry, 요청·계획·증거 template | 소스와 명령·검증 한계가 맞음 |
| 2 | 단일 run 실행기, 상태 schema, manifest·digest, 수동 검수 adapter | 잘못된 승인·오래된 증거·누락된 QA를 거부함 |
| 3 | Codex/Claude 등 실제 adapter 연결 | 호출·인증·출력 형식·읽기 전용·실패 복구를 시험함 |
| 4 | 보고서 시범 과제, Web/Android QA 연결 | 실제 결과와 BLOCKED를 구분하고 증거로 추적 가능 |
| 5 | PR 검증 CI 제안, 환경별 검증 확장 | 필수 check가 배포 전에 통과하며 기존 배포 순서 보존 |
| 6 | 격리 checkout, 공유 자원 잠금, 병렬 2작업 | 합친 결과의 회귀·QA와 충돌 시 재검수 확인 |
| 7 | Fork/cache·자동 모델 선택 최적화 | 측정 결과로 품질·시간·비용 개선 확인 |

실행기 자체에는 상태 전이, 오래된 digest 거부, BLOCKED 구분, 반복 한도, 재개 시 중복 쓰기 방지를 검증하는 테스트가 필요하다. 제품에 의미 없는 형식 확인 테스트를 대량 추가하지 않는다.

## 14. 완료 보고 규칙

최종 결과에는 요청 ID, 변경 파일, 대상 소스/아티팩트 digest, 검수 주체·판정, 실행 명령·exit code·시각, QA 항목별 증거, BLOCKED·미수행 항목, 남은 위험을 담는다.

`VERIFIED`는 요청에서 필수로 정한 검증을 모두 충족한 경우다. 로컬 코드 검사만 통과한 결과, 기기 검증이 남은 결과, 운영 배포된 결과를 같은 말로 보고하지 않는다. 기기·현장 검증이 필수인데 수행하지 못했으면 전체 작업을 VERIFIED로 바꾸지 않는다.

## 15. 이번 조사 근거

- 구조·패키지: `frontend/package.json`, `frontend/README.md`, `web/package.json`, `backend/pom.xml`, `ai/requirements.txt`.
- 공유 계약: `frontend/App.js`, `frontend/utils/sessionClient.js`, `web/src/api/session.js`, `AiReportService.java`, `ai/app.py`.
- 테스트: `frontend/scripts/session-client-test.cjs`, `report-upload-test.cjs`, `ReleaseAuthIntegrationTest.java`, `ai/test_report_export.py` 등 일부 내용 확인 및 전체 파일 목록 집계.
- 환경: `docs/development/LOCAL_RELEASE_RUN.md`, `backend/scripts/start-release-local.ps1`, `application-release-local.properties`, `web/vite.config.js`, `docker-compose.release-local.yml`.
- 배포: `.github/workflows/deploy.yml`, `backend/Dockerfile`, 루트 Dockerfile.
- 시나리오·현장 한계: `docs/release/APP_RELEASE_VALIDATION_PLAN.md`, `docs/features/KNMAP_MIGRATION_2026-10-17.md`.
- 보안·운영 맥락: `docs/security/SECURITY_AUDIT_2026-10-18.md`, `.gitignore`, `ai/INTEGRATION.md`, `infra/README.md`.
