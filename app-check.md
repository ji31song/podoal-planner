# Firebase App Check 운영 메모

## 현재 적용 상태

- Android 디버그 빌드: Firebase Debug App Check 공급자 사용
- Android 출시 빌드: Google Play Integrity 공급자 사용
- Realtime Database: App Check 필수 적용
- Callable Cloud Functions: App Check 필수 적용
- App Check 토큰 수명: 1시간

디버그 공급자 선택은 Android의 `BuildConfig.DEBUG` 값으로 결정한다. 출시 빌드에서는 Play Integrity가 선택되며, 디버그 토큰을 앱 코드나 저장소에 기록하지 않는다.

## Google Play 내부 테스트 전 필수 확인

Google Play 앱 서명을 활성화하면 Play Console에서 **앱 서명 키 인증서의 SHA-256 지문**을 확인할 수 있다. 이 지문은 개발용 또는 업로드용 인증서와 다를 수 있다.

내부 테스트 버전을 배포하기 전에 다음 순서로 등록한다.

1. Google Play Console의 `앱 무결성` 화면에서 앱 서명 인증서 SHA-256 지문을 확인한다.
2. Firebase Console의 `프로젝트 설정 > 내 앱 > Android 앱`에 그 SHA-256 지문을 추가한다.
3. Firebase Console의 `App Check > 앱`에서 Android 앱의 공급자가 Play Integrity인지 확인한다.
4. Google Play 내부 테스트로 설치한 앱에서 로그인과 가족 데이터 읽기·쓰기를 시험한다.

## 보안 주의사항

- 디버그 토큰은 비밀번호처럼 취급하며 소스 코드, 문서, 채팅, 화면 캡처에 남기지 않는다.
- 개발 기기를 더 이상 사용하지 않거나 토큰 노출이 의심되면 Firebase Console에서 해당 디버그 토큰을 즉시 폐기한다.
- App Check는 Firebase Authentication과 데이터베이스 보안 규칙을 대체하지 않는다. 세 기능을 함께 유지한다.
