$ErrorActionPreference = "Stop"

$projectRoot = Resolve-Path "$PSScriptRoot\.."
$jdk = Get-ChildItem -Path "$projectRoot\.tools\jdk" -Directory |
  Where-Object { Test-Path "$($_.FullName)\bin\java.exe" } |
  Select-Object -First 1

if (-not $jdk) {
  throw "프로젝트 전용 Java를 찾을 수 없습니다: .tools/jdk"
}

$env:JAVA_HOME = $jdk.FullName
$env:PATH = "$($jdk.FullName)\bin;$env:PATH"
$env:XDG_CONFIG_HOME = "$projectRoot\.tools\config"
$env:ANDROID_HOME = "$projectRoot\.tools\android-sdk"
$env:GRADLE_USER_HOME = "$projectRoot\.tools\gradle-home"
New-Item -ItemType Directory -Force -Path $env:XDG_CONFIG_HOME | Out-Null
New-Item -ItemType Directory -Force -Path $env:GRADLE_USER_HOME | Out-Null

Push-Location $projectRoot
try {
  & npm.cmd run test:security
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

  & npm.cmd run test:functions
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

  & npm.cmd run test:rules
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

  Push-Location "$projectRoot\android"
  try {
    & .\gradlew.bat assembleDebug
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  } finally {
    Pop-Location
  }
} finally {
  Pop-Location
}
