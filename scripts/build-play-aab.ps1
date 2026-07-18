$ErrorActionPreference = "Stop"

$projectRoot = Resolve-Path "$PSScriptRoot\.."
$androidRoot = "$projectRoot\android"
$signingFile = "$androidRoot\keystore.properties"
if (-not (Test-Path $signingFile)) {
  throw "업로드 서명 설정이 없습니다. 먼저 npm run android:create-upload-key를 실행하세요."
}

$jdk = Get-ChildItem -Path "$projectRoot\.tools\jdk" -Directory |
  Where-Object { Test-Path "$($_.FullName)\bin\java.exe" } |
  Select-Object -First 1
if (-not $jdk) { throw "프로젝트 전용 Java를 찾을 수 없습니다: .tools/jdk" }

$env:JAVA_HOME = $jdk.FullName
$env:PATH = "$($jdk.FullName)\bin;$env:PATH"
$env:ANDROID_HOME = "$projectRoot\.tools\android-sdk"
$env:GRADLE_USER_HOME = "$projectRoot\.tools\gradle-home"
$env:NO_GCE_CHECK = "true"
New-Item -ItemType Directory -Force -Path $env:GRADLE_USER_HOME | Out-Null

Push-Location $projectRoot
try {
  & npm.cmd run android:prepare
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

  & npm.cmd test
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

  Push-Location $androidRoot
  try {
    & .\gradlew.bat bundleRelease lintRelease --no-daemon --console=plain
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  } finally {
    Pop-Location
  }

  $aab = "$androidRoot\app\build\outputs\bundle\release\app-release.aab"
  if (-not (Test-Path $aab)) { throw "AAB가 생성되지 않았습니다." }

  # jarsigner 출력에는 자체 서명 인증서/타임스탬프 관련 경고가 포함될 수 있어
  # 화면에는 노출하지 않고 실제 검증 결과와 인증서 일치 여부를 따로 확인한다.
  $signatureCheck = (& "$($jdk.FullName)\bin\jarsigner.exe" -verify $aab 2>$null | Out-String)
  if ($LASTEXITCODE -ne 0) {
    throw "AAB 서명 검증에 실패했습니다."
  }

  $signingProperties = @{}
  Get-Content $signingFile | ForEach-Object {
    if ($_ -match '^([^#][^=]*)=(.*)$') {
      $signingProperties[$matches[1]] = $matches[2]
    }
  }
  $keyPath = Join-Path $androidRoot $signingProperties['storeFile']
  $env:PODOAL_VERIFY_STORE_PASSWORD = $signingProperties['storePassword']
  $previousErrorActionPreference = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  try {
    $keyCertificate = (& "$($jdk.FullName)\bin\keytool.exe" -list -v `
      -keystore $keyPath `
      -storepass:env PODOAL_VERIFY_STORE_PASSWORD `
      -alias $signingProperties['keyAlias'] 2>&1 | Out-String)
    $keytoolListExitCode = $LASTEXITCODE

    $bundleCertificate = (& "$($jdk.FullName)\bin\keytool.exe" -printcert -jarfile $aab 2>&1 | Out-String)
    $keytoolBundleExitCode = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $previousErrorActionPreference
    Remove-Item Env:PODOAL_VERIFY_STORE_PASSWORD -ErrorAction SilentlyContinue
  }

  if ($keytoolListExitCode -ne 0) { throw "업로드 키 인증서를 읽지 못했습니다." }
  if ($keytoolBundleExitCode -ne 0) { throw "AAB 인증서를 읽지 못했습니다." }

  $fingerprintPattern = '(?i)(SHA-256|SHA256)\s*:\s*([0-9A-F:]+)'
  $keyFingerprint = [regex]::Match($keyCertificate, $fingerprintPattern)
  $bundleFingerprint = [regex]::Match($bundleCertificate, $fingerprintPattern)
  if (-not $keyFingerprint.Success -or -not $bundleFingerprint.Success) {
    throw "서명 인증서 지문을 확인하지 못했습니다."
  }
  if ($keyFingerprint.Groups[2].Value -ne $bundleFingerprint.Groups[2].Value) {
    throw "AAB가 현재 업로드 키로 서명되지 않았습니다."
  }

  Write-Host "Google Play 업로드용 AAB를 만들고 서명을 확인했습니다: $aab"
} finally {
  Remove-Item Env:NO_GCE_CHECK -ErrorAction SilentlyContinue
  Pop-Location
}
