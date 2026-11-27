param(
    [string]$Compiler,
    [string]$OutputDirectory = "$PSScriptRoot/../dist"
)

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path "$PSScriptRoot/..").Path
$version = (Get-Content -Raw "$root/VERSION").Trim()
$desktop = Get-Item "$root/dist/ExcelUtils/ExcelUtils.exe"
if ($desktop.VersionInfo.ProductVersion -cne $version) {
    throw "Rebuild Excel Utils $version before packaging. Found $($desktop.VersionInfo.ProductVersion)."
}

if (!$Compiler) {
    $Compiler = (Get-Command ISCC.exe -ErrorAction SilentlyContinue).Source
}
if (!$Compiler) {
    $Compiler = @("${env:ProgramFiles(x86)}/Inno Setup 6/ISCC.exe", "$env:ProgramFiles/Inno Setup 6/ISCC.exe") |
        Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } | Select-Object -First 1
}
if (!$Compiler) { throw 'Inno Setup 6.7 is required. Set -Compiler to the path to ISCC.exe.' }

$out = (New-Item -Force -ItemType Directory $OutputDirectory).FullName
& $Compiler "/O$out" "$root/packaging/windows/ExcelUtils.iss"
if ($LASTEXITCODE) { throw 'Inno Setup failed to build the installer.' }

$installer = Get-Item "$out/ExcelUtils-Setup-x64.exe"
if ($installer.VersionInfo.ProductVersionRaw -ne [version]"$version.0" -or $installer.Length -gt 2GB) {
    throw 'The installer version or size is incompatible with the updater.'
}
[ordered]@{
    version = $version
    sha256 = (Get-FileHash -LiteralPath $installer.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
    size = $installer.Length
} | ConvertTo-Json | Set-Content -Encoding utf8NoBOM "$out/update.json"
