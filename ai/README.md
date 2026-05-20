# AI 현장 보고서 엔진 (`ai/`)

사하구 외근 앱의 **자동 HWP 보고서 + Gemini 현장 분석** 모듈입니다.

---

## 폴더 구조

```
ai/
├── app.py                 # 메인 엔진 (JSON in → HWP + AI out)
├── requirements.txt       # Python 패키지 목록
├── .env.example           # API 키 템플릿 (실제 키는 .env에만, git 제외)
├── run.sh                 # 로컬 테스트 실행 스크립트
├── INTEGRATION.md         # 백엔드 팀 연동 가이드 
├── samples/               # 테스트용 JSON
│   ├── garak_sample.json
│   └── manhole_sample.json
├── output/                # 생성된 보고서 (.hwp) — git 제외
└── test2.jpeg             # 로컬 테스트용 샘플 이미지
```

---

## 빠른 시작 (본인 PC)

```bash
cd ai
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# .env 에 GEMINI_API_KEY 직접 입력 (키는 절대 git push 금지)
chmod +x run.sh
./run.sh
```

`output/` 폴더에 `.hwp` 파일이 생기면 성공입니다.

---

## 팀원에게 줄 문서

| 파일 | 대상 | 내용 |
|------|------|------|
| **INTEGRATION.md** | 백엔드 | JSON 스키마, Java 연동, `@@AI_RESULT@@` 파싱 |
| **README.md** | 전체 | 이 폴더가 뭔지, 어떻게 테스트하는지 |

한 줄 요약 for 백엔드:

> 현장 사진 저장 후 `ai/app.py`에 JSON 넘기면 `report_file`이랑 `ai_refined_content`가 `@@AI_RESULT@@` 한 줄로 돌아옵니다.

---

## 보고서 양식

1. 제목: `위치도 및 현장사진(방문지, 업무유형)`
2. **위치도** 1장 (전체 너비)
3. **현장사진** — 코멘트로 섹션 묶음 (`현장사진(2)` 등), 줄당 최대 2장 + 캡션
4. **메인 코멘트** (가운데, 굵게) — 예: `23:00(현행) → 24:00(변경) 소등시간 연장`
5. **AI 분석 의견** (Gemini, 공문체)

---

## 키 / 보안

- `GEMINI_API_KEY`는 **본인만** `ai/.env`에 설정
- `.env`는 `.gitignore`에 포함됨
- 저장소에 키를 올리지 마세요
