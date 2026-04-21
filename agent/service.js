// CRITICAL: First line - write startup marker BEFORE any requires
const fs = require("fs");
const path = require("path");

// Try to write startup marker to multiple locations
const fallbackLog = "C:\\watson-agent-startup.log";
try {
  fs.appendFileSync(fallbackLog, `[${new Date().toISOString()}] Process started - Node ${process.version}\n`);
} catch (e) {
  // Ignore
}

const signalR = require("@microsoft/signalr");
const { HttpTransportType } = require("@microsoft/signalr");
const os = require("os");
const { exec } = require("child_process");

// Write after requires
try {
  fs.appendFileSync(fallbackLog, `[${new Date().toISOString()}] All requires successful\n`);
} catch (e) {
  // Ignore
}

// Configuration
let CONFIG = {
  hubUrl: "https://watson-parts.com/agenthub",
  reconnectInterval: 5000,
};

const possibleConfigPaths = [
  path.join(path.dirname(process.execPath), "config.json"),
  path.join(process.cwd(), "config.json"),
  path.join(__dirname, "config.json"),
];

let configLoaded = false;
for (const configPath of possibleConfigPaths) {
  try {
    if (fs.existsSync(configPath)) {
      const configFile = fs.readFileSync(configPath, "utf8");
      const loadedConfig = JSON.parse(configFile);
      CONFIG = { ...CONFIG, ...loadedConfig };
      configLoaded = true;
      break;
    }
  } catch (error) {
    // Silently continue
  }
}

const HUB_URL = process.env.HUB_URL || CONFIG.hubUrl;
const AGENT_ID = process.env.AGENT_ID || `agent-${os.hostname()}-${Date.now()}`;
const AGENT_VERSION = "1.0.0";

const LOG_DIR = process.env.PROGRAMDATA
  ? path.join(process.env.PROGRAMDATA, "WatsonRMMAgent")
  : path.join(process.cwd(), "logs");

if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

const LOG_FILE = path.join(LOG_DIR, "agent.log");

