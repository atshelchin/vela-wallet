; Windows 10/11 x64 or ARM64 installer for the GPUI desktop application.
; Build it through scripts\build-windows-installer.ps1 so the release binary
; and the Microsoft-signed VC++ Redistributable are supplied consistently.

#ifndef MyAppVersion
  #error MyAppVersion must be supplied by the build script.
#endif
#ifndef MyAppExe
  #error MyAppExe must be supplied by the build script.
#endif
#ifndef MyVCRedist
  #error MyVCRedist must be supplied by the build script.
#endif
#ifndef MyVCRedistName
  #error MyVCRedistName must be supplied by the build script.
#endif
#ifndef MyArchitecture
  #error MyArchitecture must be supplied by the build script.
#endif
#ifndef MyArchitecturesAllowed
  #error MyArchitecturesAllowed must be supplied by the build script.
#endif
#ifndef MyOutputDir
  #error MyOutputDir must be supplied by the build script.
#endif

#define MyAppName "Vela Wallet"
#define MyAppPublisher "Vela Wallet"
#define MyAppExeName "vela-wallet.exe"

[Setup]
AppId={{6B7B5D7C-E7B7-47FB-94A6-5CCB2216A6CC}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName={autopf}\Vela Wallet
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes
UninstallDisplayIcon={app}\{#MyAppExeName}
OutputDir={#MyOutputDir}
OutputBaseFilename=VelaWallet-Setup-{#MyAppVersion}-{#MyArchitecture}
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
ArchitecturesAllowed={#MyArchitecturesAllowed}
ArchitecturesInstallIn64BitMode={#MyArchitecturesAllowed}
MinVersion=10.0
PrivilegesRequired=admin
CloseApplications=yes
SetupLogging=yes

[Tasks]
Name: "desktopicon"; Description: "Create a &desktop shortcut"; GroupDescription: "Additional shortcuts:"

[Files]
Source: "{#MyAppExe}"; DestDir: "{app}"; DestName: "{#MyAppExeName}"; Flags: ignoreversion
Source: "{#MyVCRedist}"; DestDir: "{tmp}"; DestName: "{#MyVCRedistName}"; Flags: deleteafterinstall

[Icons]
Name: "{autoprograms}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; WorkingDir: "{app}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; WorkingDir: "{app}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "Launch {#MyAppName}"; Flags: nowait postinstall skipifsilent

[Code]
procedure InstallVCRedist();
var
  ResultCode: Integer;
begin
  if not Exec(
    ExpandConstant('{tmp}\{#MyVCRedistName}'),
    '/install /quiet /norestart',
    '',
    SW_HIDE,
    ewWaitUntilTerminated,
    ResultCode
  ) then begin
    RaiseException('The Microsoft Visual C++ Runtime could not be started.');
  end;

  { 0 = installed, 1638 = a newer version is already present,
    3010 = installed and Windows requests a restart. }
  if (ResultCode <> 0) and (ResultCode <> 1638) and (ResultCode <> 3010) then begin
    RaiseException(
      'The Microsoft Visual C++ Runtime installation failed (exit code ' +
      IntToStr(ResultCode) + ').'
    );
  end;
end;

procedure CurStepChanged(CurStep: TSetupStep);
begin
  if CurStep = ssPostInstall then begin
    InstallVCRedist();
  end;
end;
