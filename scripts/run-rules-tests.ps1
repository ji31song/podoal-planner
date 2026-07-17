$ErrorActionPreference = "Stop"

$jdk = Get-ChildItem -Path "$PSScriptRoot\..\.tools\jdk" -Directory |
  Where-Object { Test-Path "$($_.FullName)\bin\java.exe" } |
  Select-Object -First 1

if (-not $jdk) {
  throw "프로젝트 전용 Java를 찾을 수 없습니다: .tools/jdk"
}

$env:JAVA_HOME = $jdk.FullName
$env:PATH = "$($jdk.FullName)\bin;$env:PATH"
$env:XDG_CONFIG_HOME = "$PSScriptRoot\..\.tools\config"
New-Item -ItemType Directory -Force -Path $env:XDG_CONFIG_HOME | Out-Null

& npm.cmd run test:rules
exit $LASTEXITCODE
