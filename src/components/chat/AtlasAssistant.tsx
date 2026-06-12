"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronUp,
  HardDrive,
  KeyRound,
  Laptop,
  LogIn,
  MessageSquareText,
  Minus,
  PackageCheck,
  Paperclip,
  RotateCcw,
  Send,
  ShieldCheck,
  UserRound,
  Wifi,
  X,
} from "lucide-react";
import type { ChatMessage, ITSMResponse, OperationalStatus, SessionContext, Ticket } from "@/lib/itsm/types";
import { SondaBotIcon, SondaIcon } from "@/components/shared/BrandMark";

type ChatApiResponse = {
  response: ITSMResponse;
  sessionContext: SessionContext;
  ticket?: Ticket;
};

const sessionContextStorageKey = "sonda-active-session-context";
const identityStorageKey = "sonda-itsm-identity";
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const itsmLoginUrl = process.env.NEXT_PUBLIC_ITSM_LOGIN_URL ?? "https://itsm.geimser.cl/geimser/bot/login";
const requireITSMLogin = process.env.NEXT_PUBLIC_REQUIRE_ITSM_LOGIN !== "false";

type ITSMIdentity = {
  id?: number;
  login?: string;
  email: string;
  name?: string;
  firstname?: string;
  lastname?: string;
  area?: string;
  organization?: string;
};

