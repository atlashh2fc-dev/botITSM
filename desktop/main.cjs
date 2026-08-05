/* eslint-disable @typescript-eslint/no-require-imports -- Electron main process is CommonJS. */
const { app, BrowserWindow, Menu, Tray, nativeImage, shell } = require("electron");

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

let mainWindow;
let tray;
let isQuitting = false;

function createTrayIcon() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
    <rect width="32" height="32" rx="8" fill="#004481"/>
    <rect x="2" y="2" width="28" height="28" rx="6" fill="none" stroke="#5BBEFF" stroke-width="2"/>
    <text x="16" y="23" text-anchor="middle" font-family="Arial, sans-serif" font-weight="700" font-size="18" fill="#fff">F</text>
  </svg>`;
  return nativeImage.createFromDataURL(`data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`);
}

function showAssistant() {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.setAlwaysOnTop(true, "floating");
  mainWindow.focus();
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 460,
    height: 720,
    minWidth: 400,
    minHeight: 560,
    resizable: false,
    frame: false,
    transparent: true,
    hasShadow: true,
    alwaysOnTop: true,
    skipTaskbar: false,
    backgroundColor: "#00000000",
    title: "Asistente ITSM Forum",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });

  mainWindow.setAlwaysOnTop(true, "floating");
  mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  mainWindow.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    // The ITSM login uses postMessage back to this window, so it stays inside
    // Electron as a constrained child window instead of opening in a browser.
    if (isTrusted(url)) {
      return {
        action: "allow",
        overrideBrowserWindowOptions: {
          width: 520,
          height: 640,
          autoHideMenuBar: true,
          parent: mainWindow,
          modal: true,
          webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true },
        },
      };
    }
    void shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (!isTrusted(url)) {
      event.preventDefault();
      void shell.openExternal(url);
    }
  });

  mainWindow.webContents.on("will-redirect", (event, url) => {
    if (!isTrusted(url)) event.preventDefault();
  });

  mainWindow.on("minimize", (event) => {
    // El asistente se minimiza desde su propio control; la ventana no desaparece del escritorio.
    event.preventDefault();
    showAssistant();
  });

  mainWindow.on("close", (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.loadURL(BOT_URL);
}

function createTray() {
  tray = new Tray(createTrayIcon());
  tray.setToolTip("Asistente ITSM Forum");
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "Abrir asistente", click: showAssistant },
    { type: "separator" },
    {
      label: "Salir",
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]));
  tray.on("click", showAssistant);
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", showAssistant);

  app.whenReady().then(() => {
    if (process.platform === "win32") {
      app.setLoginItemSettings({ openAtLogin: true, openAsHidden: false });
    }

    createWindow();
    createTray();
    app.on("activate", showAssistant);
  });

  app.on("before-quit", () => {
    isQuitting = true;
  });
}
