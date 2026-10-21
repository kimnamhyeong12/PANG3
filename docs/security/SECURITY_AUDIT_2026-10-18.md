# PANG3 출시 전 보안 점검

점검일: 2026-10-18, 한국 시간. 대상: 현재 로컬 체크아웃의 Java API, Expo 앱, 웹, Python 보고서 엔진, Docker 및 배포 워크플로.

## Claude 실행 지시 — 여기부터 읽고 작업

너는 이 프로젝트의 서버 배포 담당 에이전트다. 사용자가 이 MD를 읽고 실행하라고 요청하면, 설명이나 계획 제시만으로 끝내지 말고 아래 범위의 실제 작업과 검증을 수행한다. 이미 연결되어 있고 사용이 허용된 서버 접속 도구·SSH/SSM·배포 자격 증명을 사용한다. 작업 환경 자체의 권한·승인 규칙은 준수한다.

**이번 실행 목표:** `backend/sql/security_hardening_2026_10_18.sql`을 올바른 DB에 적용하고, 이 보안 수정이 포함된 백엔드의 배포 및 로그인 동작을 검증한다. 현재 로컬 코드에 구현된 항목은 **2·3·4·7·8·9번**이다. DB 열 추가가 필요한 것은 **7번**이다. 아래 본문의 ‘남은 작업’은 참고 자료이며 **1·5·6·10·11·12번을 이번 실행에서 자동 수정하지 않는다.** 특히 HTTP 주소, xlsx 패키지, 키, 방화벽, CI 정책은 그대로 둔다. 보고서 일일 생성량·다운로드 횟수 제한도 추가하지 않는다.

### 실행 순서와 판단 기준

1. **환경을 스스로 확인한다.** 현재 체크아웃의 `git status`, 브랜치·커밋, SQL 파일, Compose 및 배포 workflow를 읽는다. 연결된 서버의 실제 Compose 프로젝트·백엔드 이미지·DB 접속 대상도 읽기 전용으로 확인한다. 후보 정보는 EC2 프로젝트 `/home/ubuntu/PANG3`, 컨테이너 `sahagu-api`/`sahagu-db`, DB `sahagu_fieldwork`이나, 이는 저장소의 정보이며 실제 접속 대상을 보증하지 않는다. 앱의 공개 IP만 보고 서버를 선택하지 않는다.
2. **배포 입력을 확정한다.** 현재 작업에 미커밋 파일이 있으면 그것도 확인한다. 아래 보안 소스·SQL이 서버/이미지에 포함되었는지 검증하며, 원격 main이나 `latest` 이미지에 이미 들어 있다고 가정하지 않는다. 기존에 허용된 전송·빌드·배포 절차로 코드가 포함된 이미지를 준비하고 이미지 ID/digest 및 대응 소스 버전을 기록한다. 서버의 로컬 변경을 `reset --hard`로 덮어쓰거나 관련 없는 변경을 배포에 섞지 않는다. Git 반영이 필요한 기존 절차라면 이번 변경 집합을 확인하고, DB 선적용 순서를 지키며 그 환경의 승인 규칙에 따른다. 새 이미지와 직전 복구 이미지가 준비되기 전에는 API를 중단하지 않는다.
3. **아래 ‘서버 담당자: DB 변경 스크립트 적용 방법’의 1~6단계를 실행한다.** 스테이징에서 먼저 검증하고, 운영은 대상 확인 → API 쓰기 중단 → 백업 → SQL → 스키마 검증 → 해당 백엔드 배포 순서로 진행한다. SQL에 들어 있는 `BEGIN`/`COMMIT`과 `ON_ERROR_STOP=1`을 유지한다. 자동 main 배포가 DB보다 앞서 실행되지 않게 기존 배포 과정과 순서를 맞추되, 이번 범위를 벗어난 CI 개편은 하지 않는다.
4. **중간에 자동으로 판정한다.** SQL 파일이 아직 없으면 아래 내장 원문을 임시 디렉터리에 복원해 사용한다. 원문 해시 불일치, 실제 백엔드 DB와 대상이 다름, 인증 테이블 없음, 백업 실패, SQL 비정상 종료, 아래 검증 SQL 실패는 다음 단계로 진행할 수 없는 조건이다. 기존 열/인덱스가 모두 정확하면 재적용 없이 스키마 완료로 기록해도 된다. 일부만 있는 경우에는 올바른 기존 정의를 확인한 후 idempotent SQL을 적용한다. 잘못된 정의를 임의 DROP/타입 변경으로 고치지 않는다.
5. **테스트 계정으로 검증한다.** 신규 로그인, 배포 전 세션의 refresh, 새 refresh token으로 교체, 60초 이내 같은 이전 토큰 재시도, 만료/로그아웃 후 거부, 타인의 세션 삭제 거부를 확인한다. 60초 초과 재사용으로 세션이 폐기되는 시험은 전용 테스트 계정 세션에서만 한다. 실제 사용자 세션·비밀번호를 대신 사용하거나 전체 세션을 강제 폐기하지 않는다. 토큰과 비밀번호는 출력/파일 로그에 남기지 않는다.
6. **같은 MD 끝의 ‘Claude 실행 결과’ 표를 갱신한다.** 명령을 제안했거나 파일을 복사한 것만으로 적용 완료라고 쓰지 않는다. 실제 종료 코드·검증 결과를 근거로 DB 적용/배포/기능 검증을 각각 구분하고, 남은 1·5·6·10·11·12번의 미처리 상태를 보존한다.

### 필요한 입력이 없는 경우

기존 환경에서 알아낼 수 있는 경로·컨테이너·DB 이름을 사용자에게 반복해서 묻지 않는다. 서버 접속 권한 자체가 없거나, 후보 서버가 여러 개라 의도한 대상을 확인할 수 없거나, 검증된 배포 이미지/스테이징/테스트 계정을 마련할 수 없다면 **읽기 전용으로 가능한 확인까지 마친 뒤 부족한 정보만 한 번에 요청한다.** 접속 성공, 백업 성공, DB 변경 또는 배포를 추측으로 기록하지 않는다. 이 문서 작성 시점에는 실행 가능한 서버 접속 세션이 이 작업에 제공되지 않았으며, 작성자는 서버 DB를 변경하지 않았다.

### 배포 입력에 포함되어야 하는 핵심 파일

- DB: `backend/sql/security_hardening_2026_10_18.sql`
- 2번: `config/SecurityConfig.java`
- 3번: `service/ReportGenerationCoordinator.java`, `service/AiReportService.java`, `service/TaskProgressService.java`, `controller/TaskProgressController.java`
- 4번: `service/RouteRequestGuard.java`, `service/ProviderQuotaInterceptor.java` 및 경로 관련 controller/service 변경
- 7번: `entity/AuthSession.java`, `repository/AuthSessionRepository.java`, `service/AuthSessionService.java`, `controller/AuthController.java`
- 8번: `security/RequestBudget.java`, `security/AuthRateLimitFilter.java`, `security/AccountRateLimitFilter.java`, `service/AccountEmailService.java`
- 9번: `service/FileStorageService.java`, `config/UploadSecurityConfig.java`, `config/FieldworkProperties.java`

위 Java 경로는 모두 `backend/src/main/java/com/fieldwork/` 기준이다. 일부 파일만 옮겨 호환되지 않는 서버를 만들지 말고, 이 작업의 변경 집합과 테스트를 함께 대조한다. 수정 후 로컬 검증 기록은 아래 ‘이번 수정 후 검증’에 있다.

## 판단

