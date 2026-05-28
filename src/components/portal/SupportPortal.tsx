"use client";

import {
  Bell,
  CalendarDays,
  Cloud,
  FileText,
  Folder,
  HardDrive,
  LayoutDashboard,
  Search,
  Settings,
  Wifi,
} from "lucide-react";
import { SondaAssistant } from "@/components/chat/AtlasAssistant";

const desktopFiles = [
  { label: "Mesa de Ayuda", type: "folder" },
  { label: "Tickets ITSM", type: "folder" },
  { label: "Manual VPN.pdf", type: "file" },
  { label: "Inventario", type: "drive" },
];

const finderRows = [
  { name: "Casos abiertos", kind: "Carpeta", date: "Hoy, 09:12" },
  { name: "Base de conocimiento", kind: "Carpeta", date: "Ayer, 18:40" },
  { name: "VPN y accesos", kind: "Carpeta", date: "Lun, 16:05" },
  { name: "Notebook lento.txt", kind: "Documento", date: "28 May, 09:03" },
  { name: "Impresoras corporativas.pdf", kind: "PDF", date: "27 May, 15:22" },
];

const dockApps = [
  { label: "Finder", icon: "/dock-icons/finder.png", open: true },
  { label: "Chrome", icon: "/dock-icons/chrome.png", open: true },
  { label: "ChatGPT", icon: "/dock-icons/chatgpt.png", open: true },
  { label: "VS Code", icon: "/dock-icons/vscode.png", open: true },
  { label: "Safari", icon: "/dock-icons/safari.png", open: true },
  { label: "Terminal", icon: "/dock-icons/terminal.png", open: true },
];

export function SupportPortal() {
  return (
    <main className="mac-real-desktop" aria-label="Escritorio macOS SONDA">
      <header className="mac-real-menu">
        <div className="mac-real-menu-left">
          <span className="apple-mark" aria-hidden>Apple</span>
          <strong>Finder</strong>
          <span>Archivo</span>
          <span>Edicion</span>
          <span>Visualizacion</span>
          <span>Ir</span>
          <span>Ventana</span>
          <span>Ayuda</span>
        </div>
        <div className="mac-real-menu-right">
          <Wifi size={15} aria-hidden />
          <Cloud size={15} aria-hidden />
          <Bell size={15} aria-hidden />
          <span>Jue 28 May 09:41</span>
        </div>
      </header>

      <section className="mac-real-stage" aria-label="Escritorio">
        <aside className="real-desktop-icons" aria-label="Archivos del escritorio">
          {desktopFiles.map((item) => {
            const Icon = item.type === "file" ? FileText : item.type === "drive" ? HardDrive : Folder;
            return (
              <button key={item.label} className="real-desktop-file" type="button">
                <span className={`desktop-file-icon desktop-file-${item.type}`}>
                  <Icon size={34} aria-hidden />
                </span>
                <span>{item.label}</span>
              </button>
            );
          })}
        </aside>

        <section className="finder-window" aria-label="Ventana Finder Mesa de Ayuda">
          <div className="finder-titlebar">
            <div className="traffic-lights" aria-hidden>
              <span className="red" />
              <span className="yellow" />
              <span className="green" />
            </div>
            <div className="finder-toolbar">
              <button type="button" aria-label="Atras">‹</button>
              <button type="button" aria-label="Adelante">›</button>
              <div className="finder-title">Mesa de Ayuda SONDA</div>
              <div className="finder-search">
                <Search size={13} aria-hidden />
                <span>Buscar</span>
              </div>
            </div>
          </div>

          <div className="finder-body">
            <nav className="finder-sidebar" aria-label="Barra lateral Finder">
              <span className="sidebar-label">Favoritos</span>
              <a className="active"><Folder size={16} aria-hidden /> Mesa de Ayuda</a>
              <a><LayoutDashboard size={16} aria-hidden /> Tickets</a>
              <a><Cloud size={16} aria-hidden /> iCloud Drive</a>
              <span className="sidebar-label">Ubicaciones</span>
              <a><HardDrive size={16} aria-hidden /> SONDA-MacBook</a>
              <a><Settings size={16} aria-hidden /> Sistemas</a>
            </nav>

            <div className="finder-content">
              <div className="finder-columns">
                <span>Nombre</span>
                <span>Clase</span>
                <span>Modificado</span>
              </div>
              {finderRows.map((row) => (
                <button key={row.name} className="finder-row" type="button">
                  <span>
                    {row.kind === "Carpeta" ? <Folder size={16} aria-hidden /> : <FileText size={16} aria-hidden />}
                    {row.name}
                  </span>
                  <span>{row.kind}</span>
                  <span>{row.date}</span>
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="calendar-widget" aria-label="Widget Calendario">
          <CalendarDays size={18} aria-hidden />
          <div>
            <span>Jueves</span>
            <strong>28</strong>
          </div>
        </section>
      </section>

      <nav className="mac-real-dock" aria-label="Dock macOS">
        {dockApps.map((app) => (
          <button key={app.label} className="real-dock-icon dock-image-icon" type="button" title={app.label}>
            <img src={app.icon} alt="" aria-hidden />
            {app.open ? <span className="dock-open-dot" aria-hidden /> : null}
          </button>
        ))}
        <span className="dock-separator" aria-hidden />
        <button className="real-dock-icon dock-stack-icon" type="button" title="Aplicaciones">
          <img src="/dock-icons/applications-folder.png" alt="" aria-hidden />
        </button>
        <button className="real-dock-icon dock-trash-real" type="button" title="Papelera">
          <img src="/dock-icons/trash.png" alt="" aria-hidden />
        </button>
      </nav>

      <div className="chat-corner-anchor">
        <SondaAssistant />
      </div>
    </main>
  );
}
