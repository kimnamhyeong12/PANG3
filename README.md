# PANG3 — 지도 기반 외근 도우미

지도와 위치 정보를 이용해 외근 방문지·업무 이관·현장 기록·보고서 작성을 지원하는 프로젝트입니다.

**문서는 [문서 목차](docs/README.md)에서 찾을 수 있습니다.**

## 프로젝트 구조

| 경로 | 역할 |
|---|---|
| frontend/ | Expo·React Native 모바일 앱 및 Android 지도·안내 모듈 |
| web/ | React·Vite 웹 클라이언트 |
| backend/ | Java 17·Spring Boot API, 인증·업무·파일·보고서 연동 |
| ai/ | Python 기반 HWPX 보고서 생성 엔진 |
| infra/ | 서버·스토리지·설정 관리 참고 자료 |
| docs/ | 출시·개발·기능·보안·설계 문서와 과거 기록 |

## 실행·검증 안내

- [로컬 앱·API 실행](docs/development/LOCAL_RELEASE_RUN.md)
- [모바일 개발 안내](frontend/README.md)
- [보고서 엔진](ai/README.md) · [연동 문서](ai/INTEGRATION.md)
- [백엔드 보조 스크립트](backend/scripts/README.md)
- [출시 전 검증 계획](docs/release/APP_RELEASE_VALIDATION_PLAN.md)

환경별 설정과 검증 한계는 각 문서에서 확인합니다. 과거 실행 기록은 현재 서버 가동·운영 배포·최신 코드 검증을 의미하지 않습니다. 자격 증명과 실제 업무 데이터는 저장소에 넣지 않습니다.

## 출시·개발 계획

- [출시 실행 계획](docs/release/APP_RELEASE_ACTION_PLAN.md)
- [보안 점검](docs/security/SECURITY_AUDIT_2026-10-18.md)
- [UI·UX 최종 점검](docs/design/UI_UX_FINAL_TODO.md)
- [AI 개발 워크플로우 설계안](docs/workflows/AI_WORKFLOW_DESIGN.md)

## 팀

김남형 · 조영준 · 박기범 · 모준호
