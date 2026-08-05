/* eslint-disable @typescript-eslint/no-require-imports -- Electron preload runs as CommonJS. */
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("forumDesktop", {
  setExpanded: (expanded) => ipcRenderer.send("forum-window:set-expanded", Boolean(expanded)),
  onOpen: (callback) => {
    const listener = () => callback();
    ipcRenderer.on("forum-window:open", listener);
    return () => ipcRenderer.removeListener("forum-window:open", listener);
  },
  onCollapse: (callback) => {
    const listener = () => callback();
    ipcRenderer.on("forum-window:collapse", listener);
    return () => ipcRenderer.removeListener("forum-window:collapse", listener);
  },
});