**이번 수정: 2·3·4·7·8·9번의 코드를 보강했다. 운영 서버에 배포한 것은 아니다.** 아래 문제 설명과 근거 줄 번호는 최초 점검 당시를 기준으로 보존했고, 각 문제 바로 아래의 ‘처리 결과’에 현재 구현과 검증 내용을 적었다. 남은 항목은 **1·5·6·10·11·12번**이다. 5번은 사용자 요청에 따라 수정하지 않았다.

현재 상태로 공개 출시를 승인하는 보고서는 아니다. HTTPS와 실제 AWS 접근 제한 등 미처리·미확인 작업이 남아 있다. 요청 횟수·동시 실행·캐시는 현재의 **백엔드 단일 인스턴스 기준**이며 여러 서버로 확장하기 전 공유 제한기와 작업 큐가 필요하다.

이 문서는 코드 검토 결과다. 실제 침해 흔적을 발견했다는 뜻이 아니며, 모든 취약점을 찾았다는 보증도 아니다. 운영 서버에 공격 요청, 부하 테스트, 포트 스캔을 실행하지 않았다. 실제 배포 버전·AWS 보안그룹·프록시·공급자 콘솔은 확인하지 못했다. 코드에서 확인되는 문제와 배포 조건에 따라 달라지는 위험을 구분했다.

우선순위 P1은 출시 전 해결, P2는 출시 전 보강 또는 제한된 초기 출시 전에 명시적으로 판단할 항목이다. CVSS 점수를 계산한 결과는 아니다.

## 1. P1 — 운영 앱이 HTTP API에 로그인 정보와 토큰을 전송

- 상태: **운영 빌드 설정에서 확인**. 실제 배포 APK의 설정은 미확인.
- 근거: `frontend/eas.json:41` production API 주소가 외부 IP의 `http://...:8080`. `frontend/app.json:50`은 `usesCleartextTraffic: true`. `frontend/utils/sessionClient.js`는 해당 주소로 비밀번호·refresh token을 보내고 API 요청에 access token을 붙인다.
- 가능한 피해: 네트워크를 관찰·변조할 수 있는 공격자가 계정 정보, 로그인 토큰, 위치, 현장 사진을 가로챌 수 있다. HTTP로 처음 보낸 비밀번호와 토큰은 이후 HTTPS 리다이렉트만으로 보호되지 않는다.
- 조치: 유효한 인증서의 HTTPS 도메인을 마련하고 production URL을 교체한다. release 빌드에서 HTTP URL을 빌드 오류로 거부하고 cleartext를 끈다. 디버그 예외는 개발 빌드에 한정한다. 이미 HTTP로 사용한 계정의 세션 폐기와 비밀번호 변경 필요성을 판단한다.
- 완료 기준: 실제 release APK의 로그인·refresh·사진 업로드·다운로드가 HTTPS만 사용하며 HTTP 접속이 거부된다.

**처리 결과 — 미처리, 개발 중 보류.** 개발용 HTTP와 현재 앱 주소는 변경하지 않았다. 출시 전 서버 담당자는 HTTPS 도메인·인증서를 준비하고, 앱 담당자는 production 주소를 HTTPS로 교체하고 release에서 cleartext 및 HTTP 주소 빌드를 차단해야 한다. 실제 개인정보 대신 테스트 데이터만 사용한다.

## 2. P1 — 일반 가입자가 공용 데이터 관리 작업 실행 가능

- 상태: **코드 경로 확인**, 운영 서버에서는 실행하지 않음.
- 근거: `backend/src/main/java/com/fieldwork/config/SecurityConfig.java:39`는 API에 로그인만 요구한다. `BearerAuthenticationFilter.java:22`는 별도 역할 권한을 부여하지 않는다. `AedController.java:26,70`, `BusStopController.java:24,44`의 import 및 행정구역 일괄 갱신에 관리자 검사가 없다. `AedService.java:128`은 기존 AED 데이터를 전체 삭제한 뒤 재적재한다.
- 가능한 피해: 무료 가입 계정으로 전체 사용자에게 영향을 주는 데이터 재적재·공간 연산을 반복 실행해 DB 부하, 잠금, 데이터 초기화를 유발할 수 있다. 로그인 화면에서 버튼을 숨기는 것으로 해결되지 않는다.
- 조치: 운영에서 관리 HTTP 경로를 막거나 제거하고 별도의 관리 작업으로 이전한다. 필요하다면 서버가 검증하는 관리자 권한을 구현한다. 그룹의 팀장 역할을 전역 관리자로 취급하면 안 된다.
- 완료 기준: 네 경로 모두 비로그인 401, 일반 사용자·팀장 403. 허용된 관리 주체만 실행 가능하고 변경 이력이 남는다.

**처리 결과 — 코드 수정 완료.** `SecurityConfig`에서 위 네 관리 POST 경로를 `denyAll()`로 차단했다. 일반 사용자·팀장·기타 앱 계정 모두 HTTP로 실행할 수 없다. 관리 기능을 사용해야 한다면 앱 API로 다시 열지 말고, 별도 관리 명령/작업에서 서비스 메서드를 실행하는 운영 절차를 마련해야 한다. 현재 별도 관리 CLI를 새로 만든 것은 아니다.

검증: `ReleaseAuthIntegrationTest.appAccountsCannotRunGlobalMaintenance`에서 네 경로 각각 비로그인 401, 로그인 계정 403을 확인했다.

## 3. P1 — 보고서 생성 반복 요청으로 프로세스·DB·디스크 고갈 가능

- 상태: **제한 부재를 코드에서 확인**, 실제 최대 부하는 미측정.
- 근거: `TaskProgressController.java`의 `/reports/prepare`, `TaskProgressService.java:271`의 통합 보고서에 건수·사용자별 횟수·동시 실행 제한이 없다. `AiReportService.java:130,140`은 요청마다 Python 프로세스를 시작하고 최대 120초, 최대 3회 시도한다. 단일 보고서는 `TaskProgressService.java:238`의 트랜잭션·행 잠금 안에서 생성한다. 통합 보고서는 매번 새 파일을 생성한다.
- 가능한 피해: 자신의 정상 보고서를 반복 요청하는 것만으로 서버 메모리, 요청 스레드, DB 연결·잠금, 임시 파일·디스크를 소모할 수 있다. Gemini 분석은 `ai/app.py:34`에서 꺼져 있으므로 현재 문제를 Gemini 비용 폭탄으로 단정하지 않는다.
- 조치: 사용자·조직별 생성 한도, 최대 묶음 건수·총 사진량, 전역 프로세스 동시 실행 제한, 제한된 큐와 429 응답을 둔다. 같은 입력의 결과를 재사용하고 긴 생성 작업은 DB 잠금 밖에서 수행한다. Python 출력은 실행 중 소비하고 크기도 제한한다.
- 완료 기준: 정해진 한도를 넘으면 Python 실행 전에 거부하며 정상 사용자의 요청과 DB 작업이 계속된다. 스테이징에서 제한된 동시성 테스트로 확인한다.

**처리 결과 — 합의한 방식으로 코드 수정 완료. 일일 생성량과 다운로드 횟수 제한은 추가하지 않았다.**

