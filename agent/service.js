// CRITICAL: Catch all startup errors before anything else
try {
  const fs = require("fs");
  const path = require("path");
  
  // Create log directory immediately
  const logDir = path.join(process.env.ProgramData || "C:\\ProgramData", "WatsonRMMAgent");
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
  
  // Write startup marker immediately
  const startupLogPath = path.join(logDir, "startup.log");
  fs.writeFileSync(startupLogPath, `[${new Date().toISOString()}] ===== SERVICE STARTING =====\n`);
  
  // Write Node.js version
  fs.appendFileSync(startupLogPath, `[${new Date().toISOString()}] Node version: ${process.version}\n`);
  fs.appendFileSync(startupLogPath, `[${new Date().toISOString()}] Platform: ${process.platform}\n`);
  fs.appendFileSync(startupLogPath, `[${new Date().toISOString()}] CWD: ${process.cwd()}\n`);
  
} catch (err) {
  // If we can't even write logs, write to a fallback location
  try {
    require("fs").appendFileSync("C:\\watson_startup_error.log", `[${new Date().toISOString()}] STARTUP ERROR: ${err.message}\n${err.stack}\n`);
  } catch (e) {
    // Completely silent fail - nothing we can do
  }
}

// Now require the rest
const signalR = require("@microsoft/signalr");
const { HttpTransportType } = require("@microsoft/signalr");
const os = require("os");
const { exec } = require("child_process");
const fs = require("fs");
const path = require("path");
const screenshot = require("screenshot-desktop");

// Configuration
const logDir = path.join(process.env.ProgramData || "C:\\ProgramData", "WatsonRMMAgent");
const startupLogPath = path.join(logDir, "startup.log");

function appendLog(msg) {
  try {
    fs.appendFileSync(startupLogPath, `[${new Date().toISOString()}] ${msg}\n`);
  } catch (err) {
    // Ignore
  }
}

appendLog("All requires completed successfully");

// Generate unique agent ID
const agentId = `agent-${os.hostname()}-${Date.now()}`;

// Configuration
const CONFIG = {
  hubUrl: process.env.HUB_URL || "https://watson-parts.com/agenthub",
  reconnectDelayMs: 5000,
  heartbeatIntervalMs: 15000,
  screenCaptureIntervalMs: 1000,
  logFile: path.join(process.env.ProgramData || "C:\\ProgramData", "WatsonRMMAgent", "agent.log"),
  agentId: agentId,
};

appendLog("CONFIG created: " + JSON.stringify(CONFIG));

// Ensure log directory exists
if (!fs.existsSync(logDir)) {
  try {
    fs.mkdirSync(logDir, { recursive: true });
  } catch (err) {
    appendLog("Failed to create log dir: " + err.message);
  }
}

