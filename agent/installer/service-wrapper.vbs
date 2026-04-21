' Watson RMM Agent Service Wrapper
' This VBS script wraps the Node.js process and handles Windows Service Control

Set objWMIService = GetObject("winmgmts:")
Set objShell = CreateObject("WScript.Shell")
Set objFSO = CreateObject("Scripting.FileSystemObject")

' Configuration
Dim serviceName, exePath, logDir, logFile

serviceName = "WatsonRMMAgent"
exePath = objShell.CurrentDirectory & "\peng-rmm-agent.exe"
logDir = objShell.ExpandEnvironmentStrings("%PROGRAMDATA%") & "\WatsonRMMAgent"
logFile = logDir & "\service-wrapper.log"

' Ensure log directory exists
If Not objFSO.FolderExists(logDir) Then
    objFSO.CreateFolder(logDir)
End If

Sub LogMessage(message)
    Dim logEntry, timestamp
    timestamp = Now()
    logEntry = "[" & timestamp & "] " & message & vbCrLf
    
    On Error Resume Next
    Dim fso, file
    Set fso = CreateObject("Scripting.FileSystemObject")
    Set file = fso.OpenTextFile(logFile, 8, True)
    file.Write logEntry
    file.Close
    On Error Goto 0
    
    WScript.Echo logEntry
End Sub

' Check if process is running
Function IsProcessRunning(processName)
    Dim objWMIService, colProcesses, objProcess
    Set objWMIService = GetObject("winmgmts:")
    Set colProcesses = objWMIService.ExecQuery("Select * from Win32_Process Where Name = '" & processName & "'")
    IsProcessRunning = (colProcesses.Count > 0)
End Function

' Start the process
Sub StartAgent()
    LogMessage "Starting Watson RMM Agent: " & exePath
    
    If Not objFSO.FileExists(exePath) Then
        LogMessage "ERROR: EXE not found at " & exePath
        Exit Sub
    End If
    
    ' Start the process
    objShell.CurrentDirectory = objFSO.GetParentFolderName(exePath)
    On Error Resume Next
    Set objExec = objShell.Exec(exePath)
    If Err.Number <> 0 Then
        LogMessage "ERROR: Failed to start process: " & Err.Description
    Else
        LogMessage "Process started successfully (PID: " & objExec.ProcessID & ")"
    End If
    On Error Goto 0
End Sub

' Main loop
LogMessage "=== Watson RMM Agent Service Wrapper Started ==="
LogMessage "Service Name: " & serviceName
LogMessage "EXE Path: " & exePath
LogMessage "Working Directory: " & objShell.CurrentDirectory

' Start the agent
StartAgent()

' Keep the process running
Dim lastCheck, checkInterval
lastCheck = Now()
checkInterval = 10 ' Check every 10 seconds

' Monitor process and restart if needed
Do While True
    WScript.Sleep(5000) ' Sleep for 5 seconds between checks
    
    ' Check if enough time has passed for a check
    If DateDiff("s", lastCheck, Now()) >= checkInterval Then
        If Not IsProcessRunning("peng-rmm-agent.exe") Then
            LogMessage "WARNING: Process not found, restarting..."
            StartAgent()
        End If
        lastCheck = Now()
    End If
    
    ' Prevent VBS from consuming too much CPU
    WScript.Sleep(5000)
Loop