- `ReportGenerationCoordinator`가 서버 전체 생성 작업을 기본 **동시 2개 + 대기 8개**로 제한한다. 설정은 `fieldwork.ai.max-concurrent`, `fieldwork.ai.queue-size`이며 운영 서버 성능에 맞춰 조정할 수 있다.
- 한 사용자가 서로 다른 새 보고서를 동시에 생성하면 429를 반환한다. 같은 내용의 요청은 기존 생성 작업을 함께 기다리며, 완료된 파일이 있으면 재사용한다. 대기 요청 스레드도 최대 32개이고 요청 대기는 180초까지다. 시간 초과 후에도 이미 접수된 작업은 완료될 수 있으므로 다시 요청하면 그 작업/결과를 재사용한다.
- 내용 전체를 정렬된 JSON으로 해시해 단일/통합 보고서의 중복을 합친다. 단일 보고서의 기존 파일은 DB 경로로 재사용하고, 통합 등의 생성 결과 캐시는 파일 존재 확인 + 24시간 + 최대 256개로 관리한다. 캐시 만료·퇴출·서버 재시작 뒤에는 통합 보고서 재생성이 가능하다.
- Python 실행은 DB 트랜잭션 밖에서 수행한다. 완료 후 짧은 DB 잠금 안에서 권한과 입력 내용을 다시 확인해, 생성 도중 수정된 오래된 파일을 최신 결과로 저장하지 않는다(409).
- Python 자동 3회 재시도를 1회 실행으로 변경했다. 실행 중 출력을 읽고 1MiB로 제한하며 120초 초과 시 종료한다. 출력 저장소 여유 공간 512MiB 미만에서는 새 생성을 시작하지 않는다.
- 한 번의 통합은 보고서 50개·사진 150장까지다. 이는 일일 한도가 아닌 한 작업의 크기 제한이다. 통합 다운로드 링크는 중복 재사용하고 메타데이터 2,048개를 넘으면 가장 오래된 링크부터 퇴출한다. 이 경우 재준비 요청이 필요할 수 있으며 생성량을 차감하지 않는다.

검증: `ReportGenerationCoordinatorTest`는 동시 동일 요청 1회 실행, 재다운로드용 결과 재사용, 파일 삭제/내용 변경 후 재생성, 사용자별 작업 제한, 대기 및 실패 후 재시도를 확인했다. `ReportPreparationTest`는 생성 중 DB 트랜잭션 없음, 기존 파일 재사용, 생성 중 수정 시 409와 이전 결과 미저장을 확인했다. 단순 재다운로드 경로에는 생성 횟수 제한을 넣지 않았다.

## 4. P1 — 경로 API를 통한 외부 서비스 쿼터 소모

- 상태: **코드에서 확인**, 공급자 측 한도·과금 설정은 미확인.
- 근거: `RouteController.java:27,46`, `RouteService.java:55`의 optimize/segment에 사용자별 호출 한도와 optimize 방문지 상한이 없다. 차량 경로는 서버 REST 키로 외부 API를 호출한다. `VisitOrderService.java`의 order는 500개 제한·작업자 4개·큐 128개·캐시 256개가 있으나 사용자별 호출 한도는 없다. 이 기존 제한은 인정하며 모든 경로가 무제한인 것으로 보지 않는다.
- 가능한 피해: 임의 좌표 요청을 반복해 공용 API 쿼터를 소모하고 외부 응답 대기로 서버를 점유한다. 유료 설정이라면 비용 증가 가능성도 있다.
- 조치: 사용자·조직·서비스 전체 한도, optimize 방문지 상한, 서버 측 입력 검증, 좌표 기반 캐시, 공급자 사용량 경고와 비용 상한을 둔다.
- 완료 기준: 한도 초과 요청이 외부 API 호출 전에 거부되고 한 계정이 전체 쿼터를 독점할 수 없다.

**처리 결과 — 백엔드 코드 수정 완료.** `RouteRequestGuard`를 optimize/segment/order에 공통 적용했다. 같은 사용자·조건의 결과는 30초 재사용하고 진행 중 중복 요청을 합친다. 캐시는 최대 128개, 진행 중 서로 다른 요청은 전체 4개, 대기 요청은 32개다. 새 계산 요청은 사용자당 분당 60회, 전체 분당 300회이며 초과 시 429다. 위치 마커 표시·현재 위치 갱신 자체는 이 한도의 대상이 아니다.

optimize 방문지는 최대 50개, order는 기존 500개 상한을 유지하며 좌표·이동 수단·입력 크기를 서버에서 검증한다. 캐시 키에는 사용자와 입력 및 도보 키의 해시를 포함하고 원문 키를 저장하지 않는다. optimize/segment의 연속 외부 호출에는 45초 시간 예산을 적용하고, 개별 연결/읽기 제한도 유지한다.

`ProviderQuotaInterceptor`가 차량·도보·방문순서 계산의 **실제 외부 호출**도 합계 분당 300회로 제한한다. 방문순서 행렬이나 경로 비교 한 요청이 외부 API를 여러 번 호출하는 경우도 이 예산에 포함된다. 이 값들은 초기 보수적 정책이며 실사용량에 따라 코드의 제한값을 조정해야 한다.

검증: `RouteRequestGuardTest`에서 동일 조건의 캐시 재사용, 사용자 한도 초과, 다른 계정의 정상 처리, 잘못된 좌표·방문지 초과 요청이 외부 작업 전에 거부됨을 확인했다. 공급자 콘솔의 실제 요금·일일 쿼터·알림은 별도 설정해야 하며 이번에 변경하지 않았다.

## 5. P1 — 알려진 취약 버전의 엑셀 파서가 실제 파일 가져오기에 사용됨

