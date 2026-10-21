# PANG3 단일 작업 실행기

첫 구현 범위는 **명세·계획 고정 → 검수 제출 → 등록된 QA 실행 → 증거·결과 기록**이다. AI를 자동 호출하거나 코드를 자동 수정하는 오케스트레이터, Claude 교차 검수, 배포·병렬 실행은 아직 연결하지 않았다. 설계 전체는 [워크플로우 설계](../../docs/workflows/AI_WORKFLOW_DESIGN.md)를 참고한다.

## 시범 방식

휴대폰 없이 PC에서 먼저 합성 보고서 2건을 시험한다.

- Java API의 인증·권한·DB·실제 Python 호출·HWPX 파일 응답: MockMvc/H2로 실행. 실행 중인 서버나 운영 DB가 필요 없다.
- 실제 방문지·날짜·메모·사진의 구분, 덮어쓰기 방지, 비로그인/다른 그룹 접근 차단, 작업 전 다운로드 차단을 검사한다.
- 기존 Node 스크립트로 모바일 다운로드 로직을 검증한다. 네이티브 저장은 모의 처리이므로 기기 성공으로 기록하지 않는다.
- 실제 Android의 저장 위치·파일 관리자·한글 뷰어 확인은 별도 수동 QA다. 안 하면 전체 시범은 BLOCKED로 남는다.

## 실행

저장소 루트에서 Python 3.10 이상, Git, Node, Maven, Java 17을 사용한다. 보고서용 Python에는 `ai/requirements.txt`의 패키지가 필요하다. 실행기는 기존 `backend/target/release-local/report-venv` 또는 `ai/venv`를 먼저 찾고 없으면 현재 Python을 사용한다. 패키지를 자동 설치하지 않는다.

Maven은 네트워크 없이 `.m2/repository`의 작업 폴더 캐시를 사용한다. 캐시 누락은 BLOCKED로 기록한다. Python은 `.env` 로딩과 AI API 키를 비활성화하며, AI 분석 플래그가 False인지 확인한 후 실행한다. dotenv의 비활성화 지원도 사전에 확인한다.

```powershell
python tools/agent-workflow/test_runner.py
python tools/agent-workflow/runner.py init my-report-pilot
python tools/agent-workflow/runner.py status my-report-pilot
```

`.agent-runs/my-report-pilot/`에 요청·계획·후보 manifest·검증 명령 목록·상태·타임라인·결과가 만들어진다. 이 폴더는 Git 제외다. run ID는 재사용하지 않는다.

`workflow.json`은 현재 보고서 시범 과제의 명세를 담는다. `checks.json`의 등록된 argv만 shell=False로 실행하며, 임의 명령을 CLI로 넘기는 기능은 없다. 테스트는 전역 단일 실행 lock을 사용한다.

## 검수 제출

명세·계획 또는 코드를 실제로 검토한 사람이 아래 형식의 JSON을 실행 폴더 안에 저장한다. `candidateDigest`는 status의 값을 그대로 사용한다.

```json
{
  "stage": "plan",
  "candidateDigest": "status에서 확인한 해시",
  "inputRevision": 1,
  "reviewer": { "kind": "human", "name": "실제 검수자" },
  "decision": "APPROVE",
  "summary": "어떤 요구·누락·증거 기준을 검토했는지",
  "findings": []
}
```

```powershell
python tools/agent-workflow/runner.py review my-report-pilot plan .agent-runs/my-report-pilot/plan-review.json
# 구현·코드 검토 후 stage를 code로 작성한 별도 JSON 제출
python tools/agent-workflow/runner.py review my-report-pilot code .agent-runs/my-report-pilot/code-review.json
python tools/agent-workflow/runner.py check my-report-pilot all
```

`kind`는 `human`, `same-agent`, `external-model` 중 실제 수행 방식으로 적는다. 이번 최초 시범은 `same-agent` 자체 검수다. 제출된 이름은 인증된 신원이나 독립 검수의 증명이 아니다. 검수자는 제품 파일을 고치지 않고 결과를 제출한다. 읽기 전용 모델 sandbox를 강제하는 adapter는 후속 단계다.

