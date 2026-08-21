/* eslint-disable @typescript-eslint/no-require-imports -- Electron main process is CommonJS. */
const { app, BrowserWindow, Menu, Tray, ipcMain, nativeImage, screen, shell } = require("electron");

const BOT_URL = process.env.FORUM_BOT_URL || "https://iabot.demoitsm.cl/asistente";
const TRUSTED_ORIGINS = new Set([
  "https://iabot.demoitsm.cl",
  // Previously distributed Forum installers remain supported and constrained
  // to the same tenant rather than being interpreted as Geimser.
  "https://iabot.mda.demoitsm.cl",
  "https://iabot.atlasitsm.geimser.cl",
  "https://mda.demoitsm.cl",
]);
const COLLAPSED_SIZE = { width: 78, height: 78 };
// Keep the installed assistant aligned with the compact support window used by
// the web portal. The content itself scrolls when a conversation is longer.
const EXPANDED_SIZE = { width: 420, height: 528 };
const ASSISTANT_MARGIN = 16;

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
let isAssistantExpanded = false;

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
  setAssistantExpanded(true);
  mainWindow.setAlwaysOnTop(true, "floating");
  mainWindow.focus();
  mainWindow.webContents.send("forum-window:open");
}

function positionAssistant(size) {
  const { workArea } = screen.getPrimaryDisplay();
  const x = Math.max(workArea.x, workArea.x + workArea.width - size.width - ASSISTANT_MARGIN);
  const y = Math.max(workArea.y, workArea.y + workArea.height - size.height - ASSISTANT_MARGIN);
  mainWindow.setBounds({ x, y, width: size.width, height: size.height }, true);
}

function setAssistantExpanded(expanded) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const size = expanded ? EXPANDED_SIZE : COLLAPSED_SIZE;
  isAssistantExpanded = expanded;
  positionAssistant(size);
  mainWindow.setAlwaysOnTop(true, "floating");
}

function collapseAssistant() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.show();
  setAssistantExpanded(false);
  mainWindow.webContents.send("forum-window:collapse");
}

function createWindow() {
  mainWindow = new BrowserWindow({
    ...COLLAPSED_SIZE,
    minWidth: COLLAPSED_SIZE.width,
    minHeight: COLLAPSED_SIZE.height,
    resizable: false,
    movable: false,
    frame: false,
    transparent: true,
    hasShadow: true,
    alwaysOnTop: true,
    // La burbuja se mantiene en el escritorio; no ocupa espacio en la barra de tareas.
    skipTaskbar: true,
    show: false,
    backgroundColor: "#00000000",
    title: "Asistente ITSM Forum",
    webPreferences: {
      preload: `${__dirname}/preload.cjs`,
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
    // El asistente se minimiza a la burbuja; nunca desaparece del escritorio.
    event.preventDefault();
    collapseAssistant();
  });

  mainWindow.on("close", (event) => {
    if (!isQuitting) {
      event.preventDefault();
      collapseAssistant();
    }
  });

  mainWindow.once("ready-to-show", () => {
    // Esta transición es deliberadamente controlada por el proceso principal:
    // si el renderizador aún está iniciando, el icono Forum sigue apareciendo.
    collapseAssistant();
  });

  const botUrl = new URL(BOT_URL);
  botUrl.searchParams.set("desktop", "1");
  mainWindow.loadURL(botUrl.toString());
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
    ipcMain.on("forum-window:set-expanded", (_event, expanded) => setAssistantExpanded(expanded));
    screen.on("display-added", () => setAssistantExpanded(isAssistantExpanded));
    screen.on("display-removed", () => setAssistantExpanded(isAssistantExpanded));
    screen.on("display-metrics-changed", () => setAssistantExpanded(isAssistantExpanded));
    app.on("activate", showAssistant);
  });

  app.on("before-quit", () => {
    isQuitting = true;
  });
}
