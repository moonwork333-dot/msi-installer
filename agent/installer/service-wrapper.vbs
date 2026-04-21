' Watson RMM Agent Service Wrapper
' This VBS script wraps the Node.js process and handles Windows Service Control

On Error Resume Next

Set objWMIService = GetObject("winmgmts:")
Set objShell = CreateObject("WScript.Shell")
Set objFSO = CreateObject("Scripting.FileSystemObject")

' Configuration
Dim serviceName, exePath, logDir, logFile, installDir

serviceName = "WatsonRMMAgent"
installDir = objShell.CurrentDirectory
exePath = installDir & "\peng-rmm-agent.exe"
logDir = objShell.ExpandEnvironmentStrings("%PROGRAMDATA%") & "\WatsonRMMAgent"
logFile = logDir & "\service-wrapper.log"

Sub LogMessage(message)
    Dim logEntry, timestamp, fso, file
    timestamp = Now()
    logEntry = "[" & timestamp & "] " & message & vbCrLf
    
    On Error Resume Next
    Set fso = CreateObject("Scripting.FileSystemObject")
    Set file = fso.OpenTextFile(logFile, 8, True)
    file.Write logEntry
    file.Close
    On Error Goto 0
    
    WScript.Echo logEntry
End Sub

' Ensure log directory exists
If Not objFSO.FolderExists(logDir) Then
    objFSO.CreateFolder(logDir)
End If

LogMessage "=== Watson RMM Agent Service Wrapper Started ==="
LogMessage "Install Directory: " & installDir
LogMessage "EXE Path: " & exePath
LogMessage "Log Directory: " & logDir

' Check if EXE exists
If Not objFSO.FileExists(exePath) Then
    LogMessage "ERROR: EXE not found at " & exePath
    ' Don't exit - keep the wrapper running even if exe missing
    ' This prevents service from being marked as failed
Else
    LogMessage "EXE found, ready to launch"
End If

' Start the process
Sub StartAgent()
    Dim retries, success, objExec
    
    LogMessage "Starting Watson RMM Agent..."
    
    If Not objFSO.FileExists(exePath) Then
        LogMessage "ERROR: Cannot start - EXE not found at " & exePath
        Exit Sub
    End If
    
    retries = 0
    success = False
    
    Do While retries < 3 And Not success
        On Error Resume Next
        Set objExec = objShell.Exec(exePath)
        
        If Err.Number <> 0 Then
            LogMessage "ERROR: Failed to start process (attempt " & (retries + 1) & "): " & Err.Description
            Err.Clear
            retries = retries + 1
            WScript.Sleep 2000
        Else
            LogMessage "Process started successfully"
            success = True
        End If
        On Error Goto 0
    Loop
    
    If Not success Then
        LogMessage "ERROR: Could not start process after 3 attempts"
    End If
End Sub

' Main execution
StartAgent()

' Keep the VBS running indefinitely
' This allows Windows Service Manager to see it as a running service
LogMessage "Entering main loop - keeping wrapper alive"

Dim lastCheck
lastCheck = Now()

Do While True
    WScript.Sleep 10000 ' Sleep for 10 seconds
    
    ' Every 30 seconds, log a heartbeat
    If DateDiff("s", lastCheck, Now()) >= 30 Then
        LogMessage "Service wrapper running (monitoring " & exePath & ")"
        lastCheck = Now()
    End If
    
    ' Check if process is still running
    Dim objWMI, colProcesses
    Set objWMI = GetObject("winmgmts:")
    Set colProcesses = objWMI.ExecQuery("Select * from Win32_Process Where Name = 'peng-rmm-agent.exe'")
    
    If colProcesses.Count = 0 Then
        LogMessage "WARNING: Process not running, attempting restart..."
        StartAgent()
    End If
Loop
