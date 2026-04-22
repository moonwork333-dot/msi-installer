// CRITICAL: First line - write startup marker BEFORE any requires
const fs = require("fs");
const path = require("path");

// Try to write startup marker
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

// Configuration
let CONFIG = {
  hubUrl: "https://watson-parts.com/agenthub",
  reconnectInterval: 5000,
};

const possibleConfigPaths = [
  path.join(path.dirname(process.execPath), "config.json"),
  path.join(process.cwd(), "config.json"),
];

let configLoaded = false;
for (const configPath of possibleConfigPaths) {
  try {
    if (fs.existsSync(configPath)) {
      const configFile = fs.readFileSync(configPath, "utf8");
      CONFIG = { ...CONFIG, ...JSON.parse(configFile) };
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

try {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
} catch (e) {
  // Ignore
}

const LOG_FILE = path.join(LOG_DIR, "agent.log");

function log(message) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}`;
  console.log(logMessage);
  try {
    fs.appendFileSync(LOG_FILE, logMessage + "\n");
  } catch (error) {
    // Ignore
  }
}

process.on("uncaughtException", (error) => {
  log(`[FATAL] ${error.message}`);
  log(error.stack);
});

process.on("unhandledRejection", (reason) => {
  log(`[ERROR] ${reason}`);
});

class AgentService {
  constructor() {
    this.connection = null;
    this.isRunning = false;
    this.isConnected = false;
  }

  async start() {
    log("[Agent] Starting Watson RMM Agent...");
    log(`[Agent] ID: ${AGENT_ID}`);
    log(`[Agent] Hub: ${HUB_URL}`);
    this.isRunning = true;
    this.connect();

    this.heartbeatInterval = setInterval(() => {
      log(this.isConnected ? "[Heartbeat] OK" : "[Heartbeat] Reconnecting");
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

      this.connection.onreconnecting(() => {
        log("[Connection] Reconnecting...");
        this.isConnected = false;
      });

      this.connection.onreconnected(() => {
        log("[Connection] Reconnected");
        this.isConnected = true;
        this.registerAgent();
      });

      this.connection.onclose(() => {
        log("[Connection] Closed");
        this.isConnected = false;
        if (this.isRunning) {
          setTimeout(() => this.connect(), CONFIG.reconnectInterval);
        }
      });

      this.connection.on("ExecuteCommand", async (cmd) => {
        log("[Command] " + cmd);
        const result = await this.executeCommand(cmd);
        try {
          await this.connection.invoke("CommandResult", os.hostname(), cmd, result);
        } catch (error) {
          log("[Command] Send failed: " + error.message);
        }
      });

      this.connection.on("GetSystemInfo", async () => {
        log("[SystemInfo] Sending...");
        try {
          await this.connection.invoke("SystemInfo", os.hostname(), this.getSystemInfo());
        } catch (error) {
          log("[SystemInfo] Send failed: " + error.message);
        }
      });

      this.connection.on("Ping", async () => {
        try {
          await this.connection.invoke("Pong", os.hostname());
        } catch (error) {
          log("[Ping] Failed");
        }
      });

      await this.connection.start();
      log("[Connect] Connected successfully");
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
    try {
      await this.connection.invoke("RegisterAgent", this.getSystemInfo());
      log("[Register] Success");
    } catch (error) {
      log("[Register] Failed");
    }
  }

  getSystemInfo() {
    let ipAddress = "Unknown";
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
      for (const net of interfaces[name]) {
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
      cpus: os.cpus().length,
      totalMemory: Math.round(os.totalmem() / 1073741824) + " GB",
      freeMemory: Math.round(os.freemem() / 1073741824) + " GB",
      uptime: Math.round(os.uptime() / 3600) + " hours",
      ipAddress,
      username: os.userInfo().username,
      version: AGENT_VERSION,
    };
  }

  async executeCommand(command) {
    return new Promise((resolve) => {
      try {
        exec(command, { timeout: 60000, maxBuffer: 10485760 }, (error, stdout, stderr) => {
          resolve({
            success: !error,
            output: error ? stderr || error.message : stdout,
            exitCode: error ? error.code || 1 : 0,
          });
        });
      } catch (err) {
        resolve({ success: false, output: err.message, exitCode: 1 });
      }
    });
  }

  stop() {
    log("[Agent] Stopping...");
    this.isRunning = false;
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
    if (this.connection) this.connection.stop().catch(() => {});
    setTimeout(() => process.exit(0), 1000);
  }
}

log(`Watson RMM Agent v${AGENT_VERSION} starting`);

const agent = new AgentService();

process.on("SIGINT", () => agent.stop());
process.on("SIGTERM", () => agent.stop());

agent.start().catch((error) => {
  log("[FATAL] " + error.message);
  setTimeout(() => agent.start(), 5000);
});

setInterval(() => {}, 60000);
