$WshShell = New-Object -comObject WScript.Shell
$Shortcut = $WshShell.CreateShortcut([Environment]::GetFolderPath('Desktop') + '\TeleFetch Studio.lnk')
$Shortcut.TargetPath = 'd:\telefetch-studio-application\scripts\start_windows.bat'
$Shortcut.WorkingDirectory = 'd:\telefetch-studio-application\scripts'
$Shortcut.IconLocation = 'd:\telefetch-studio-application\public\favicon.ico'
$Shortcut.Save()
