# 고객센터 공통 문의함

## 동작

- 앱의 고객센터 → 문의하기에서 `문의하기 / 문의 내역` 탭을 제공한다.
- 문의를 DB에 저장한 뒤 운영 메일에 `[핀워크 문의]` 알림을 보낸다. SMTP 오류가 나도 저장된 문의는 접수된다. 서버 로그에는 메일 오류와 문의 번호만 기록하며 본문과 비밀번호를 기록하지 않는다.
- 운영자는 기존 웹의 `/admin/support`에서 공통 문의함을 사용한다. 그룹 선택과 독립된 화면이다. 로그인 전 접근했다면 로그인 후 문의함으로 돌아온다.
- 모든 운영자가 같은 문의를 조회한다. 답변은 한 번 등록하며 담당자와 시간을 기록한다. 동시에 등록하면 첫 답변만 반영되고 다른 요청에는 409를 반환한다.
- 사용자는 자신의 문의와 답변만 조회한다. 운영자 이름·회원번호는 사용자 응답에 노출하지 않는다. HTML은 실행하지 않고 일반 텍스트로 표시한다.
- 관리자 목록과 앱 문의 내역은 진입·새로고침·조회 조건 변경·등록/답변 완료 시 조회한다. 주기적 자동 조회와 앱 활성화 시 자동 갱신은 하지 않는다. 새 답변은 새로고침 또는 문의 내역 재진입 시 확인한다. 푸시나 실시간 채팅은 포함하지 않는다.
- Gmail에 직접 답장한 내용은 앱에 저장되지 않는다. 앱에 표시할 답변은 관리자 문의함에서 등록한다.
- 문의 유형에 `대량 데이터 등록 요청`을 제공하며, 시설물 등록 신청 화면에서 문의하기를 안내한다. 문의 파일은 JPG·PNG·PDF·XLSX·CSV 최대 5개, 개별 15MiB, 합계 30MiB까지 첨부한다. 기존 JSON 접수도 유지하며 첨부가 있으면 `multipart/form-data`의 `inquiry` JSON 문자열과 반복 `files` 파트로 접수한다.
- 사진은 서버에서 다시 인코딩해 촬영 위치 등 원본 메타데이터를 제거하고 JPG로 저장한다. PDF는 확장자와 헤더를 확인한다. XLSX는 워크북·워크시트가 있는 ZIP 구조와 압축 해제 크기를 검사하며, CSV는 UTF-8·CP949 또는 BOM이 있는 UTF-16 텍스트인지 검사한다. XLSX·CSV 원본은 변환하지 않고 보관하며, 자동 시설물 등록은 수행하지 않는다. 서버는 파일을 웹페이지 안에서 실행하지 않고 다운로드로만 제공한다.
- 첨부는 기존 업로드 볼륨의 `support/{회원번호}/`에 무작위 이름으로 저장한다. 저장 실패·문의 트랜잭션 취소 시 함께 작성된 파일을 제거한다. 기존 업로드 설정의 계정별·전체 용량 한도를 첨부 보관함에도 적용한다.
- 파일은 앱의 내 문의 상세에서 열거나 관리자 상세에서 다운로드한다. 파일 URL에도 로그인과 문의 소유권 또는 운영자 권한을 검사한다. 메일에는 파일 개수만 표시하며 파일 자체는 관리자 문의함에서 확인한다.
- 기존 이메일 전송만 하던 문의는 과거 DB가 없으므로 가져오지 않는다. 새 서버 배포 후 접수한 문의부터 조회한다.

## 서버에서 내일 할 작업

1. DB 백업 후 `backend/sql/2026-10-29-support-inbox.sql` 적용 여부를 확인한다. 엑셀·CSV 첨부를 반영할 때는 `backend/sql/2026-10-29-support-data-attachments.sql`로 `content_type`을 100자로 확장한다. 현재 Hibernate `ddl-auto=update` 환경에서는 동일한 엔티티 테이블이 생성되지만 운영에서는 명시적인 스키마 확인을 권장한다.
2. 새 백엔드와 웹·앱 코드를 함께 배포한다. 관리자 주소는 **웹을 제공하는 도메인** 뒤에 `/admin/support`를 붙인다. 백엔드 주소와 웹 주소가 다르면 기존 웹의 `VITE_API_BASE_URL`과 CORS 설정을 사용한다. 이 경로는 SPA로 전달되어야 한다.
3. 팀원의 기존 회원번호를 확인한 뒤 필요한 계정에만 `SUPPORT_AGENT` 권한을 부여한다. 계정 지정 API나 앱 내 자가 승격 기능은 없다.

