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
  TerminalSquare,
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
  { label: "Finder", className: "dock-finder" },
  { label: "Safari", className: "dock-safari" },
  { label: "Messages", className: "dock-messages" },
  { label: "Mail", className: "dock-mail" },
  { label: "Calendar", className: "dock-calendar" },
  { label: "Terminal", className: "dock-terminal" },
  { label: "System Settings", className: "dock-settings" },
  { label: "Trash", className: "dock-trash" },
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
          <button key={app.label} className={`real-dock-icon ${app.className}`} type="button" title={app.label}>
            {app.label === "Terminal" ? <TerminalSquare size={28} aria-hidden /> : null}
            {app.label === "System Settings" ? <Settings size={28} aria-hidden /> : null}
            {app.label === "Trash" ? <span className="trash-lines" aria-hidden /> : null}
          </button>
        ))}
      </nav>

      <div className="chat-corner-anchor">
        <SondaAssistant />
      </div>
    </main>
  );
}
