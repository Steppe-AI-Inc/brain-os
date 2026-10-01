# ARTIFACT RELAY V0 - the founder's one command. It runs relay/install.mjs, which does the whole install (or the removal) on the
# dedicated NON-PRODUCTION Factory control plane and prints one PASS or FAIL.
#
#   .\relay\install.ps1 -Plan         print exactly what would change; needs no token and touches nothing
#   .\relay\install.ps1               install (safe to run again: it continues where it stopped)
#   .\relay\install.ps1 -Uninstall    remove what was installed
#
# The access token is asked for here, without echo, unless SUPABASE_ACCESS_TOKEN is already set. It is handed to the installer
# for this one run only: it is not written anywhere and it is removed from this session when the run ends.
param(
  [switch]$Plan,
  [switch]$Uninstall,
  [switch]$WithoutDirectorRecord,
  [switch]$LeaveBucket,
  [string]$VerifierRegistration
)
$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host 'ARTIFACT RELAY V0 INSTALL: STOPPED - Node.js 18 or later is required and was not found'
  exit 2
}
$installer = @((Join-Path $here 'install.mjs'))
if ($Plan) { $installer += '--plan' }
if ($Uninstall) { $installer += '--uninstall' }
if ($WithoutDirectorRecord) { $installer += '--without-director-record' }
if ($LeaveBucket) { $installer += '--leave-bucket' }
if ($VerifierRegistration) { $installer += '--verifier-registration'; $installer += $VerifierRegistration }

$asked = $false
if (-not $Plan -and -not $env:SUPABASE_ACCESS_TOKEN) {
  if (-not [Environment]::UserInteractive -or [Console]::IsInputRedirected) {
    Write-Host 'ARTIFACT RELAY V0 INSTALL: STOPPED - no access token. Run this in your own PowerShell window: it asks for the token without echo.'
    exit 2
  }
  $secure = Read-Host -AsSecureString 'Supabase access token for the Factory NON-PRODUCTION project (hidden; not stored)'
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try { $env:SUPABASE_ACCESS_TOKEN = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
  $asked = $true
}
try {
  & node @installer
  $code = $LASTEXITCODE
} finally {
  if ($asked) { Remove-Item Env:SUPABASE_ACCESS_TOKEN -ErrorAction SilentlyContinue }
}
exit $code
