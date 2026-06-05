# AI 현장 보고서 엔진 (`ai/`)

사하구 외근 앱의 **HWP 보고서 자동 생성 + Gemini 현장 분석** 모듈입니다.  
**최종 DB:** `task` + `task_progress`

---

## 이 폴더가 하는 일

1. **위치도** 1장 (맨 위, 크게)
2. **현장사진** N장 — 코멘트로 섹션/캡션 (`현장사진(2)|설명`, `전`/`중`/`후`)
3. **메인 코멘트** — 가운데 굵게 (`23:00(현행) → 24:00(변경)...`)
4. **AI 분석 의견** — Gemini 공문체 (`ai_refined_content`)

---

## 폴더 구조

```text
ai/
├── app.py              ← 메인 (JSON in → HWP + AI out)
├── requirements.txt
├── .env.example        ← 키 템플릿 (실제 키는 .env, git 제외)
├── run.sh              ← 로컬 테스트
├── samples/            ← 테스트용 예시 JSON (가락타운 = mock)
├── output/             ← 생성 HWP
├── uploads/            ← 백엔드가 저장하는 사진 (런타임)
├── INTEGRATION.md      ← 팀원용 상세 연동 문서 ⭐
└── README.md           ← 이 파일
```

---

## 5분 만에 테스트

```bash
cd ai
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# .env 에 GEMINI_API_KEY 입력 (본인만, git 금지)

./run.sh samples/garak_sample.json
```

→ `output/위치도_및_현장사진_*.hwp` 생성되면 성공

---

## 운영에서 누가 뭘 하나?

| 역할 | 할 일 |
|------|--------|
| **앱** | `POST /api/task-progress` (multipart) |
| **백엔드** | DB 저장 → `app.py` 호출 → DB에 AI/HWP 경로 저장 |
| **AI (`app.py`)** | JSON 받아서 파일 생성만 |

**직접 `app.py`를 앱에서 부르지 않습니다.** 항상 백엔드가 호출합니다.

---

## mock vs 실제 데이터

| | mock (테스트) | 실제 (운영) |
|--|----------------|-------------|
| 방문지명 | `samples/garak_sample.json` 의 "가락타운" | `task.detail_address` |
| 업무유형 | "보행등, 경관조명" | `task.task_category` |
| 사진 | `test2.jpeg` | `ai/uploads/{taskId}/` 에 저장된 파일 |

---

## 팀 문서

- **연동 전체:** [INTEGRATION.md](./INTEGRATION.md)
- **AWS:** [../infra/README.md](../infra/README.md)
- **DB DDL:** [../backend/sql/schema.sql](../backend/sql/schema.sql)

---

## 키 / 보안

- `GEMINI_API_KEY` → `ai/.env` 또는 AWS SSM
- **절대 git에 올리지 마세요**