const smartActions = [
  {
    topic: "No puedo entrar al correo",
    title: "Correo / Acceso",
    icon: KeyRound,
    color: "#00FFFF",
    bg: "rgba(0,255,255,0.06)",
    border: "rgba(0,255,255,0.15)",
    prompt: "Elige qué problema de correo o acceso quieres revisar:",
    replies: [
      { label: "Correo no abre", message: "No puedo entrar al correo corporativo" },
      { label: "Clave o MFA", message: "Tengo problema con mi clave o MFA" },
      { label: "Cuenta bloqueada", message: "Mi cuenta está bloqueada" },
      { label: "Permiso de acceso", message: "Necesito acceso o permiso a una carpeta o sistema" },
      { label: "Otro acceso", message: "Tengo otro problema de acceso" },
    ],
  },
  {
    topic: "Red o VPN",
    title: "VPN / Red",
    icon: Wifi,
    color: "#3B82F6",
    bg: "rgba(59,130,246,0.06)",
    border: "rgba(59,130,246,0.15)",
    prompt: "Elige qué tipo de problema de red o VPN quieres revisar:",
    replies: [
      { label: "VPN no conecta", message: "La VPN no conecta" },
      { label: "VPN se corta", message: "La VPN se conecta pero se corta" },
      { label: "Internet lento", message: "Tengo internet lento" },
      { label: "Wi-Fi sin conexión", message: "No puedo conectarme al Wi-Fi" },
      { label: "Red cableada", message: "No tengo red por cable" },
      { label: "Otro red/VPN", message: "Tengo otro problema de red o VPN" },
    ],
  },
  {
    topic: "Software",
    title: "Software",
    icon: PackageCheck,
    color: "#8B5CF6",
    bg: "rgba(139,92,246,0.06)",
    border: "rgba(139,92,246,0.15)",
    prompt: "Elige qué pasa con el software:",
    replies: [
      { label: "Instalar software", message: "Necesito instalar software" },
      { label: "Software no abre", message: "Un software no abre o falla" },
      { label: "Error en app", message: "Tengo un error en una aplicación" },
      { label: "Licencia", message: "Necesito revisar licencia o activación de software" },
      { label: "Actualizar", message: "Necesito actualizar un software" },
      { label: "Otro software", message: "Tengo otro problema de software" },
    ],
  },
  {
    topic: "Hardware",
    title: "Hardware",
    icon: Laptop,
    color: "#10B981",
    bg: "rgba(16,185,129,0.06)",
    border: "rgba(16,185,129,0.15)",
    prompt: "Elige qué tipo de hardware quieres revisar:",
    replies: [
      { label: "Notebook lento", message: "Mi notebook está lenta" },
      { label: "Pantalla", message: "Tengo un problema con la pantalla del notebook" },
      { label: "Mouse o teclado", message: "Tengo un problema con el mouse o teclado" },
      { label: "Monitor externo", message: "Tengo un problema con el monitor externo" },
      { label: "Impresora", message: "Tengo un problema con la impresora" },
      { label: "Otro hardware", message: "Tengo otro problema de hardware" },
    ],
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
  const storedIdentity = readStoredIdentity();
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    const storedContext = readStoredSessionContext();
    return storedContext?.messages.length ? [initialMessage, ...storedContext.messages] : [initialMessage];
  });
  const [input, setInput] = useState("");
  const [context, setContext] = useState<SessionContext | undefined>(() => readStoredSessionContext());
  const [selectedUserEmail, setSelectedUserEmail] = useState(() => {
    const storedContext = readStoredSessionContext();
    return storedIdentity?.email || storedContext?.collectedFields?.correo || "";
  });
  const [selectedUserName, setSelectedUserName] = useState(() => storedIdentity?.name || readStoredSessionContext()?.collectedFields?.nombre || "");
  const [selectedUserArea, setSelectedUserArea] = useState(() => storedIdentity?.area || storedIdentity?.organization || readStoredSessionContext()?.collectedFields?.area || "");
  const [identityStatus, setIdentityStatus] = useState<"anonymous" | "authenticated">(() => storedIdentity?.email ? "authenticated" : "anonymous");
  const [status, setStatus] = useState("en línea");
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const [closed, setClosed] = useState(true);

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
  const canUseChat = !requireITSMLogin || identityStatus === "authenticated";

  function openAssistant() {
    setClosed(false);
    setExpanded(true);
  }

  async function sendMessage(
    message: string,
    fileToAttach?: { name: string; url: string } | null,
    overrideContext?: SessionContext,
  ) {
    const cleanMessage = message.trim();
    const activeFile = fileToAttach !== undefined ? fileToAttach : attachedFile;
    if (!cleanMessage && !activeFile) return;
    if (isLoading) return;
    if (requireITSMLogin && identityStatus !== "authenticated") {
      setStatus("login ITSM requerido");
      openITSMLogin();
      return;
    }

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

    setMessages((current) => [...clearSuggestedRepliesFromMessages(current), optimisticMessage]);

    const activeContext = removeSuggestedRepliesFromContext(overrideContext ?? context);
    const knownEmail = normalizeEmail(selectedUserEmail || activeContext?.collectedFields?.correo || "");
    const knownName = selectedUserName || activeContext?.collectedFields?.nombre || "";
    const knownArea = selectedUserArea || activeContext?.collectedFields?.area || "";

    try {
      const response = await withMinimumDelay(fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userMessage: cleanMessage || `[Evidencia Adjunta: ${activeFile?.name}]`,
          sessionContext: activeContext,
          attachmentName: activeFile?.name,
          attachmentUrl: activeFile?.url,
          userEmail: knownEmail || undefined,
          userName: knownName || undefined,
          userArea: knownArea || undefined,
        }),
      }));

      if (!response.ok) throw new Error("Error de red");

      const payload = (await response.json()) as ChatApiResponse;

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

  function openITSMLogin() {
    const url = new URL(itsmLoginUrl);
    url.searchParams.set("return_origin", window.location.origin);
    setStatus("esperando login ITSM...");
    window.open(url.toString(), "geimser-itsm-login", "popup=yes,width=520,height=640");
  }

  function applyITSMIdentity(identity: ITSMIdentity) {
    const email = normalizeEmail(identity.email);
    if (!email || !emailPattern.test(email)) return;

    const name = identity.name || [identity.firstname, identity.lastname].filter(Boolean).join(" ") || identity.login || email;
    const area = identity.area || identity.organization || "";
    const nextIdentity = { ...identity, email, name, area };
    const newContext: SessionContext = {
      sessionId: `session-${crypto.randomUUID()}`,
      collectedFields: { correo: email, nombre: name, area: area || undefined },
      messages: [],
      stepsExecuted: [],
    };

    const greetingMsg: ChatMessage = {
      id: "sonda-welcome-personal",
      role: "assistant",
      createdAt: new Date().toISOString(),
      content: `Listo, quedaste conectado con ITSM como ${name} (${email}).\n\nPuedo revisar tus tickets actuales o registrar uno nuevo a tu nombre.`,
    };

    setIdentityStatus("authenticated");
    setSelectedUserEmail(email);
    setSelectedUserName(name);
    setSelectedUserArea(area);
    setContext(newContext);
    setMessages([greetingMsg]);
    setInput("");
    setTicket(null);
    setAttachedFile(null);
    setShowAttachmentMenu(false);
    setStatus("sesión ITSM activa");
    storeIdentity(nextIdentity);
    storeSessionContext(newContext);
  }

  useEffect(() => {
    function handleITSMIdentityMessage(event: MessageEvent) {
      if (event.origin !== new URL(itsmLoginUrl).origin) return;
      if (!event.data || event.data.type !== "geimser:itsm-identity") return;
      if (!event.data.authenticated || !event.data.user?.email) return;

      applyITSMIdentity(event.data.user as ITSMIdentity);
    }

    window.addEventListener("message", handleITSMIdentityMessage);
    return () => window.removeEventListener("message", handleITSMIdentityMessage);
  }, []);

  // Se restablece todo limpiamente
  function startNewChat() {
    if (isLoading) return;
    
    const email = normalizeEmail(selectedUserEmail);

    if (!email) {
      clearStoredSessionContext();
      setContext(undefined);
      setMessages([initialMessage]);
    } else {
      const newContext: SessionContext = {
        sessionId: `session-${crypto.randomUUID()}`,
        collectedFields: { correo: email, nombre: selectedUserName || undefined, area: selectedUserArea || undefined },
        messages: [],
        stepsExecuted: [],
      };

      const greetingMsg: ChatMessage = {
        id: "sonda-welcome-personal",
        role: "assistant",
        createdAt: new Date().toISOString(),
        content: selectedUserName
          ? `Listo, sigo conectado con ITSM como ${selectedUserName} (${email}).\n\nCuéntame qué necesitas revisar.`
          : `Perfecto, trabajaré con el correo ${email}.\n\nSi ya tienes usuario en ITSM, consultaré tus tickets a tu nombre. Si no existe todavía, lo crearé automáticamente al registrar el primer caso.`,
      };

      setContext(newContext);
      setMessages([greetingMsg]);
      storeSessionContext(newContext);
    }

    setInput("");
    setTicket(null);
    setAttachedFile(null);
    setShowAttachmentMenu(false);
    setStatus("en línea");
    setExpanded(true);
  }

  function handleSuggestion(topic: string) {
    if (isLoading) return;

    const action = smartActions.find((item) => item.topic === topic);
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

    if (action?.replies?.length) {
      const assistantMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: action.prompt ?? "Elige una opción para orientar el caso:",
        createdAt: new Date().toISOString(),
        suggestedReplies: action.replies,
      };
      const nextContext = { ...freshContext, messages: [assistantMessage] };
      setContext(nextContext);
      setMessages([initialMessage, assistantMessage]);
      storeSessionContext(nextContext);
      return;
    }

    void sendMessage(topic, null, freshContext);
  }

  /* ── Vista cerrada (botón flotante) ── */
  if (closed) {
    return (
      <button
        type="button"
        onPointerDown={openAssistant}
        onClick={openAssistant}
        className="sonda-bot-launcher group relative grid h-[50px] w-[66px] place-items-center overflow-hidden rounded-xl p-0 transition-all duration-200"
        style={{
          background: "rgba(7, 13, 24, 0.82)",
          border: "1px solid rgba(226, 232, 240, 0.18)",
          boxShadow: "0 12px 26px rgba(2, 6, 23, 0.34), 0 1px 0 rgba(255,255,255,0.1) inset",
          backdropFilter: "blur(14px) saturate(1.08)",
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLElement).style.borderColor = "rgba(85, 244, 255, 0.42)";
          (e.currentTarget as HTMLElement).style.transform = "translateY(-2px) scale(1.02)";
          (e.currentTarget as HTMLElement).style.boxShadow = "0 16px 30px rgba(2, 6, 23, 0.4), 0 1px 0 rgba(255,255,255,0.12) inset";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLElement).style.borderColor = "rgba(226, 232, 240, 0.18)";
          (e.currentTarget as HTMLElement).style.transform = "translateY(0) scale(1)";
          (e.currentTarget as HTMLElement).style.boxShadow = "0 12px 26px rgba(2, 6, 23, 0.34), 0 1px 0 rgba(255,255,255,0.1) inset";
        }}
        aria-label="Abrir soporte SONDA"
        title="Abrir soporte SONDA"
      >
        <SondaBotIcon width={62} height={46} />
        <span
          aria-hidden
          className="absolute -right-px -top-px size-3 rounded-full"
          style={{
            background: "#2FE56F",
            border: "2px solid rgba(7, 13, 24, 0.96)",
            boxShadow: "0 0 8px rgba(47, 229, 111, 0.58)",
          }}
        />
      </button>
    );
  }

  /* ── Vista principal (Contenedor Chatbot) ── */
  return (
    <section
      className="relative flex flex-col overflow-hidden"
      style={{
        width: "min(420px, calc(100vw - 32px))",
        height: "min(528px, calc(100dvh - 86px))",
        borderRadius: "16px",
        background: "linear-gradient(180deg, rgba(14, 21, 33, 0.98) 0%, rgba(5, 8, 13, 0.98) 100%)",
        border: "1px solid rgba(148, 163, 184, 0.22)",
        boxShadow: "0 24px 58px rgba(2, 6, 23, 0.64), 0 1px 0 rgba(255,255,255,0.08) inset",
        backdropFilter: "blur(18px) saturate(1.08)",
      }}
    >
      {/* ── Header ── */}
      <header
        className="relative flex h-[52px] shrink-0 items-center justify-between px-3.5"
        style={{
          background: "rgba(8, 13, 22, 0.9)",
          borderBottom: "1px solid rgba(148, 163, 184, 0.14)",
          backdropFilter: "blur(14px)",
        }}
      >
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-lg"
            style={{
              border: "1px solid rgba(85, 244, 255, 0.22)",
              background: "rgba(5, 10, 18, 0.84)",
            }}
          >
            <SondaBotIcon width={44} height={34} />
          </span>
          <div>
            <h1
              className="text-[13px] font-semibold leading-tight"
              style={{ color: "#FFFFFF" }}
            >
              Mesa de Ayuda
            </h1>
            <p className="text-[10px] font-medium" style={{ color: "rgba(203, 213, 225, 0.72)" }}>
              Asistente TI SONDA
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={startNewChat}
            disabled={isLoading}
            title="Nuevo caso"
            className="grid size-8 place-items-center rounded-lg transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-40"
            style={{
              border: "1px solid rgba(148, 163, 184, 0.16)",
              background: "rgba(255, 255, 255, 0.04)",
              color: "rgba(226, 232, 240, 0.78)",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.borderColor = "rgba(85, 244, 255, 0.38)";
              (e.currentTarget as HTMLElement).style.color = "#55F4FF";
              (e.currentTarget as HTMLElement).style.background = "rgba(85, 244, 255, 0.08)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.borderColor = "rgba(148, 163, 184, 0.16)";
              (e.currentTarget as HTMLElement).style.color = "rgba(226, 232, 240, 0.78)";
              (e.currentTarget as HTMLElement).style.background = "rgba(255, 255, 255, 0.04)";
            }}
            aria-label="Nuevo caso"
          >
            <RotateCcw size={14} aria-hidden />
          </button>

          <button
            type="button"
            onClick={() => setExpanded((c) => !c)}
            className="grid size-8 place-items-center rounded-lg transition-all duration-200"
            style={{ border: "1px solid rgba(148, 163, 184, 0.16)", background: "rgba(255, 255, 255, 0.04)", color: "rgba(226, 232, 240, 0.66)" }}
            aria-label={expanded ? "Minimizar" : "Expandir"}
            onMouseEnter={(e) => (e.currentTarget as HTMLElement).style.borderColor = "rgba(85, 244, 255, 0.36)"}
            onMouseLeave={(e) => (e.currentTarget as HTMLElement).style.borderColor = "rgba(148, 163, 184, 0.16)"}
          >
            {expanded ? <Minus size={14} aria-hidden /> : <ChevronUp size={14} aria-hidden />}
          </button>

          <button
            type="button"
            onClick={() => setClosed(true)}
            className="grid size-8 place-items-center rounded-lg transition-all duration-200"
            style={{ border: "1px solid rgba(148, 163, 184, 0.16)", background: "rgba(255, 255, 255, 0.04)", color: "rgba(226, 232, 240, 0.66)" }}
            aria-label="Cerrar"
            onMouseEnter={(e) => (e.currentTarget as HTMLElement).style.borderColor = "rgba(248, 113, 113, 0.42)"}
            onMouseLeave={(e) => (e.currentTarget as HTMLElement).style.borderColor = "rgba(148, 163, 184, 0.16)"}
          >
            <X size={14} aria-hidden />
          </button>
        </div>
      </header>

      {/* ── Identidad omnicanal ── */}
      <div
        className="relative z-10 flex shrink-0 items-center justify-between gap-2 px-3.5 py-2 text-[11px]"
        style={{ background: "rgba(2, 6, 23, 0.38)", borderBottom: "1px solid rgba(148, 163, 184, 0.1)" }}
      >
        <div className="flex min-w-0 items-center gap-1.5" style={{ color: "rgba(203, 213, 225, 0.72)" }}>
          {identityStatus === "authenticated" ? (
            <ShieldCheck size={12} style={{ color: "#2FE56F" }} aria-hidden />
          ) : (
            <UserRound size={12} style={{ color: "#55F4FF" }} aria-hidden />
          )}
          <span className="shrink-0">{identityStatus === "authenticated" ? "ITSM" : "Login"}</span>
          <span className="min-w-0 truncate font-semibold" style={{ color: "#F8FAFC" }}>
            {identityStatus === "authenticated"
              ? selectedUserName || selectedUserEmail
              : "sesión requerida"}
          </span>
        </div>
        <button
          type="button"
          onClick={openITSMLogin}
          disabled={isLoading}
          className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-[11px] font-semibold transition-all disabled:cursor-not-allowed disabled:opacity-50"
          style={{
            border: identityStatus === "authenticated" ? "1px solid rgba(47, 229, 111, 0.2)" : "1px solid rgba(85, 244, 255, 0.28)",
            background: identityStatus === "authenticated" ? "rgba(47, 229, 111, 0.07)" : "rgba(85, 244, 255, 0.08)",
            color: identityStatus === "authenticated" ? "#8CF0B2" : "#55F4FF",
          }}
        >
          <LogIn size={12} aria-hidden />
          {identityStatus === "authenticated" ? "cambiar" : "iniciar"}
        </button>
      </div>

      {expanded ? (
        <>
          {/* ── Área de mensajes ── */}
          <div ref={scrollRef} className="thin-scrollbar relative min-h-0 flex-1 overflow-y-auto px-3.5 py-3.5">
            <div className="space-y-3.5">
              {messages.map((message) => (
                <Bubble key={message.id} message={message} onReply={(reply) => sendMessage(reply)} />
              ))}

              {!hasConversation ? (
                <div className="grid grid-cols-2 gap-2 pt-1">
                  {smartActions.map((action) => (
                    <SmartActionCard
                      key={action.topic}
                      action={action}
                      disabled={!canUseChat}
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
            className="relative flex shrink-0 flex-col gap-1.5 px-3.5 py-2.5"
            style={{
              background: "rgba(4, 8, 14, 0.92)",
              borderTop: "1px solid rgba(148, 163, 184, 0.14)",
              backdropFilter: "blur(14px)",
            }}
          >
            {/* Preview adjunto */}
            {attachedFile && (
              <div
                className="flex items-center justify-between gap-2 rounded-lg p-2 text-xs"
                style={{
                  border: "1px solid rgba(85, 244, 255, 0.2)",
                  background: "rgba(85, 244, 255, 0.05)",
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
                className="flex flex-col gap-1.5 rounded-lg p-2 shadow-2xl animate-fade-up"
                style={{
                  border: "1px solid rgba(148, 163, 184, 0.16)",
                  background: "#0B111B",
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
                      className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-xs font-medium transition-all duration-150"
                      style={{
                        border: "1px solid rgba(148, 163, 184, 0.1)",
                        background: "rgba(255, 255, 255, 0.025)",
                        color: "rgba(226, 232, 240, 0.78)",
                      }}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLElement).style.borderColor = "rgba(85, 244, 255, 0.32)";
                        (e.currentTarget as HTMLElement).style.background = "rgba(85, 244, 255, 0.06)";
                        (e.currentTarget as HTMLElement).style.color = "#FFFFFF";
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLElement).style.borderColor = "rgba(148, 163, 184, 0.1)";
                        (e.currentTarget as HTMLElement).style.background = "rgba(255, 255, 255, 0.025)";
                        (e.currentTarget as HTMLElement).style.color = "rgba(226, 232, 240, 0.78)";
                      }}
                    >
                      <span className="size-6 overflow-hidden rounded-md shrink-0" style={{ border: "1px solid rgba(255, 255, 255, 0.08)", background: "#000" }}>
                        <img src={shot.url} alt={shot.label} className="size-full object-cover" />
                      </span>
                      <span>{shot.label}</span>
                    </button>
                  ))}

                  <label
                    className="flex cursor-pointer items-center justify-center gap-2 rounded-md px-2.5 py-2 text-xs font-semibold transition-all duration-150"
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
              <div className="flex items-center gap-2" style={{ color: "rgba(203, 213, 225, 0.58)" }}>
                <span
                  className="size-1.5 rounded-full"
                  style={{
                    background: isLoading ? "#00FFFF" : "#00FF88",
                    boxShadow: isLoading
                      ? "0 0 7px rgba(85, 244, 255, 0.64)"
                      : "0 0 7px rgba(47, 229, 111, 0.52)",
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
                className="grid size-10 shrink-0 place-items-center rounded-lg transition-all duration-200"
                style={{
                  border: showAttachmentMenu ? "1px solid rgba(85, 244, 255, 0.34)" : "1px solid rgba(148, 163, 184, 0.14)",
                  background: showAttachmentMenu ? "rgba(85, 244, 255, 0.08)" : "rgba(255, 255, 255, 0.04)",
                  color: showAttachmentMenu ? "#55F4FF" : "rgba(226, 232, 240, 0.62)",
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
                disabled={!canUseChat || isLoading}
                placeholder={!canUseChat ? "Inicia sesión con ITSM para continuar..." : attachedFile ? "Agrega un comentario o envía..." : "Describe tu problema..."}
                className="thin-scrollbar max-h-28 min-h-10 flex-1 resize-none rounded-lg px-3.5 py-2.5 text-[13px] leading-5 outline-none transition-all duration-200"
                style={{
                  border: "1px solid rgba(148, 163, 184, 0.14)",
                  background: "rgba(15, 23, 42, 0.52)",
                  color: "#FFFFFF",
                }}
                onFocus={(e) => {
                  (e.currentTarget as HTMLElement).style.borderColor = "rgba(85, 244, 255, 0.34)";
                  (e.currentTarget as HTMLElement).style.background = "rgba(15, 23, 42, 0.72)";
                }}
                onBlur={(e) => {
                  (e.currentTarget as HTMLElement).style.borderColor = "rgba(148, 163, 184, 0.14)";
                  (e.currentTarget as HTMLElement).style.background = "rgba(15, 23, 42, 0.52)";
                }}
              />

              <button
                type="submit"
                disabled={!canUseChat || (!input.trim() && !attachedFile) || isLoading}
                className="grid size-10 shrink-0 place-items-center rounded-lg transition-all duration-200 disabled:cursor-not-allowed"
                style={{
                  background: !canUseChat || (!input.trim() && !attachedFile) || isLoading
                    ? "rgba(255, 255, 255, 0.04)"
                    : "linear-gradient(135deg, #55F4FF 0%, #38BDF8 100%)",
                  color: !canUseChat || (!input.trim() && !attachedFile) || isLoading ? "rgba(255, 255, 255, 0.3)" : "#000000",
                  boxShadow: !canUseChat || (!input.trim() && !attachedFile) || isLoading
                    ? "none"
                    : "0 4px 14px rgba(56, 189, 248, 0.24)",
                  border: "1px solid rgba(255, 255, 255, 0.08)",
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
  disabled,
  onClick,
}: {
  action: (typeof smartActions)[number];
  disabled?: boolean;
  onClick: () => void;
}) {
  const Icon = action.icon;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="group relative min-h-[58px] overflow-hidden rounded-lg text-left transition-all duration-200 focus:outline-none disabled:cursor-not-allowed disabled:opacity-45"
      style={{
        border: "1px solid rgba(148, 163, 184, 0.14)",
        borderLeft: `3px solid ${action.color}`,
        background: "rgba(15, 23, 42, 0.48)",
        padding: "9px 10px",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.background = "rgba(30, 41, 59, 0.58)";
        (e.currentTarget as HTMLElement).style.transform = "translateY(-1px)";
        (e.currentTarget as HTMLElement).style.borderColor = "rgba(226, 232, 240, 0.2)";
        (e.currentTarget as HTMLElement).style.borderLeftColor = action.color;
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.background = "rgba(15, 23, 42, 0.48)";
        (e.currentTarget as HTMLElement).style.transform = "translateY(0)";
        (e.currentTarget as HTMLElement).style.borderColor = "rgba(148, 163, 184, 0.14)";
        (e.currentTarget as HTMLElement).style.borderLeftColor = action.color;
      }}
    >
      <div className="flex items-center gap-2.5">
        <span className="grid size-7 shrink-0 place-items-center rounded-md" style={{ background: "rgba(255,255,255,0.06)", color: action.color }}>
          <Icon size={13} aria-hidden />
        </span>
        <span className="block text-[11.5px] font-semibold leading-tight" style={{ color: "#F8FAFC" }}>
          {action.title}
        </span>
      </div>
    </button>
  );
}

function Bubble({ message, onReply }: { message: ChatMessage; onReply?: (message: string) => void }) {
  const isUser = message.role === "user";

  const welcomeIds = ["sonda-welcome", "sonda-welcome-personal", "atlas-welcome", "atlas-welcome-personal"];
  if (welcomeIds.includes(message.id)) {
    return (
      <div
        className="max-w-[86%] rounded-lg px-3.5 py-2.5 text-[13px] leading-5"
        style={{
          border: "1px solid rgba(85, 244, 255, 0.22)",
          background: "rgba(8, 145, 178, 0.08)",
          color: "#E5E7EB",
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
          className="mt-0.5 grid size-[24px] shrink-0 place-items-center rounded-md"
          style={{
            border: "1px solid rgba(85, 244, 255, 0.2)",
            background: "rgba(85, 244, 255, 0.06)",
          }}
        >
          <SondaIcon size={14} />
        </span>
      ) : null}

      <div
        className="max-w-[80%] flex flex-col gap-2"
        style={{
          borderRadius: isUser ? "14px 6px 14px 14px" : "6px 14px 14px 14px",
          padding: "9px 13px",
          ...(isUser
            ? {
                background: "linear-gradient(135deg, #55F4FF 0%, #38BDF8 100%)",
                border: "1px solid rgba(85, 244, 255, 0.28)",
                color: "#000000",
                boxShadow: "0 4px 14px rgba(56, 189, 248, 0.14)",
                fontWeight: 500,
              }
            : {
                border: "1px solid rgba(148, 163, 184, 0.12)",
                background: "rgba(15, 23, 42, 0.46)",
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
        {!isUser && message.suggestedReplies?.length ? (
          <div className="grid gap-1.5 pt-1">
            {message.suggestedReplies.map((reply) => (
              <button
                key={reply.message}
                type="button"
                onClick={() => onReply?.(reply.message)}
                className="inline-flex min-h-8 items-center gap-2 rounded-md px-2.5 text-left text-[12px] font-semibold transition-all duration-150"
                style={{
                  border: "1px solid rgba(85, 244, 255, 0.16)",
                  background: "rgba(85, 244, 255, 0.05)",
                  color: "#FFFFFF",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.borderColor = "rgba(85, 244, 255, 0.38)";
                  (e.currentTarget as HTMLElement).style.background = "rgba(85, 244, 255, 0.09)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.borderColor = "rgba(85, 244, 255, 0.16)";
                  (e.currentTarget as HTMLElement).style.background = "rgba(85, 244, 255, 0.05)";
                }}
              >
                <HardDrive size={12} aria-hidden />
                <span>{reply.label}</span>
              </button>
            ))}
          </div>
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

function removeSuggestedRepliesFromContext(sessionContext?: SessionContext) {
  if (!sessionContext) return undefined;

  return {
    ...sessionContext,
    messages: clearSuggestedRepliesFromMessages(sessionContext.messages),
  };
}

function clearSuggestedRepliesFromMessages(messages: ChatMessage[]) {
  return messages.map((message) => {
    if (!message.suggestedReplies?.length) return message;
    return { ...message, suggestedReplies: undefined };
  });
}

async function withMinimumDelay<T>(promise: Promise<T>, minDelay = 1600) {
  const startTime = performance.now();
  const result = await promise;
  const remainingDelay = minDelay - (performance.now() - startTime);

  if (remainingDelay > 0) {
    await new Promise((resolve) => setTimeout(resolve, remainingDelay));
  }

  return result;
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

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function readStoredIdentity() {
  if (typeof window === "undefined") return undefined;
  try {
    const raw = window.localStorage.getItem(identityStorageKey);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as ITSMIdentity;
    return parsed.email ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function storeIdentity(identity: ITSMIdentity) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(identityStorageKey, JSON.stringify(identity));
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
