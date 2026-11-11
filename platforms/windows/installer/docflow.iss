; Inno Setup script for DocFlow Windows Desktop Edition.
; Build the EXE first (see platforms/windows/DocFlow.spec), then compile
; this script with Inno Setup (https://jrsoftware.org/isinfo.php).

[Setup]
AppName=DocFlow
AppVersion=1.0.0
DefaultDirName={autopf}\DocFlow
DefaultGroupName=DocFlow
OutputDir=..\..\dist\installer
OutputBaseFilename=DocFlowSetup
Compression=lzma
SolidCompression=yes
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=dialog

[Files]
Source: "..\..\dist\DocFlow.exe"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{group}\DocFlow"; Filename: "{app}\DocFlow.exe"
Name: "{autodesktop}\DocFlow"; Filename: "{app}\DocFlow.exe"; Tasks: desktopicon

[Tasks]
Name: "desktopicon"; Description: "Create a desktop shortcut"; GroupDescription: "Shortcuts:"

[Run]
Filename: "{app}\DocFlow.exe"; Description: "Launch DocFlow"; Flags: nowait postinstall skipifsilent

; NOTE: user data in %LOCALAPPDATA%\DocFlow is intentionally NOT touched by
; the installer, so upgrades and reinstalls preserve the database.
