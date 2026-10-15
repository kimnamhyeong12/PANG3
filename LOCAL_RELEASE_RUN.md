# 출시 브랜치 로컬 실행

2026-10-14: Docker Desktop이 `Inference manager / dockerInference` 시작 오류로 실행되지 않아 Docker 없는 H2 파일 DB로 백엔드를 실행했다.

- 로컬 API: http://localhost:18081
- 현재 Wi-Fi의 휴대폰용 API 후보: http://192.168.219.105:18081 (같은 Wi-Fi, Windows 방화벽의 접속 허용 여부는 미확인. IP는 바뀔 수 있음)
- 테스트 계정: `release_test`
- 테스트 계정 비밀번호: `LocalTest!2026` (이 로컬 검증 DB에만 만든 계정)
- DB/로그/사진/보고서 위치: `backend/target/release-local/` 아래. Git 무시 경로이며 기존 DB·업로드 폴더를 사용하지 않는다.

실제 HTTP 검증: 비로그인 요청 401, 회원가입, 로그인, 본인 정보, 개인 그룹 조회, refresh, 로그아웃, 로그아웃한 토큰의 401을 확인했다. 서버는 백그라운드로 실행 중이다.

실기기 확인: 앱 종료·재실행 시 자동 로그인 유지, 로그아웃 후 재실행 시 로그인 화면 표시, 방문지 등록·작업 중 상태 저장. 사진 재조회에서 네이티브 이미지 로더의 401을 발견해 인증 API 다운로드 후 로컬 파일 표시로 수정했다. 수정 후 휴대폰에서 기존 사진과 사진 설명 `로컬 저장 테스트`가 보이는 것을 확인했다. 입력한 문구는 사진 설명에 저장됐고 현장 메모 필드는 비어 있었다. 수정 뒤 화면 렌더링·사진 편집·세션 수명주기 검증 3개 통과.

## 안내 자동 재개 변경

사용자 요청에 따라 앱 작업 제거는 안내 목적지의 명시적 종료로 취급하지 않는다. 종료 중에는 SDK·알림을 정리하고, 앱을 다시 열어 로그인·업무 조회·GPS가 준비되면 같은 미완료 목적지로 새 경로를 계산해서 자동 안내한다. 별도 이어서 안내 버튼은 추가하지 않았다.

Android에 명시적 안내 종료 표시를 별도로 저장했다. 안내 종료·도착·로그아웃 및 유효하지 않은 목적지는 재개하지 않는다. 차량 SDK의 이전 프로세스 경로 객체는 재사용하지 않고 현재 GPS로 새로 준비한다. 기존의 같은 업무일·현재 업무공간 세션 복원 조건은 유지한다. 재탐색 요청의 일시 실패는 목적지를 보존하고 제한된 자동 재시도를 한다.

차량·도보 자동 재개, 현재 GPS 사용, 종료 중 SDK 콜백이 목적지를 지우지 않음, 명시적 종료, 삭제·완료된 목적지 차단을 회귀 검증에 추가했다. 관련 스크립트 4개와 Android 네이티브 debug 빌드가 통과했다. 실제 안내 시작 → 작업 제거 → 재실행 → 같은 목적지 자동 안내와 명시적 종료 후 재실행은 휴대폰에서 추가 확인할 항목이다.

## 다시 시작 / 종료

프로젝트 루트에서 PowerShell:

```powershell
# Docker 없이 실행한 현재 방식
./backend/scripts/start-release-local.ps1 -Database H2

# 코드 변경 후 빌드해서 재시작
./backend/scripts/stop-release-local.ps1
./backend/scripts/start-release-local.ps1 -Database H2 -Build

# 백엔드 종료: 테스트 DB 파일은 보존
./backend/scripts/stop-release-local.ps1
```

H2 실행은 테스트 scope 의존성을 포함한 `backend/target/release-test-classpath.txt`가 필요하다. 이 PC에는 생성되어 있다. 다른 PC에서 파일이 없다면 backend 폴더에서 다음을 실행한다.

```powershell
mvn dependency:build-classpath '-Dmdep.outputFile=target/release-test-classpath.txt' '-DincludeScope=test'
```

## Docker 정상화 후 PostgreSQL 검증

```powershell
docker compose -f docker-compose.release-local.yml up -d db
./backend/scripts/start-release-local.ps1 -Database Postgres -Build
```

실행 중인 H2 백엔드를 먼저 stop 스크립트로 종료해야 한다. PostgreSQL 컨테이너는 `pang3-release-test-db`, DB는 `pang3_release_test`, 호스트 포트는 `127.0.0.1:15432`이며 기존 Docker DB/볼륨을 사용하지 않는다. H2 데이터가 PostgreSQL로 자동 이전되지는 않는다.

현재 설정은 기본 application.yml과 AWS SSM import를 읽지 않도록 별도 config location을 사용한다. 실행 인자로 DB/업로드/보고서 경로를 고정하고 외부 AI·경로 키와 이메일 발송값을 비웠다.

## 현재 검증 범위

### 휴대폰 프론트 실행 (USB 연결)

2026-10-14: 연결된 SM-S908N에 SecureStore 포함 debug APK를 데이터 유지 방식으로 설치했고, Metro를 18082 포트로 실행했다. 프론트 프로세스에만 API 주소 `http://127.0.0.1:18081`을 지정했다. 기존 frontend/.env는 변경하지 않았다.

```powershell
# 프로젝트 루트에서 실행
./frontend/scripts/start-release-local.ps1

# Android SDK의 adb 경로를 사용할 것
adb reverse tcp:18081 tcp:18081
adb reverse tcp:18082 tcp:18082
adb shell am start -a android.intent.action.VIEW -d 'exp+fieldwork-helper://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A18082' com.pang3.fieldworkhelper
```

USB를 분리하면 이 연결은 끊어진다. 재연결 후 adb reverse 두 명령을 다시 실행한다. Expo Go 대신 설치된 개발용 외근도우미 앱을 사용한다.

- 자동 로그인·권한 등 기본 API를 시험할 수 있다.
- 현재 프론트 개발 서버는 로컬 API에 연결된다. 기존 .env의 서버 주소는 그대로다.
- H2 검증은 실제 PostgreSQL/PostGIS 동작 및 운영 마이그레이션 검증을 대신하지 않는다.
- 실제 이메일 발송, AI 생성, 서버 도보 경로/SGIS에는 추가 테스트 설정이 필요하다.
- Docker의 기존 컨테이너/볼륨 초기화·삭제는 하지 않았다. 오류 창의 공장 초기화 기능을 사용하지 않는다.

동일 Docker 오류 보고: [Docker Desktop feedback #448](https://github.com/docker/desktop-feedback/issues/448). H2 파일 DB 참고: [H2 기능 문서](https://h2database.com/html/features.html).
# 일괄 점검 후 수정 내역

2026-10-14 후속 수정, 검증 결과 및 남은 실기기 확인은 `RELEASE_FIXES_2026-10-14.md`에 정리했다. `frontend/scripts/build-release-local.ps1`로 개발 서버 없이 실행할 로컬 검증 APK를 만들고, 휴대폰 USB 연결 후 `frontend/scripts/install-local-preview.ps1`로 기존 데이터를 유지하며 업데이트할 수 있다. 로컬 백엔드 연결에는 USB가 계속 필요하다.
