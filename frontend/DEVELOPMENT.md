# Android 개발자 빌드 실행

프로젝트의 `frontend` 폴더에서 실행한다.

```powershell
npm run android
```

이 명령은 `expo start --dev-client --lan --port 8081 --android`로 고정돼 있다.
휴대폰에 개발자 빌드가 설치돼 있고 USB 디버깅 연결이 승인돼 있어야 한다.
Expo는 Metro 서버를 준비한 뒤 Android 실행 과정에서 ADB reverse를 설정한다.
서버만 필요하면 `npm start`를 사용한다. 동일하게 LAN 모드와 8081 포트를 사용한다.

## 실행 시 지킬 사항

- `--localhost`로 바꾸지 않는다. 이 Windows 환경에서는 서버가 IPv6 `::1`에만 열려 휴대폰의 `127.0.0.1:8081` 접속이 실패한 사례를 확인했다.
- 앱을 먼저 열지 말고 서버 준비를 기다린다. `http://127.0.0.1:8081/status`가 `packager-status:running`을 반환하는지 확인한다.
- 이미 서버가 실행 중이면 새 서버를 중복 실행하지 말고 해당 Metro 터미널에서 `a`로 Android 앱을 연다.
- 에이전트가 터미널 입력 없이 USB로 여는 경우, IPv4 상태 확인 후 아래 순서로 실행한다. `adb devices -l`에 기기가 여러 대면 각 명령에 `-s 기기번호`를 넣는다.

```powershell
adb reverse tcp:8081 tcp:8081
adb shell am start --user 0 -W -a android.intent.action.VIEW -d 'pang3://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8081' -p com.pang3.fieldworkhelper
```

확인된 오류는 `java.io.IOException: unexpected end of stream`이었다.
LAN 모드에서는 IPv4 요청이 정상 응답하고 실제 Android 번들 로딩과 화면 표시가 성공했다.
이 설정은 해당 연결 문제를 피하기 위한 것이며, USB 분리·서버 종료 등 다른 연결 실패까지 없애는 것은 아니다.
