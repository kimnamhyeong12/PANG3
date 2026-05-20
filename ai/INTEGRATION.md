# AI 보고서 엔진 — 백엔드 연동 가이드

> 담당: AI·인프라 (PANG3 `ai/` 폴더)  
> 프론트·DB API는 백엔드에서 구현 후, **저장된 이미지 절대경로**를 JSON으로 넘기면 됩니다.

---

## 1. 하는 일

1. 위치도 + 현장사진(가변) + 메인코멘트 → **HWP 호환 docx** 생성  
2. Gemini Vision → **`ai_refined_content`** (공문체 현장 분석)  
3. stdout 한 줄에 **`@@AI_RESULT@@` + JSON** 출력 → Java가 파싱

---

## 2. 실행 방법

### 로컬 테스트

```bash
cd ai
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # GEMINI_API_KEY 직접 입력 (팀 공유 금지)
./run.sh samples/garak_sample.json
```

생성 파일: `ai/output/위치도_및_현장사진_*.hwp`

### Java ProcessBuilder (예시)

```java
List<String> cmd = List.of(
    "/absolute/path/PANG3/ai/venv/bin/python",
    "/absolute/path/PANG3/ai/app.py",
    jsonPayload  // 아래 스키마 JSON 문자열
);
ProcessBuilder pb = new ProcessBuilder(cmd);
pb.directory(new File("/absolute/path/PANG3"));  // 작업 디렉터리 = 프로젝트 루트 권장
```

### JSON 파일로 실행

```bash
python app.py samples/garak_sample.json
```

---

## 3. 입력 JSON 스키마

| 필드 | 필수 | 설명 |
|------|------|------|
| `location_name` | ○ | 방문지명 (보고서 제목) |
| `task_category` | ○ | 업무 유형 (보고서 제목) |
| `map_image` | ○ | 위치도 이미지 **절대경로** (서버 저장 후) |
| `field_photos` | ○ | `[{ "path": "...", "comment": "..." }]` |
| `main_comment` | △ | 하단 메인 코멘트 (예: 소등시간 연장) |
| `field_memo` | △ | AI 분석용 날것 메모 |
| `latitude` / `longitude` | △ | 선택 |
| `output_dir` | △ | 보고서 저장 폴더 (기본 `ai/output`) |

### `field_photos[].comment` 규칙

| 입력 예 | 보고서 표 제목 | 사진 아래 캡션 |
|---------|----------------|----------------|
| `현장사진(2)\|가락타운 옹벽 경관조명` | 현장사진 (2) | 가락타운 옹벽 경관조명 |
| `전` / `중` / `후` | 현장사진 (전) 등 | (없음) |
| `가락타운 옹벽` (한 줄만) | 현장사진 (1)… 자동 | 가락타운 옹벽 |

같은 섹션 제목끼리 묶이고, **한 줄에 최대 2장** 배치됩니다.

### 입력 예시

```json
{
  "location_name": "가락타운",
  "task_category": "보행등, 경관조명",
  "main_comment": "23:00(현행) → 24:00(변경) 소등시간 연장",
  "field_memo": "옹벽 경관조명 점검",
  "map_image": "/var/app/uploads/12/map.jpg",
  "field_photos": [
    { "path": "/var/app/uploads/12/photo1.jpg", "comment": "현장사진(2)|가락타운 옹벽 경관조명" },
    { "path": "/var/app/uploads/12/photo2.jpg", "comment": "현장사진(2)|인도 측 보행등" }
  ],
  "output_dir": "/var/app/reports"
}
```

---

## 4. 출력 (stdout)

마지막에 **한 줄** 출력:

```
@@AI_RESULT@@{"ok":true,"ai_refined_content":"...","report_file":"/path/to/report.hwp","error":null,...}
```

### Java 파싱 예시

```java
String aiJson = null;
for (String line : lines) {
    if (line.startsWith("@@AI_RESULT@@")) {
        aiJson = line.substring("@@AI_RESULT@@".length());
        break;
    }
}
ObjectMapper mapper = new ObjectMapper();
Map<String, Object> result = mapper.readValue(aiJson, Map.class);
String aiText = (String) result.get("ai_refined_content");
String reportPath = (String) result.get("report_file");
boolean ok = Boolean.TRUE.equals(result.get("ok"));
```

> 기존 `[DB Column] ai_refined_content` 로그 파싱 방식은 **deprecated** — `@@AI_RESULT@@` 사용 권장.

---

## 5. 백엔드 권장 흐름

```
POST /api/locations/{id}/field-report  (multipart)
  → 이미지 서버 디스크/S3 저장
  → 절대경로로 JSON 구성
  → python app.py '<json>'
  → @@AI_RESULT@@ 파싱
  → DB: ai_refined_content, report_file_path 저장
  → (선택) GET /api/reports/{id}/download
```

**주의:** 현재 `LocationService.saveLocation()` 에서 방문지 추가 시 AI를 호출하는 로직은  
**현장 보고 저장 API로 옮기는 것**을 권장합니다.

---

## 6. 서버 배포 체크리스트

- [ ] Python 3.11+  
- [ ] `ai/venv` + `pip install -r requirements.txt`  
- [ ] 환경변수 `GEMINI_API_KEY` (SSM 등 — **코드/깃에 넣지 않음**)  
- [ ] `output_dir` 쓰기 권한  
- [ ] 이미지 경로는 **절대경로**  
- [ ] Docker 이미지에 `ai/` 폴더 포함 또는 AI HTTP 서비스 분리

---

## 7. 샘플 데이터

| 파일 | 설명 |
|------|------|
| `samples/garak_sample.json` | 가락타운형 2장 |
| `samples/manhole_sample.json` | 맨홀형 3장 (2+1 배치) |

---

## 8. 문의

AI 엔진 오류 시 `ok: false` 의 `error` 필드와 stderr 로그를 확인하세요.