function log(message) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}`;

  console.log(logMessage);

  try {
    fs.appendFileSync(LOG_FILE, logMessage + "\n");
  } catch (error) {
    // Ignore log write errors
  }

  // Also write to fallback log
  try {
    fs.appendFileSync(fallbackLog, logMessage + "\n");
  } catch (error) {
    // Ignore
  }
}

// Catch all unhandled errors
process.on("uncaughtException", (error) => {
  log(`[FATAL] Uncaught exception: ${error.message}`);
  log(error.stack);
  // Don't exit - keep running
});

process.on("unhandledRejection", (reason) => {
  log(`[ERROR] Unhandled rejection: ${reason}`);
  // Don't exit - keep running
});

// Defer screenshot-desktop - it may not be available
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

class AgentService {
  constructor() {
    this.connection = null;
    this.isRunning = false;
    this.isConnected = false;
    this.screenCaptureEnabled = false;
    this.screenCaptureInterval = null;
  }

  async start() {
    log("[Agent] Starting Watson RMM Agent...");
    log(`[Agent] Agent ID: ${AGENT_ID}`);
    log(`[Agent] Hub URL: ${HUB_URL}`);
    log(`[Agent] Node: ${process.version}`);
    log(`[Agent] Platform: ${process.platform} ${os.arch()}`);

    this.isRunning = true;
    this.connect();

    // Keep process alive with a heartbeat
    this.heartbeatInterval = setInterval(() => {
      if (this.isConnected) {
        log("[Heartbeat] Connected");
      } else {
        log("[Heartbeat] Reconnecting...");
      }
    }, 30000);
  }

  async connect() {
    if (!this.isRunning) return;

    try {
      log("[Connect] Connecting to hub...");

      this.connection = new signalR.HubConnectionBuilder()
        .withUrl(HUB_URL, {
          skipNegotiation: false,
          transport: HttpTransportType.WebSockets,
          withCredentials: false,
          headers: {
            "x-client-type": "agent",
            "x-client-id": AGENT_ID,
          },
        })
        .withAutomaticReconnect([0, 0, 10000])
        .configureLogging(signalR.LogLevel.Information)
        .build();

      this.connection.serverTimeoutInMilliseconds = 40000;
      this.connection.keepAliveInterval = 15000;

      this.connection.onreconnecting((error) => {
        log("[Connection] Reconnecting... " + (error?.message || ""));
        this.isConnected = false;
      });

      this.connection.onreconnected((connectionId) => {
        log("[Connection] Reconnected with ID: " + connectionId);
        this.isConnected = true;
        this.registerAgent();
      });

      this.connection.onclose((error) => {
        log("[Connection] Closed: " + (error?.message || ""));
        this.isConnected = false;
        this.stopScreenCapture();
        if (this.isRunning) {
          setTimeout(() => this.connect(), CONFIG.reconnectInterval);
        }
      });

      this.connection.on("ExecuteCommand", async (cmd) => {
        log("[Command] Executing: " + cmd);
        const result = await this.executeCommand(cmd);
        try {
          await this.connection.invoke("CommandResult", os.hostname(), cmd, result);
        } catch (error) {
          log("[Command] Failed to send result: " + error.message);
        }
      });

      this.connection.on("StartScreenCapture", () => {
        log("[Screenshot] Starting capture...");
        this.startScreenCapture();
      });

      this.connection.on("StopScreenCapture", () => {
        log("[Screenshot] Stopping capture...");
        this.stopScreenCapture();
      });

      this.connection.on("CaptureScreenOnce", async () => {
        log("[Screenshot] Capturing single frame...");
        const screenData = await this.captureScreen();
        if (screenData) {
          try {
            await this.connection.invoke("ScreenCapture", os.hostname(), screenData);
          } catch (error) {
            log("[Screenshot] Failed to send: " + error.message);
          }
        }
      });

      this.connection.on("GetSystemInfo", async () => {
        log("[SystemInfo] Request received");
        const sysInfo = this.getSystemInfo();
        try {
          await this.connection.invoke("SystemInfo", os.hostname(), sysInfo);
        } catch (error) {
          log("[SystemInfo] Failed to send: " + error.message);
        }
      });

      this.connection.on("Ping", async () => {
        try {
          await this.connection.invoke("Pong", os.hostname());
        } catch (error) {
          log("[Ping] Failed: " + error.message);
        }
      });

      await this.connection.start();
      log("[Connect] Connected to hub successfully");
      this.isConnected = true;
      await this.registerAgent();
    } catch (error) {
      log("[Connect] Failed: " + error.message);
      if (this.isRunning) {
        setTimeout(() => this.connect(), CONFIG.reconnectInterval);
      }
    }
  }

  async registerAgent() {
    const sysInfo = this.getSystemInfo();
    try {
      await this.connection.invoke("RegisterAgent", sysInfo);
      log("[Register] Agent registered");
    } catch (error) {
      log("[Register] Failed: " + error.message);
    }
  }

  getSystemInfo() {
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
      agentVersion: AGENT_VERSION,
    };
  }

  async executeCommand(command) {
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

  async captureScreen() {
    try {
      const shot = getScreenshot();
      if (!shot) {
        return null;
      }
      const imgBuffer = await shot({ format: "png" });
      return imgBuffer.toString("base64");
    } catch (error) {
      log("[Screenshot] Capture failed: " + error.message);
      return null;
    }
  }

  startScreenCapture() {
    if (this.screenCaptureInterval) return;

    this.screenCaptureEnabled = true;
    this.screenCaptureInterval = setInterval(async () => {
      if (this.isConnected && this.screenCaptureEnabled) {
        const screenData = await this.captureScreen();
        if (screenData && this.connection) {
          try {
            await this.connection.invoke("ScreenCapture", os.hostname(), screenData);
          } catch (error) {
            // Silently ignore send errors
          }
        }
      }
    }, 1000);

    log("[Screenshot] Capture started");
  }

  stopScreenCapture() {
    this.screenCaptureEnabled = false;
    if (this.screenCaptureInterval) {
      clearInterval(this.screenCaptureInterval);
      this.screenCaptureInterval = null;
    }
    log("[Screenshot] Capture stopped");
  }

  stop() {
    log("[Agent] Stopping...");
    this.isRunning = false;

    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    this.stopScreenCapture();

    if (this.connection) {
      this.connection.stop().catch(() => {});
    }

    setTimeout(() => {
      process.exit(0);
    }, 1000);
  }
}

// Main execution
log(`Watson RMM Agent v${AGENT_VERSION} starting...`);

const agent = new AgentService();

process.on("SIGINT", () => {
  log("[Signal] SIGINT received");
  agent.stop();
});

process.on("SIGTERM", () => {
  log("[Signal] SIGTERM received");
  agent.stop();
});

// Start the agent and keep it running
agent.start().catch((error) => {
  log(`[FATAL] Start failed: ${error.message}`);
  log(error.stack);
  // Don't exit - try to keep running
  setTimeout(() => agent.start(), 5000);
});

// Keep process alive indefinitely
setInterval(() => {
  // Silent keepalive
}, 60000);
