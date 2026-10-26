# PANG3 문서 목차

프로젝트 소개는 [루트 README](../README.md), 문서를 찾을 때는 이 페이지에서 시작한다. 폴더 분류는 문서의 목적을 나타내며, 내용이 현재 코드·운영 환경에서 재검증됐다는 뜻은 아니다. 문서의 작성일과 미검증 항목을 함께 확인한다.

## 자주 보는 문서

| 목적 | 문서 |
|---|---|
| 로컬 앱·API 실행 | [로컬 실행 및 검증 환경](development/LOCAL_RELEASE_RUN.md) |
| 출시 준비 작업 | [실행 계획](release/APP_RELEASE_ACTION_PLAN.md) |
| 출시 전 테스트 | [검증 시나리오 V01~V26](release/APP_RELEASE_VALIDATION_PLAN.md) |
| 보안 및 서버 반영 | [2026-10-18 보안 점검](security/SECURITY_AUDIT_2026-10-18.md) |
| UI 최종 확인 | [UI·UX 점검 TODO](design/UI_UX_FINAL_TODO.md) |
| AI 개발 워크플로우 | [설계 및 구현 범위](workflows/AI_WORKFLOW_DESIGN.md) · [단일 작업 실행기](../tools/agent-workflow/README.md) |

## 출시·운영 준비

- [출시 실행 계획](release/APP_RELEASE_ACTION_PLAN.md): 작업 순서·담당·완료 기준.
- [사용자 준비 목록](release/APP_RELEASE_OWNER_CHECKLIST.md): 계정·스토어·운영 결정.
- [서버 전달 문서](release/APP_RELEASE_SERVER_HANDOFF.md): 서버 환경 준비 항목.
- [검증 계획](release/APP_RELEASE_VALIDATION_PLAN.md): 수행할 시험과 과거 증거의 구분.
- [출시 준비 조사](release/APP_RELEASE_READINESS_REPORT.md): 2026-10-15 기준 조사 결과.
- [공식 출처·코드 근거](release/APP_RELEASE_SOURCES.md): 조사 당시 근거. 정책·가격은 제출 시 재확인.
- [보안 점검](security/SECURITY_AUDIT_2026-10-18.md): 코드 점검 및 서버 반영 절차. 이동 자체는 배포 완료를 의미하지 않는다.

## 개발·기능 참고

- [로컬 실행](development/LOCAL_RELEASE_RUN.md).
- [프로젝트·통합 보고서 (풀 받은 뒤 할 일·DB 자동 적용)](features/PROJECT_REPORT_2026-10-22.md).
- [근무지역 선택](features/WORK_REGION_SELECTION.md).
- [업무 이관 Push 설정](features/TRANSFER_PUSH_SETUP.md).
- [이관 이력 보관·페이징](features/TRANSFER_HISTORY_RETENTION.md).
- [Android 지도 전환 및 후속 수정](features/KNMAP_MIGRATION_2026-10-17.md).
- [모바일 앱 안내](../frontend/README.md).
- [백엔드 보조 스크립트](../backend/scripts/README.md), [도로 경로 검증](../backend/scripts/ROAD_ROUTE_VERIFICATION.md).
- [보고서 엔진 안내](../ai/README.md), [연동 문서](../ai/INTEGRATION.md), [팀 전달 요약](../ai/팀전달용_요약.md).
- [인프라 안내](../infra/README.md).

일부 모듈 README에는 초기 구현 설명이 남아 있다. 특히 보고서 형식·AI 분석 활성 여부·실행 경로는 현재 코드와 대조한다. 이번 정리는 문서 배치·중복·링크 정리이며 전체 기술 내용을 재검증한 작업은 아니다.

## UI·UX 및 계획

- [UI·UX 코드 반영 기록](design/UX_UI_IMPLEMENTATION.md).
- [최종 점검 TODO](design/UI_UX_FINAL_TODO.md).
- [현장 피드백 계획](design/FIELD_FEEDBACK_PLAN.md): 제안·요구 목록. 반영 여부는 별도 확인.