```sql
-- 실제 운영 DB에서 계정을 먼저 확인한다. 비밀번호를 입력하는 작업이 아니다.
SELECT user_id, login_id, name, role FROM users WHERE user_id = <확인한_회원번호>;
UPDATE users SET role = 'SUPPORT_AGENT'
WHERE user_id = <확인한_회원번호> AND role = 'USER';
-- 권한 회수:
-- UPDATE users SET role = 'USER' WHERE user_id = <회원번호> AND role = 'SUPPORT_AGENT';
```

`ADMIN` 역할도 문의함을 사용할 수 있지만 문의 담당자에게는 `SUPPORT_AGENT`를 사용한다. 역할은 매 API 요청에서 DB로 다시 확인하므로 권한 회수가 기존 로그인에도 적용된다. 메뉴 갱신에는 재로그인이 필요할 수 있다. 이번 개발 작업에서는 실제 계정을 변경하지 않는다.

4. 기존 SMTP 비밀 설정을 유지한다. 프록시·게이트웨이가 있다면 30MiB의 파일과 multipart 부가 정보를 받을 수 있도록 요청 크기 제한도 확인한다(예: 35MiB 이상). 기존 서버의 파일당 15MiB, 요청당 60MiB 제한은 유지한다. 메인 브랜치 반영 후 운영 백엔드 배포와 DB 적용은 별도로 수행한다.
5. 테스트 계정으로 문의 → 두 운영자의 조회 → 한 운영자의 답변 → 사용자 앱의 답변 확인을 수행한다. 다른 회원 계정에서는 해당 문의를 읽지 못하는지도 확인한다.

## API

| 경로 | 기능 |
|---|---|
| `POST /api/support/inquiries` | 문의 접수. `category`, 재시도 중복 방지용 `requestKey` 추가. 기존 필드도 유지 |
| `GET /api/support/inquiries?page=0` | 내 문의 목록, 한 페이지 20개 |
| `GET /api/support/inquiries/{id}` | 내 문의 본문과 답변 |
| `GET /api/support/inquiries/{id}/attachments/{attachmentId}` | 내 문의의 첨부파일 받기 |
| `GET /api/admin/support/inquiries?status=WAITING&page=0` | 공통 목록. status 생략 시 전체 |
| `GET /api/admin/support/inquiries/{id}` | 운영자 상세, 답변 담당자 포함 |
| `GET /api/admin/support/inquiries/{id}/attachments/{attachmentId}` | 운영자 첨부파일 받기 |
| `POST /api/admin/support/inquiries/{id}/answer` | `{ "answer": "답변", "version": 0 }`. 오래된 버전·이미 답변된 문의는 409 |

## 보관 및 삭제

문의하기 UI에는 필수 수집·이용 동의와 전문보기를 추가했다. 일반 문의 안내 초안은 **문의 처리 완료일부터 최대 1년 보관 후 파기**이며, 목적 달성으로 불필요해지면 조기 파기하고 법정 보관 대상은 해당 기간 별도 보관한다. 미동의 상태에서는 앱에서 접수를 차단하고 동의 여부와 안내 버전(`support-2026-10-29-v1`)을 요청에 포함한다.

**보관 안내와 동의 체크의 현재 변경 범위는 UI다. 서버의 동의 증적 저장·검증 및 1년 만료 후 자동 파기·법정 보관 대상 분리는 아직 구현하지 않았다.** 이 안내를 운영 배포하기 전에 실제 데이터 처리 및 개인정보처리방침을 일치시켜야 한다. DB 외에 첨부파일 볼륨, 운영 Gmail의 문의 사본 및 백업도 함께 검토한다. 앱 목록에서 숨기는 것만으로 데이터가 삭제되지는 않는다.

## 검증

- 서버: `mvn -o -Dtest=SupportInquiryServiceTest,ReleaseAuthIntegrationTest test`
- 앱: `node scripts/support-inquiry-test.cjs`, `node scripts/support-inbox-test.cjs`
- 웹: `npm run build`
