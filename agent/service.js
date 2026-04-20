const signalR = require("@microsoft/signalr");
const os = require("os");
const { exec } = require("child_process");
const screenshot = require("screenshot-desktop");
const fs = require("fs");
const path = require("path");
const robot = require("robotjs");

// Configure robotjs for smoother mouse movement
robot.setMouseDelay(1);
robot.setKeyboardDelay(1);

// Configuration
const CONFIG = {
  hubUrl: process.env.HUB_URL || "https://watson-parts.com/agenthub",
  reconnectDelayMs: 5000,
  heartbeatIntervalMs: 30000,
  screenCaptureIntervalMs: 10000,
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
  return new Promise((resolve, reject) => {
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

// Remote control functions
function moveMouse(x, y) {
  try {
    robot.moveMouse(x, y);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

function mouseClick(x, y, button = "left", double = false) {
  try {
    robot.moveMouse(x, y);
    if (double) {
      robot.mouseClick(button, true);
    } else {
      robot.mouseClick(button);
    }
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

function mouseScroll(x, y, amount) {
  try {
    robot.moveMouse(x, y);
    robot.scrollMouse(0, amount);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

function keyboardType(text) {
  try {
    robot.typeString(text);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

function keyboardPress(key, modifiers = []) {
  try {
    robot.keyTap(key, modifiers);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

function keyboardCombo(keys) {
  try {
    // keys is an array like ["control", "alt", "delete"]
    const mainKey = keys[keys.length - 1];
    const mods = keys.slice(0, -1);
    robot.keyTap(mainKey, mods);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

function getScreenSize() {
  try {
    const size = robot.getScreenSize();
    return { success: true, width: size.width, height: size.height };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

function getMousePosition() {
  try {
    const pos = robot.getMousePos();
    return { success: true, x: pos.x, y: pos.y };
  } catch (error) {
    return { success: false, error: error.message };
  }
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

  // Remote Control - Mouse Move
  connection.on("MouseMove", async (x, y) => {
    console.log(`Mouse move to: ${x}, ${y}`);
    const result = moveMouse(x, y);
    try {
      await connection.invoke("RemoteControlResult", os.hostname(), "MouseMove", result);
    } catch (error) {
      console.error("Failed to send mouse move result:", error.message);
    }
  });

  // Remote Control - Mouse Click
  connection.on("MouseClick", async (x, y, button, double) => {
    console.log(`Mouse click at: ${x}, ${y}, button: ${button}, double: ${double}`);
    const result = mouseClick(x, y, button || "left", double || false);
    try {
      await connection.invoke("RemoteControlResult", os.hostname(), "MouseClick", result);
    } catch (error) {
      console.error("Failed to send mouse click result:", error.message);
    }
  });

  // Remote Control - Mouse Scroll
  connection.on("MouseScroll", async (x, y, amount) => {
    console.log(`Mouse scroll at: ${x}, ${y}, amount: ${amount}`);
    const result = mouseScroll(x, y, amount);
    try {
      await connection.invoke("RemoteControlResult", os.hostname(), "MouseScroll", result);
    } catch (error) {
      console.error("Failed to send mouse scroll result:", error.message);
    }
  });

  // Remote Control - Type Text
  connection.on("KeyboardType", async (text) => {
    console.log(`Keyboard type: ${text.substring(0, 20)}...`);
    const result = keyboardType(text);
    try {
      await connection.invoke("RemoteControlResult", os.hostname(), "KeyboardType", result);
    } catch (error) {
      console.error("Failed to send keyboard type result:", error.message);
    }
  });

  // Remote Control - Key Press (single key with optional modifiers)
  connection.on("KeyboardPress", async (key, modifiers) => {
    console.log(`Keyboard press: ${key}, modifiers: ${modifiers}`);
    const result = keyboardPress(key, modifiers || []);
    try {
      await connection.invoke("RemoteControlResult", os.hostname(), "KeyboardPress", result);
    } catch (error) {
      console.error("Failed to send keyboard press result:", error.message);
    }
  });

  // Remote Control - Key Combo (e.g., Ctrl+Alt+Delete)
  connection.on("KeyboardCombo", async (keys) => {
    console.log(`Keyboard combo: ${keys.join("+")}`);
    const result = keyboardCombo(keys);
    try {
      await connection.invoke("RemoteControlResult", os.hostname(), "KeyboardCombo", result);
    } catch (error) {
      console.error("Failed to send keyboard combo result:", error.message);
    }
  });

  // Remote Control - Get Screen Size
  connection.on("GetScreenSize", async () => {
    console.log("Getting screen size...");
    const result = getScreenSize();
    try {
      await connection.invoke("ScreenSize", os.hostname(), result);
    } catch (error) {
      console.error("Failed to send screen size:", error.message);
    }
  });

  // Remote Control - Get Mouse Position
  connection.on("GetMousePosition", async () => {
    const result = getMousePosition();
    try {
      await connection.invoke("MousePosition", os.hostname(), result);
    } catch (error) {
      console.error("Failed to send mouse position:", error.message);
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
  console.log("PENG RMM Agent v1.0.0");
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

// Start agent
main().catch(console.error);
