const signalR = require("@microsoft/signalr");
const { HttpTransportType } = require("@microsoft/signalr");
const os = require("os");
const { exec } = require("child_process");
const fs = require("fs");
const path = require("path");
const Service = require("node-windows").Service;

// Defer screenshot-desktop import until needed
let screenshot = null;
function getScreenshot() {
  if (!screenshot) {
    try {
      screenshot = require("screenshot-desktop");
    } catch (err) {
      return null;
    }
  }
  return screenshot;
}

// Handle command line arguments for service install/uninstall
const args = process.argv.slice(2);
const command = args[0];

if (command === "--install") {
  installService();
} else if (command === "--uninstall") {
  uninstallService();
} else {
  // Normal agent startup
  startAgent();
}

function installService() {
  console.log("[Installer] Installing Watson RMM Agent service...");

  const svc = new Service({
    name: "WatsonRMMAgent",
    description: "Watson RMM Agent - Remote monitoring and management",
    script: process.execPath,
    nodeOptions: [],
    env: {
      name: "NODE_ENV",
      value: "production",
    },
  });

  svc.on("install", () => {
    console.log("[Installer] Service installed successfully");
    console.log("[Installer] Starting service...");
    svc.start();
  });

  svc.on("start", () => {
    console.log("[Installer] Service started successfully");
    process.exit(0);
  });

  svc.on("alreadyinstalled", () => {
    console.log("[Installer] Service already installed, restarting...");
    svc.restart();
  });

  svc.on("error", (err) => {
    console.error("[Installer] Service installation error:", err.message);
    process.exit(1);
  });

  svc.install();
}

function uninstallService() {
  console.log("[Installer] Uninstalling Watson RMM Agent service...");

  const svc = new Service({
    name: "WatsonRMMAgent",
    script: process.execPath,
  });

  svc.on("uninstall", () => {
    console.log("[Installer] Service uninstalled successfully");
    process.exit(0);
  });

  svc.on("error", (err) => {
    console.error("[Installer] Service uninstallation error:", err.message);
    process.exit(1);
  });

  svc.uninstall();
}

function startAgent() {
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

  // Ensure log directory exists
  const logDir = path.dirname(CONFIG.logFile);
  if (!fs.existsSync(logDir)) {
    try {
      fs.mkdirSync(logDir, { recursive: true });
    } catch (err) {
      // Ignore if can't create
    }
  }

  // Logging function
  function log(message) {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] ${message}\n`;
    
    try {
      fs.appendFileSync(CONFIG.logFile, logMessage);
    } catch (err) {
      // Silently fail
    }
    
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
      const shot = getScreenshot();
      if (!shot) {
        log("Screenshot module not available");
        return null;
      }
      const imgBuffer = await shot({ format: "png" });
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
  });

  process.on("unhandledRejection", (reason) => {
    log("Unhandled rejection: " + reason);
  });

  // Start agent
  main().catch((error) => {
    log("Failed to start agent: " + error.message);
  });

  // Keep the process alive
  setInterval(() => {}, 60000);
}
