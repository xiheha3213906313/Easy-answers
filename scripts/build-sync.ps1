$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location (Resolve-Path (Join-Path $scriptDir ".."))

Write-Host "Building web assets..." -ForegroundColor Cyan
npm run build

Write-Host "Copying web assets to Android..." -ForegroundColor Cyan
npx cap copy android

Write-Host "Done." -ForegroundColor Green
