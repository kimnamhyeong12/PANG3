# AI 보고서 연동 가이드 (팀원용 · 최종 DB 기준)

> **대상:** 백엔드, 프론트, 클라우드  
> **DB:** `task` + `task_progress` (DBeaver 최종 스키마)  
> **AI 엔진:** `ai/app.py`

---

## 1. 한 줄 요약

공무원이 앱에서 **위치도 + 현장사진 + 메모**를 저장하면 →  
백엔드가 DB(`task_progress`)에 저장하고 → **`app.py`가 HWP + AI 분석문**을 만든 뒤 →  
`ai_refined_content`, `report_file_path`를 DB에 다시 저장합니다.

---

## 2. DB 테이블 (최종)

### `task` — 방문지(마스터)

| 컬럼 | 설명 | 앱/보고서 |
|------|------|-----------|
| `task_id` | PK | `id`, `taskId` |
| `detail_address` | 방문지 이름 | 보고서 제목 `location_name` |
| `road_address` | 도로명 주소 | |
| `lat`, `lng` | 좌표 | |
| `task_category` | 업무 유형 (보행등, 배수 등) | 보고서 제목 `task_category` |
| `task_status` | pending / working / complete | |

### `task_progress` — 현장 기록 1건

| 컬럼 | 설명 | 앱 화면 |
|------|------|---------|
| `progress_id` | PK | |
| `task_id` | FK → task | |
| `latitude`, `longitude` | 수정 좌표 | FieldActionScreen |
| `location_map_image` | 위치도 **서버 절대경로** | 위치도 사진 |
| `field_photos` | JSONB `[{path, comment}]` | 현장 사진 + 코멘트 |
| `main_comment` | 종합 의견 | `23:00→24:00...` |
| `field_memo` | AI용 메모 | 현장 메모 |
| `progress_status` | 미작업/작업중/완료 | |
| `ai_refined_content` | Gemini 공문 분석 | AI 카드 |
| `report_file_path` | 생성된 HWP 경로 | 다운로드 |
| `created_at` | 저장 시각 | |

DDL 파일: `backend/sql/schema.sql`

---

## 3. 전체 흐름 (그림)

```text
[앱] 지도에서 방문지 추가
   POST /api/tasks  →  task INSERT

[앱] 현장 기록 (FieldActionScreen)
   POST /api/task-progress (multipart)
   → task_progress INSERT
   → 사진 ai/uploads/{taskId}/ 저장
   → app.py 실행
   → ai_refined_content, report_file_path UPDATE

[앱] 보고서 목록/다운로드
   GET /api/task-progress/task/{taskId}
   GET /api/task-progress/{progressId}/report/download
```

---

## 4. API 목록

### 4-1. 방문지 `task`

| 메서드 | URL | 설명 |
|--------|-----|------|
| GET | `/api/tasks` | 방문지 목록 |
| POST | `/api/tasks` | 방문지 추가 |
| PATCH | `/api/tasks/{taskId}/status` | 상태 변경 |

**호환:** `/api/locations` 도 동일하게 `task` 를 사용합니다 (기존 프론트 URL 유지).

**POST body 예시:**

```json
{
  "detailAddress": "가락타운",
  "roadAddress": "사하구 ...",
  "lat": 35.11,
  "lng": 128.96,
  "taskCategory": "보행등, 경관조명",
  "status": "pending"
}
```

### 4-2. 현장 기록 + AI 보고서 `task_progress`

| 메서드 | URL | 설명 |
|--------|-----|------|
| POST | `/api/task-progress` | **multipart** 저장 + AI + HWP |
| POST | `/api/task-progress` | JSON (사진 없으면 AI 생략 가능) |
| GET | `/api/task-progress/task/{taskId}` | 최신 기록 조회 |
| GET | `/api/task-progress/{progressId}/report/download` | HWP 다운로드 |

### 4-3. 사진 보기

| 메서드 | URL |
|--------|-----|
| GET | `/api/files/{taskId}/{fileName}` |

응답 JSON의 `locationMapImage`, `fieldPhotos[].uri` 가 이 URL 형식입니다.

---

## 5. multipart 저장 (프론트 → 백엔드)

`FieldActionScreen` 저장 시 **FormData** 사용:

| 필드 | 타입 | 필수 |
|------|------|------|
| `taskId` | string | ○ |
| `latitude`, `longitude` | string | △ |
| `mainComment`, `fieldMemo` | string | △ |
| `progressStatus` | string | ○ |
| `photoComments` | JSON 문자열 `["코멘트1","코멘트2"]` | △ |
| `mapImage` | 파일 | △ |
| `fieldPhotos` | 파일 (여러 개) | △ |

