; Compile with Inno Setup 6.7 on Windows after scripts/build.ps1.
#ifndef AppVersion
  #define VersionFile FileOpen(SourcePath + "..\..\VERSION")
  #define AppVersion FileRead(VersionFile)
  #expr FileClose(VersionFile)
#endif
#ifndef RuntimeDir
  #define RuntimeDir SourcePath + "..\..\dist\ExcelUtils"
#endif
#if !FileExists(RuntimeDir + "\ExcelUtils.exe") || !FileExists(RuntimeDir + "\HeaderMerge.exe") || !FileExists(RuntimeDir + "\ResearchTools.exe") || !FileExists(RuntimeDir + "\WorkspaceIndex.exe") || !FileExists(RuntimeDir + "\index.html") || !FileExists(RuntimeDir + "\converter\x2t.exe") || !FileExists(RuntimeDir + "\editors\web-apps\apps\spreadsheeteditor\main\index.html")
  #error Build the complete ExcelUtils runtime with scripts/build.ps1 before packaging.
#endif

[Setup]
AppId={{BA53D862-6D37-46B8-9A76-6E36D15CC625}
AppName=Excel Utils
AppVersion={#AppVersion}
VersionInfoVersion={#AppVersion}
AppPublisher=Excel Utils
DefaultDirName={localappdata}\Programs\ExcelUtils
DefaultGroupName=Excel Utils
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0
DisableProgramGroupPage=yes
AllowNoIcons=yes
UninstallDisplayIcon={app}\ExcelUtils.exe
SetupIconFile=..\..\apps\desktop\brand\excel-utils.ico
OutputDir=..\..\dist
OutputBaseFilename=ExcelUtils-Setup-x64
Compression=lzma2/fast
SolidCompression=yes
WizardStyle=modern

[Files]
Source: "{#RuntimeDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\Excel Utils"; Filename: "{app}\ExcelUtils.exe"; WorkingDir: "{app}"
