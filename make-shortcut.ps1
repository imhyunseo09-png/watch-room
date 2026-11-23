# 바탕화면에 "같이 보는 방" 바로가기(아이콘 포함)를 만든다.
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$exe = Join-Path $here 'node_modules\electron\dist\electron.exe'
if (-not (Test-Path $exe)) {
  Write-Host '처음이라 필요한 파일을 설치합니다. 잠시만 기다려 주세요...'
  Push-Location $here; npm install; Pop-Location
}
$lnk = Join-Path ([Environment]::GetFolderPath('Desktop')) '같이 보는 방.lnk'
$s = (New-Object -ComObject WScript.Shell).CreateShortcut($lnk)
$s.TargetPath = $exe
$s.Arguments = '.'
$s.WorkingDirectory = $here
$s.IconLocation = (Join-Path $here 'icons\icon.ico') + ',0'
$s.Description = '같이 보는 방'
$s.Save()
Write-Host "바탕화면에 바로가기를 만들었어요: $lnk"
