$ErrorActionPreference = 'Stop'
$folder = Split-Path -Parent $MyInvocation.MyCommand.Path
$certificatePath = Join-Path $folder 'Notch-Appx-Certificate.cer'
$packageFile = Get-ChildItem -LiteralPath $folder -Filter 'Notch-*-browser-media.appx' -File |
  Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $packageFile) { throw 'The Notch AppX package was not found next to this installer.' }
$packagePath = $packageFile.FullName
$versionText = $packageFile.BaseName -replace '^Notch-(.+)-browser-media$', '$1'
if ($versionText.Split('.').Count -eq 3) { $versionText += '.0' }
try { $targetVersion = [version]$versionText }
catch { throw "Could not read the package version from '$($packageFile.Name)'." }
if (-not (Test-Path -LiteralPath $certificatePath)) { throw 'The Notch publisher certificate is missing.' }

Write-Host 'This installs Notch and trusts its self-signed publisher certificate for your Windows account.'
if ((Read-Host 'Type YES to continue') -cne 'YES') { Write-Host 'Cancelled.'; exit 0 }

$certificate = [System.Security.Cryptography.X509Certificates.X509Certificate2]::new($certificatePath)
$trusted = Get-ChildItem Cert:\CurrentUser\TrustedPeople | Where-Object Thumbprint -eq $certificate.Thumbprint
if (-not $trusted) { Import-Certificate -FilePath $certificatePath -CertStoreLocation Cert:\CurrentUser\TrustedPeople | Out-Null }

$installed = Get-AppxPackage -Name NotchDesktop
if (-not $installed) {
  Add-AppxPackage -Path $packagePath
} elseif ([version]$installed.Version -ne $targetVersion) {
  Add-AppxPackage -Path $packagePath -ForceUpdateFromAnyVersion
}

$package = Get-AppxPackage -Name NotchDesktop
if (-not $package) { throw 'Notch did not appear in the Windows app list after installation.' }
Start-Process explorer.exe -ArgumentList "shell:AppsFolder\$($package.PackageFamilyName)!NotchDesktop"
