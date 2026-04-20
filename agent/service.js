const signalR = require("@microsoft/signalr");
const os = require("os");
const { exec } = require("child_process");
const screenshot = require("screenshot-desktop");

// Configuration
const CONFIG = {
  hubUrl: process.env.HUB_URL || "https://watson-parts.com/agenthub",
  reconnectDelayMs: 5000,
  heartbeatIntervalMs: 30000,
  screenCaptureIntervalMs: 1000,
};

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
  });
}

// Capture screen
async function captureScreen() {
  try {
    const imgBuffer = await screenshot({ format: "png" });
    return imgBuffer.toString("base64");
  } catch (error) {
    console.error("Screen capture failed:", error.message);
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
          console.error("Failed to send screen capture:", error.message);
        }
      }
    }
  }, CONFIG.screenCaptureIntervalMs);
  
  console.log("Screen capture started");
}

// Stop screen streaming
function stopScreenCapture() {
  screenCaptureEnabled = false;
  if (screenCaptureInterval) {
    clearInterval(screenCaptureInterval);
    screenCaptureInterval = null;
  }
  console.log("Screen capture stopped");
}

// Initialize SignalR connection
async function initializeConnection() {
  connection = new signalR.HubConnectionBuilder()
    .withUrl(CONFIG.hubUrl)
    .withAutomaticReconnect({
      nextRetryDelayInMilliseconds: () => CONFIG.reconnectDelayMs,
    })
    .configureLogging(signalR.LogLevel.Information)
    .build();

  // Handle connection events
  connection.onreconnecting((error) => {
    console.log("Reconnecting to hub...", error?.message);
    isConnected = false;
  });

  connection.onreconnected((connectionId) => {
    console.log("Reconnected to hub with ID:", connectionId);
    isConnected = true;
    registerAgent();
  });

  connection.onclose((error) => {
    console.log("Connection closed:", error?.message);
    isConnected = false;
    stopScreenCapture();
    setTimeout(startConnection, CONFIG.reconnectDelayMs);
  });

  // Handle incoming commands
  connection.on("ExecuteCommand", async (command) => {
    console.log("Received command:", command);
    const result = await executeCommand(command);
    try {
      await connection.invoke("CommandResult", os.hostname(), command, result);
    } catch (error) {
      console.error("Failed to send command result:", error.message);
    }
  });

  // Handle screen capture requests
  connection.on("StartScreenCapture", () => {
    console.log("Starting screen capture...");
    startScreenCapture();
  });

  connection.on("StopScreenCapture", () => {
    console.log("Stopping screen capture...");
    stopScreenCapture();
  });

  connection.on("CaptureScreenOnce", async () => {
    console.log("Capturing single screenshot...");
    const screenData = await captureScreen();
    if (screenData) {
      try {
        await connection.invoke("ScreenCapture", os.hostname(), screenData);
      } catch (error) {
        console.error("Failed to send screenshot:", error.message);
      }
    }
  });

  // Handle system info requests
  connection.on("GetSystemInfo", async () => {
    console.log("System info requested");
    const sysInfo = getSystemInfo();
    try {
      await connection.invoke("SystemInfo", os.hostname(), sysInfo);
    } catch (error) {
      console.error("Failed to send system info:", error.message);
    }
  });

  // Handle ping
  connection.on("Ping", async () => {
    try {
      await connection.invoke("Pong", os.hostname());
    } catch (error) {
      console.error("Failed to send pong:", error.message);
    }
  });
}

// Register agent with hub
async function registerAgent() {
  const sysInfo = getSystemInfo();
  try {
    await connection.invoke("RegisterAgent", sysInfo);
    console.log("Agent registered successfully");
  } catch (error) {
    console.error("Failed to register agent:", error.message);
  }
}

// Start connection
async function startConnection() {
  try {
    await connection.start();
    console.log("Connected to hub:", CONFIG.hubUrl);
    isConnected = true;
    await registerAgent();
  } catch (error) {
    console.error("Failed to connect:", error.message);
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
        console.error("Heartbeat failed:", error.message);
      }
    }
  }, CONFIG.heartbeatIntervalMs);
}

// Main entry point
async function main() {
  console.log("Watson RMM Agent v1.0.0");
  console.log("Hub URL:", CONFIG.hubUrl);
  console.log("Hostname:", os.hostname());
  
  await initializeConnection();
  await startConnection();
  startHeartbeat();
}

// Handle process termination
process.on("SIGINT", () => {
  console.log("Shutting down agent...");
  stopScreenCapture();
  if (connection) {
    connection.stop();
  }
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("Shutting down agent...");
  stopScreenCapture();
  if (connection) {
    connection.stop();
  }
  process.exit(0);
});

// Keep process alive on errors
process.on("uncaughtException", (error) => {
  console.error("Uncaught exception:", error.message);
});

// Start agent
main().catch(console.error);
