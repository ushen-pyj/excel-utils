param(
    [string]$Runtime = "$env:ProgramFiles/ONLYOFFICE/DesktopEditors",
    [string]$QtDir = "$PSScriptRoot/../build/qt-sdk/5.15.2/msvc2019_64",
    [switch]$NativeOnly,
    [string]$ReleaseRepository = 'ushen-pyj/excel-utils'
)
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path "$PSScriptRoot/..").Path
$Runtime = (Resolve-Path $Runtime).Path
$QtDir = (Resolve-Path $QtDir).Path
if ((Get-Item "$Runtime/ascdocumentscore.dll").VersionInfo.FileVersion -ne '10.0.0.169') {
    throw 'This SDK expects the matching ONLYOFFICE Windows x64 runtime 10.0.0.169.'
}
$out = New-Item -Force -ItemType Directory "$root/dist/ExcelUtils"
$imports = New-Item -Force -ItemType Directory "$root/build/imports"
$vswhere = "${env:ProgramFiles(x86)}/Microsoft Visual Studio/Installer/vswhere.exe"
$vs = & $vswhere -latest -products '*' -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
if (!$vs) { throw 'Visual Studio x64 C++ Build Tools required.' }
Import-Module "$vs/Common7/Tools/Microsoft.VisualStudio.DevShell.dll"
Enter-VsDevShell -VsInstallPath $vs -SkipAutomaticLocation -DevCmdArguments '-arch=x64 -host_arch=x64' | Out-Null
foreach ($name in 'ascdocumentscore','qtascdocumentscore') {
    $exports = & dumpbin /nologo /exports "$Runtime/$name.dll"
    if ($LASTEXITCODE) { throw "dumpbin $name failed" }
    $symbols = foreach ($line in $exports) {
        if ($line -match '^\s*\d+\s+[0-9A-F]+\s+[0-9A-F]+\s+(\S+)') { $Matches[1] }
    }
    if (!$symbols) { throw "No exports in $name" }
    @("LIBRARY $name.dll",'EXPORTS') + $symbols | Set-Content -Encoding ascii "$imports/$name.def"
    & lib /nologo /machine:x64 "/def:$imports/$name.def" "/out:$imports/$name.lib" | Out-Null
    if ($LASTEXITCODE) { throw "Import library for $name failed" }
}
$native = "$root/build/native"
& cmake -S "$root/apps/desktop" -B $native -G Ninja "-DCMAKE_PREFIX_PATH=$QtDir" "-DSDK_IMPORT_DIR=$imports" "-DEXCELUTILS_RELEASE_REPOSITORY=$ReleaseRepository" '-DCMAKE_BUILD_TYPE=Release'
if ($LASTEXITCODE) { throw 'CMake configure failed' }
& cmake --build $native
if ($LASTEXITCODE) { throw 'Native build failed' }
Copy-Item "$native/ExcelUtils.exe" $out -Force
$csc = Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
$mergeSources = (Get-ChildItem -Path "$root/apps/desktop/header_merge/*.cs").FullName
& $csc /nologo /optimize+ /platform:x64 /codepage:65001 /target:exe "/out:$out/HeaderMerge.exe" /r:System.IO.Compression.dll /r:System.Xml.Linq.dll /r:System.Web.Extensions.dll $mergeSources
if ($LASTEXITCODE) { throw 'Header merge worker build failed' }
$researchSources = (Get-ChildItem "$root/apps/desktop/finance_operations/*.cs").FullName
$sharedSources = Get-Item "$root/apps/desktop/header_merge/SourceBook.cs","$root/apps/desktop/header_merge/ResultBook.cs"
& $csc /nologo /optimize+ /platform:x64 /codepage:65001 /target:exe "/out:$out/ResearchTools.exe" /r:System.IO.Compression.dll /r:System.Xml.Linq.dll /r:System.Web.Extensions.dll $researchSources $sharedSources.FullName
if ($LASTEXITCODE) { throw 'Finance operations worker build failed' }
$searchSource = Get-Item "$root/apps/desktop/workspace_search/WorkspaceIndex.cs"
& $csc /nologo /optimize+ /platform:x64 /codepage:65001 /target:exe "/out:$out/WorkspaceIndex.exe" /r:System.IO.Compression.dll /r:System.Xml.Linq.dll /r:System.Web.Extensions.dll $searchSource.FullName $sharedSources.FullName
if ($LASTEXITCODE) { throw 'Workspace search worker build failed' }
if ($NativeOnly) { return }

