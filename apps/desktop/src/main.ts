import { app, BrowserWindow, shell, ipcMain } from "electron";
import path from "path";
import { spawn } from "child_process";
import http from "http";
import fs from "fs";

function readFileIfExists(p: string) {
  try {
    return fs.readFileSync(p, "utf8");
  } catch {
    return null;
  }
}

function copyFileEnsuringDirs(from: string, to: string) {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
}

function waitForHttp(url: string, timeoutMs: number) {
  const start = Date.now();
  return new Promise<void>((resolve, reject) => {
    const timer = setInterval(() => {
      if (Date.now() - start > timeoutMs) {
        clearInterval(timer);
        reject(new Error(`Timed out waiting for ${url}`));
        return;
      }
      const u = new URL(url);
      const req = http.request(
        { hostname: u.hostname, port: u.port, path: u.pathname, method: "GET" },
        (res) => {
          clearInterval(timer);
          resolve();
        }
      );
      req.on("error", () => {});
      req.end();
    }, 1000);
  });
}

function dockerComposeUp(composePath: string, envFilePath: string) {
  // Note: requires Docker Desktop + docker CLI available.
  const isWin = process.platform === "win32";
  const composeCmd = "docker";
  const args = ["compose", "-f", composePath, "--env-file", envFilePath, "up", "-d"];
  const child = spawn(composeCmd, args, {
    stdio: "inherit"
  });
  return new Promise<void>((resolve, reject) => {
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`docker compose up failed with code ${code}`));
    });
  });
}

let mainWindow: BrowserWindow | null = null;

async function startServicesIfNeeded() {
  const webUrl = process.env.VIDEOGEN_WEB_URL ?? "http://localhost:3000";
  const timeoutMs = Number(process.env.VIDEOGEN_START_TIMEOUT_MS ?? "180000");

  // If web is already up, skip startup.
  try {
    await waitForHttp(webUrl, 1000);
    return;
  } catch {
    // continue
  }

  // Launch compose from packaged resources.
  const composePath = path.join(process.resourcesPath, "infra", "docker-compose.yml");

  // Create a writable env file in userData for credentials/keys.
  // The template ships with the product; user should edit it once.
  const templatePath = path.join(process.resourcesPath, ".env.example");
  const userEnvPath = path.join(app.getPath("userData"), ".env");
  const existing = readFileIfExists(userEnvPath);
  if (!existing && fs.existsSync(templatePath)) {
    copyFileEnsuringDirs(templatePath, userEnvPath);
  }

  await dockerComposeUp(composePath, userEnvPath);
  await waitForHttp(webUrl, timeoutMs);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      nodeIntegration: false
    }
  });

  const webUrl = process.env.VIDEOGEN_WEB_URL ?? "http://localhost:3000";
  mainWindow.loadURL(webUrl).catch(() => {
    shell.openExternal(webUrl);
  });
}

app.whenReady().then(async () => {
  await startServicesIfNeeded().catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e);
  });
  createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

