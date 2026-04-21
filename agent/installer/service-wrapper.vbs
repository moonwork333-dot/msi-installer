' Watson RMM Agent Service Wrapper
' This VBS script wraps the Node.js process and handles Windows Service Control

On Error Resume Next

Set objWMIService = GetObject("winmgmts:")
Set objShell = CreateObject("WScript.Shell")
Set objFSO = CreateObject("Scripting.FileSystemObject")

' Configuration
Dim serviceName, exePath, logDir, logFile, installDir

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

' Start the process using Shell.Run with explicit working directory
Sub StartAgent()
    Dim retries, success, cmd, exitCode
    
    LogMessage "Starting Watson RMM Agent..."
    
    If Not objFSO.FileExists(exePath) Then
        LogMessage "ERROR: Cannot start - EXE not found at " & exePath
        Exit Sub
    End If
    
    retries = 0
    success = False
    
    Do While retries < 3 And Not success
        On Error Resume Next
        
        ' Use cmd.exe with explicit directory change to ensure proper working directory
        cmd = "cmd.exe /c cd /d """ & installDir & """ && """ & exePath & """"
        LogMessage "Attempting to launch with: " & cmd
        
        exitCode = objShell.Run(cmd, 0, False)
        
        If Err.Number = 0 Then
            LogMessage "Process launched (exit code: " & exitCode & ")"
            success = True
            WScript.Sleep 1000 ' Give it a moment to start
        Else
            LogMessage "ERROR: Failed to launch (error " & Err.Number & "): " & Err.Description
            Err.Clear
            retries = retries + 1
            WScript.Sleep 2000
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
