PANG3 Android Development Build 전환본

변경 사항
- Expo Go용 음성 녹음 -> Android/iOS 네이티브 음성 인식(expo-speech-recognition)
- 음성 입력 시 /api/speech/transcribe 및 Gemini STT를 호출하지 않음
- Expo SDK 57 Development Build용 expo-dev-client 추가
- Android RECORD_AUDIO 권한 및 speech-recognition config plugin 추가
- Android package: com.pang3.fieldworkhelper
- EAS development/preview APK, production AAB 프로필 추가

처음 한 번 실행
1. frontend 폴더에서 npm install
2. npx expo install --fix
3. npx eas-cli@latest login
4. npx eas-cli@latest build --platform android --profile development

빌드가 끝나면 생성된 APK를 휴대폰에 설치.
그 뒤 개발 실행은 frontend 폴더에서:
  npx expo start --dev-client

주의
- 이 버전의 음성 입력은 Gemini API Key/MIME 문제와 무관하게 휴대폰의 네이티브 음성 인식 서비스를 사용함.
- 기존 AI 보고서 생성 기능은 백엔드/Gemini 구조를 그대로 유지함.
- package-lock.json은 의존성 전환 때문에 제거되어 있음. npm install 시 새로 생성됨.
