"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ExternalLink,
  Headphones,
  KeyRound,
  Mic,
  MicOff,
  Pause,
  Phone,
  PhoneCall,
  PhoneOff,
  Play,
  ShieldCheck,
  X,
} from "lucide-react";

type PhoneStatus = "locked" | "connecting" | "ready" | "ringing" | "active" | "offline" | "error";

type PhoneConfig = {
  extension: string;
  authorizationUsername: string;
  password: string;
  aor: string;
  webSocketServer: string;
  agentEmail: string;
};

type TrackedCall = {
  callId: string;
  fromNumber: string;
  toNumber: string;
  queue?: string | null;
  agentExtension?: string | null;
  status: string;
  cause?: string | null;
  durationSeconds?: number | null;
  ticketId?: string | null;
  ticketNumber?: string | null;
  ticketUrl?: string | null;
  startedAt: string;
  answeredAt?: string | null;
  endedAt?: string | null;
};

type SimplePhone = {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  register(): Promise<void>;
  unregister(): Promise<void>;
  answer(): Promise<void>;
  hangup(): Promise<void>;
  decline(): Promise<void>;
  hold(): Promise<void>;
  unhold(): Promise<void>;
  mute(): void;
  unmute(): void;
};

const STATUS_LABEL: Record<PhoneStatus, string> = {
  locked: "Activación requerida",
  connecting: "Conectando…",
  ready: "Disponible",
  ringing: "Llamada entrante",
  active: "En llamada",
  offline: "Sin conexión",
  error: "Revisar conexión",
};

