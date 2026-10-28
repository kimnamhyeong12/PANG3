# 외근도우미 모바일 앱

Expo/React Native 앱의 진입점은 App.js다. 화면 전환은 이 파일에서 관리하며 Expo Router 샘플 화면은 사용하지 않는다.

## 개발 실행

frontend 폴더에서 npm ci 후 npm start를 실행한다. 지도·음성 인식·차량 안내 등을 확인하려면 네이티브 모듈이 포함된 development build를 사용한다.

Android/iOS 빌드 구성은 app.json, app.config.js, eas.json 및 ANDROID_BUILD_README.txt를 참고한다. 네이티브 의존성이 변경되면 앱을 다시 빌드해야 한다.

## 코드 위치

- screens/: 현재 사용하는 앱 화면
- components/: 지도, 장소 검색, 사진 편집, 일괄 등록 등
- utils/workRegion.js: 전국 시·도/시·군·구 선택과 지역별 행정동 경계 조회
- utils/, services/: 경로·업무 계획·보고서·알림 처리
- modules/kakao-navigation/: Android 차량 미리보기·안내 및 알림 생명주기
- scripts/*-test.cjs: Node로 실행하는 기능 검증 스크립트

음성 메모는 expo-speech-recognition으로 처리한다. 이전 Gemini 서버 음성 변환 API는 폐기했으며 사진 분석·AI 보고서 생성 엔진은 유지한다.

예제 전용 router·animation·haptics·browser·status-bar 직접 의존성을 제거했다. react-native-safe-area-context는 실제 화면에서 사용하므로 직접 의존성으로 유지한다.

## 고객센터와 앱 정보

- 설정의 서비스 안내에는 공지사항, 고객센터와 앱 정보를 표시한다. 공지사항은 등록된 내용이 없는 빈 목록으로 유지한다. 미확정 정책 문서는 표시하지 않으며 출시용 약관·개인정보 문서 준비는 별도 작업이다.
- FAQ 문구는 `components/CustomerSupportContent.js`에서 관리한다. 문의 유형은 기존 문의 API의 본문에 포함하므로 서버 변경 없이 운영 메일에서 확인할 수 있다.
- 문의 메일은 기존 `/api/support/inquiries`를 이용한다. 배포 서버에는 `SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD`, `FIELDWORK_AUTH_MAIL_FROM` 설정이 필요하다. 실제 메일 수신 여부는 해당 환경에서 확인해야 한다.
- 스토어 등록 후 `app.json`의 `expo.extra.playStoreUrl`과 `expo.extra.appStoreUrl`에 실제 스토어 주소를 넣으면 앱 정보에 업데이트 확인 버튼이 표시된다. 주소가 없으면 배포 준비 안내를 표시한다.
- JavaScript 패키지 고지는 `node scripts/generate-open-source-licenses.cjs`로 설치된 운영 의존성에서 생성한다. 의존성 변경 후 다시 실행한다. 네이티브 SDK의 별도 고지는 출시 전에 확인해야 한다.
- 캐시 삭제는 제공하지 않는다. 미전송 사진·작성 중인 기록·다운로드한 보고서를 삭제하는 동작도 추가하지 않는다.
- 검증: `node scripts/customer-support-info-test.cjs`, `node scripts/support-inquiry-test.cjs`.
