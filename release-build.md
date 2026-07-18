# Google Play AAB 만들기

## 현재 설정

- 패키지 이름: `com.jisong.podoalplanner`
- 최초 출시 버전: `1.0.0`
- 버전 코드: `1`
- 버전은 `android/version.properties` 한 곳에서 관리한다.
- 출시판은 코드 축소를 사용하고 Android 테스트용 App Check를 포함하지 않는다.

## 최초 한 번: 업로드 키 준비

1. PowerShell에서 `npm run android:create-upload-key`를 실행한다.
2. 화면의 질문에 비밀번호를 직접 입력한다. 비밀번호를 채팅, 소스 코드, 이메일에 적지 않는다.
3. `android/keystore.properties.example`을 `android/keystore.properties`로 복사한다.
4. 방금 정한 비밀번호를 `storePassword`와 `keyPassword`에 입력한다.
5. `android/keys` 폴더와 비밀번호를 암호화된 별도 저장소에 백업한다.

업로드 키와 `keystore.properties`는 Git에서 자동 제외된다. 기존 키가 있으면 생성 스크립트는 덮어쓰지 않는다.

## AAB 만들기

PowerShell에서 `npm run android:release`를 실행한다. 이 명령은 웹 파일 동기화, 보안 검사, 서버·보안 규칙 검사, Android 빌드, 릴리스 품질 검사와 서명 확인을 순서대로 수행한다.

완성 파일은 `android/app/build/outputs/bundle/release/app-release.aab`이다.

## Google Play 첫 등록 뒤 꼭 할 일

Play App Signing을 사용하고, Play Console의 앱 서명 인증서 SHA-256을 Firebase Android 앱과 App Check에 등록한다. 로컬 업로드 키의 SHA-256과 Google Play 앱 서명 키의 SHA-256은 서로 다를 수 있다.

업데이트를 올릴 때는 `android/version.properties`의 `VERSION_CODE`를 반드시 1씩 올리고, 사용자에게 보이는 버전이 바뀌면 `VERSION_NAME`도 변경한다.