export function AgentSoftphone({
  userEmail,
  onOpenTicket,
}: {
  userEmail: string;
  onOpenTicket: (ticketId: string) => void;
}) {
  const phoneRef = useRef<SimplePhone | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [sessionRevision, setSessionRevision] = useState(0);
  const [status, setStatus] = useState<PhoneStatus>("connecting");
  const [extension, setExtension] = useState("6020");
  const [open, setOpen] = useState(false);
  const [accessCode, setAccessCode] = useState("");
  const [error, setError] = useState("");
  const [activeCall, setActiveCall] = useState<TrackedCall | null>(null);
  const [muted, setMuted] = useState(false);
  const [held, setHeld] = useState(false);
  const [activating, setActivating] = useState(false);

  useEffect(() => {
    let disposed = false;
    let phone: SimplePhone | null = null;

    async function startPhone() {
      setStatus("connecting");
      setError("");
      const response = await fetch("/api/telephony/agent/config", {
        credentials: "same-origin",
        cache: "no-store",
      });
      if (response.status === 401) {
        if (!disposed) {
          setStatus("locked");
          setOpen(true);
        }
        return;
      }
      const payload = await response.json().catch(() => ({})) as Partial<PhoneConfig> & { error?: string };
      if (!response.ok || !payload.password || !payload.aor || !payload.webSocketServer) {
        throw new Error(payload.error || "No fue posible cargar la configuración SIP.");
      }
      if (disposed) return;

      setExtension(payload.extension || "6020");
      const { Web } = await import("sip.js");
      if (disposed) return;

      phone = new Web.SimpleUser(payload.webSocketServer, {
        aor: payload.aor,
        media: {
          constraints: { audio: true, video: false },
          remote: { audio: audioRef.current ?? undefined },
        },
        reconnectionAttempts: 6,
        reconnectionDelay: 3,
        userAgentOptions: {
          authorizationUsername: payload.authorizationUsername || payload.extension,
          authorizationPassword: payload.password,
          displayName: `Mesa de ayuda ${payload.extension || "6020"}`,
        },
        delegate: {
          onServerConnect: () => {
            if (!disposed) setStatus("connecting");
          },
          onServerDisconnect: (disconnectError?: Error) => {
            if (!disposed) {
              setStatus("offline");
              if (disconnectError) setError("Se perdió la conexión con Asterisk.");
            }
          },
          onRegistered: () => {
            if (!disposed) {
              setStatus("ready");
              setError("");
            }
          },
          onUnregistered: () => {
            if (!disposed) setStatus("offline");
          },
          onCallReceived: () => {
            if (!disposed) {
              setStatus("ringing");
              setOpen(true);
              setMuted(false);
              setHeld(false);
            }
          },
          onCallAnswered: () => {
            if (!disposed) {
              setStatus("active");
              setOpen(true);
            }
          },
          onCallHangup: () => {
            if (!disposed) {
              setStatus("ready");
              setMuted(false);
              setHeld(false);
            }
          },
          onCallHold: (isHeld: boolean) => {
            if (!disposed) setHeld(isHeld);
          },
        },
      }) as SimplePhone;
      phoneRef.current = phone;
      await phone.connect();
      if (!disposed) await phone.register();
    }

    void startPhone().catch((startError) => {
      if (!disposed) {
        setStatus("error");
        setOpen(true);
        setError(startError instanceof Error ? startError.message : "No fue posible conectar con Asterisk.");
      }
    });

    return () => {
      disposed = true;
      if (phoneRef.current === phone) phoneRef.current = null;
      if (phone) {
        void phone.unregister().catch(() => undefined);
        void phone.disconnect().catch(() => undefined);
      }
    };
  }, [sessionRevision]);

  useEffect(() => {
    if (status === "locked") return;
    let disposed = false;

    async function refreshCall() {
      const response = await fetch("/api/telephony/agent/call", {
        credentials: "same-origin",
        cache: "no-store",
      });
      if (response.status === 401) {
        if (!disposed) setStatus("locked");
        return;
      }
      if (!response.ok) return;
      const payload = await response.json() as { call?: TrackedCall | null };
      if (!disposed) setActiveCall(payload.call ?? null);
    }

    void refreshCall();
    const timer = window.setInterval(() => { void refreshCall(); }, status === "ringing" || status === "active" ? 1500 : 4000);
    return () => {
      disposed = true;
      window.clearInterval(timer);
    };
  }, [status]);

  async function activatePhone() {
    if (!accessCode.trim()) return;
    setActivating(true);
    setError("");
    try {
      const response = await fetch("/api/telephony/agent/session", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessCode, email: userEmail }),
      });
      const payload = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "No fue posible activar la telefonía.");
      setAccessCode("");
      setSessionRevision(current => current + 1);
    } catch (activationError) {
      setError(activationError instanceof Error ? activationError.message : "Código de activación inválido.");
    } finally {
      setActivating(false);
    }
  }

  async function answerCall() {
    try {
      await audioRef.current?.play().catch(() => undefined);
      await phoneRef.current?.answer();
    } catch {
      setError("No fue posible contestar. Revisa el permiso del micrófono.");
    }
  }

  async function endCall() {
    try {
      if (status === "ringing") await phoneRef.current?.decline();
      else await phoneRef.current?.hangup();
    } catch {
      setError("No fue posible finalizar la llamada desde el navegador.");
    }
  }

  function toggleMute() {
    if (!phoneRef.current) return;
    if (muted) phoneRef.current.unmute();
    else phoneRef.current.mute();
    setMuted(current => !current);
  }

  async function toggleHold() {
    if (!phoneRef.current) return;
    try {
      if (held) await phoneRef.current.unhold();
      else await phoneRef.current.hold();
    } catch {
      setError("Asterisk no confirmó la espera de la llamada.");
    }
  }

  async function closePhoneSession() {
    try {
      await phoneRef.current?.unregister().catch(() => undefined);
      await phoneRef.current?.disconnect().catch(() => undefined);
      await fetch("/api/telephony/agent/session", { method: "DELETE", credentials: "same-origin" });
    } finally {
      phoneRef.current = null;
      setActiveCall(null);
      setStatus("locked");
      setOpen(true);
    }
  }

  const statusColor = status === "ready" ? "#1F7A4D"
    : status === "ringing" ? "#B86E00"
    : status === "active" ? "#004481"
    : status === "connecting" ? "#5C5AA8"
    : "#B42318";

  return (
    <>
      <audio ref={audioRef} autoPlay playsInline />
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Abrir teléfono de mesa de ayuda"
          style={{
            position: "fixed", right: 20, bottom: 20, zIndex: 80,
            width: 52, height: 52, borderRadius: "50%", border: "none",
            display: "grid", placeItems: "center", cursor: "pointer",
            color: "#fff", background: statusColor,
            boxShadow: "0 10px 28px rgba(7,33,70,0.28)",
            animation: status === "ringing" ? "pulse 1.1s infinite" : undefined,
          }}
        >
          {status === "ringing" ? <PhoneCall size={22} /> : <Headphones size={22} />}
        </button>
      )}

      {open && (
        <aside
          aria-label="Softphone de mesa de ayuda"
          style={{
            position: "fixed", right: 20, bottom: 20, zIndex: 80,
            width: 340, overflow: "hidden", borderRadius: 12,
            border: "1px solid #D5E1E8", background: "#fff",
            boxShadow: "0 18px 50px rgba(7,33,70,0.24)",
            fontFamily: "'Outfit', 'Plus Jakarta Sans', 'Segoe UI', sans-serif",
          }}
        >
          <header style={{ padding: "13px 14px", color: "#fff", background: "#072146", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ width: 32, height: 32, borderRadius: 8, display: "grid", placeItems: "center", background: "rgba(255,255,255,0.12)" }}>
                <Headphones size={18} />
              </span>
              <div>
                <p style={{ margin: 0, fontSize: 13, fontWeight: 800 }}>Telefonía · Mesa de ayuda</p>
                <p style={{ margin: "2px 0 0", fontSize: 10, opacity: 0.75 }}>Agente {extension} · sólo llamadas entrantes</p>
              </div>
            </div>
            <button type="button" onClick={() => setOpen(false)} aria-label="Minimizar teléfono" style={{ border: 0, background: "transparent", color: "#fff", cursor: "pointer", padding: 4 }}>
              <X size={17} />
            </button>
          </header>

          <div style={{ padding: 14 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: statusColor, fontSize: 11, fontWeight: 800 }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: statusColor }} />
                {STATUS_LABEL[status]}
              </span>
              {status !== "locked" && (
                <button type="button" onClick={() => { void closePhoneSession(); }} style={{ border: 0, background: "transparent", color: "#64748B", fontSize: 10, cursor: "pointer" }}>
                  Desactivar
                </button>
              )}
            </div>

            {status === "locked" ? (
              <div style={{ borderRadius: 9, background: "#F4F7F8", border: "1px solid #D5E1E8", padding: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 7, color: "#0F172A", fontSize: 12, fontWeight: 800, marginBottom: 5 }}>
                  <KeyRound size={15} color="#004481" /> Activar puesto telefónico
                </div>
                <p style={{ margin: "0 0 10px", color: "#64748B", fontSize: 11, lineHeight: 1.45 }}>
                  Ingresa el código entregado por el administrador. La credencial SIP no se guarda en el navegador.
                </p>
                <div style={{ display: "flex", gap: 7 }}>
                  <input
                    type="password"
                    value={accessCode}
                    onChange={event => setAccessCode(event.target.value)}
                    onKeyDown={event => { if (event.key === "Enter") void activatePhone(); }}
                    placeholder="Código de activación"
                    autoComplete="off"
                    style={{ flex: 1, minWidth: 0, border: "1px solid #C6D3DC", borderRadius: 6, padding: "8px 9px", font: "inherit", fontSize: 11 }}
                  />
                  <button type="button" disabled={activating || !accessCode.trim()} onClick={() => { void activatePhone(); }} style={{ border: 0, borderRadius: 6, background: "#004481", color: "#fff", padding: "0 12px", fontSize: 11, fontWeight: 800, cursor: "pointer", opacity: activating ? 0.6 : 1 }}>
                    {activating ? "…" : "Activar"}
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div style={{ minHeight: 112, display: "grid", placeItems: "center", textAlign: "center", borderRadius: 9, background: status === "ringing" ? "#FFF7E8" : "#F4F7F8", border: `1px solid ${status === "ringing" ? "#F0C36A" : "#D5E1E8"}`, padding: 12 }}>
                  {activeCall ? (
                    <div>
                      <p style={{ margin: 0, color: "#64748B", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em" }}>Llamada desde</p>
                      <p style={{ margin: "5px 0 2px", color: "#0F172A", fontSize: 22, fontWeight: 900 }}>{formatPhone(activeCall.fromNumber)}</p>
                      <p style={{ margin: 0, color: "#64748B", fontSize: 11 }}>{activeCall.queue || "Mesa de ayuda Forum"}</p>
                    </div>
                  ) : (
                    <div>
                      <Phone size={24} color="#64748B" />
                      <p style={{ margin: "7px 0 0", color: "#334155", fontSize: 12, fontWeight: 700 }}>
                        {status === "ready"
                          ? "Esperando llamadas"
                          : status === "ringing"
                            ? "Llamada entrante"
                            : status === "active"
                              ? "Llamada en curso"
                              : status === "connecting"
                                ? "Registrando agente…"
                                : "Conexión telefónica no disponible"}
                      </p>
                    </div>
                  )}
                </div>

                {(status === "ringing" || status === "active") && (
                  <div style={{ display: "grid", gridTemplateColumns: status === "ringing" ? "1fr 1fr" : "repeat(3, 1fr)", gap: 8, marginTop: 10 }}>
                    {status === "ringing" && (
                      <PhoneButton label="Contestar" color="#1F7A4D" icon={<PhoneCall size={18} />} onClick={() => { void answerCall(); }} />
                    )}
                    {status === "active" && (
                      <>
                        <PhoneButton label={muted ? "Activar mic." : "Silenciar"} color={muted ? "#B86E00" : "#334155"} icon={muted ? <Mic size={17} /> : <MicOff size={17} />} onClick={toggleMute} />
                        <PhoneButton label={held ? "Retomar" : "Espera"} color={held ? "#B86E00" : "#334155"} icon={held ? <Play size={17} /> : <Pause size={17} />} onClick={() => { void toggleHold(); }} />
                      </>
                    )}
                    <PhoneButton label={status === "ringing" ? "Rechazar" : "Colgar"} color="#B42318" icon={<PhoneOff size={18} />} onClick={() => { void endCall(); }} />
                  </div>
                )}

                {activeCall?.ticketNumber && (
                  <div style={{ marginTop: 10, borderRadius: 8, border: "1px solid #B8D8C7", background: "#F0F8F4", padding: 10, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                    <div style={{ minWidth: 0 }}>
                      <p style={{ margin: 0, color: "#1F7A4D", fontSize: 10, fontWeight: 800, display: "flex", alignItems: "center", gap: 5 }}><ShieldCheck size={13} /> Ticket registrado</p>
                      <p style={{ margin: "3px 0 0", color: "#0F172A", fontSize: 13, fontWeight: 900 }}>#{activeCall.ticketNumber}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        if (activeCall.ticketId) onOpenTicket(activeCall.ticketId);
                        else if (activeCall.ticketUrl) window.open(activeCall.ticketUrl, "_blank", "noopener,noreferrer");
                      }}
                      style={{ border: "1px solid #1F7A4D", borderRadius: 6, background: "#fff", color: "#1F7A4D", padding: "6px 8px", fontSize: 10, fontWeight: 800, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4 }}
                    >
                      Abrir <ExternalLink size={12} />
                    </button>
                  </div>
                )}
              </>
            )}

            {error && <p role="alert" style={{ margin: "9px 0 0", color: "#B42318", fontSize: 10, lineHeight: 1.4 }}>{error}</p>}
          </div>
        </aside>
      )}
    </>
  );
}

function PhoneButton({
  label,
  color,
  icon,
  onClick,
}: {
  label: string;
  color: string;
  icon: ReactNode;
  onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick} style={{ border: 0, borderRadius: 8, background: color, color: "#fff", padding: "9px 6px", display: "flex", flexDirection: "column", alignItems: "center", gap: 4, fontSize: 10, fontWeight: 800, cursor: "pointer" }}>
      {icon}
      {label}
    </button>
  );
}

function formatPhone(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("56")) {
    return `+${digits.slice(0, 2)} ${digits.slice(2, 3)} ${digits.slice(3, 7)} ${digits.slice(7)}`;
  }
  return value || "Número privado";
}
