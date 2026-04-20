const signalR = require("@microsoft/signalr");
const os = require("os");
const { exec } = require("child_process");
const screenshot = require("screenshot-desktop");
const fs = require("fs");
const path = require("path");

// Configuration
const CONFIG = {
  hubUrl: process.env.HUB_URL || "https://watson-parts.com/agenthub",
  reconnectDelayMs: 5000,
  heartbeatIntervalMs: 30000,
  screenCaptureIntervalMs: 1000,
  logFile: path.join(process.env.ProgramData || "C:\\ProgramData", "WatsonRMMAgent", "agent.log"),
};

// Ensure log directory exists
const logDir = path.dirname(CONFIG.logFile);
if (!fs.existsSync(logDir)) {
  try {
    fs.mkdirSync(logDir, { recursive: true });
  } catch (err) {
    // Ignore if can't create
  }
}

// Logging function (writes to file for service debugging)
function log(message) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}\n`;
  
  try {
    fs.appendFileSync(CONFIG.logFile, logMessage);
  } catch (err) {
    // Silently fail - we can't log this error anywhere
  }
  
  // Also try console if available
  try {
    console.log(logMessage);
  } catch (err) {
    // Silently fail
  }
}

// Agent state
let connection = null;
let isConnected = false;
let screenCaptureEnabled = false;
let screenCaptureInterval = null;

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
      .withUrl(CONFIG.hubUrl)
      .withAutomaticReconnect({
        nextRetryDelayInMilliseconds: () => CONFIG.reconnectDelayMs,
      })
      .configureLogging(signalR.LogLevel.Information)
      .build();

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
    connection.on("ExecuteCommand", async (command) => {
      log("Received command: " + command);
      const result = await executeCommand(command);
      try {
        await connection.invoke("CommandResult", os.hostname(), command, result);
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
  log("Watson RMM Agent v1.0.0 started");
  log("Hub URL: " + CONFIG.hubUrl);
  log("Hostname: " + os.hostname());
  log("Log file: " + CONFIG.logFile);
  
  try {
    await initializeConnection();
    await startConnection();
    startHeartbeat();
    log("Agent initialized and running");
  } catch (error) {
    log("Fatal error during startup: " + error.message);
    // Don't exit - keep process running to avoid service restart loop
    setTimeout(() => main(), 10000);
  }
}

// Handle process termination
process.on("SIGINT", () => {
  log("Received SIGINT - shutting down agent...");
  stopScreenCapture();
  if (connection) {
    connection.stop();
  }
  process.exit(0);
});

process.on("SIGTERM", () => {
  log("Received SIGTERM - shutting down agent...");
  stopScreenCapture();
  if (connection) {
    connection.stop();
  }
  process.exit(0);
});

// Keep process alive on errors
process.on("uncaughtException", (error) => {
  log("Uncaught exception: " + error.message);
  // Don't exit - service will auto-restart
});

process.on("unhandledRejection", (reason, promise) => {
  log("Unhandled rejection: " + reason);
  // Don't exit - service will auto-restart
});

// Start agent
main().catch((error) => {
  log("Failed to start agent: " + error.message);
});

// Keep the process alive
setInterval(() => {
  // Periodic check
}, 60000);