반려는 `REQUEST_CHANGES`, 지적 항목은 `severity: blocking/non-blocking`, `reason`을 쓴다. blocking 지적이 남아 있는 APPROVE는 거부한다. 단계별 최대 3회 반려 시 LIMIT_REACHED다.

소스가 변경되면 `refresh <run-id>`로 새 후보 세대를 만든 뒤 검수를 다시 제출한다. 기존 검수·QA 파일은 보존하고 새 상태에서 무효화한다. 요청·계획·검증 명령 목록 자체를 바꾸려면 새 실행을 만든다.

## 결과와 종료 코드

- `result.md`: 검수·QA·합격 기준별 결과.
- `events.jsonl`: 단계·명령 시작과 종료·재개 기록(KST).
- `checks/<ID>/<회차>/command.log`, `result.json`: argv·시각·종료 코드·사유·파일 해시.
- Java 시범의 증거: `report-a.hwpx`, `report-b.hwpx`, `pilot-summary.json`.
- 종료 코드: 0 정상 처리, 2 잘못된 상태·입력, 3 QA 실패, 4 QA 차단. `check all`은 실행 가능한 검사를 끝까지 기록하고 실패/차단 상태를 반환한다.

`finish <run-id>`는 필수 QA 전부 PASS이고 검수·후보·증거가 바뀌지 않았을 때만 VERIFIED로 바꾼다. 기기 항목이 BLOCKED이면 완료로 바꿀 수 없다. 의존성 누락·권한·기기 부재를 제품 결함과 혼동하지 않는다.

## 휴대폰에서 이어서 확인할 때

1. 먼저 PC 검증 결과를 확인한다. 기존 휴대폰의 데이터를 지우거나 앱을 재설치하지 않는다.
2. 후보 코드로 만든 시험 앱의 빌드와 SHA-256, 격리 시험 API 연결을 준비한다. 현재 사용 중인 앱의 서버 설정을 바꾸려면 이를 먼저 사용자에게 설명한다.
3. USB 개발 빌드의 경우에만 ADB·USB 디버깅·포트 연결을 준비한다. 이미 설치된 적절한 시험 앱이면 무조건 USB가 필요한 것은 아니다.
4. 합성 보고서 2건을 선택해 다운로드하고, 각각 한글 뷰어로 열어 방문지·날짜·메모·사진을 확인한다. 저장 화면과 두 뷰어 화면을 캡처한다.
5. 증거를 `.agent-runs/<run-id>/device-input/`에 저장하고 아래 JSON을 제출한다. 실제로 시험한 결과만 기록한다.

```json
{
  "candidateDigest": "현재 후보 해시",
  "status": "PASS",
  "tester": "실제 확인자",
  "reason": "두 파일 저장 및 각각의 뷰어 내용 확인",
  "metadata": {
    "device": "기기 모델", "os": "Android 버전",
    "app_build": "versionCode와 시험 빌드 식별자",
    "artifact_sha256": "시험한 APK 해시",
    "network": "격리 로컬 API / USB 또는 시험 Wi-Fi",
    "steps": "목록→2건 선택→다운로드→각 파일 열기",
    "expected": "서로 다른 내용·사진의 HWPX 2개",
    "actual": "관찰한 저장 위치·각 파일 내용"
  },
  "evidence": [".agent-runs/my-report-pilot/device-input/save.png", ".agent-runs/my-report-pilot/device-input/report-a.png", ".agent-runs/my-report-pilot/device-input/report-b.png"]
}
```

```powershell
python tools/agent-workflow/runner.py manual my-report-pilot android-report-device .agent-runs/my-report-pilot/device-review.json
python tools/agent-workflow/runner.py finish my-report-pilot
```

기기 확인자 진술과 증거를 기록하는 기능이며 APK 설치 상태나 뷰어 내용을 실행기가 자동 인증하는 것은 아니다. TCP 서버·PostgreSQL·운영 Linux·기기 UI·문서 시각 배치를 PC MockMvc 시험으로 통과 처리하지 않는다.
