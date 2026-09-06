# 팀 공지 — task / task_progress + AI 보고서 연동 완료

## 바뀐 점 (한 줄)

**방문지는 `task`, 현장 기록은 `task_progress`, 저장 시 자동으로 HWP + AI 분석** 됩니다.

---

## DB (DBeaver 최종)

- `task` — 방문지 (주소, 좌표, 업무유형, 상태)
- `task_progress` — 현장 사진·메모·AI결과·HWP경로

DDL: `backend/sql/schema.sql`

---

## API 요약

| 용도 | API |
|------|-----|
| 방문지 목록/추가 | `GET/POST /api/tasks` (또는 `/api/locations` 호환) |
| 현장 저장 + AI + HWP | `POST /api/task-progress` (**multipart**) |
| 최신 기록 조회 | `GET /api/task-progress/task/{taskId}` |
| HWP 다운로드 | `GET /api/task-progress/{progressId}/report/download` |
| 사진 보기 | `GET /api/files/{taskId}/{fileName}` |

---

## 프론트

- `FieldActionScreen` — 저장 시 **multipart**, 저장 후 **AI 분석문** 표시
- `MapScreen` — `POST /api/tasks`
- `ReportScreen` — DB에서 `aiRefinedContent` 조회

`.env`: `EXPO_PUBLIC_API_BASE_URL=http://서버IP:8081`

---

## 백엔드 실행 전

1. PostgreSQL에 `task`, `task_progress` 테이블 생성
2. `ai/venv` + `pip install -r requirements.txt`
3. `ai/.env` 에 `GEMINI_API_KEY`

---

## 상세 문서

- **전체 연동:** `ai/INTEGRATION.md`
- **AI 사용법:** `ai/README.md`
- **AWS:** `infra/README.md`

---

## mock 주의

`ai/samples/garak_sample.json` 의 **가락타운, 보행등** 은 테스트용입니다.  
실제 앱 데이터는 **DB `task` 테이블** 에 들어갑니다.
