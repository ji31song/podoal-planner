# 포도알플래너 보안 메모

## 저장소에 넣지 않는 파일

- 앱 서명 키(`.jks`, `.keystore`, `.p12`, `.pem`)
- Firebase 또는 Google Cloud 서비스 계정 JSON
- Firebase CLI 토큰과 환경 변수 파일
- APK, AAB, 빌드 폴더와 실행 로그

이 파일들은 `.gitignore`에서 제외하며 `npm run test:security`로 실수로 포함된 비밀정보가 없는지 검사한다. 검사는 의심 파일의 경로만 표시하고 값은 출력하지 않는다.

## Firebase 클라이언트 설정

`firebase-config.js`와 `android/app/google-services.json`에 들어 있는 Firebase 웹·Android 클라이언트 식별자는 앱 실행에 필요하고 설치 파일에서도 확인할 수 있으므로 서버 비밀번호로 취급하지 않는다. 이 값만으로 데이터 접근 권한을 주지 않으며 다음 보호 장치를 함께 사용한다.

- Firebase Authentication 로그인
- 가족별 Realtime Database 보안 규칙
- Android App Check와 Play Integrity
- 서버 함수의 사용자·역할·최근 로그인 재검사

가족을 처음 만드는 계정은 Google 로그인이 확인된 경우에만 데이터베이스 규칙상 새 가족을 만들 수 있다. 초대 구성원은 Google 계정 대신 Firebase 익명 참여 계정의 고유 UID를 사용하며, 서버 함수에서 48시간 초대 코드와 계정별·네트워크별 시도 제한을 검사한다. 네트워크 제한에는 IP 주소 원문이 아니라 일방향 변환값만 사용한다.

서비스 계정 개인 키, 앱 서명 키, Firebase CLI 토큰은 클라이언트 설정과 다르며 절대로 저장소나 앱에 포함하지 않는다.

## 운영 확인

- Google Cloud Console에서 클라이언트 API 키가 Firebase 사용 API로만 제한되어 있는지 확인한다.
- Play App Signing을 시작하면 Google Play가 발급한 앱 서명 SHA-256을 Firebase App Check에 추가한다.
- 배포 전 `npm run test:security`와 AAB 내부 검사를 실행한다.

## 서버 라이브러리 보안 감사

- 2026-07-18에 Firebase Admin과 Firebase Functions를 Node.js 22 호환 최신 안정 버전으로 갱신했다.
- 운영 의존성 감사 결과 높은 위험과 치명적 위험은 0건이다.
- 중간 위험 7건은 최신 Firebase Admin이 간접 포함하는 Cloud Storage 보조 라이브러리와 `uuid` 경고에서 이어진다.
- 현재 서버 코드는 Cloud Storage와 경고 대상인 UUID v3·v5·v6 버퍼 입력 기능을 사용하지 않는다.
- npm의 자동 권고는 최신 Firebase를 오래된 주 버전으로 되돌리는 방식이므로 적용하지 않는다. 선언된 호환 범위를 벗어난 간접 라이브러리 강제 교체도 하지 않는다.
- Firebase Admin 또는 `@google-cloud/storage` 새 버전이 이 의존성을 갱신하면 다시 감사하고 정상 업데이트한다.

## 개발·배포 도구 보안 감사

- Firebase CLI를 15.24.0으로 갱신해 높은 위험과 치명적 위험을 0건으로 낮췄다.
- 남은 중간 위험 5건은 로컬에서만 사용하는 Firebase CLI의 간접 라이브러리 경고이며 Android 앱과 Cloud Functions 운영 코드에는 포함되지 않는다.
- 강제 자동 수정은 Firebase CLI를 다른 주 버전으로 바꾸므로 적용하지 않고, 새 보안 수정 버전이 나오면 정상 업데이트 후 전체 테스트를 다시 실행한다.
