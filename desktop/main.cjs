/* eslint-disable @typescript-eslint/no-require-imports -- Electron main process is CommonJS. */
const { app, BrowserWindow, shell } = require("electron");

const BOT_URL = process.env.FORUM_BOT_URL || "https://iabot.atlasitsm.geimser.cl/asistente";
const TRUSTED_ORIGINS = new Set([
  "https://iabot.atlasitsm.geimser.cl",
  "https://atlasitsm.geimser.cl",
]);

function isTrusted(url) {
  try {
    return TRUSTED_ORIGINS.has(new URL(url).origin);
  } catch {
    return false;
  }
}

function createWindow() {
  const window = new BrowserWindow({
    width: 460,
    height: 720,
    minWidth: 390,
    minHeight: 560,
    backgroundColor: "#07101d",
    autoHideMenuBar: true,
    title: "Asistente ITSM Forum",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });

  window.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));

  window.webContents.setWindowOpenHandler(({ url }) => {
    // The ITSM login uses postMessage back to this window, so it stays inside
    // Electron as a constrained child window instead of opening in a browser.
    if (isTrusted(url)) {
      return {
        action: "allow",
        overrideBrowserWindowOptions: {
          width: 520,
          height: 640,
          autoHideMenuBar: true,
          parent: window,
          modal: true,
          webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true },
        },
      };
    }
    void shell.openExternal(url);
    return { action: "deny" };
  });

  window.webContents.on("will-navigate", (event, url) => {
    if (!isTrusted(url)) {
      event.preventDefault();
      void shell.openExternal(url);
    }
  });

  window.webContents.on("will-redirect", (event, url) => {
    if (!isTrusted(url)) event.preventDefault();
  });

  window.loadURL(BOT_URL);
}

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
