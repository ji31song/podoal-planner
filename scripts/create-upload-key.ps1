$ErrorActionPreference = "Stop"

$projectRoot = Resolve-Path "$PSScriptRoot\.."
$jdk = Get-ChildItem -Path "$projectRoot\.tools\jdk" -Directory |
  Where-Object { Test-Path "$($_.FullName)\bin\keytool.exe" } |
  Select-Object -First 1

if (-not $jdk) {
  throw "프로젝트 전용 Java를 찾을 수 없습니다: .tools/jdk"
}

$keyDirectory = "$projectRoot\android\keys"
$keyPath = "$keyDirectory\podoal-upload-key.jks"
$signingFile = "$projectRoot\android\keystore.properties"

if ((Test-Path $keyPath) -or (Test-Path $signingFile)) {
  throw "기존 업로드 서명 설정이 있습니다. 안전을 위해 자동으로 덮어쓰지 않습니다."
}

New-Item -ItemType Directory -Force -Path $keyDirectory | Out-Null

# 비밀번호는 채팅이나 명령줄 인수에 직접 작성하지 않고 실행 시 안전한 난수로 생성한다.
$passwordBytes = New-Object byte[] 24
$random = [System.Security.Cryptography.RandomNumberGenerator]::Create()
try {
  $random.GetBytes($passwordBytes)
} finally {
  $random.Dispose()
}
$password = -join ($passwordBytes | ForEach-Object { $_.ToString("x2") })
$env:PODOAL_UPLOAD_KEY_PASSWORD = $password

try {
  & "$($jdk.FullName)\bin\keytool.exe" `
    -genkeypair `
    -v `
    -keystore $keyPath `
    -storetype JKS `
    -storepass:env PODOAL_UPLOAD_KEY_PASSWORD `
    -keypass:env PODOAL_UPLOAD_KEY_PASSWORD `
    -alias podoal-upload `
    -keyalg RSA `
    -keysize 2048 `
    -validity 10000 `
    -dname "CN=Jisong, OU=Podoal Planner, O=Jisong, L=Seoul, ST=Seoul, C=KR"
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

  $properties = @(
    "storeFile=keys/podoal-upload-key.jks"
    "storePassword=$password"
    "keyAlias=podoal-upload"
    "keyPassword=$password"
    ""
  ) -join [Environment]::NewLine
  [System.IO.File]::WriteAllText($signingFile, $properties, (New-Object System.Text.UTF8Encoding($false)))

  Write-Host "Google Play 업로드용 서명 키와 로컬 서명 설정을 만들었습니다."
  Write-Host "android/keys와 android/keystore.properties를 안전한 별도 장소에 함께 백업하세요."
} catch {
  if (Test-Path $keyPath) { Remove-Item -LiteralPath $keyPath -Force }
  if (Test-Path $signingFile) { Remove-Item -LiteralPath $signingFile -Force }
  throw
} finally {
  Remove-Item Env:PODOAL_UPLOAD_KEY_PASSWORD -ErrorAction SilentlyContinue
  $password = $null
  [Array]::Clear($passwordBytes, 0, $passwordBytes.Length)
}
