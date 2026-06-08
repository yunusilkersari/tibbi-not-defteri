' ============================================================
' Tibbi Not Defteri - sessiz baslatici (konsol penceresi gostermez)
' Gunluk kullanim icin bunu (ya da masaustu kisayolunu) calistirin.
' ============================================================
Dim sh, fso, scriptDir
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
sh.CurrentDirectory = scriptDir
' -STA: WinForms icin sart, 0: pencere gizli, False: bekleme
sh.Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -STA -WindowStyle Hidden -File """ & scriptDir & "\Defter.ps1""", 0, False