---

## 6. `app.py` 입력 JSON (백엔드가 자동 생성)

백엔드 `AiReportService.buildPayload()` 가 조립합니다. **직접 가락타운 mock 파일을 쓰지 않습니다.**

```json
{
  "location_name": "task.detail_address",
  "task_category": "task.task_category",
  "latitude": 35.11,
  "longitude": 128.96,
  "main_comment": "task_progress.main_comment",
  "field_memo": "task_progress.field_memo",
  "map_image": "/절대경로/ai/uploads/5/map_xxx.jpg",
  "field_photos": [
    { "path": "/절대경로/.../photo_0.jpg", "comment": "현장사진(2)|옹벽" }
  ],
  "output_dir": "./ai/output",
  "task_id": 5,
  "progress_id": 12
}
```

### 사진 코멘트 규칙 → HWP 레이아웃

| 코멘트 입력 | HWP |
|-------------|-----|
| `현장사진(2)\|가락타운 옹벽` | 섹션 제목 + 캡션 |
| `전` / `중` / `후` | 섹션 `현장사진 (전)` 등 |
| `인도 보행등` (한 줄만) | 자동 섹션 + 캡션 |

---

## 7. `app.py` 출력 (백엔드가 파싱)

stdout 마지막 줄:

```text
@@AI_RESULT@@{"ok":true,"ai_refined_content":"...","report_file":"/path/xxx.hwp",...}
```

백엔드 `AiReportService` 가 파싱 후 DB 업데이트:

- `task_progress.ai_refined_content`
- `task_progress.report_file_path`

---

## 8. 로컬 실행 (AI 담당)

```bash
cd ai
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # GEMINI_API_KEY 직접 입력
./run.sh samples/garak_sample.json
```

- `samples/garak_sample.json` → **테스트용 예시** (가락타운 이름은 mock)
- 운영 데이터는 **DB에서** 옴

---

## 9. 백엔드 설정 (`application.yml`)

```yaml
fieldwork:
  upload:
    base-dir: ./ai/uploads
  ai:
    python-path: ./ai/venv/bin/python
    script-path: ./ai/app.py
    output-dir: ./ai/output
```

EC2/Docker에서는 경로를 `/app/ai/...` 로 맞추세요.

---

## 10. 역할별 체크리스트

### AI·인프라
- [ ] `ai/.env` 에 `GEMINI_API_KEY`
- [ ] `./run.sh` 로 HWP 생성 확인
- [ ] EC2에 `ai/venv` 설치 (`infra/scripts/03-setup-ec2-ai.sh`)

### 백엔드
- [ ] DB `task`, `task_progress` 테이블 생성 (`backend/sql/schema.sql`)
- [ ] Spring Boot 실행 후 `POST /api/task-progress` 테스트
- [ ] multipart + `@@AI_RESULT@@` 파싱 확인

### 프론트
- [ ] `EXPO_PUBLIC_API_BASE_URL=http://서버:8081`
- [ ] 현장 저장 → AI 결과 카드 표시
- [ ] 보고서 화면에서 `aiRefinedContent` 확인

### 클라우드 (다음 단계)
- [ ] S3 업로드로 `location_map_image` / `field_photos` URL 변경
- [ ] SSM `/sahagu/gemini/api-key`

---

## 11. 자주 묻는 것

**Q. 가락타운·보행등은 DB에 있나요?**  
A. 없습니다. `ai/samples/` 테스트용입니다. 실제 값은 `task.detail_address`, `task.task_category` 입니다.

**Q. `locations` 테이블은?**  
A. 레거시입니다. API는 `/api/locations` 를 유지하지만 내부는 `task` 를 씁니다.

**Q. AI가 안 돌아가요**  
A. `GEMINI_API_KEY`, `ai/venv`, 사진 **multipart 업로드** 여부를 확인하세요.

---

## 12. 관련 파일

| 경로 | 설명 |
|------|------|
| `ai/app.py` | AI + HWP 엔진 |
| `backend/.../TaskProgressService.java` | 저장 + AI 호출 |
| `backend/.../AiReportService.java` | app.py 연동 |
| `frontend/screens/FieldActionScreen.js` | 현장 입력 |
| `infra/README.md` | AWS S3/SSM/EC2 |
