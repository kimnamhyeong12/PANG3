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
