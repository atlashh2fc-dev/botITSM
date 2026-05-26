"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, ChevronUp, Headset, Loader2, Minus, Send, ShieldCheck, UserRound, X } from "lucide-react";
import type { ChatMessage, ITSMResponse, OperationalStatus, SessionContext, Ticket } from "@/lib/itsm/types";

type ChatApiResponse = {
  response: ITSMResponse;
  sessionContext: SessionContext;
};

const frequentTopics = [
  "No puedo entrar al correo",
  "VPN no funciona",
  "Necesito instalar software",
  "Mi notebook está lenta",
  "Necesito acceso",
  "Otro problema",
];

const initialMessage: ChatMessage = {
  id: "atlas-welcome",
  role: "assistant",
  createdAt: new Date().toISOString(),
  content:
    "Hola 👋\nSoy Atlas ITSM Assistant.\n\nEstoy aquí para ayudarte con soporte TI.\n\nPuedo ayudarte con accesos, conectividad, software, equipos o incidentes operacionales.\n\nSelecciona un tema frecuente o descríbeme directamente lo que está ocurriendo.",
};

const statusLabels: Partial<Record<OperationalStatus, string>> = {
  "Detectando intención": "analizando...",
  "Clasificando según ITIL": "analizando...",
  "Consultando base de conocimiento": "consultando guía...",
  "Ejecutando guía de descarte": "revisando pasos...",
  "Preparando ticket": "preparando escalamiento...",
  "Cerrando caso": "cerrando...",
};

export function AtlasAssistant() {
  const [messages, setMessages] = useState<ChatMessage[]>([initialMessage]);
  const [input, setInput] = useState("");
  const [context, setContext] = useState<SessionContext | undefined>();
  const [status, setStatus] = useState("listo");
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const [closed, setClosed] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, ticket, isLoading, expanded]);

  const hasConversation = useMemo(() => messages.length > 1, [messages.length]);

  async function sendMessage(message: string) {
    const cleanMessage = message.trim();
    if (!cleanMessage || isLoading) return;

    setExpanded(true);
    setInput("");
    setTicket(null);
    setIsLoading(true);
    setStatus("analizando...");

    const optimisticMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: cleanMessage,
      createdAt: new Date().toISOString(),
    };

    setMessages((current) => [...current, optimisticMessage]);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userMessage: cleanMessage, sessionContext: context }),
      });

      if (!response.ok) throw new Error("No se pudo procesar el mensaje");

      const payload = (await response.json()) as ChatApiResponse;
      const refinedContext = refineAssistantTurn(payload.sessionContext, cleanMessage);
      setContext(refinedContext);
      setMessages([initialMessage, ...refinedContext.messages]);
      setStatus(resolveStatus(payload.response.operationalStatuses));

      if (payload.response.shouldCreateTicket) {
        const ticketResponse = await fetch("/api/tickets", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ticketDraft: payload.response.ticketDraft }),
        });

        if (ticketResponse.ok) {
          const ticketPayload = (await ticketResponse.json()) as { ticket: Ticket };
          setTicket(ticketPayload.ticket);
          setStatus("caso registrado");
        }
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

  function handleSuggestion(topic: string) {
    if (isLoading) return;

    const assistantResponse = responseForSuggestion(topic);
    if (!assistantResponse) {
      void sendMessage(topic);
      return;
    }

    setExpanded(true);
    setInput("");
    setTicket(null);
    setStatus("listo");
    setMessages([
      initialMessage,
      {
        id: crypto.randomUUID(),
        role: "user",
        content: topic,
        createdAt: new Date().toISOString(),
      },
      {
        id: crypto.randomUUID(),
        role: "assistant",
        content: assistantResponse,
        createdAt: new Date().toISOString(),
      },
    ]);
  }

  if (closed) {
    return (
      <button
        type="button"
        onClick={() => {
          setClosed(false);
          setExpanded(true);
        }}
        className="inline-flex h-11 items-center gap-2 rounded-full border border-white/70 bg-white/88 px-4 text-sm font-semibold text-slate-800 shadow-[0_18px_50px_rgba(15,23,42,0.14)] backdrop-blur-2xl transition hover:border-cyan-200 hover:text-slate-950"
      >
        <ShieldCheck size={17} aria-hidden />
        Atlas ITSM Assistant
      </button>
    );
  }

  return (
    <section className="flex h-[min(600px,calc(100dvh-84px))] w-full max-w-[420px] flex-col overflow-hidden rounded-3xl border border-white/70 bg-white/88 shadow-[0_28px_90px_rgba(15,23,42,0.16)] backdrop-blur-2xl">
      <header className="flex h-[68px] shrink-0 items-center justify-between border-b border-slate-200/70 px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="relative grid size-9 place-items-center rounded-2xl bg-slate-950 text-white shadow-lg shadow-slate-950/15">
            <ShieldCheck size={17} aria-hidden />
            <span className="absolute -bottom-0.5 -right-0.5 size-3 rounded-full border-2 border-white bg-emerald-400" />
          </div>
          <div>
            <h1 className="text-sm font-semibold tracking-[-0.01em] text-slate-950">Atlas ITSM Assistant</h1>
            <p className="text-xs text-slate-500">Soporte inteligente</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setExpanded((current) => !current)}
            className="grid size-8 place-items-center rounded-full border border-slate-200 bg-white/80 text-slate-500 transition hover:border-slate-300 hover:text-slate-900"
            aria-label={expanded ? "Minimizar asistente" : "Expandir asistente"}
          >
            {expanded ? <Minus size={15} aria-hidden /> : <ChevronUp size={15} aria-hidden />}
          </button>
          <button
            type="button"
            onClick={() => setClosed(true)}
            className="grid size-8 place-items-center rounded-full border border-slate-200 bg-white/80 text-slate-500 transition hover:border-slate-300 hover:text-slate-900"
            aria-label="Cerrar asistente"
          >
            <X size={15} aria-hidden />
          </button>
        </div>
      </header>

      {expanded ? (
        <>
          <div ref={scrollRef} className="thin-scrollbar min-h-0 flex-1 overflow-y-auto px-4 py-2.5">
            <div className="space-y-2.5">
              {messages.map((message) => (
                <Bubble key={message.id} message={message} />
              ))}

              {!hasConversation ? (
                <>
                  <div className="grid grid-cols-2 gap-1.5 pl-8">
                    {frequentTopics.map((topic) => (
                      <button
                        key={topic}
                        type="button"
                        onClick={() => handleSuggestion(topic)}
                        className="min-h-7 rounded-full border border-slate-200 bg-white/84 px-2.5 py-1 text-left text-[11px] font-medium leading-4 text-slate-600 shadow-sm transition hover:-translate-y-0.5 hover:border-cyan-300 hover:text-slate-950"
                      >
                        {topic}
                      </button>
                    ))}
                  </div>
                </>
              ) : null}

              {isLoading ? <TypingIndicator /> : null}
              {ticket ? <RegisteredCase ticket={ticket} /> : null}
            </div>
          </div>

          <div className="shrink-0 border-t border-slate-200/70 bg-white/76 px-4 py-2.5">
            <div className="mb-2 flex items-center gap-2 text-[11px] font-medium text-slate-400">
              <span className={`size-1.5 rounded-full ${isLoading ? "animate-pulse bg-cyan-500" : "bg-emerald-500"}`} />
              {status}
            </div>
            <form onSubmit={handleSubmit} className="flex items-end gap-2">
              <textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                rows={1}
                placeholder="Describe brevemente tu problema..."
                className="max-h-24 min-h-10 flex-1 resize-none rounded-2xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm leading-5 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-cyan-300 focus:ring-4 focus:ring-cyan-100/70"
              />
              <button
                type="submit"
                disabled={!input.trim() || isLoading}
                className="grid size-10 shrink-0 place-items-center rounded-2xl bg-slate-950 text-white shadow-lg shadow-slate-950/10 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                aria-label="Enviar"
              >
                <Send size={17} aria-hidden />
              </button>
            </form>
          </div>
        </>
      ) : null}
    </section>
  );
}

function Bubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";

  return (
    <div className={`flex gap-2 ${isUser ? "justify-end" : "justify-start"}`}>
      {!isUser ? (
        <span className="mt-1 grid size-6 shrink-0 place-items-center rounded-xl bg-slate-950 text-white">
          <Headset size={13} aria-hidden />
        </span>
      ) : null}
      <div
        className={
          isUser
            ? "max-w-[82%] rounded-2xl bg-slate-950 px-3.5 py-2.5 text-sm leading-6 text-white"
            : "max-w-[calc(100%-32px)] rounded-2xl border border-slate-200 bg-white px-3.5 py-2.5 text-[13px] leading-5 text-slate-700 shadow-sm"
        }
      >
        <p className="whitespace-pre-line">{message.content}</p>
      </div>
      {isUser ? (
        <span className="mt-1 grid size-6 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-500">
          <UserRound size={13} aria-hidden />
        </span>
      ) : null}
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex items-center gap-2 pl-9 text-sm text-slate-500">
      <Loader2 size={15} className="animate-spin text-cyan-600" aria-hidden />
      revisando contexto...
    </div>
  );
}

function RegisteredCase({ ticket }: { ticket: Ticket }) {
  return (
    <article className="ml-10 rounded-2xl border border-cyan-200 bg-gradient-to-br from-white to-cyan-50/70 p-4 shadow-sm">
      <div className="flex items-center gap-2 text-sm font-semibold text-slate-950">
        <CheckCircle2 size={17} className="text-emerald-600" aria-hidden />
        Caso registrado
      </div>
      <p className="mt-1 font-mono text-xs font-semibold text-cyan-700">{ticket.id}</p>
      <div className="mt-4 space-y-3 text-sm">
        <CaseLine label="Resumen" value={summarize(ticket.description)} />
        <CaseLine label="Prioridad" value={priorityText(ticket.priority)} />
        <CaseLine label="Próximo paso" value={ticket.assignedTeam.includes("Redes") ? "derivación a soporte de redes" : ticket.nextAction} />
        <CaseLine label="SLA estimado" value={ticket.estimatedSla.replace("respuesta inicial", "")} />
      </div>
    </article>
  );
}

function CaseLine({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-slate-400">{label}</p>
      <p className="mt-1 leading-5 text-slate-700">{value}</p>
    </div>
  );
}

function resolveStatus(states: OperationalStatus[]) {
  const state = states.at(-1);
  return (state && statusLabels[state]) ?? "analizando...";
}

function priorityText(priority: Ticket["priority"]) {
  const labels: Record<Ticket["priority"], string> = {
    P1: "Crítica",
    P2: "Alta",
    P3: "Media",
    P4: "Baja",
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
