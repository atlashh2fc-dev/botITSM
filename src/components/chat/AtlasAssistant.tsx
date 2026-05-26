"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronUp,
  KeyRound,
  Laptop,
  Loader2,
  MessageSquareText,
  Minus,
  PackageCheck,
  Paperclip,
  RotateCcw,
  Send,
  UserRound,
  Wifi,
  X,
} from "lucide-react";
import type { ChatMessage, ITSMResponse, OperationalStatus, SessionContext, Ticket } from "@/lib/itsm/types";
import { SondaIcon } from "@/components/shared/BrandMark";

type ChatApiResponse = {
  response: ITSMResponse;
  sessionContext: SessionContext;
  ticket?: Ticket;
};

const sessionContextStorageKey = "sonda-active-session-context";

const smartActions = [
  {
    topic: "No puedo entrar al correo",
    title: "Correo / Acceso",
    icon: KeyRound,
    color: "#00FFFF",
    bg: "rgba(0,255,255,0.06)",
    border: "rgba(0,255,255,0.15)",
  },
  {
    topic: "VPN no funciona",
    title: "VPN / Red",
    icon: Wifi,
    color: "#3B82F6",
    bg: "rgba(59,130,246,0.06)",
    border: "rgba(59,130,246,0.15)",
  },
  {
    topic: "Necesito instalar software",
    title: "Software",
    icon: PackageCheck,
    color: "#8B5CF6",
    bg: "rgba(139,92,246,0.06)",
    border: "rgba(139,92,246,0.15)",
  },
  {
    topic: "Mi notebook está lenta",
    title: "Hardware",
    icon: Laptop,
    color: "#10B981",
    bg: "rgba(16,185,129,0.06)",
    border: "rgba(16,185,129,0.15)",
  },
  {
    topic: "Necesito acceso",
    title: "Privilegios",
    icon: AlertTriangle,
    color: "#EF4444",
    bg: "rgba(239,68,68,0.06)",
    border: "rgba(239,68,68,0.15)",
  },
  {
    topic: "Otro problema",
    title: "Otro caso",
    icon: MessageSquareText,
    color: "#FFFFFF",
    bg: "rgba(255,255,255,0.04)",
    border: "rgba(255,255,255,0.1)",
  },
];

