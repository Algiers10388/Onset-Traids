# ==============================================================================
# Autonomous Crypto Trading Agent - Windows PowerShell Runner
# ==============================================================================
$ErrorActionPreference = "Stop"

Write-Host "=== [1/3] Checking Node.js Environment ===" -ForegroundColor Cyan
if (!(Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "Node.js not detected. Please install Node.js from https://nodejs.org" -ForegroundColor Red
    exit 1
}

Write-Host "Node: $(node -v)" -ForegroundColor Green
Write-Host "NPM:  $(npm -v)" -ForegroundColor Green

Set-Location $PSScriptRoot

Write-Host "=== [2/3] Installing Dependencies ===" -ForegroundColor Cyan
if (!(Test-Path "node_modules")) {
    npm install
}

Write-Host "=== [3/3] Launching Autonomous Crypto Trading Agent ===" -ForegroundColor Cyan
npx tsx src/cli.ts $args
