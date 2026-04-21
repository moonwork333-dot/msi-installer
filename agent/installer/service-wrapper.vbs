' Watson RMM Agent Service Wrapper
' This VBS script wraps the Node.js process and handles Windows Service Control

On Error Resume Next

Set objShell = CreateObject("WScript.Shell")
Set objFSO = CreateObject("Scripting.FileSystemObject")

' Configuration
Dim serviceName, exePath, logDir, logFile, installDir, objProcess

serviceName = "WatsonRMMAgent"

' Get installation directory from command-line arguments
' If no argument provided, try current directory (for manual testing)
If WScript.Arguments.Count > 0 Then
    installDir = WScript.Arguments(0)
Else
    installDir = objShell.CurrentDirectory
End If

exePath = installDir & "\peng-rmm-agent.exe"
logDir = objShell.ExpandEnvironmentStrings("%PROGRAMDATA%") & "\WatsonRMMAgent"
logFile = logDir & "\service-wrapper.log"

' Store reference to keep process alive
Dim agentProcess
Set agentProcess = Nothing

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
LogMessage "Working from: " & objShell.CurrentDirectory

' Check if EXE exists
If Not objFSO.FileExists(exePath) Then
    LogMessage "ERROR: EXE not found at " & exePath
Else
    LogMessage "EXE found, ready to launch"
End If

' Start the process using direct Shell.Exec
Sub StartAgent()
    Dim retries, success
    
    LogMessage "Starting Watson RMM Agent (Exec method)..."
    
    If Not objFSO.FileExists(exePath) Then
        LogMessage "ERROR: Cannot start - EXE not found at " & exePath
        Exit Sub
    End If
    
    retries = 0
    success = False
    
    Do While retries < 3 And Not success
        On Error Resume Next
        
        ' Launch EXE directly using Exec (non-blocking)
        ' This keeps the process reference alive in agentProcess
        Set agentProcess = objShell.Exec(exePath)
        
        If Err.Number = 0 Then
            LogMessage "Process started with Exec (Status: " & agentProcess.Status & ")"
            success = True
            WScript.Sleep 2000 ' Give process time to initialize
        Else
            LogMessage "ERROR: Failed to exec process (error " & Err.Number & "): " & Err.Description
            Err.Clear
            Set agentProcess = Nothing
            retries = retries + 1
            WScript.Sleep 2000
        End If
        On Error Goto 0
    Loop
    
    If Not success Then
        LogMessage "ERROR: Could not start process after 3 attempts"
        Set agentProcess = Nothing
    End If
End Sub

' Main execution
StartAgent()

' Keep the VBS running indefinitely with the process reference
LogMessage "Entering main loop - keeping wrapper alive"

Dim lastCheck, checkCount
lastCheck = Now()
checkCount = 0

Do While True
    WScript.Sleep 5000 ' Sleep for 5 seconds
    
    ' Check if process is still running
    On Error Resume Next
    If Not (agentProcess Is Nothing) Then
        ' If we have a process reference, check if it's still running
        If agentProcess.Status = 0 Then
            ' Status 0 = still running
            checkCount = checkCount + 1
        Else
            ' Status 1 = process exited
            LogMessage "WARNING: Process exited with status " & agentProcess.Status & ", attempting restart..."
            Set agentProcess = Nothing
            StartAgent()
            checkCount = 0
        End If
    End If
    On Error Goto 0
    
    ' Every 30 seconds, log a heartbeat
    If DateDiff("s", lastCheck, Now()) >= 30 Then
        If Not (agentProcess Is Nothing) Then
            LogMessage "Service wrapper running (process status: " & agentProcess.Status & ")"
        Else
            LogMessage "Service wrapper running (no process reference)"
        End If
        lastCheck = Now()
    End If
Loop
