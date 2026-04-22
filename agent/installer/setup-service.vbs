' Watson RMM Agent Service Setup Script
' This VBS script is executed by WiX to install the service

Dim objShell, objFSO, strScriptDir, strBatchFile, intStatus

Set objShell = CreateObject("WScript.Shell")
Set objFSO = CreateObject("Scripting.FileSystemObject")

' Get the script directory
strScriptDir = objFSO.GetParentFolderName(WScript.ScriptFullName)

' Ensure we're in the right directory
objShell.CurrentDirectory = strScriptDir

' Run the install-service.bat script
strBatchFile = strScriptDir & "\install-service.bat"

If objFSO.FileExists(strBatchFile) Then
    intStatus = objShell.Run(strBatchFile, 0, True)
    WScript.Quit(intStatus)
Else
    WScript.Echo "Error: install-service.bat not found at " & strBatchFile
    WScript.Quit(1)
End If