- 상태: **lockfile 버전 및 호출 경로 확인**, 악성 파일 재현은 수행하지 않음.
- 근거: `frontend/package-lock.json:11632`의 `xlsx`는 0.18.5. `frontend/components/BulkUploadModal.jsx:274,281`은 사용자가 선택한 파일 전체를 읽어 `XLSX.read`로 파싱한다. 파싱 전 파일 크기 제한은 보이지 않는다. 미리보기 10행 및 서버 업로드 청크 제한은 파서 입력 크기 제한이 아니다.
- 공식 공지: [CVE-2023-30533](https://cdn.sheetjs.com/advisories/CVE-2023-30533)는 조작된 파일을 읽을 때 prototype pollution, [CVE-2024-22363](https://cdn.sheetjs.com/advisories/CVE-2024-22363)는 정규식 처리로 인한 서비스 거부. 현재 버전은 두 영향 범위에 포함된다.
- 가능한 피해: 악성 엑셀 파일을 가져온 단말의 앱 정지 및 JS 객체 변조. 이 사실만으로 계정 탈취·서버 코드 실행을 입증한 것은 아니다.
- 조치: 공식 배포 경로의 수정 버전 또는 유지 관리되는 대체 파서로 전환한다. 두 공지 기준 수정 하한은 0.20.2지만 선택 시점의 추가 공지도 확인한다. npm의 기존 `xlsx`를 단순 업데이트하는 것만으로 해결된다고 가정하지 않는다. 파일 크기·시트·행·열 상한 및 파싱 시간·메모리 제한도 필요하다.

**처리 결과 — 사용자 요청으로 미처리.** `xlsx`, 앱의 엑셀 처리 코드 및 JS 패키지 파일은 변경하지 않았다. 나중에 공식 수정 배포 또는 유지 관리되는 대체 파서로 교체하고, 파싱 전 파일 용량·시트·행·열 상한을 적용한 뒤 정상/악성 입력 및 내보내기를 검증해야 한다. 현재 위험은 남아 있다.

## 6. P1 확인 필요 — DB와 API 포트가 호스트 전체 인터페이스에 게시됨

- 상태: **Compose 설정 확인**, 인터넷 노출 여부는 미확인.
- 근거: `docker-compose.yml:14,27`의 `5432:5432`, `8080:8080`. loopback 지정이 없다.
- 가능한 피해: 방화벽이 허용하면 DB에 직접 접근하거나 HTTPS 프록시의 제한을 우회하여 API에 접속할 수 있다. DB 포트가 열렸다는 사실만으로 비밀번호 없이 접속 가능하다고 보지는 않는다.
- 조치: DB는 Docker 내부망에만 둔다. 같은 호스트의 프록시를 쓴다면 API는 loopback에 바인딩하고, 로드밸런서를 쓴다면 해당 보안그룹만 허용한다. 인터넷에는 필요한 HTTPS 진입점만 연다.
- 완료 기준: 보안그룹·호스트 방화벽·Docker 바인딩을 대조하고 허가된 외부 점검 위치에서 5432와 API 직접 접속이 차단됨을 확인한다.

**처리 결과 — 미처리, 서버 담당 작업.** Compose와 AWS는 이번 범위에서 변경하지 않았다. 서버 담당자는 DB 포트 공개를 제거하고 API의 직접 접속을 프록시/로드밸런서로 한정하며, AWS 보안그룹·서버 방화벽·Docker 바인딩을 함께 점검해야 한다. 실제 외부 노출 여부는 여전히 미확인이다.

## 7. P2 — 탈취된 refresh token을 반복 재사용해 세션 유지 가능

- 상태: **설계 확인**, 토큰 추측 취약점은 아님.
- 근거: `AuthSessionService.java:46–58`은 refresh secret을 바꾸지 않고 매번 만료일을 현재부터 90일 연장한다. 절대 세션 수명·재사용 탐지가 없다. 토큰은 충분한 난수로 만들고 DB에는 해시로 저장한다.
- 가능한 피해: HTTP 통신 등 다른 경로로 refresh token을 얻은 공격자가 정상 사용자와 함께 장기간 세션을 유지할 수 있다. 로그아웃·전체 세션 폐기로는 해제 가능하다.
- 조치: 절대 만료와 기기별 세션 해제 기능을 추가한다. 토큰 회전을 도입한다면 동시 요청·응답 유실을 처리할 유예 또는 토큰 계열 설계까지 구현한다.

**처리 결과 — 코드 수정 완료, 배포 전 DB 마이그레이션 필요.**

- 로그인 시 정한 만료일(기본 90일)을 refresh 때 연장하지 않도록 바꿨다. access 만료도 이 절대 만료일을 넘지 않는다. 기존 세션은 배포 시 이미 저장된 만료일까지 유지된다.
- refresh token을 새 난수로 교체한다. 응답 유실·동시 갱신에는 직전 토큰을 **60초 동안** 허용하고 같은 새 토큰을 돌려준다. 이 시간 동안 현재 토큰을 다시 쓰는 경우 추가 회전은 하지 않는다.
- 재시도용 새 토큰은 직전 원문 토큰에서 도출한 키로 AES-GCM 암호화해 저장하며 평문은 저장하지 않는다. 직전 토큰을 가진 호출자가 유예 시간을 넘겨 재사용하면 세션 전체를 폐기하고, 더 오래된/알 수 없는 토큰은 거부한다. 전체 과거 토큰 계열을 무기한 보존하는 탐지 방식은 아니다.
- 인증된 본인의 세션 목록 `GET /api/auth/sessions`와 개별 해제 `DELETE /api/auth/sessions/{sessionId}`를 추가했다. 타인의 세션은 해제할 수 없다. 별도 기기 목록 화면을 추가한 것은 아니며 API를 제공한다.
- 웹 쿠키 수명도 실제 남은 절대 만료일에 맞춘다. 비밀번호 변경/재설정·로그아웃의 기존 세션 폐기는 유지했다.

검증: 인증 통합 테스트에서 토큰 교체, 유예 재시도의 동일 토큰 반환, 만료일 비연장, 유예 초과 재사용 후 DB에 폐기 상태 유지, access 무효화, 세션 목록 및 본인만 해제를 확인했다. 앱의 기존 세션 클라이언트 회귀 검사도 통과했다. **서버 배포 전 `backend/sql/security_hardening_2026_10_18.sql`을 백업 후 적용**해야 한다.

## 8. P2 — 인증 요청 제한이 IP·일부 경로에만 적용됨

- 근거: `AuthRateLimitFilter.java:16–18`은 선택된 POST 경로에 원격 IP+경로 기준 5분 30회만 적용한다. refresh, 아이디 중복 조회, `/api/users/{id}/account/verify` 등은 이 제한 대상이 아니다. 다중 인스턴스의 카운터 공유도 없다.
- 가능한 피해: 여러 IP를 쓰는 비밀번호 추측, 계정 대량 생성·메일 반복 발송, 인증된 토큰을 가진 공격자의 현재 비밀번호 재확인 무제한 시도. 프록시 뒤에서는 반대로 모든 사용자가 같은 IP로 묶일 가능성도 있다.
- 조치: IP+계정+세션별 제한, 메일 수신자별 재발송 대기, 분산 환경의 공유 카운터를 둔다. 신뢰할 프록시 범위를 지정하고 전달 헤더를 무조건 신뢰하지 않는다. 계정별 영구 잠금은 공격자가 피해자를 잠그는 데 악용하지 못하게 설계한다.

**처리 결과 — 단일 서버 기준 코드 수정 완료.** 기존 인증 POST의 IP 기준 5분 30회 제한을 유지하면서 로그인·비밀번호 찾기에 계정 기준 제한을 추가했다. refresh/logout 및 아이디 중복 조회는 IP 기준 5분 120회, refresh는 제출 토큰(웹 쿠키 포함) 기준 분당 30회다. 인증 본문은 16KiB까지만 읽고 재사용 가능한 요청으로 전달한다.

현재 비밀번호 재확인·계정 수정·이메일 변경·탈퇴는 **인증된 실제 userId** 기준 합계 5분 30회다. 이메일은 수신자+용도 기준 60초 재발송 대기와 계정당 시간당 5회 제한을 실제 메일 전송 전에 적용한다. 카운터는 크기 상한과 만료가 있으며 거부 요청 때문에 만료가 계속 늘어나지 않는다. 클라이언트가 임의로 준 `X-Forwarded-For`는 신뢰하지 않는다.

검증: `AuthRateLimitFilterTest`, `RequestBudgetTest` 및 인증 통합 테스트에서 IP를 바꿔도 계정 한도 유지, 본문 보존, 큰 인증 본문 거부, 메일 중복 전송 방지를 확인했다. 여러 서버로 확장할 때 Redis/게이트웨이의 공유 제한기로 옮기고 신뢰할 프록시 전달 IP 정책을 함께 적용해야 한다. 실제 프록시 뒤 정상 사용자 한도는 배포 환경에서 검증해야 한다.

## 9. P2 — 사진 확장자만 검사하며 저장량 제한이 부족

- 근거: `FileStorageService.java:33–36,73`은 파일명 확장자를 검사한 뒤 원본 바이트를 저장한다. 확장자가 없는 파일은 jpg로 취급한다. 이미지 포맷·픽셀 수 검증과 사용자별 누적 저장량 제한은 보이지 않는다. 로컬 release 설정의 15MB/60MB를 운영 설정으로 간주할 수 없다.
- 가능한 피해: 위장 파일 저장, 큰 이미지 처리에 따른 자원 소모, 반복 업로드에 따른 저장공간 고갈. 확장자 허용만으로 서버 코드 실행이 가능하다는 주장은 아니다. 보고서의 이미지 재인코딩과 원본 업로드 검증은 별개다.
- 조치: 운영의 파일·요청 크기 상한을 명시하고 실제 이미지 디코딩·허용 포맷·픽셀 상한을 검사한다. 원본 메타데이터 보존 여부를 정하고 사용자·그룹별 저장 한도를 둔다.

**처리 결과 — 코드 수정 완료.** 이미지 헤더의 실제 포맷과 크기를 확인하고 픽셀을 디코딩한 뒤 JPEG로 다시 저장한다. EXIF 방향을 반영하고 원본 메타데이터는 복사하지 않는다. 신규 업로드는 검증 가능한 **JPG/PNG**로 한정했으며 직접 WEBP 업로드는 JPG/PNG 변환 안내로 거부한다. 기존 저장된 WEBP의 조회·보고서 파일 참조를 일괄 삭제하거나 변경한 것은 아니다.

기본 상한은 파일 15MiB, multipart 요청 60MiB, 이미지 2,400만 픽셀, 등록 사진 12장이다. 파일을 전부 디코딩하기 전에 크기·해상도를 거부한다. 동시 디코딩과 저장량 검사/쓰기는 직렬화했다. 운영에서 더 작은 `spring.servlet.multipart.max-file-size`/`max-request-size`를 지정하면 더 작은 값을 존중한다.

원본 업로드 저장 한도는 업무별 256MiB, 업로더별 1GiB, 전체 5GiB이며 최소 디스크 여유 512MiB를 유지한다. 업무 파일 1,000개·전체 20,000개 상한도 둔다. 용량 설정은 `fieldwork.upload.max-file-bytes`, `max-pixels`, `max-task-bytes`, `max-user-bytes`, `max-total-bytes`로 조정할 수 있다. 업로더는 인증 주체에서 결정하고 저장 파일 이름에 귀속을 기록한다. 기존 파일도 전체/업무 한도에는 포함되지만 배포 전 파일은 업로더 귀속을 복원할 정보가 없어 개인 한도에 소급 합산하지 않는다.

검증: `FileIsolationTest`에서 다른 업무 파일 접근 차단, 가짜 사진·파일 크기·픽셀 상한 거부, 업무 및 여러 업무에 걸친 업로더 용량 제한, 재인코딩 후 메타데이터 제거를 확인했다. `UploadSecurityConfigTest`는 운영자가 더 엄격한 multipart 한도를 지정할 수 있고 상한을 느슨하게 우회할 수 없음을 검증한다.

## 10. P2 — 클라이언트에 포함된 REST 키의 악용 가능성

- 근거: `frontend/eas.json`의 `EXPO_PUBLIC_KAKAO_REST_API_KEY`, `frontend/utils/placeSearch.js:90` 및 여러 화면의 직접 REST 호출. 공개 환경변수는 APK/JS 번들에서 읽을 수 있다.
- 가능한 피해: 제한이 부족한 키의 쿼터 소모. 지도 JS/native 키나 Firebase 설정의 존재만으로 서버 비밀 유출로 단정하지 않는다. AWS·SMTP·DB 비밀과도 구분한다.
- 조치: 서버용 REST 키는 백엔드에서만 사용하고 클라이언트 기능은 공급자의 지원되는 인증·앱 제한 방식을 적용한다. 공식 콘솔에서 키별 허용 앱·도메인·IP·권한·쿼터를 검증하고 서버/앱 키를 분리한다. 환경변수로 옮기는 것만으로 번들 내 비밀이 되지는 않는다.

**처리 결과 — 미처리.** 앱에 포함된 키 및 직접 REST 호출은 변경하지 않았다. 앱·백엔드 담당자가 서버 비밀 키의 외부 호출을 백엔드로 옮기고 서버/앱 키를 분리해야 한다. 공급자 콘솔 담당자는 지원되는 앱·도메인·IP 제한과 권한·쿼터를 적용하고 실제 노출된 서버 비밀이 있으면 교체해야 한다. 환경변수로 옮기기만 해서는 앱 번들에서 숨겨지지 않는다.

## 11. P2 — 위치·업무 입력 전체가 서버 로그에 남음

- 근거: `RouteController.java:30`이 요청 body 전체를 출력한다. 현재 위치와 방문지 정보가 로그 수집·백업 경로로 복제될 수 있다. `TaskProgressService.java:327`은 내부 보고서 절대 경로도 응답한다.
- 조치: 요청 전문 로깅을 없애고 요청 ID·상태·처리시간 위주로 기록한다. 내부 경로는 응답에서 제거하고 로그 접근권한·보존기간·백업을 정한다. 로그 유출이 이미 발생했다는 증거는 없다.

**처리 결과 — 미처리.** 경로 요청 전문 출력과 응답 내부 파일 경로는 이번 범위에서 일괄 정리하지 않았다. 백엔드 담당자는 요청 전문 출력을 없애고 허용된 로그 필드만 남겨야 한다. 프런트에서 사용 여부를 대조한 뒤 응답 절대 경로를 제거하고, 서버 담당자는 로그 저장·백업 접근권한과 보존기간을 적용해야 한다.

## 12. P2 — 배포 공급망과 런타임 격리 보강 필요

- 근거: `.github/workflows/deploy.yml:64`의 SSH action은 변경 가능한 `@master`를 사용하며 배포 비밀에 접근한다. `backend/Dockerfile:11`은 테스트를 건너뛰고 현재 workflow에도 테스트 단계가 없다. 런타임 Dockerfile에 비특권 `USER`가 없다. Python 의존성은 `ai/requirements.txt`에서 하한만 정해 재빌드 결과가 달라질 수 있다.
- 가능한 피해: 의존 action·패키지가 바뀌거나 침해되면 배포 경로로 위험이 확산된다. 컨테이너 취약점이 생겼을 때 root 실행은 피해 범위를 키운다. 현재 침해의 증거는 아니다.
- 조치: action을 검증한 commit SHA로 고정하고 최소 권한 및 AWS OIDC를 검토한다. 보안 테스트를 배포 필수 단계로 만들고 이미지 SHA/digest로 배포한다. Python 버전·해시를 고정하고 이미지 취약점 검사를 둔다. Java/Python을 비특권 사용자로 실행하고 필요한 데이터 경로만 쓰기 허용한다.

**처리 결과 — 미처리.** CI workflow, Docker 실행 사용자 및 의존성 배포 정책은 변경하지 않았다. 배포 담당자는 action commit SHA 고정, 테스트 배포 차단, AWS OIDC/최소 권한, 이미지 digest 배포, 비특권 컨테이너 및 Python 버전·해시 고정과 이미지 검사를 적용해야 한다. 이번 로컬 테스트의 JVM agent 옵션은 테스트 실행 환경 설정이며 운영 배포 구성을 변경한 것이 아니다.

## 추가 보강·미확인 사항

- `frontend/components/KakaoMapWebView.js:3578`은 origin `*`, `mixedContentMode="always"`를 허용한다. 필요한 origin·탐색만 허용하고 혼합 콘텐츠를 차단한다. 외부 페이지에서 토큰을 탈취할 수 있는 주입 경로까지 확인한 것은 아니다.
- 보고서 초안은 `frontend/utils/reportDraft.js`에서 AsyncStorage와 document 디렉터리에, 다운로드는 `frontend/utils/auth.js`에서 cache에 저장된다. 로그아웃의 계정별 캐시 폐기, 초안 유효기간, OS 백업 제외 정책을 검증해야 한다. 이 저장 방식만으로 다른 앱이 읽을 수 있다고 단정하지 않는다.
- AWS 실제 IAM·SSM/KMS·S3 공개 접근 차단·DB 사용자 권한·IMDSv2·백업 암호화·복원 시험·감사로그·알림은 확인하지 않았다. 저장소의 IAM 예시는 운영 적용 증거가 아니다.
- Git 현재 추적 파일의 제한된 비밀 패턴 검색에서는 Firebase 설정 키 패턴이 나왔다. 이는 비밀 유출 확정이 아니다. Git 전체 이력, 원격 CI 로그, 과거 APK·이미지, SSM 실제 값은 검사하지 않았으므로 “비밀이 없다”고 판정하지 않는다.
- Python의 URL 다운로드 보조 함수가 존재하지만 현재 보고서 파이프라인에서 호출되지 않으며 Java 입력은 task 파일로 제한한다. 따라서 해당 함수만 보고 외부 공격 가능한 SSRF로 등록하지 않았다.
- 로컬 `application.yml`은 Git에서 제외되지만 로컬 Docker 빌드 시 `COPY backend/src`에 포함될 수 있다. 로컬 비밀 설정의 이미지 포함 여부를 확인하고 빌드 입력에서 제외한다. CI의 깨끗한 Git 체크아웃과 로컬 빌드는 다르다.

## 확인된 기존 방어

BCrypt 비밀번호 해시, 난수 토큰·DB 해시 보관, 15분 access token, native SecureStore, 웹 HttpOnly/Secure/SameSite 쿠키, 명시적 CORS origin, 요청 userId와 인증 주체 대조, 그룹 읽기/현재 담당자 수정 권한, task별 파일 realpath 검사, 재설정 링크 1회 사용과 비밀번호 변경 후 세션 폐기가 구현되어 있다.

이 방어가 존재한다는 사실과 모든 우회가 없다는 보증은 다르다. 다른 그룹 자료를 임의 ID만으로 읽을 수 있다고 확인한 것은 아니다.

## 최초 점검 당시 검증 기록

- Java 보안 테스트 실행: `mvn -o test -Dtest=ReleaseAuthIntegrationTest,FileIsolationTest,TaskTransferHistoryTest -Dsurefire.useFile=true`.
- 이번 실행의 `FileIsolationTest`: 1개 통과. 이후 `ReleaseAuthIntegrationTest`가 수분 동안 완료되지 않아 이번 Maven 실행을 중단했다. 인증 통합 테스트 및 뒤에 예약된 `TaskTransferHistoryTest`는 이번 실행에서 검증 완료로 계산하지 않는다. 원인은 확정하지 않았으며 과거 surefire 결과를 이번 실행 성공으로 사용하지 않는다.
- frontend/web `npm audit --omit=dev --json`: 기본 실행은 DNS ENOTFOUND로 실패. 외부 통신 재시도는 비공개 의존성 목록 전송을 이유로 자동 승인 검토가 거부했다. 사용자에게 전송 범위를 설명했고 사용자는 필요성을 질문했으며 전송 승인은 하지 않았다. 추가 외부 전송 검사는 보류했다.
- npm 자동 검사를 대신 수행한 것으로 간주하지 않고, 위 xlsx 두 건만 로컬 버전과 제작사 공개 공지를 대조했다. Java/Python 및 나머지 JS 의존성의 전체 CVE 검사는 완료되지 않았다.
- 최초 점검 당시에는 실제 서버를 변경하거나 취약점을 수정하지 않았다. 이후 사용자 요청으로 위 2·3·4·7·8·9번의 코드를 수정했으며, 실제 서버 배포는 수행하지 않았다.

## 이번 수정 후 검증

- **백엔드 JUnit 전체 59개 통과**, 실패·오류·건너뜀 0개. `mvn -o test -DforkCount=0 -Dsurefire.useFile=true`로 실행했다. 로컬 Windows 샌드박스에서 Mockito의 동적 attach가 막혀, 실행 프로세스의 `MAVEN_OPTS`에 이미 설치된 `byte-buddy-agent-1.17.8.jar`를 `-javaagent`로 미리 로드했다. 테스트를 삭제/무시하거나 운영 설정을 완화해 통과시킨 것은 아니다.
- 별도 assertion 실행: `TaskProgressContractTest`, `KakaoWalkingContractTest`, `KakaoRoadContractTest` 통과. 기존 보고서 수정·권한·사진 유지와 차량/도보 경로 계약을 확인했으며 실제 외부 API를 호출하는 `--live` 모드는 사용하지 않았다.
- 앱 세션 클라이언트: `node frontend/scripts/session-client-test.cjs` 통과. 로그인 복원, 동시 갱신, 외부 공급자 요청 분리, 403 처리, 오프라인 유지, 세션 폐기, 로그아웃 경합을 검증했다.
- `git diff --check` 확인. 외부 npm 자동 검사 승인은 보류 상태를 유지했고 새로운 의존성 외부 전송을 하지 않았다. 5번 패키지/lockfile은 변경하지 않았다.
- PostgreSQL 운영 마이그레이션 실행, 실제 배포 APK, 운영 서버 부하·프록시·공급자 콘솔 검증은 수행하지 않았다. 코드와 로컬 테스트 완료를 운영 검증 완료로 해석하면 안 된다.

## 서버 담당자: DB 변경 스크립트 적용 방법

**실행 담당은 운영 DB 접근 권한을 가진 서버 담당자다. 이 문서에 명령을 적었을 뿐, 실제 서버에는 실행하지 않았다.** 대상 파일은 `backend/sql/security_hardening_2026_10_18.sql`이다. 이 파일은 로그인 세션 테이블에 nullable 열 3개와 unique 인덱스 1개를 추가한다. 업무·사용자·사진 데이터를 삭제하거나 기존 세션을 일괄 폐기하지 않는다.

아래는 **Linux EC2의 Bash + 현재 저장소의 Docker Compose 구성**을 기준으로 한다. Windows PowerShell에서 그대로 실행하는 명령이 아니다. 저장소 기준 DB 컨테이너는 `sahagu-db`, DB는 `sahagu_fieldwork`, 사용자는 `sahagu_admin`, 서비스 이름은 `db`/`backend`다. **운영 실물과 다르면 그 환경에 맞춰 수정하고 실행**한다. RDS를 사용하는 경우에는 이 Docker 예제를 적용하지 말고, 해당 DB의 승인된 접속·스냅샷/백업 절차를 사용한다. 명령은 저장소 구성 및 PostgreSQL 16 공식 문서와 대조해 작성했으며 운영 실행은 검증하지 않았다. 로컬 Bash 구문 검사도 Windows 샌드박스의 MSYS 권한 오류로 실행하지 못했으므로 담당자가 스테이징에서 먼저 확인해야 한다.

### 1. 대상과 적용 순서 확인

스테이징에서 먼저 적용한다. 운영에서는 **검증된 SQL 확보 → 대상 확인 → API 쓰기 중단 → 백업 → SQL 적용 → 스키마 확인 → 새 백엔드 배포 → 로그인 확인** 순서다. `main` push 자동 배포가 활성화되어 있으면, 새 서버가 DB 변경보다 먼저 배포되지 않도록 배포 담당자와 순서를 맞춘다. Hibernate의 `ddl-auto=update`만 믿고 이 확인을 생략하지 않는다.

서버에서 현재 프로젝트의 `docker-compose.yml`이 있는 디렉터리로 이동한다. 아래 Bash 블록들은 같은 SSH 세션에서 순서대로 실행하며, 어느 단계든 실패하면 다음 단계로 진행하지 않는다.

```bash
set -euo pipefail
test -f docker-compose.yml

# 서버 체크아웃에 SQL이 아직 없으면 MD에 포함된 정확한 원문을 사용한다.
# 서버 저장소 안에 임의 파일을 만들어 배포의 clean-check를 깨뜨리지 않는다.
PANG3_SQL_FILE='backend/sql/security_hardening_2026_10_18.sql'
if [ ! -f "$PANG3_SQL_FILE" ]; then
    umask 077
    PANG3_SQL_DIR="$(mktemp -d /tmp/pang3-security.XXXXXXXX)"
    PANG3_SQL_FILE="${PANG3_SQL_DIR}/security_hardening_2026_10_18.sql"
    cat > "$PANG3_SQL_FILE" <<'PANG3_SQL'
-- Back up the database and apply before deploying the security changes.
BEGIN;
ALTER TABLE auth_sessions ADD COLUMN IF NOT EXISTS previous_refresh_hash varchar(64);
ALTER TABLE auth_sessions ADD COLUMN IF NOT EXISTS previous_refresh_until timestamptz;
ALTER TABLE auth_sessions ADD COLUMN IF NOT EXISTS refresh_retry_ciphertext varchar(256);
CREATE UNIQUE INDEX IF NOT EXISTS uk_auth_sessions_previous_refresh ON auth_sessions(previous_refresh_hash);
-- Existing sessions retain their already assigned expiry; it no longer slides on refresh.
COMMIT;
PANG3_SQL
fi
printf '%s  %s\n' '3311ee25616f02b56f6b01c04105b30af517d9146e19e6a431d76c75ccae10b3' "$PANG3_SQL_FILE" | sha256sum -c -
docker compose ps

docker exec -i sahagu-db sh -c 'exec psql -X -w -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' <<'SQL'
SELECT current_database(), current_user, current_schema();
SHOW search_path;
SELECT to_regclass('public.auth_sessions');
SQL
```

결과의 DB/사용자와 백엔드가 실제 사용하는 접속 대상을 대조한다. `public.auth_sessions`가 있어야 한다. 다른 스키마를 쓰거나 테이블이 없으면 멈추고 원래 인증 스키마 준비 여부와 SQL의 대상 스키마를 먼저 확인한다. DB 비밀번호·전체 환경변수·세션 원문/해시를 작업 기록에 출력하지 않는다. 예제는 컨테이너 내부 접속을 사용한다. 인증이 필요하면 담당자의 비밀 관리 방식 또는 권한 0600의 `.pgpass`를 사용하며 비밀번호를 명령 인자에 넣지 않는다.

내장 SQL은 현재 파일의 UTF-8/LF 원문과 SHA-256이 일치한다. 해시가 다르면 임의로 검사를 끄거나 다른 SQL로 적용하지 말고 차이를 확인한다. MD에서 SQL을 복원할 수 있다는 사실이 새 Java 백엔드 코드까지 서버에 존재한다는 뜻은 아니다. 이미지 준비도 별도로 완료해야 한다.

### 2. 쓰기 중단 후 백업

사용 중인 API가 잠시 중단되는 유지보수 작업으로 진행한다. 다른 백엔드 인스턴스나 DB에 쓰는 작업이 있으면 함께 중단한다. DB 컨테이너와 볼륨은 유지한다.

```bash
docker compose stop backend

umask 077
set -o noclobber
PANG3_BACKUP_DIR="${HOME}/pang3-db-backups"
mkdir -p "$PANG3_BACKUP_DIR"
chmod 700 "$PANG3_BACKUP_DIR"
PANG3_BACKUP_FILE="${PANG3_BACKUP_DIR}/before-security-$(date -u +%Y%m%dT%H%M%SZ).dump"

docker exec sahagu-db sh -c 'exec pg_dump -w -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom' > "${PANG3_BACKUP_FILE}.partial"
test -s "${PANG3_BACKUP_FILE}.partial"
docker exec -i sahagu-db pg_restore --list < "${PANG3_BACKUP_FILE}.partial" > "${PANG3_BACKUP_FILE}.list"
mv "${PANG3_BACKUP_FILE}.partial" "$PANG3_BACKUP_FILE"
```

`pg_dump`는 운영 DB의 일관된 논리 백업을 만든다. 백업을 저장소 밖, 제한된 권한으로 보관하고 승인된 별도 백업 저장소에도 보호해 보관한다. `pg_restore --list` 성공은 백업 목록을 읽을 수 있다는 확인이며 **실제 복원 시험을 대신하지 않는다**. 별도 임시 DB로 복원하는 시험도 스테이징에서 수행한다. 실패해 `.partial`만 남으면 유효한 백업이 있다고 간주하지 않는다. [PostgreSQL 16 pg_dump 문서](https://www.postgresql.org/docs/16/app-pgdump.html)

### 3. 스크립트 적용

적용할 파일을 검토한 뒤 DB 컨테이너에 복사해 실행한다. `public` 스키마가 앞 단계에서 확인된 경우의 명령이다.

```bash
docker cp "$PANG3_SQL_FILE" sahagu-db:/tmp/pang3-security-hardening-2026-10-18.sql

docker exec -e PGOPTIONS='-c search_path=public -c lock_timeout=5s -c statement_timeout=60s' sahagu-db sh -c 'exec psql -X -w -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -f /tmp/pang3-security-hardening-2026-10-18.sql'
```

성공 시 `BEGIN`, `ALTER TABLE`, `CREATE INDEX`, `COMMIT`이 출력되고 명령 종료 코드가 0이어야 한다. 이미 존재하는 항목의 `NOTICE`는 나올 수 있지만, 같은 이름의 열/인덱스가 **올바른 정의인지**는 다음 단계에서 확인한다. 스크립트는 `BEGIN`/`COMMIT`으로 묶여 있고, `ON_ERROR_STOP=1`이 오류 발생 시 실행을 중단한다. `-X`는 개인 psql 시작 설정의 영향을 제외한다. [psql 실행 옵션](https://www.postgresql.org/docs/16/app-psql.html)

잠금 대기는 5초, 각 SQL 실행은 60초로 제한했다. 시간 초과나 잠금 오류가 나면 원인인 다른 DB 작업을 확인한 뒤 다시 진행한다. 무조건 대기시간을 늘리거나 알 수 없는 세션을 종료하지 않는다. [PostgreSQL 시간 제한 설정](https://www.postgresql.org/docs/16/runtime-config-client.html)

### 4. 적용 결과 확인

```bash
docker exec -i sahagu-db sh -c 'exec psql -X -w -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' <<'SQL'
SELECT column_name, data_type, character_maximum_length, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'auth_sessions'
  AND column_name IN ('previous_refresh_hash', 'previous_refresh_until', 'refresh_retry_ciphertext')
ORDER BY column_name;

SELECT c.relname, i.indisunique, i.indisvalid, pg_get_indexdef(i.indexrelid)
FROM pg_index i
JOIN pg_class c ON c.oid = i.indexrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname = 'uk_auth_sessions_previous_refresh';
SQL
```

열 조회 결과는 아래 3행이어야 하며 모두 `is_nullable=YES`여야 한다.

| 열 | 자료형 | 길이 |
|---|---|---|
| `previous_refresh_hash` | character varying | 64 |
| `previous_refresh_until` | timestamp with time zone | 해당 없음 |
| `refresh_retry_ciphertext` | character varying | 256 |

인덱스는 `indisunique=t`, `indisvalid=t`이고 정의가 **public.auth_sessions의 previous_refresh_hash 열에 대한 UNIQUE 인덱스**여야 한다. 결과가 다르거나 누락되면 새 백엔드를 배포하지 않는다. `IF NOT EXISTS`는 이름이 같은 기존 항목의 잘못된 자료형/정의를 수정하지 않는다.

Claude는 표를 눈으로 읽고 넘어가는 대신 다음 검증도 실행한다. 성공하면 `DO`로 끝나며, 누락·다른 정의가 있으면 예외와 비정상 종료 코드가 발생한다.

```bash
docker exec -i sahagu-db sh -c 'exec psql -X -w -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' <<'SQL'
DO $verify$
DECLARE
    correct_columns integer;
    correct_index boolean;
BEGIN
    SELECT count(*) INTO correct_columns
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'auth_sessions' AND is_nullable = 'YES'
      AND (
        (column_name = 'previous_refresh_hash' AND data_type = 'character varying' AND character_maximum_length = 64)
        OR (column_name = 'previous_refresh_until' AND data_type = 'timestamp with time zone')
        OR (column_name = 'refresh_retry_ciphertext' AND data_type = 'character varying' AND character_maximum_length = 256)
      );

    SELECT EXISTS (
        SELECT 1 FROM pg_index i
        JOIN pg_class c ON c.oid = i.indexrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = i.indkey[0]
        WHERE n.nspname = 'public' AND c.relname = 'uk_auth_sessions_previous_refresh'
          AND i.indrelid = 'public.auth_sessions'::regclass
          AND i.indisunique AND i.indisvalid AND i.indisready
          AND i.indnkeyatts = 1 AND i.indnatts = 1
          AND i.indpred IS NULL AND i.indexprs IS NULL
          AND a.attname = 'previous_refresh_hash'
    ) INTO correct_index;

    IF correct_columns <> 3 OR NOT correct_index THEN
        RAISE EXCEPTION 'PANG3 auth session migration verification failed';
    END IF;
END
$verify$;
SQL
```

### 5. 검증한 백엔드 배포 및 기능 확인

이번 수정이 포함된 이미지/커밋인지 확인하고 기존 배포 절차로 해당 이미지를 준비한다. 이미지가 준비된 뒤, DB를 재생성하지 않고 백엔드만 기동한다.

```bash
docker compose up -d --no-deps backend
docker compose ps backend
```

테스트 계정으로 신규 로그인, 배포 전 로그인 세션의 refresh, 새 토큰 교체, 짧은 재시도 후 유지, 로그아웃 후 기존 토큰 거부를 확인한다. 다른 계정의 세션을 해제할 수 없는지도 확인한다. 토큰 값과 DB 백업 내용을 메일·메신저·로그에 붙이지 말고 결과만 기록한다. 서버 담당자는 적용 일시(시간대 포함), DB/스키마, SQL 파일/배포 커밋, 백업 위치, 종료 코드, 스키마 확인 및 기능 검증 결과를 남긴다.

### 6. 실패했을 때

- **백업 실패:** SQL을 실행하지 않는다. 원인을 해결해 백업을 다시 만들거나, 이번 DB 변경을 하지 않은 상태에서 기존 이미지로 API를 다시 기동한다.
- **SQL 오류·시간 초과:** `ON_ERROR_STOP`과 트랜잭션 때문에 해당 실행에서 아직 커밋되지 않은 변경은 연결 종료 시 롤백된다. 최초 상태에 이미 존재하던 열/인덱스는 남아 있을 수 있으므로 4단계로 상태를 확인한다. 오류를 해결하기 전 새 백엔드를 배포하지 않는다.
- **SQL 성공 후 새 백엔드 오류:** 백엔드를 중단하고 원인을 확인한다. 필요하면 직전 검증 이미지로 되돌리되, 추가한 nullable 열/인덱스는 남겨도 이전 코드와 호환된다. 열 삭제나 운영 DB 전체 복원을 자동 대응으로 실행하지 않는다. 이미 토큰이 교체된 세션은 되돌린 버전에서 재로그인이 필요할 수 있다.
- **복원이 실제로 필요한 별도 사고:** 쓰기를 중단하고 새로 생긴 데이터의 보존을 먼저 판단한 뒤, 담당자의 복구 절차와 복원 시험 결과에 따라 수행한다. `docker compose down -v`, DB 볼륨 삭제, 업무/사용자 테이블 삭제는 이 마이그레이션 절차에 필요하지 않다.

## 권장 진행 순서

1. 이번 코드를 배포하기 전 DB를 백업하고 `backend/sql/security_hardening_2026_10_18.sql`을 먼저 적용한다. 운영 PostgreSQL 스키마를 확인하고 기존 세션·refresh 회전 및 로그아웃을 스테이징에서 검증한다.
2. 남은 **1·6번**: 서버 HTTPS와 DB/API 직접 접근 제한을 적용하고 출시 앱의 HTTPS 설정을 맞춘다.
3. 남은 **5번**: 사용자가 다시 작업을 요청하면 엑셀 파서 교체와 입력 제한을 진행한다. 이번에는 보류했다.
4. 남은 **10·11·12번**: 키 관리, 로그/응답 정보 정리, CI·컨테이너 격리를 각 항목의 미처리 설명에 따라 진행한다.
5. 보고서 동시 2개·대기 8개, 경로 호출량, 사진 용량 정책을 실제 업무량·서버 성능으로 검증하고 필요시 조정한다. 보고서 일일 생성량/다운로드 횟수 제한을 새로 도입한 것은 아니다.
6. 스테이징에서 두 계정·다른 그룹·팀장/일반 멤버/탈퇴 계정의 권한을 실제 요청으로 재검증한다. 신규 사진은 JPG/PNG만 직접 업로드할 수 있으므로 실제 단말의 카메라·갤러리 선택 흐름도 확인한다.
7. 여러 백엔드 인스턴스로 확장하기 전에 요청 제한·생성 작업 공유 큐·중복 캐시·업로드 할당량을 서버 간 공유 저장소 기반으로 옮긴다. 실제 release APK·운영 이미지와 같은 환경에서 TLS·포트·캐시·백업 복원을 검증한 뒤 출시를 판단한다.

## 기준 자료

- [OWASP API5: 기능 단위 권한 오류](https://api-security.owasp.org/editions/2023/en/0xa5-broken-function-level-authorization/)
- [OWASP API4: 자원 소비 제한 부재](https://api-security.owasp.org/editions/2023/en/0xa4-unrestricted-resource-consumption/)
- [Android: 평문 통신 위험](https://developer.android.com/privacy-and-security/risks/cleartext-communications)
- [SheetJS CVE-2023-30533](https://cdn.sheetjs.com/advisories/CVE-2023-30533)
- [SheetJS CVE-2024-22363](https://cdn.sheetjs.com/advisories/CVE-2024-22363)

## Claude 실행 결과

작성 시점에는 아래 작업을 실제 서버에서 실행하지 않았다. Claude는 실행 후 이 표를 실제 결과로 갱신하고, 실패/미실행 항목을 성공으로 바꾸지 않는다. 접속 정보의 비밀값·토큰·백업 내용은 기록하지 않는다.

| 항목 | 상태/결과 |
|---|---|
| 적용 일시 및 시간대 | 미실행 |
| 대상 서버·Compose 프로젝트·DB·스키마 확인 | 미실행 |
| 적용 SQL 파일의 SHA-256 및 코드 버전 | 미확인 |
| 스테이징 적용·기능 확인 | 미실행 |
| 배포 이미지 ID/digest 및 직전 복구 이미지 | 미확인 |
| API 중단 및 재기동 상태 | 미실행 |
| DB 백업 위치·백업/목록 확인 종료 코드 | 미실행 |
| SQL 실행 종료 코드·COMMIT 확인 | 미실행 |
| 3개 열·unique 인덱스 자동 검증 | 미실행 |
| 실제 배포 이미지 일치 및 백엔드 기동 | 미실행 |
| 로그인·refresh 교체/재시도·로그아웃·세션 권한 확인 | 미실행 |
| 실패 시 대응·복구 수행 여부 | 해당 없음: 아직 실행 전 |
| 남은 작업 | 1·5·6·10·11·12번 및 실제 운영 검증 |