// Logging function
function log(message) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}\n`;
  
  try {
    fs.appendFileSync(CONFIG.logFile, logMessage);
  } catch (err) {
    // Ignore
  }
  
  try {
    fs.appendFileSync(startupLogPath, logMessage);
  } catch (err) {
    // Ignore
  }
  
  try {
    console.log(logMessage);
  } catch (err) {
    // Ignore
  }
}

appendLog("Logging function defined");

// Agent state
let connection = null;
let isConnected = false;
let screenCaptureEnabled = false;
let screenCaptureInterval = null;

appendLog("Agent state initialized");

// Get system information
function getSystemInfo() {
  const networkInterfaces = os.networkInterfaces();
  let ipAddress = "Unknown";
  
  for (const name of Object.keys(networkInterfaces)) {
    for (const net of networkInterfaces[name]) {
      if (net.family === "IPv4" && !net.internal) {
        ipAddress = net.address;
        break;
      }
    }
  }

  return {
    hostname: os.hostname(),
    platform: os.platform(),
    arch: os.arch(),
    osType: os.type(),
    osRelease: os.release(),
    cpus: os.cpus().length,
    totalMemory: Math.round(os.totalmem() / (1024 * 1024 * 1024)) + " GB",
    freeMemory: Math.round(os.freemem() / (1024 * 1024 * 1024)) + " GB",
    uptime: Math.round(os.uptime() / 3600) + " hours",
    ipAddress: ipAddress,
    username: os.userInfo().username,
    agentVersion: "1.0.0",
  };
}

// Execute command
function executeCommand(command) {
  return new Promise((resolve) => {
    try {
      exec(command, { timeout: 60000, maxBuffer: 1024 * 1024 * 10 }, (error, stdout, stderr) => {
        if (error) {
          resolve({
            success: false,
            output: stderr || error.message,
            exitCode: error.code || 1,
          });
        } else {
          resolve({
            success: true,
            output: stdout,
            exitCode: 0,
          });
        }
      });
    } catch (err) {
      resolve({
        success: false,
        output: err.message,
        exitCode: 1,
      });
    }
  });
}

// Capture screen
async function captureScreen() {
  try {
    const imgBuffer = await screenshot({ format: "png" });
    return imgBuffer.toString("base64");
  } catch (error) {
    log("Screen capture failed: " + error.message);
    return null;
  }
}

// Start screen streaming
function startScreenCapture() {
  if (screenCaptureInterval) return;
  
  screenCaptureEnabled = true;
  screenCaptureInterval = setInterval(async () => {
    if (isConnected && screenCaptureEnabled) {
      const screenData = await captureScreen();
      if (screenData && connection) {
        try {
          await connection.invoke("ScreenCapture", os.hostname(), screenData);
        } catch (error) {
          log("Failed to send screen capture: " + error.message);
        }
      }
    }
  }, CONFIG.screenCaptureIntervalMs);
  
  log("Screen capture started");
}

// Stop screen streaming
function stopScreenCapture() {
  screenCaptureEnabled = false;
  if (screenCaptureInterval) {
    clearInterval(screenCaptureInterval);
    screenCaptureInterval = null;
  }
  log("Screen capture stopped");
}

// Initialize SignalR connection
async function initializeConnection() {
  try {
    connection = new signalR.HubConnectionBuilder()
      .withUrl(CONFIG.hubUrl, {
        skipNegotiation: false,
        transport: HttpTransportType.WebSockets,
        withCredentials: false,
        headers: {
          "x-client-type": "agent",
          "x-client-id": CONFIG.agentId
        }
      })
      .withAutomaticReconnect([0, 0, 10000])
      .configureLogging(signalR.LogLevel.Information)
      .build();
    
    connection.serverTimeoutInMilliseconds = 40000;
    connection.keepAliveInterval = 15000;

    // Handle connection events
    connection.onreconnecting((error) => {
      log("Reconnecting to hub... " + (error?.message || ""));
      isConnected = false;
    });

    connection.onreconnected((connectionId) => {
      log("Reconnected to hub with ID: " + connectionId);
      isConnected = true;
      registerAgent();
    });

    connection.onclose((error) => {
      log("Connection closed: " + (error?.message || ""));
      isConnected = false;
      stopScreenCapture();
      setTimeout(startConnection, CONFIG.reconnectDelayMs);
    });

    // Handle incoming commands
    connection.on("ExecuteCommand", async (cmd) => {
      log("Received command: " + cmd);
      const result = await executeCommand(cmd);
      try {
        await connection.invoke("CommandResult", os.hostname(), cmd, result);
      } catch (error) {
        log("Failed to send command result: " + error.message);
      }
    });

    // Handle screen capture requests
    connection.on("StartScreenCapture", () => {
      log("Starting screen capture...");
      startScreenCapture();
    });

    connection.on("StopScreenCapture", () => {
      log("Stopping screen capture...");
      stopScreenCapture();
    });

    connection.on("CaptureScreenOnce", async () => {
      log("Capturing single screenshot...");
      const screenData = await captureScreen();
      if (screenData) {
        try {
          await connection.invoke("ScreenCapture", os.hostname(), screenData);
        } catch (error) {
          log("Failed to send screenshot: " + error.message);
        }
      }
    });

    // Handle system info requests
    connection.on("GetSystemInfo", async () => {
      log("System info requested");
      const sysInfo = getSystemInfo();
      try {
        await connection.invoke("SystemInfo", os.hostname(), sysInfo);
      } catch (error) {
        log("Failed to send system info: " + error.message);
      }
    });

    // Handle ping
    connection.on("Ping", async () => {
      try {
        await connection.invoke("Pong", os.hostname());
      } catch (error) {
        log("Failed to send pong: " + error.message);
      }
    });

    log("SignalR connection initialized");
  } catch (error) {
    log("Failed to initialize connection: " + error.message);
    throw error;
  }
}

// Register agent with hub
async function registerAgent() {
  const sysInfo = getSystemInfo();
  try {
    await connection.invoke("RegisterAgent", sysInfo);
    log("Agent registered successfully");
  } catch (error) {
    log("Failed to register agent: " + error.message);
  }
}

// Start connection
async function startConnection() {
  try {
    await connection.start();
    log("Connected to hub: " + CONFIG.hubUrl);
    isConnected = true;
    await registerAgent();
  } catch (error) {
    log("Failed to connect: " + error.message);
    setTimeout(startConnection, CONFIG.reconnectDelayMs);
  }
}

// Heartbeat
function startHeartbeat() {
  setInterval(async () => {
    if (isConnected && connection) {
      try {
        const sysInfo = getSystemInfo();
        await connection.invoke("Heartbeat", sysInfo);
      } catch (error) {
        log("Heartbeat failed: " + error.message);
      }
    }
  }, CONFIG.heartbeatIntervalMs);
}

// Main entry point
async function main() {
  appendLog("main() called");
  log("Watson RMM Agent v1.0.0 started");
  log("Hub URL: " + CONFIG.hubUrl);
  log("Hostname: " + os.hostname());
  log("Log file: " + CONFIG.logFile);
  log("Platform: " + os.platform());
  log("Node version: " + process.version);
  
  try {
    log("Initializing SignalR connection...");
    await initializeConnection();
    log("SignalR connection initialized successfully");
    
    log("Starting connection to hub...");
    await startConnection();
    log("Connection to hub started");
    
    log("Starting heartbeat...");
    startHeartbeat();
    log("Heartbeat started");
    
    log("Agent initialized and running - entering main loop");
    appendLog("Agent successfully initialized and running");
  } catch (error) {
    log("Fatal error during startup: " + error.message);
    appendLog("Fatal error: " + error.message + " | " + error.stack);
    // Don't exit - retry after delay
    setTimeout(() => main().catch((err) => {
      log("Retry failed: " + err.message);
      appendLog("Retry failed: " + err.message);
    }), 5000);
  }
}

// Handle process termination - GRACEFULLY for Windows service
process.on("SIGINT", () => {
  log("Received SIGINT - shutting down agent...");
  appendLog("Received SIGINT");
  stopScreenCapture();
  if (connection) {
    connection.stop().catch(() => {});
  }
  setTimeout(() => {
    process.exit(0);
  }, 1000);
});

process.on("SIGTERM", () => {
  log("Received SIGTERM - shutting down agent...");
  appendLog("Received SIGTERM");
  stopScreenCapture();
  if (connection) {
    connection.stop().catch(() => {});
  }
  setTimeout(() => {
    process.exit(0);
  }, 1000);
});

// Keep process alive on errors - CRITICAL for Windows service
process.on("uncaughtException", (error) => {
  log("Uncaught exception: " + error.message);
  appendLog("Uncaught exception: " + error.message + " | " + error.stack);
  // Don't exit - keep the service running
});

process.on("unhandledRejection", (reason) => {
  log("Unhandled rejection: " + reason);
  appendLog("Unhandled rejection: " + reason);
  // Don't exit - keep the service running
});

// Start agent with immediate logging
appendLog("About to call main()");
main().catch((error) => {
  log("Failed to start agent: " + error.message);
  appendLog("Failed to start agent: " + error.message + " | " + error.stack);
  // Don't exit - wait and retry
  setTimeout(() => main().catch(() => {
    log("Retry failed");
    appendLog("Retry failed");
  }), 5000);
});

// Keep the process alive - MUST NOT EXIT
setInterval(() => {
  if (!isConnected) {
    // Silently keep alive
  }
}, 30000);

// Final safety net
process.on("exit", (code) => {
  appendLog("Process exiting with code: " + code);
});