## 개발 자동화·전달 프롬프트

- [AI 워크플로우 설계](workflows/AI_WORKFLOW_DESIGN.md): 역할·상태·증거·QA·도입 순서.
- [출시 조사 프롬프트](prompts/APP_RELEASE_RESEARCH_PROMPT.md).
- [서버 이메일 설정 전달 프롬프트](prompts/CLAUDE_SERVER_EMAIL_SETUP.md).

프롬프트와 기록 속 명령은 참고 자료다. 문서를 열거나 분류했다는 이유로 서버 변경·배포·메시지 전송을 실행하지 않는다.

## 과거 기록

아래 문서는 작성 당시의 변경·조사 기록이다. 과거 성공·미배포 표시는 당시의 상태이며 현재 상태를 보증하지 않는다.

| 분류 | 기록 |
|---|---|
| 리팩터링 | [10/13 감사](archive/refactor/REFACTOR_AUDIT_2026-10-13.md), [10/14 재검증](archive/refactor/REFACTOR_AUDIT_2026-10-14.md), [정리 결과](archive/refactor/REFACTOR_CLEANUP_2026-10-14.md) |
| 인증·출시 | [인증 구현](archive/release/RELEASE_AUTH_PROGRESS_2026-10-14.md), [초기 출시 점검](archive/release/RELEASE_CHECKLIST_2026-10-14.md) |
| 수정 기록 | [10/14 수정](archive/release/RELEASE_FIXES_2026-10-14.md), [10/15 수정](archive/release/RELEASE_FIXES_2026-10-15.md), [보고서·경로 변경](archive/release/REPORT_ROUTE_UPDATES_2026-10-15.md) |
| 지도 조사 | [차량 접근점·우회 경로 분석](archive/navigation/NAVIGATION_FINDINGS_2026-10-14.md) |
| UI 검토 | [Figma 검토](archive/design/FIGMA_UX_UI_REVIEW.md), [초기 프론트 개편](archive/design/FRONTEND_REDESIGN_NOTES.md) |

## 발표 준비 참고자료

- [코드 기준 발표 기능 전체 목록](research/PANG3_PRESENTATION_FEATURE_INVENTORY_2026-10-22.md): 앱·웹·서버·보고서 기능과 설정 필요·비활성·미연결 항목. 발표 기능 선택용.
- [FairDay 7·8번 내용 후보](research/PANG3_FAIRDAY_SECTIONS_7_8_2026-10-22.md): 현재 개발·검증 현황과 다음 단계의 근거·발표 문장.
- [FairDay 발표 사례 조사](research/PANG3_FAIRDAY_PRESENTATION_RESEARCH_2026-10-20.md): 유사 프로젝트의 실제 발표 PDF, 시연 구성, 전달 방식과 PANG3 적용 제안. PPT 제작 전 참고용.
- [발표 참고자료 목록](research/PRESENTATION_REFERENCE_INDEX.md): 원문 링크, 추천 페이지·영상 구간, 로컬 보관 자료와 확인 범위.

## 앞으로 문서를 추가할 때

1. 루트에는 README를 유지하고 프로젝트 공용 문서는 이 구조에 넣는다. 각 모듈의 README는 해당 모듈 옆에 둔다.
2. 같은 주제는 기존 문서를 갱신한다. 날짜별 기록이 필요하면 `archive/<분류>/`에 보관하고 관련 문서에서 연결한다.
3. 실행 방법·정책·계약과 일회성 작업 기록을 구분한다. 작성일·상태·검증 범위를 명시한다.
4. 문서 링크는 문서 위치 기준 상대 경로를 사용한다. 본문의 코드 경로·명령은 별도 설명이 없으면 저장소 루트 기준이다.
5. 문서를 이동하면 링크와 전달 프롬프트의 경로를 함께 수정하고 이 목차에서 찾을 수 있게 한다.
6. 개인용 Git 제외 문서는 개인 파일로 유지한다. 이번 정리에서는 루트의 개인 계획·포트폴리오·UI 지침을 이동하거나 추적에 추가하지 않았다.
