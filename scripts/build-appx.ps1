$ErrorActionPreference = 'Stop'
$project = Split-Path -Parent $PSScriptRoot
$release = Join-Path $project 'Build-test\appx'
$pfx = Join-Path $release 'Notch-Appx-signing.tmp.pfx'
$cer = Join-Path $release 'Notch-Appx-Certificate.cer'
$rsa = $null
$certificate = $null
$buildCode = 1
$environmentNames = @('WIN_CSC_LINK', 'WIN_CSC_KEY_PASSWORD', 'ELECTRON_BUILDER_OFFLINE')
$previousEnvironment = @{}
foreach ($name in $environmentNames) {
  $previousEnvironment[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
}

try {
  New-Item -ItemType Directory -Force -Path $release | Out-Null
  $rsa = [System.Security.Cryptography.RSA]::Create(2048)
  $request = [System.Security.Cryptography.X509Certificates.CertificateRequest]::new(
    'CN=Notch', $rsa, [System.Security.Cryptography.HashAlgorithmName]::SHA256,
    [System.Security.Cryptography.RSASignaturePadding]::Pkcs1
  )
  $request.CertificateExtensions.Add([System.Security.Cryptography.X509Certificates.X509KeyUsageExtension]::new(
    [System.Security.Cryptography.X509Certificates.X509KeyUsageFlags]::DigitalSignature, $true
  ))
  $oids = [System.Security.Cryptography.OidCollection]::new()
  $null = $oids.Add([System.Security.Cryptography.Oid]::new('1.3.6.1.5.5.7.3.3'))
  $request.CertificateExtensions.Add([System.Security.Cryptography.X509Certificates.X509EnhancedKeyUsageExtension]::new($oids, $false))
  $certificate = $request.CreateSelfSigned([DateTimeOffset]::Now.AddMinutes(-5), [DateTimeOffset]::Now.AddYears(3))

  $password = [guid]::NewGuid().ToString('N')
  [IO.File]::WriteAllBytes($pfx, $certificate.Export([System.Security.Cryptography.X509Certificates.X509ContentType]::Pfx, $password))
  [IO.File]::WriteAllBytes($cer, $certificate.Export([System.Security.Cryptography.X509Certificates.X509ContentType]::Cert))
  $env:WIN_CSC_LINK = $pfx
  $env:WIN_CSC_KEY_PASSWORD = $password
  $env:ELECTRON_BUILDER_OFFLINE = 'true'

  Push-Location $project
  try {
    & (Join-Path $project 'node_modules\.bin\electron-builder.cmd') --config electron-builder.appx.yml
    $buildCode = $LASTEXITCODE
  } finally { Pop-Location }

  if ($buildCode -eq 0) {
    Copy-Item (Join-Path $PSScriptRoot 'Install-Notch.ps1') $release -Force
    Copy-Item (Join-Path $PSScriptRoot 'Install Notch.cmd') $release -Force
  }
} finally {
  foreach ($name in $environmentNames) {
    [Environment]::SetEnvironmentVariable($name, $previousEnvironment[$name], 'Process')
  }
  if (Test-Path -LiteralPath $pfx) { Remove-Item -LiteralPath $pfx -Force -ErrorAction SilentlyContinue }
  if ($certificate) { $certificate.Dispose() }
  if ($rsa) { $rsa.Dispose() }
}

if ($buildCode -ne 0) { exit $buildCode }