const demoScreenshots = [
  {
    name: "screenshot-administrador-tareas-cpu-99.png",
    label: "CPU al 99% (Chrome)",
    url:
      "data:image/svg+xml;utf8," +
      encodeURIComponent(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 250" width="100%" height="100%">
        <rect width="400" height="250" rx="8" fill="#121212"/>
        <text x="20" y="30" fill="#ffffff" font-family="monospace" font-size="14" font-weight="bold">Task Manager - Resource Monitor</text>
        <line x1="20" y1="45" x2="380" y2="45" stroke="#333333" stroke-width="2"/>
        <rect x="20" y="60" width="360" height="40" rx="4" fill="#1e1e1e"/>
        <text x="30" y="84" fill="#00ffff" font-family="monospace" font-size="12" font-weight="bold">Google Chrome.exe</text>
        <text x="200" y="84" fill="#00ffff" font-family="monospace" font-size="12">CPU: 98.4%</text>
        <text x="300" y="84" fill="#888888" font-family="monospace" font-size="12">RAM: 7.2 GB</text>
        <path d="M 20,230 L 100,210 L 180,225 L 260,160 L 340,90 L 380,80" fill="none" stroke="#00ffff" stroke-width="3"/>
        <text x="20" y="195" fill="#00ffff" font-family="monospace" font-size="12" font-weight="bold">CPU SPIKE: 99.1%</text>
      </svg>
    `.trim()),
  },
  {
    name: "screenshot-disco-lleno.png",
    label: "Disco C:\\ Lleno (crítico)",
    url:
      "data:image/svg+xml;utf8," +
      encodeURIComponent(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 250" width="100%" height="100%">
        <rect width="400" height="250" rx="8" fill="#121212"/>
        <text x="20" y="30" fill="#ffffff" font-family="monospace" font-size="14" font-weight="bold">This PC - Drive Analyzer</text>
        <rect x="95" y="98" width="280" height="15" rx="3" fill="#333333"/>
        <rect x="95" y="98" width="265" height="15" rx="3" fill="#00ffff"/>
        <text x="95" y="132" fill="#00ffff" font-family="sans-serif" font-size="11" font-weight="bold">1.82 GB free of 256 GB (CRITICAL)</text>
      </svg>
    `.trim()),
  },
  {
    name: "screenshot-pantallazo-azul-bsod.png",
    label: "Pantallazo Azul (BSOD)",
    url:
      "data:image/svg+xml;utf8," +
      encodeURIComponent(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 250" rx="8" width="100%" height="100%">
        <rect width="400" height="250" fill="#0055ff"/>
        <text x="30" y="60" fill="#ffffff" font-family="sans-serif" font-size="48">:(</text>
        <text x="30" y="110" fill="#ffffff" font-family="sans-serif" font-size="13" font-weight="bold">Su PC sufrió un problema y necesita reiniciarse.</text>
        <text x="30" y="185" fill="#ffffff" font-family="monospace" font-size="9" font-weight="bold">Código: DRIVER_IRQL_NOT_LESS_OR_EQUAL</text>
      </svg>
    `.trim()),
  },
];

const initialMessage: ChatMessage = {
  id: "sonda-welcome",
  role: "assistant",
  createdAt: new Date().toISOString(),
  content: "Hola. Escríbeme qué falla y te guío con el siguiente paso.",
};

const statusLabels: Partial<Record<OperationalStatus, string>> = {
  "Detectando intención": "analizando...",
  "Clasificando según ITIL": "clasificando...",
  "Consultando base de conocimiento": "consultando guía...",
  "Ejecutando guía de descarte": "validando pasos...",
  "Preparando ticket": "preparando escalamiento...",
  "Cerrando caso": "cerrando caso...",
};

/* ─────────────────────────────────── COMPONENTE PRINCIPAL ─────────────────────────────────── */

export function SondaAssistant() {
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    const storedContext = readStoredSessionContext();
    return storedContext?.messages.length ? [initialMessage, ...storedContext.messages] : [initialMessage];
  });
  const [input, setInput] = useState("");
  const [context, setContext] = useState<SessionContext | undefined>(() => readStoredSessionContext());
  const [selectedUserEmail, setSelectedUserEmail] = useState(() => {
    const storedContext = readStoredSessionContext();
    return storedContext?.collectedFields?.correo || "";
  });
  const [status, setStatus] = useState("en línea");
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const [closed, setClosed] = useState(false);

  // Adjuntos
  const [attachedFile, setAttachedFile] = useState<{ name: string; url: string } | null>(null);
  const [showAttachmentMenu, setShowAttachmentMenu] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (messages.length <= 1 && !ticket && !isLoading) return;
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, ticket, isLoading, expanded]);

  useEffect(() => {
    const textarea = inputRef.current;
    if (!textarea) return;
    textarea.style.height = "0px";
    const nextHeight = Math.min(textarea.scrollHeight, 112);
    textarea.style.height = `${nextHeight}px`;
    textarea.style.overflowY = textarea.scrollHeight > 112 ? "auto" : "hidden";
  }, [input]);

  const hasConversation = useMemo(() => messages.length > 1, [messages.length]);

  async function sendMessage(
    message: string,
    fileToAttach?: { name: string; url: string } | null,
    overrideContext?: SessionContext,
  ) {
    const cleanMessage = message.trim();
    const activeFile = fileToAttach !== undefined ? fileToAttach : attachedFile;
    if (!cleanMessage && !activeFile) return;
    if (isLoading) return;

    setExpanded(true);
    setInput("");
    setAttachedFile(null);
    setShowAttachmentMenu(false);
    setTicket(null);
    setIsLoading(true);
    setStatus("analizando...");

    const optimisticMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: cleanMessage || `[Evidencia: ${activeFile?.name}]`,
      createdAt: new Date().toISOString(),
      attachmentName: activeFile?.name,
      attachmentUrl: activeFile?.url,
    };

    setMessages((current) => [...current, optimisticMessage]);

    const activeContext = overrideContext ?? context;
    const startTime = Date.now();

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userMessage: cleanMessage || `[Evidencia Adjunta: ${activeFile?.name}]`,
          sessionContext: activeContext,
          attachmentName: activeFile?.name,
          attachmentUrl: activeFile?.url,
        }),
      });

      if (!response.ok) throw new Error("Error de red");

      const payload = (await response.json()) as ChatApiResponse;
      
      // Simular tiempo de pensamiento/procesamiento técnico humano (mínimo 1600ms)
      const elapsedTime = Date.now() - startTime;
      const minDelay = 1600;
      if (elapsedTime < minDelay) {
        await new Promise((resolve) => setTimeout(resolve, minDelay - elapsedTime));
      }

      const refinedContext = refineAssistantTurn(payload.sessionContext, cleanMessage || `[Evidencia: ${activeFile?.name}]`);
      setContext(refinedContext);
      storeSessionContext(refinedContext);
      setMessages([initialMessage, ...refinedContext.messages]);
      setStatus(resolveStatus(payload.response.operationalStatuses));

      if (payload.ticket) {
        setTicket(payload.ticket);
        setStatus("caso registrado");
      }
    } catch {
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: "Tuve un problema procesando esto. Escríbeme nuevamente qué ocurre y lo retomamos.",
          createdAt: new Date().toISOString(),
        },
      ]);
      setStatus("reintentemos");
    } finally {
      setIsLoading(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void sendMessage(input);
  }

  // Se restablece todo limpiamente
  function startNewChat() {
    if (isLoading) return;
    clearStoredSessionContext();
    setContext(undefined);
    setMessages([initialMessage]);
    setInput("");
    setTicket(null);
    setAttachedFile(null);
    setShowAttachmentMenu(false);
    setStatus("en línea");
    setExpanded(true);
  }

  function handleUserChange(email: string) {
    if (isLoading) return;
    setSelectedUserEmail(email);

    if (!email) {
      clearStoredSessionContext();
      setContext(undefined);
      setMessages([initialMessage]);
      setInput("");
      setTicket(null);
      setAttachedFile(null);
      setShowAttachmentMenu(false);
      setStatus("en línea");
      return;
    }

    const userData =
      email === "lilian.leon@sonda.cl"
        ? { nombre: "Lilian Leon", correo: "lilian.leon@sonda.cl", area: "Operaciones" }
        : { nombre: "Francisco Martinez", correo: "francisco.martinez@sonda.cl", area: "Soporte TI" };

    const newContext: SessionContext = {
      sessionId: `session-${crypto.randomUUID()}`,
      collectedFields: userData,
      messages: [],
      stepsExecuted: [],
    };

    const greetingMsg: ChatMessage = {
      id: "sonda-welcome-personal",
      role: "assistant",
      createdAt: new Date().toISOString(),
      content: `Hola ${userData.nombre}. Soy el asistente de soporte TI de SONDA.\n\nVeo en la CMDB que perteneces al área de ${userData.area}. Escríbeme qué falla con tus equipos y lo resolvemos juntos.`,
    };

    setContext(newContext);
    setMessages([greetingMsg]);
    setInput("");
    setTicket(null);
    setAttachedFile(null);
    setShowAttachmentMenu(false);
    setStatus("en línea");
    storeSessionContext(newContext);
  }

  function handleSuggestion(topic: string) {
    if (isLoading) return;

    const freshContext: SessionContext = {
      sessionId: `session-${crypto.randomUUID()}`,
      collectedFields: context?.collectedFields ?? {},
      messages: [],
      stepsExecuted: [],
    };

    setContext(freshContext);
    setMessages([initialMessage]);
    setTicket(null);
    setAttachedFile(null);
    setShowAttachmentMenu(false);
    setStatus("en línea");

    void sendMessage(topic, null, freshContext);
  }

  /* ── Vista cerrada (botón flotante) ── */
  if (closed) {
    return (
      <button
        type="button"
        onClick={() => {
          setClosed(false);
          setExpanded(true);
        }}
        className="inline-flex h-11 items-center gap-2.5 rounded-full px-5 text-sm font-semibold transition-all duration-200"
        style={{
          background: "#000000",
          border: "1px solid rgba(0, 255, 255, 0.35)",
          color: "#00FFFF",
          boxShadow: "0 8px 32px rgba(0, 255, 255, 0.15), inset 0 0 8px rgba(0, 255, 255, 0.05)",
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLElement).style.borderColor = "#00FFFF";
          (e.currentTarget as HTMLElement).style.boxShadow = "0 0 20px rgba(0, 255, 255, 0.3)";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLElement).style.borderColor = "rgba(0, 255, 255, 0.35)";
          (e.currentTarget as HTMLElement).style.boxShadow = "0 8px 32px rgba(0, 255, 255, 0.15), inset 0 0 8px rgba(0, 255, 255, 0.05)";
        }}
      >
        <SondaIcon size={20} />
        Soporte SONDA
      </button>
    );
  }

  /* ── Vista principal (Contenedor Chatbot) ── */
  return (
    <section
      className="relative flex flex-col overflow-hidden"
      style={{
        width: "min(420px, calc(100vw - 32px))",
        height: "min(540px, calc(100dvh - 100px))",
        borderRadius: "20px",
        background: "linear-gradient(160deg, #0C0C0C 0%, #000000 100%)",
        border: "1px solid rgba(0, 255, 255, 0.16)",
        boxShadow: "0 32px 80px rgba(0,0,0,0.95), 0 0 0 1px rgba(0, 255, 255, 0.04) inset",
      }}
    >
      {/* Borde superior decorativo estilo Cyber HUD */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-[1.5px] rounded-t-[20px]"
        style={{ background: "linear-gradient(90deg, transparent 5%, #00FFFF 35%, #FFFFFF 65%, transparent 95%)" }}
      />

      {/* Brillo radial soft cyan de fondo */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: "radial-gradient(ellipse 60% 40% at 30% 0%, rgba(0,255,255,0.08), transparent 55%)",
        }}
      />

      {/* ── Header ── */}
      <header
        className="relative flex h-[54px] shrink-0 items-center justify-between px-4"
        style={{
          background: "rgba(0, 0, 0, 0.75)",
          borderBottom: "1px solid rgba(0, 255, 255, 0.12)",
          backdropFilter: "blur(16px)",
        }}
      >
        <div className="flex items-center gap-2.5">
          <SondaIcon size={24} />
          <div>
            <h1
              className="text-[13px] font-bold leading-tight tracking-[-0.01em]"
              style={{ color: "#FFFFFF" }}
            >
              Soporte SONDA
              <span className="mx-1.5 font-normal opacity-30">·</span>
              <span className="font-semibold text-[11px]" style={{ color: "rgba(255,255,255,0.7)" }}>Mesa de Ayuda</span>
            </h1>
            <p className="text-[9.5px] font-semibold uppercase tracking-wider" style={{ color: "#00FFFF", textShadow: "0 0 8px rgba(0,255,255,0.15)" }}>
              Asistente TI Inteligente
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={startNewChat}
            disabled={isLoading}
            title="Nuevo caso"
            className="inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-[10.5px] font-semibold transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-40"
            style={{
              border: "1px solid rgba(0, 255, 255, 0.2)",
              background: "rgba(0, 255, 255, 0.03)",
              color: "rgba(255, 255, 255, 0.8)",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.borderColor = "#00FFFF";
              (e.currentTarget as HTMLElement).style.color = "#00FFFF";
              (e.currentTarget as HTMLElement).style.background = "rgba(0, 255, 255, 0.08)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.borderColor = "rgba(0, 255, 255, 0.2)";
              (e.currentTarget as HTMLElement).style.color = "rgba(255, 255, 255, 0.8)";
              (e.currentTarget as HTMLElement).style.background = "rgba(0, 255, 255, 0.03)";
            }}
          >
            <RotateCcw size={10} aria-hidden />
            Nuevo
          </button>

          <button
            type="button"
            onClick={() => setExpanded((c) => !c)}
            className="grid size-7 place-items-center rounded-full transition-all duration-200"
            style={{ border: "1px solid rgba(255, 255, 255, 0.1)", background: "rgba(255, 255, 255, 0.03)", color: "rgba(255, 255, 255, 0.6)" }}
            aria-label={expanded ? "Minimizar" : "Expandir"}
            onMouseEnter={(e) => (e.currentTarget as HTMLElement).style.borderColor = "rgba(0, 255, 255, 0.3)"}
            onMouseLeave={(e) => (e.currentTarget as HTMLElement).style.borderColor = "rgba(255, 255, 255, 0.1)"}
          >
            {expanded ? <Minus size={14} aria-hidden /> : <ChevronUp size={14} aria-hidden />}
          </button>

          <button
            type="button"
            onClick={() => setClosed(true)}
            className="grid size-7 place-items-center rounded-full transition-all duration-200"
            style={{ border: "1px solid rgba(255, 255, 255, 0.1)", background: "rgba(255, 255, 255, 0.03)", color: "rgba(255, 255, 255, 0.6)" }}
            aria-label="Cerrar"
            onMouseEnter={(e) => (e.currentTarget as HTMLElement).style.borderColor = "rgba(0, 255, 255, 0.3)"}
            onMouseLeave={(e) => (e.currentTarget as HTMLElement).style.borderColor = "rgba(255, 255, 255, 0.1)"}
          >
            <X size={14} aria-hidden />
          </button>
        </div>
      </header>

      {/* ── Selector POC demo ── */}
      <div
        className="relative shrink-0 flex items-center justify-between gap-2 px-3.5 py-1.5 text-[11px] z-10"
        style={{ background: "rgba(0, 0, 0, 0.4)", borderBottom: "1px solid rgba(0, 255, 255, 0.06)" }}
      >
        <div className="flex items-center gap-1.5" style={{ color: "rgba(255, 255, 255, 0.5)" }}>
          <UserRound size={11} style={{ color: "#00FFFF" }} aria-hidden />
          <span>Sesión demo:</span>
        </div>
        <select
          value={selectedUserEmail}
          onChange={(e) => handleUserChange(e.target.value)}
          disabled={isLoading}
          className="rounded-md px-2 py-0.5 text-[11px] font-semibold outline-none cursor-pointer transition-all"
          style={{
            background: "#080808",
            border: "1px solid rgba(0, 255, 255, 0.18)",
            color: "#FFFFFF",
          }}
        >
          <option value="">Anónimo</option>
          <option value="lilian.leon@sonda.cl">Lilian Leon (Operaciones)</option>
          <option value="francisco.martinez@sonda.cl">Francisco Martinez (Soporte TI)</option>
        </select>
      </div>

      {expanded ? (
        <>
          {/* ── Área de mensajes ── */}
          <div ref={scrollRef} className="thin-scrollbar relative min-h-0 flex-1 overflow-y-auto px-3.5 py-3">
            <div className="space-y-3.5">
              {messages.map((message) => (
                <Bubble key={message.id} message={message} />
              ))}

              {!hasConversation ? (
                <div className="grid grid-cols-3 gap-1.5 pt-1">
                  {smartActions.map((action) => (
                    <SmartActionCard
                      key={action.topic}
                      action={action}
                      onClick={() => handleSuggestion(action.topic)}
                    />
                  ))}
                </div>
              ) : null}

              {isLoading ? <TypingIndicator /> : null}
              {ticket ? <RegisteredCase ticket={ticket} /> : null}
            </div>
          </div>

          {/* ── Input área ── */}
          <div
            className="relative shrink-0 flex flex-col gap-1.5 px-3.5 py-2.5"
            style={{
              background: "rgba(0, 0, 0, 0.8)",
              borderTop: "1px solid rgba(0, 255, 255, 0.12)",
              backdropFilter: "blur(16px)",
            }}
          >
            {/* Preview adjunto */}
            {attachedFile && (
              <div
                className="flex items-center justify-between gap-2 rounded-xl p-2 text-xs"
                style={{
                  border: "1px solid rgba(0, 255, 255, 0.25)",
                  background: "rgba(0, 255, 255, 0.05)",
                }}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <img src={attachedFile.url} alt={attachedFile.name} className="size-8 object-cover rounded-md shrink-0" style={{ border: "1px solid rgba(255,255,255,0.1)" }} />
                  <div className="min-w-0">
                    <p className="font-semibold truncate" style={{ color: "#FFFFFF" }}>{attachedFile.name}</p>
                    <p className="text-[10px]" style={{ color: "#00FFFF" }}>Evidencia lista para enviar</p>
                  </div>
                </div>
                <button type="button" onClick={() => setAttachedFile(null)} className="grid size-6 place-items-center rounded-full" style={{ color: "rgba(255, 255, 255, 0.6)" }}>
                  <X size={12} />
                </button>
              </div>
            )}

            {/* Menú adjuntos demo */}
            {showAttachmentMenu && (
              <div
                className="rounded-xl p-2 shadow-2xl flex flex-col gap-1.5 animate-fade-up"
                style={{
                  border: "1px solid rgba(0, 255, 255, 0.15)",
                  background: "#080808",
                }}
              >
                <div className="flex items-center justify-between px-1 mb-0.5">
                  <span className="text-[9.5px] font-bold uppercase tracking-wider" style={{ color: "rgba(255, 255, 255, 0.4)" }}>
                    Adjuntar evidencia técnica
                  </span>
                  <button type="button" onClick={() => setShowAttachmentMenu(false)} style={{ color: "rgba(255, 255, 255, 0.5)" }}>
                    <X size={11} />
                  </button>
                </div>
                <div className="grid grid-cols-1 gap-1">
                  {demoScreenshots.map((shot) => (
                    <button
                      key={shot.name}
                      type="button"
                      onClick={() => {
                        setAttachedFile({ name: shot.name, url: shot.url });
                        setShowAttachmentMenu(false);
                      }}
                      className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs font-medium transition-all duration-150"
                      style={{
                        border: "1px solid rgba(255, 255, 255, 0.05)",
                        background: "rgba(255, 255, 255, 0.02)",
                        color: "rgba(255, 255, 255, 0.7)",
                      }}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLElement).style.borderColor = "rgba(0, 255, 255, 0.35)";
                        (e.currentTarget as HTMLElement).style.background = "rgba(0, 255, 255, 0.06)";
                        (e.currentTarget as HTMLElement).style.color = "#FFFFFF";
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLElement).style.borderColor = "rgba(255, 255, 255, 0.05)";
                        (e.currentTarget as HTMLElement).style.background = "rgba(255, 255, 255, 0.02)";
                        (e.currentTarget as HTMLElement).style.color = "rgba(255, 255, 255, 0.7)";
                      }}
                    >
                      <span className="size-6 overflow-hidden rounded-md shrink-0" style={{ border: "1px solid rgba(255, 255, 255, 0.08)", background: "#000" }}>
                        <img src={shot.url} alt={shot.label} className="size-full object-cover" />
                      </span>
                      <span>{shot.label}</span>
                    </button>
                  ))}

                  <label
                    className="flex items-center justify-center gap-2 rounded-lg px-2.5 py-2 text-xs font-semibold transition-all duration-150 cursor-pointer"
                    style={{
                      border: "1px dashed rgba(255, 255, 255, 0.15)",
                      background: "rgba(255, 255, 255, 0.01)",
                      color: "rgba(255, 255, 255, 0.5)",
                    }}
                  >
                    <Paperclip size={12} />
                    <span>Subir desde tu equipo...</span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          const reader = new FileReader();
                          reader.onload = () => {
                            setAttachedFile({ name: file.name, url: reader.result as string });
                            setShowAttachmentMenu(false);
                          };
                          reader.readAsDataURL(file);
                        }
                      }}
                    />
                  </label>
                </div>
              </div>
            )}

            {/* Estado */}
            <div className="flex items-center justify-between text-[10.5px] font-medium mb-0.5">
              <div className="flex items-center gap-2" style={{ color: "rgba(255, 255, 255, 0.5)" }}>
                <span
                  className="size-1.5 rounded-full"
                  style={{
                    background: isLoading ? "#00FFFF" : "#00FF88",
                    boxShadow: isLoading
                      ? "0 0 8px rgba(0, 255, 255, 0.9)"
                      : "0 0 8px rgba(0, 255, 136, 0.7)",
                    animation: isLoading ? "pulse 1s ease-in-out infinite" : "none",
                  }}
                />
                {status}
              </div>
            </div>

            {/* Formulario envío */}
            <form onSubmit={handleSubmit} className="flex items-end gap-2">
              <button
                type="button"
                onClick={() => setShowAttachmentMenu((p) => !p)}
                className="grid size-10 shrink-0 place-items-center rounded-xl transition-all duration-200"
                style={{
                  border: showAttachmentMenu ? "1px solid rgba(0, 255, 255, 0.4)" : "1px solid rgba(255, 255, 255, 0.08)",
                  background: showAttachmentMenu ? "rgba(0, 255, 255, 0.08)" : "rgba(255, 255, 255, 0.03)",
                  color: showAttachmentMenu ? "#00FFFF" : "rgba(255, 255, 255, 0.6)",
                }}
                title="Adjuntar evidencia"
              >
                <Paperclip size={15} />
              </button>

              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void sendMessage(input);
                  }
                }}
                rows={1}
                placeholder={attachedFile ? "Agrega un comentario o envía..." : "Describe tu problema..."}
                className="thin-scrollbar max-h-28 min-h-10 flex-1 resize-none rounded-xl px-3.5 py-2.5 text-[13px] leading-5 outline-none transition-all duration-200"
                style={{
                  border: "1px solid rgba(255, 255, 255, 0.08)",
                  background: "rgba(255, 255, 255, 0.03)",
                  color: "#FFFFFF",
                }}
                onFocus={(e) => {
                  (e.currentTarget as HTMLElement).style.borderColor = "rgba(0, 255, 255, 0.4)";
                  (e.currentTarget as HTMLElement).style.background = "rgba(255, 255, 255, 0.05)";
                }}
                onBlur={(e) => {
                  (e.currentTarget as HTMLElement).style.borderColor = "rgba(255, 255, 255, 0.08)";
                  (e.currentTarget as HTMLElement).style.background = "rgba(255, 255, 255, 0.03)";
                }}
              />

              <button
                type="submit"
                disabled={(!input.trim() && !attachedFile) || isLoading}
                className="grid size-10 shrink-0 place-items-center rounded-xl transition-all duration-200 disabled:cursor-not-allowed"
                style={{
                  background: (!input.trim() && !attachedFile) || isLoading
                    ? "rgba(255, 255, 255, 0.04)"
                    : "linear-gradient(135deg, #00FFFF 0%, #0088FF 100%)",
                  color: (!input.trim() && !attachedFile) || isLoading ? "rgba(255, 255, 255, 0.3)" : "#000000",
                  boxShadow: (!input.trim() && !attachedFile) || isLoading
                    ? "none"
                    : "0 4px 16px rgba(0, 255, 255, 0.3)",
                  border: "1px solid rgba(255, 255, 255, 0.06)",
                }}
                aria-label="Enviar"
              >
                <Send size={15} aria-hidden />
              </button>
            </form>
          </div>
        </>
      ) : null}
    </section>
  );
}

/* ─────────────────────────────────── SUB-COMPONENTES ─────────────────────────────────── */

function SmartActionCard({
  action,
  onClick,
}: {
  action: (typeof smartActions)[number];
  onClick: () => void;
}) {
  const Icon = action.icon;

  return (
    <button
      type="button"
      onClick={onClick}
      className="group relative min-h-[52px] overflow-hidden rounded-xl text-left transition-all duration-200 focus:outline-none"
      style={{
        border: `1px solid ${action.border}`,
        background: action.bg,
        padding: "8px 10px",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.background = action.bg.replace("0.06", "0.14");
        (e.currentTarget as HTMLElement).style.transform = "translateY(-1.5px)";
        (e.currentTarget as HTMLElement).style.borderColor = action.color;
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.background = action.bg;
        (e.currentTarget as HTMLElement).style.transform = "translateY(0)";
        (e.currentTarget as HTMLElement).style.borderColor = action.border;
      }}
    >
      <div className="flex flex-col gap-1.5">
        <span className="grid size-6 shrink-0 place-items-center rounded-lg" style={{ background: "rgba(255,255,255,0.06)", color: action.color }}>
          <Icon size={12} aria-hidden />
        </span>
        <span className="block text-[11px] font-semibold leading-tight" style={{ color: "#FFFFFF" }}>
          {action.title}
        </span>
      </div>
    </button>
  );
}

function Bubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";

  const welcomeIds = ["sonda-welcome", "sonda-welcome-personal", "atlas-welcome", "atlas-welcome-personal"];
  if (welcomeIds.includes(message.id)) {
    return (
      <div
        className="max-w-[86%] rounded-2xl px-3.5 py-2.5 text-[13px] leading-5"
        style={{
          border: "1px solid rgba(0, 255, 255, 0.22)",
          background: "rgba(0, 255, 255, 0.05)",
          color: "#E5E5E5",
        }}
      >
        <p className="whitespace-pre-line">{message.content}</p>
      </div>
    );
  }

  return (
    <div className={`flex gap-2.5 ${isUser ? "justify-end" : "justify-start"}`}>
      {!isUser ? (
        <span
          className="mt-0.5 grid size-[24px] shrink-0 place-items-center rounded-lg"
          style={{
            border: "1px solid rgba(0, 255, 255, 0.25)",
            background: "rgba(0, 255, 255, 0.06)",
          }}
        >
          <SondaIcon size={14} />
        </span>
      ) : null}

      <div
        className="max-w-[80%] flex flex-col gap-2"
        style={{
          borderRadius: isUser ? "16px 4px 16px 16px" : "4px 16px 16px 16px",
          padding: "9px 13px",
          ...(isUser
            ? {
                background: "linear-gradient(135deg, #00FFFF 0%, #0088FF 100%)",
                border: "1px solid rgba(0, 255, 255, 0.35)",
                color: "#000000",
                boxShadow: "0 4px 16px rgba(0, 255, 255, 0.15)",
                fontWeight: 500,
              }
            : {
                border: "1px solid rgba(255, 255, 255, 0.08)",
                background: "rgba(255, 255, 255, 0.03)",
                color: "#EAEAEA",
              }),
        }}
      >
        {message.attachmentUrl ? (
          <div className="relative overflow-hidden rounded-lg p-1 flex flex-col gap-1" style={{ border: "1px solid rgba(255,255,255,0.06)", background: "rgba(0,0,0,0.5)" }}>
            <img src={message.attachmentUrl} alt={message.attachmentName || "Evidencia"} className="max-h-40 object-cover rounded-md" />
            <span className="text-[10px] font-mono px-1 truncate" style={{ color: "rgba(255,255,255,0.4)" }}>
              📎 {message.attachmentName || "evidencia.png"}
            </span>
          </div>
        ) : null}
        {message.content ? (
          <p className="text-[13px] leading-[1.55] whitespace-pre-line">{message.content}</p>
        ) : null}
      </div>

      {isUser ? (
        <span
          className="mt-0.5 grid size-[24px] shrink-0 place-items-center rounded-lg"
          style={{
            border: "1px solid rgba(255,255,255,0.1)",
            background: "rgba(255,255,255,0.04)",
            color: "rgba(255,255,255,0.6)",
          }}
        >
          <UserRound size={12} aria-hidden />
        </span>
      ) : null}
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex items-center gap-3 pl-8 text-[12.5px]" style={{ color: "rgba(255, 255, 255, 0.45)" }}>
      <span className="flex gap-1.5 items-center">
        {[0, 1, 2].map(i => (
          <span key={i} style={{
            width: 5,
            height: 5,
            borderRadius: "50%",
            background: "#00FFFF",
            boxShadow: "0 0 6px rgba(0, 255, 255, 0.6)",
            animation: `sonda-dot-blink 1.4s ease-in-out ${i * 0.18}s infinite`,
            display: "inline-block",
          }} />
        ))}
      </span>
      <span style={{ fontStyle: "italic" }}>Soporte SONDA está analizando tu caso...</span>
    </div>
  );
}

function RegisteredCase({ ticket }: { ticket: Ticket }) {
  return (
    <article
      className="ml-8 flex flex-col gap-3 rounded-2xl p-4"
      style={{
        border: "1px solid rgba(0, 255, 255, 0.3)",
        background: "linear-gradient(135deg, rgba(0, 255, 255, 0.05) 0%, rgba(0, 255, 255, 0.01) 100%)",
        boxShadow: "0 8px 32px rgba(0, 255, 255, 0.05)",
      }}
    >
      <div className="flex items-center gap-2 text-sm font-bold" style={{ color: "#00FFFF" }}>
        <CheckCircle2 size={16} style={{ color: "#00FFFF" }} aria-hidden />
        Caso registrado exitosamente
      </div>

      <p className="font-data text-xs font-semibold" style={{ color: "rgba(255,255,255,0.7)" }}>
        {ticket.id}
      </p>

      <div className="space-y-2.5 text-sm">
        <CaseLine label="Resumen" value={summarize(ticket.description)} />
        <CaseLine label="Prioridad" value={priorityText(ticket.priority)} />
        <CaseLine
          label="Siguiente acción"
          value={ticket.assignedTeam.includes("Redes") ? "Derivación a soporte de redes" : ticket.nextAction}
        />
        <CaseLine label="SLA estimado" value={ticket.estimatedSla.replace("respuesta inicial", "")} />
      </div>

      {ticket.attachmentName && (
        <div className="border-t pt-3 flex flex-col gap-1.5" style={{ borderColor: "rgba(255,255,255,0.05)" }}>
          <p className="text-[10px] font-bold uppercase tracking-[0.1em]" style={{ color: "rgba(255, 255, 255, 0.4)" }}>
            Evidencia técnica adjunta
          </p>
          <div
            className="flex items-center gap-3 rounded-xl p-2 text-xs"
            style={{ border: "1px solid rgba(0, 255, 255, 0.15)", background: "rgba(0, 0, 0, 0.5)" }}
          >
            {ticket.attachmentUrl ? (
              <img src={ticket.attachmentUrl} alt={ticket.attachmentName} className="size-10 object-cover rounded-lg shrink-0" style={{ border: "1px solid rgba(255,255,255,0.08)" }} />
            ) : (
              <Paperclip size={15} style={{ color: "#00FFFF" }} className="shrink-0" />
            )}
            <div className="min-w-0 flex-1">
              <p className="font-semibold truncate" style={{ color: "#FFFFFF" }}>{ticket.attachmentName}</p>
              <p className="text-[10.5px] italic mt-0.5 leading-4" style={{ color: "rgba(255,255,255,0.7)" }}>
                {ticket.attachmentAnalysis || "Análisis técnico completado por soporte SONDA"}
              </p>
            </div>
          </div>
        </div>
      )}
    </article>
  );
}

function CaseLine({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10.5px] font-bold uppercase tracking-[0.1em]" style={{ color: "rgba(255, 255, 255, 0.4)" }}>
        {label}
      </p>
      <p className="mt-0.5 leading-5" style={{ color: "#FFFFFF" }}>
        {value}
      </p>
    </div>
  );
}

/* ─────────────────────────────────── HELPERS ─────────────────────────────────── */

function resolveStatus(states: OperationalStatus[]) {
  const state = states.at(-1);
  return (state && statusLabels[state]) ?? "analizando...";
}

function priorityText(priority: Ticket["priority"]) {
  const labels: Record<Ticket["priority"], string> = {
    P1: "Crítica — Atención inmediata",
    P2: "Alta — 4 horas hábiles",
    P3: "Media — 8 horas hábiles",
    P4: "Baja — 48 horas hábiles",
  };
  return labels[priority];
}

function summarize(description: string) {
  return description.split("|")[0]?.trim() || description;
}

function refineAssistantTurn(sessionContext: SessionContext, userMessage: string): SessionContext {
  const messages = sessionContext.messages.map((message, index, list) => {
    const isLastAssistant = message.role === "assistant" && index === list.length - 1;

    if (!isLastAssistant) {
      return message.role === "assistant" ? { ...message, content: removeAssumedName(message.content) } : message;
    }

    return {
      ...message,
      content: responseForSuggestion(userMessage) ?? removeAssumedName(message.content),
    };
  });

  return { ...sessionContext, messages };
}

function responseForSuggestion(message: string) {
  const normalized = message.trim().toLowerCase();

  if (normalized === "vpn no funciona") {
    return "Entendido.\n\n¿El problema ocurre al conectarte desde fuera de la red corporativa o también dentro de oficina?";
  }
  if (normalized === "no puedo entrar al correo") {
    return "Entendido.\n\n¿El acceso falla por contraseña, MFA o aparece algún mensaje específico en Outlook?";
  }
  if (normalized === "necesito instalar software") {
    return "Entendido.\n\n¿Qué software necesitas instalar y en qué equipo corporativo debe quedar habilitado?";
  }
  if (normalized === "mi notebook está lenta") {
    return "Entendido.\n\n¿La lentitud ocurre desde el inicio del equipo o principalmente al usar una aplicación específica?";
  }
  if (normalized === "necesito acceso") {
    return "Entendido.\n\n¿A qué sistema, carpeta o recurso necesitas acceder y ya cuentas con aprobación del responsable?";
  }
  if (normalized === "otro problema") {
    return "Entendido.\n\nDescríbeme brevemente qué está ocurriendo, desde cuándo pasa y si afecta solo a tu usuario o a más personas.";
  }

  return undefined;
}

function removeAssumedName(message: string) {
  return message
    .replace(/\bHugo,\s*/g, "")
    .replace(/^Hugo,\s*/g, "")
    .trim();
}

function readStoredSessionContext() {
  if (typeof window === "undefined") return undefined;
  try {
    const raw = window.localStorage.getItem(sessionContextStorageKey);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as SessionContext;
    return Array.isArray(parsed.messages) && Array.isArray(parsed.stepsExecuted) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function storeSessionContext(sessionContext: SessionContext) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(sessionContextStorageKey, JSON.stringify(sessionContext));
}

function clearStoredSessionContext() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(sessionContextStorageKey);
}