$page = New-Item -Force -ItemType Directory "$root/build/home"
& robocopy "$root/third_party/desktop-apps/common/loginpage" $page /E /NFL /NDL /NJH /NJS /NP | Out-Null
if ($LASTEXITCODE -ge 8) { throw 'Could not stage start page sources' }
Copy-Item "$root/apps/desktop/home/app.jsx" "$page/src/app.jsx" -Force
Copy-Item "$root/apps/desktop/home/workspace.css" "$page/src/workspace.css" -Force
Copy-Item "$root/apps/desktop/home/finance" "$page/src" -Recurse -Force
$fonts = New-Item -ItemType Directory -Force "$page/res/fonts"
foreach ($weight in 'Regular','Light','Bold') {
    Copy-Item "$Runtime/fonts/OpenSans-$weight.ttf" $fonts -Force
}
$styles = "$page/src/styles/main.css"
(Get-Content $styles -Raw -Encoding utf8).Replace('../../../../core-fonts/opensans/', '../../res/fonts/') | Set-Content $styles -Encoding utf8
# The shared recent-row component asks this selector whether to show chat actions.
$list = "$page/src/routes/home/components/RecentList.jsx"
$source = Get-Content -Raw -Encoding utf8 $list
$featureImport = 'import { appliedUseAi } from "@/services/settings-sync";'
if (!$source.Contains($featureImport)) { throw 'Review the upstream recent-list integration after updating desktop-apps.' }
$source.Replace($featureImport, 'const appliedUseAi = () => false;') | Set-Content $list -Encoding utf8
Copy-Item "$root/apps/desktop/home/package-lock.json" "$page/package-lock.json" -Force
Push-Location $page
try {
    & npm pkg set 'dependencies.xlsx=https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz' 'dependencies.saxes=6.0.0' 'dependencies.@xmldom/xmldom=0.9.12'
    if ($LASTEXITCODE) { throw 'Could not configure the XLSX dependency' }
    & npm ci --ignore-scripts --no-audit --no-fund --cache "$root/build/npm-cache"
    if ($LASTEXITCODE) { throw 'Page dependencies failed' }
    & npm run build
    if ($LASTEXITCODE) { throw 'Start page build failed' }
} finally { Pop-Location }

# Keep upstream's relative paths for CEF, its renderer process and x2t.
& robocopy $Runtime $out /E /XF DesktopEditors.exe editors.exe updatesvc.exe 'unins*' /XD providers /NFL /NDL /NJH /NJS /NP | Out-Null
if ($LASTEXITCODE -ge 8) { throw 'Runtime staging failed' }
Copy-Item "$Runtime/converter/*.dll" $out -Force
Copy-Item "$root/apps/desktop/brand/excel-utils.ico" "$out/app.ico" -Force
Copy-Item "$page/deploy/index.html" "$out/index.html" -Force
Copy-Item "$page/node_modules/xlsx/LICENSE" "$out/SheetJS-LICENSE.txt" -Force
Copy-Item "$root/packaging/windows/saxes-LICENSE.txt" "$out/saxes-LICENSE.txt" -Force
Copy-Item "$page/node_modules/xmlchars/LICENSE" "$out/xmlchars-LICENSE.txt" -Force
Copy-Item "$page/node_modules/@xmldom/xmldom/LICENSE" "$out/xmldom-LICENSE.txt" -Force
$crt = Join-Path $env:VCToolsRedistDir 'x64/Microsoft.VC143.CRT'
Copy-Item "$crt/*.dll" $out -Force
Copy-Item "$root/third_party/desktop-apps/LICENSE" "$out/ONLYOFFICE-LICENSE.txt" -Force
$notice = Get-Content -Raw -Encoding utf8 "$root/packaging/windows/NOTICE.txt"
$license = Get-Content -Raw -Encoding utf8 "$out/ONLYOFFICE-LICENSE.txt"
Set-Content -Encoding utf8 "$out/NOTICE.txt" -Value ($notice.TrimEnd() + [Environment]::NewLine * 2 + $license)
Write-Output "Built $out/ExcelUtils.exe"
# Robocopy returns nonzero codes for successful copies.
exit 0
