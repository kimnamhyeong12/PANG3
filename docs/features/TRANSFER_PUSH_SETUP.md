# 업무 이관 Push 알림

## 수정 사항

- Firebase 파일은 `expo.android.googleServicesFile`에 지정한다. `expo-build-properties` 옵션에 넣으면 Google Services 플러그인이 적용되지 않는다.
- 업무 이관 요청을 저장한 트랜잭션이 커밋되면 수신자에게 알림을 보낸다.
- 수락/거절 결과는 보낸 사람에게 알린다. 같은 응답을 재시도해도 중복 발송하지 않는다.
- 알림을 누르면 해당 그룹의 업무 이관 탭으로 이동한다. 앱 종료 상태에서 누른 알림도 로그인 및 업무공간 복원 후 처리한다.
- 알림 권한을 설정 앱에서 변경한 뒤 앱으로 돌아오면 Push Token 등록을 다시 시도한다.

## 각 개발 PC에서 새 APK 만들기

`frontend`에서 실행한다. `android` 폴더는 Git에서 제외되므로 pull만으로 네이티브 설정은 갱신되지 않는다.

```powershell
npm install
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
npx expo prebuild --platform android --no-install
cd android
.\gradlew.bat :app:processReleaseGoogleServices :app:assembleRelease
```

`android/app/build/generated/res/processReleaseGoogleServices/values/values.xml`에 `google_app_id`와 `gcm_defaultSenderId`가 생성되어야 한다. 파일 복사만으로는 이 리소스가 생성되지 않는다.

APK: `frontend/android/app/build/outputs/apk/release/app-release.apk`

개발용 설치는 prebuild 후 `npx expo run:android --device`로 진행한다. 동일한 서명의 기존 앱에는 업데이트 설치할 수 있다. 앱 삭제는 필수 단계가 아니다.

## 서버 및 실기기 확인

1. 수정한 `TaskTransferService`가 포함된 백엔드를 빌드하고 배포해야 한다. 앱 재설치만으로 서버 변경은 반영되지 않는다.
2. 수신자 휴대폰에 새 APK를 설치하고 수신자 계정으로 로그인한다. Android 알림 권한과 앱 내 업무 알림을 켠다.
3. `[Notification DEBUG] 토큰 등록 결과`에서 `success: true`를 확인한다. 실패 시 `[Notification] Expo Push Token 발급 실패` 또는 서버 등록 실패 로그를 확인한다.
4. 발신자가 새 이관 요청을 보내면 수신자에게 알림이 와야 한다. 알림을 눌러 해당 그룹의 이관 탭에서 수락/거절하고, 발신자에게 결과 알림이 오는지 확인한다.
5. 앱이 열려 있을 때, 백그라운드일 때, 종료 후 알림을 눌렀을 때를 각각 확인한다.

Firebase 초기화와 토큰 등록까지 성공했는데 전달되지 않으면 Expo 프로젝트의 FCM V1 서버 자격 증명도 같은 Firebase 프로젝트인지 확인한다. `google-services.json`은 클라이언트 설정이며 서버 자격 증명을 대체하지 않는다. 서버의 `[Notification] Expo Push ticket 오류`도 함께 확인한다.

공식 설정 안내: https://docs.expo.dev/push-notifications/fcm-credentials/

실기기 로그를 좁혀 볼 때는 아래처럼 앱 프로세스만 선택한다. 앱이 실행 중이어야 한다.

```powershell
$adb = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
$appProcessId = (& $adb shell pidof -s com.pang3.fieldworkhelper).Trim()
if ($appProcessId) { & $adb logcat "--pid=$appProcessId" 'ReactNativeJS:V' 'FirebaseApp:V' 'FirebaseMessaging:V' '*:S' }
```
