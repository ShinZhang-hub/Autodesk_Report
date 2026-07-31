<#
.SYNOPSIS
  Download all.zip attachment from Office 365 email, extract CSV, and run analysis.
.DESCRIPTION
  Uses Microsoft Graph (device auth) to find the latest email matching sender/subject,
  saves the attachment, and runs the analysis pipeline to produce a new dated JSON.
.PARAMETER OutputDir
  Directory for output (default: ..\output).
.PARAMETER CsvSaveDir
  Directory to save the downloaded CSV (default: ..\downloads).
.EXAMPLE
  .\download-report.ps1
#>

param(
  [string]$OutputDir  = (Join-Path $PSScriptRoot "..\output"),
  [string]$CsvSaveDir = (Join-Path $PSScriptRoot "..\downloads")
)

# ═══════════════════════ CONFIG ═══════════════════════════════════════
$SenderEmail    = "sender@example.com"   # TODO: replace
$SubjectKeyword = "usage report"         # TODO: replace
$AttachmentName = "all.zip"
$CsvFileName    = "user_details.csv"
# ══════════════════════════════════════════════════════════════════════

$ErrorActionPreference = "Stop"

# ─── 1. Ensure Microsoft.Graph module ─────────────────────────────────
if (-not (Get-Module -ListAvailable -Name Microsoft.Graph)) {
  Write-Host "Installing Microsoft.Graph module (may take a while)..." -ForegroundColor Yellow
  Install-Module Microsoft.Graph -Scope CurrentUser -Force -AllowClobber
}

Import-Module Microsoft.Graph -ErrorAction Stop

# ─── 2. Authenticate (device code) ────────────────────────────────────
Write-Host "`nAuthenticating with Microsoft Graph..." -ForegroundColor Cyan
Write-Host "A browser will open. Sign in and enter the displayed code." -ForegroundColor Yellow
try {
  Connect-MgGraph -Scopes "Mail.Read" -UseDeviceAuthentication -ErrorAction Stop | Out-Null
} catch {
  Write-Host "Authentication failed: $_" -ForegroundColor Red
  exit 1
}
Write-Host "Authenticated." -ForegroundColor Green

# ─── 3. Find latest matching message ──────────────────────────────────
Write-Host "`nSearching for email from '$SenderEmail' / '$SubjectKeyword'..." -ForegroundColor Cyan

$filter = "from/emailAddress/address eq '$SenderEmail' and contains(subject,'$SubjectKeyword')"
$msg = Get-MgUserMessage -UserId "me" -Filter $filter -Top 1 -OrderBy "receivedDateTime desc" `
  -Property "id,subject,receivedDateTime,hasAttachments" -ErrorAction SilentlyContinue

if (-not $msg) {
  Write-Host "No matching email found." -ForegroundColor Red
  Disconnect-MgGraph | Out-Null
  exit 1
}

Write-Host "Latest: $($msg.Subject) ($($msg.ReceivedDateTime))" -ForegroundColor Green

# ─── 4. Get attachment ────────────────────────────────────────────────
if (-not $msg.HasAttachments) {
  Write-Host "Message has no attachments." -ForegroundColor Red
  Disconnect-MgGraph | Out-Null
  exit 1
}

$attachments = Get-MgUserMessageAttachment -UserId "me" -MessageId $msg.Id
$target = $attachments | Where-Object { $_.Name -eq $AttachmentName }

if (-not $target) {
  Write-Host "Attachment '$AttachmentName' not found. Available:" -ForegroundColor Red
  $attachments | ForEach-Object { Write-Host "  - $($_.Name)" }
  Disconnect-MgGraph | Out-Null
  exit 1
}

Write-Host "Downloading $AttachmentName ($([math]::Round($target.Size/1KB)) KB)..." -ForegroundColor Cyan

if (-not (Test-Path $CsvSaveDir)) { New-Item -ItemType Directory -Path $CsvSaveDir -Force | Out-Null }

$zipPath = Join-Path $CsvSaveDir "all.zip"
[System.IO.File]::WriteAllBytes($zipPath, $target.ContentBytes)
Write-Host "Saved: $zipPath" -ForegroundColor Green

Disconnect-MgGraph | Out-Null

# ─── 5. Extract CSV ──────────────────────────────────────────────────
Write-Host "Extracting CSV..." -ForegroundColor Cyan
$extractDir = Join-Path $CsvSaveDir "extracted"
if (Test-Path $extractDir) { Remove-Item -Recurse -Force $extractDir }
Expand-Archive -Path $zipPath -DestinationPath $extractDir

$csvFile = Get-ChildItem -Path $extractDir -Filter "*.csv" | Select-Object -First 1
if (-not $csvFile) {
  Write-Host "No CSV found in zip." -ForegroundColor Red
  exit 1
}

$destCsv = Join-Path $CsvSaveDir $CsvFileName
Copy-Item $csvFile.FullName $destCsv -Force
Remove-Item -Recurse -Force $extractDir
Write-Host "CSV saved to $destCsv" -ForegroundColor Green

# ─── 6. Run analysis ─────────────────────────────────────────────────
Write-Host "`nRunning analysis..." -ForegroundColor Cyan
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Push-Location $projectRoot
try {
  npx tsx src/main.ts --csv=$destCsv --team-filter=exact
} finally {
  Pop-Location
}

Write-Host "`nDone." -ForegroundColor Green
