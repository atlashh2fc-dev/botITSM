"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  AlertTriangle,
  AppWindow,
  BriefcaseBusiness,
  Camera,
  CheckCircle2,
  ChevronLeft,
  CircleDot,
  Clock3,
  Headphones,
  ImagePlus,
  KeyRound,
  Laptop,
  LockKeyhole,
  Mail,
  MapPin,
  Mic,
  Network,
  Paperclip,
  Radio,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Ticket as TicketIcon,
  UserRound,
  Wifi,
  X,
} from "lucide-react";
import { SondaIcon } from "@/components/shared/BrandMark";
import type { ITSMResponse, SessionContext, Ticket } from "@/lib/itsm/types";
import { FormattedMessage } from "@/components/shared/FormattedMessage";

type TechnicianRole = "tecnico terreno" | "residente" | "supervisor" | "admin";

type TechnicianSession = {
  name: string;
  email: string;
  role: TechnicianRole;
  zone: string;
};

type FieldChatApiResponse = {
  response: ITSMResponse;
  sessionContext: SessionContext;
  ticket?: Ticket;
  knowledgeMatches?: Array<{ title: string; category: string; resolutionSteps: string[]; escalationCriteria: string[] }>;
};

type FieldTurn = {
  id: string;
  userText: string;
  assistantText: string;
  response: ITSMResponse;
  ticket?: Ticket;
  evidenceName?: string;
  audioName?: string;
  createdAt: string;
};

const sessionKey = "sonda-field-copilot-session";
const contextKey = "sonda-field-copilot-context";
const historyKey = "sonda-field-copilot-history";

const demoTechnicians: TechnicianSession[] = [
  {
    name: "Valentina Rojas",
    email: "valentina.rojas@sonda.cl",
    role: "tecnico terreno",
    zone: "Santiago Centro",
  },
  {
    name: "Cristian Mora",
    email: "cristian.mora@sonda.cl",
    role: "residente",
    zone: "Cliente Banca Norte",
  },
  {
    name: "Paula Fuentes",
    email: "paula.fuentes@sonda.cl",
    role: "supervisor",
    zone: "Operaciones Field",
  },
  {
    name: "Admin Field",
    email: "admin.field@sonda.cl",
    role: "admin",
    zone: "Gobernanza ITSM",
  },
];

const categories = [
  { label: "VPN", icon: Wifi, prompt: "VPN no conecta desde equipo del usuario final" },
  { label: "Red", icon: Network, prompt: "Sin conectividad de red en sitio cliente" },
  { label: "Correo", icon: Mail, prompt: "Outlook no sincroniza y el usuario no recibe correos" },
  { label: "Hardware", icon: Laptop, prompt: "Notebook presenta falla física o rendimiento crítico" },
  { label: "Software", icon: AppWindow, prompt: "Aplicación corporativa no abre o queda congelada" },
  { label: "Accesos", icon: KeyRound, prompt: "Usuario no puede ingresar a sistema corporativo" },
  { label: "App crítica", icon: AlertTriangle, prompt: "Aplicación crítica de negocio está caída para el usuario" },
];

const recentExamples = [
  "VPN AnyConnect: error de certificado",
  "Notebook sin carga tras cambio de dock",
  "SAP GUI no abre en sucursal",
];

const openTicketExamples = [
  { id: "INC-2026-48211", title: "Pantalla azul recurrente", priority: "P2" },
  { id: "REQ-2026-10840", title: "Instalación agente EDR", priority: "P3" },
];

export function FieldCopilotApp() {
  const [mounted, setMounted] = useState(false);
  const [technician, setTechnician] = useState<TechnicianSession | null>(null);
  const [view, setView] = useState<"home" | "diagnostic">("home");
  const [context, setContext] = useState<SessionContext | undefined>(undefined);
  const [history, setHistory] = useState<FieldTurn[]>([]);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      setTechnician(readJson<TechnicianSession>(sessionKey));
      setContext(readJson<SessionContext>(contextKey) ?? undefined);
      setHistory(readJson<FieldTurn[]>(historyKey) ?? []);
      setMounted(true);
    });
    return () => {
      active = false;
    };
  }, []);

  function handleLogin(nextTechnician: TechnicianSession) {
    const nextContext: SessionContext = {
      sessionId: `field-${crypto.randomUUID()}`,
      collectedFields: {
        nombre: nextTechnician.name,
        correo: nextTechnician.email,
        area: `Field Copilot - ${nextTechnician.zone}`,
      },
      messages: [],
      stepsExecuted: [],
    };

    setTechnician(nextTechnician);
    setContext(nextContext);
    setHistory([]);
    storeJson(sessionKey, nextTechnician);
    storeJson(contextKey, nextContext);
    storeJson(historyKey, []);
  }

  function handleLogout() {
    setTechnician(null);
    setContext(undefined);
    setHistory([]);
    window.localStorage.removeItem(sessionKey);
    window.localStorage.removeItem(contextKey);
    window.localStorage.removeItem(historyKey);
  }

  function startDiagnostic(seed?: string) {
    setView("diagnostic");
    window.setTimeout(() => {
      window.dispatchEvent(new CustomEvent("field-copilot-seed", { detail: seed ?? "" }));
    }, 80);
  }

  function persistTurn(turn: FieldTurn, nextContext: SessionContext) {
    const nextHistory = [turn, ...history].slice(0, 12);
    setHistory(nextHistory);
    setContext(nextContext);
    storeJson(historyKey, nextHistory);
    storeJson(contextKey, nextContext);
  }

  if (!mounted) {
    return <FieldBootScreen />;
  }

  if (!technician) {
    return <FieldLogin onLogin={handleLogin} />;
  }

  return (
    <main className="min-h-dvh bg-[#E9EEF2] text-[#172033]">
      <div className="mx-auto flex min-h-dvh w-full max-w-[520px] flex-col bg-[#F8FAFB] shadow-[0_20px_80px_rgba(15,23,42,0.16)] md:my-6 md:min-h-[860px] md:overflow-hidden md:rounded-[28px] md:border md:border-white">
        {view === "home" ? (
          <FieldHome
            technician={technician}
            history={history}
            onLogout={handleLogout}
            onStartDiagnostic={startDiagnostic}
          />
        ) : (
          <FieldDiagnostic
            technician={technician}
            context={context}
            onBack={() => setView("home")}
            onPersistTurn={persistTurn}
          />
        )}
      </div>
    </main>
  );
}

function FieldBootScreen() {
  return (
    <main className="grid min-h-dvh place-items-center bg-[#111827] px-5 py-8 text-white">
      <section className="w-full max-w-[440px] rounded-[28px] border border-white/10 bg-white/5 px-6 py-8 text-center shadow-[0_30px_90px_rgba(0,0,0,0.28)]">
        <span className="mx-auto grid size-12 place-items-center rounded-2xl border border-white/15 bg-white/10">
          <SondaIcon size={24} />
        </span>
        <p className="mt-4 text-sm font-bold">Field IT Copilot</p>
        <p className="mt-1 text-xs text-blue-100">Validando sesión segura</p>
      </section>
    </main>
  );
}

function FieldLogin({ onLogin }: { onLogin: (technician: TechnicianSession) => void }) {
  const [selectedEmail, setSelectedEmail] = useState(demoTechnicians[0].email);
  const selected = demoTechnicians.find((item) => item.email === selectedEmail) ?? demoTechnicians[0];

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onLogin(selected);
  }

  return (
    <main className="grid min-h-dvh place-items-center bg-[#111827] px-5 py-8 text-white">
      <section className="w-full max-w-[440px] overflow-hidden rounded-[28px] border border-white/10 bg-[#F8FAFB] text-[#172033] shadow-[0_30px_90px_rgba(0,0,0,0.38)]">
        <div className="bg-[#12315A] px-6 pb-7 pt-6 text-white">
          <div className="flex items-center justify-between">
            <span className="grid size-11 place-items-center rounded-2xl border border-white/15 bg-white/10">
              <SondaIcon size={23} />
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300/30 bg-emerald-400/10 px-3 py-1 text-[11px] font-semibold text-emerald-100">
              <LockKeyhole size={12} />
              Sesión segura
            </span>
          </div>
          <h1 className="mt-7 text-[28px] font-bold leading-tight">Field IT Copilot</h1>
          <p className="mt-2 text-sm leading-6 text-blue-100">
            Canal móvil seguro para diagnóstico en terreno, trazabilidad y registro ITSM.
          </p>
        </div>

        <form onSubmit={submit} className="grid gap-5 px-6 py-6">
          <div>
            <label htmlFor="field-user" className="text-xs font-bold uppercase text-[#5E718C]">
              Perfil operativo
            </label>
            <select
              id="field-user"
              value={selectedEmail}
              onChange={(event) => setSelectedEmail(event.target.value)}
              className="mt-2 h-12 w-full rounded-xl border border-[#CAD5E2] bg-white px-3 text-sm font-semibold outline-none focus:border-[#0F6CBD]"
            >
              {demoTechnicians.map((item) => (
                <option key={item.email} value={item.email}>
                  {item.name} · {item.role}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <LoginSignal icon={UserRound} label="Rol" value={selected.role} />
            <LoginSignal icon={MapPin} label="Zona" value={selected.zone} />
            <LoginSignal icon={ShieldCheck} label="Trazabilidad" value="Activa" />
            <LoginSignal icon={BriefcaseBusiness} label="Base KB" value="Controlada" />
          </div>

          <button
            type="submit"
            className="h-12 rounded-xl bg-[#0F6CBD] text-sm font-bold text-white shadow-[0_12px_24px_rgba(15,108,189,0.25)] transition hover:bg-[#0B5AA3]"
          >
            Ingresar a Field Copilot
          </button>
        </form>
      </section>
    </main>
  );
}

function LoginSignal({ icon: Icon, label, value }: { icon: typeof UserRound; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[#D8E1EA] bg-white p-3">
      <Icon size={16} className="text-[#0F6CBD]" />
      <p className="mt-2 text-[10px] font-bold uppercase text-[#6D7F95]">{label}</p>
      <p className="mt-0.5 truncate text-xs font-bold text-[#1F2937]">{value}</p>
    </div>
  );
}

function FieldHome({
  technician,
  history,
  onLogout,
  onStartDiagnostic,
}: {
  technician: TechnicianSession;
  history: FieldTurn[];
  onLogout: () => void;
  onStartDiagnostic: (seed?: string) => void;
}) {
  return (
    <>
      <header className="bg-[#12315A] px-5 pb-5 pt-5 text-white">
        <div className="flex items-center justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-white/10">
              <SondaIcon size={20} />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-blue-100">Hola, {technician.name.split(" ")[0]}</p>
              <h1 className="truncate text-lg font-bold">Field IT Copilot</h1>
            </div>
          </div>
          <button type="button" onClick={onLogout} className="rounded-full border border-white/15 px-3 py-1.5 text-xs font-semibold text-blue-50">
            Salir
          </button>
        </div>

        <div className="mt-5 grid grid-cols-[1fr_auto] gap-3 rounded-2xl border border-white/10 bg-white/10 p-4">
          <div>
            <p className="flex items-center gap-1.5 text-xs font-semibold text-emerald-100">
              <CircleDot size={12} className="fill-emerald-300 text-emerald-300" />
              Operativo en terreno
            </p>
            <p className="mt-2 text-sm leading-5 text-blue-50">
              {technician.role} · {technician.zone}
            </p>
          </div>
          <div className="grid place-items-center rounded-2xl bg-emerald-400/15 px-3">
            <Radio size={22} className="text-emerald-100" />
          </div>
        </div>
      </header>

      <section className="thin-scrollbar flex-1 overflow-y-auto px-5 py-5">
        <button
          type="button"
          onClick={() => onStartDiagnostic()}
          className="flex min-h-[72px] w-full items-center justify-between rounded-2xl bg-[#0F6CBD] px-4 text-left text-white shadow-[0_14px_28px_rgba(15,108,189,0.22)]"
        >
          <span>
            <span className="block text-sm font-bold">Nuevo diagnóstico</span>
            <span className="mt-1 block text-xs text-blue-100">Descartes guiados, evidencia y ticket si corresponde</span>
          </span>
          <Sparkles size={22} />
        </button>

        <div className="mt-4 rounded-2xl border border-[#D8E1EA] bg-white p-3">
          <div className="flex items-center gap-2 rounded-xl bg-[#F1F5F9] px-3 py-2.5">
            <Search size={16} className="text-[#5E718C]" />
            <input
              type="search"
              placeholder="Buscar error, código o síntoma"
              className="min-w-0 flex-1 bg-transparent text-sm font-medium text-[#172033] outline-none placeholder:text-[#7A8CA3]"
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  const value = event.currentTarget.value.trim();
                  if (value) onStartDiagnostic(value);
                }
              }}
            />
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3">
          <FieldMetric icon={ShieldCheck} label="Trazabilidad" value="Activa" />
          <FieldMetric icon={TicketIcon} label="Tickets" value="Registrados" />
          <FieldMetric icon={Clock3} label="Historial" value={`${Math.max(history.length, 3)} casos`} />
          <FieldMetric icon={Headphones} label="KB controlada" value="ITSM" />
        </div>

        <SectionTitle title="Accesos rápidos" />
        <div className="grid grid-cols-2 gap-3">
          {categories.map((category) => (
            <button
              key={category.label}
              type="button"
              onClick={() => onStartDiagnostic(category.prompt)}
              className="flex min-h-[76px] items-center gap-3 rounded-2xl border border-[#D8E1EA] bg-white p-3 text-left shadow-sm"
            >
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#E8F3FF] text-[#0F6CBD]">
                <category.icon size={18} />
              </span>
              <span className="text-sm font-bold text-[#172033]">{category.label}</span>
            </button>
          ))}
        </div>

        <SectionTitle title="Historial reciente" />
        <div className="grid gap-2">
          {(history.length ? history : recentExamples.map((item, index) => ({
            id: `demo-${index}`,
            userText: item,
            assistantText: "",
            response: undefined,
            createdAt: new Date().toISOString(),
          } as unknown as FieldTurn))).slice(0, 3).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onStartDiagnostic(item.userText)}
              className="rounded-2xl border border-[#D8E1EA] bg-white px-4 py-3 text-left"
            >
              <p className="truncate text-sm font-bold text-[#172033]">{item.userText}</p>
              <p className="mt-1 text-xs text-[#6D7F95]">Diagnóstico Field Copilot · trazable</p>
            </button>
          ))}
        </div>

        <SectionTitle title="Tickets abiertos" />
        <div className="grid gap-2 pb-5">
          {openTicketExamples.map((ticket) => (
            <div key={ticket.id} className="flex items-center justify-between rounded-2xl border border-[#D8E1EA] bg-white px-4 py-3">
              <div className="min-w-0">
                <p className="font-data text-xs font-bold text-[#0F6CBD]">{ticket.id}</p>
                <p className="mt-1 truncate text-sm font-semibold text-[#172033]">{ticket.title}</p>
              </div>
              <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-bold text-amber-700">{ticket.priority}</span>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

function FieldDiagnostic({
  technician,
  context,
  onBack,
  onPersistTurn,
}: {
  technician: TechnicianSession;
  context?: SessionContext;
  onBack: () => void;
  onPersistTurn: (turn: FieldTurn, nextContext: SessionContext) => void;
}) {
  const [input, setInput] = useState("");
  const [activeContext, setActiveContext] = useState(context);
  const [turns, setTurns] = useState<FieldTurn[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [evidence, setEvidence] = useState<{ name: string; url: string } | null>(null);
  const [audioNote, setAudioNote] = useState<{ name: string; seconds: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const listener = (event: Event) => {
      const custom = event as CustomEvent<string>;
      if (custom.detail) setInput(custom.detail);
    };
    window.addEventListener("field-copilot-seed", listener);
    return () => window.removeEventListener("field-copilot-seed", listener);
  }, []);

  const latestTurn = turns.at(-1);
  const quickChecklist = useMemo(() => latestTurn?.response.suggestedActions.slice(0, 4) ?? [], [latestTurn]);

  async function sendDiagnostic(message: string) {
    const cleanMessage = message.trim();
    if ((!cleanMessage && !evidence && !audioNote) || isLoading) return;

    setIsLoading(true);
    setInput("");

    const userMessage = [
      cleanMessage || "Evidencia técnica adjunta desde terreno",
      audioNote ? `[Nota de audio adjunta: ${audioNote.name}, ${audioNote.seconds}s]` : "",
    ].filter(Boolean).join("\n");

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userMessage,
          sessionContext: activeContext,
          sourceChannel: "field-copilot",
          fieldRole: technician.role,
          fieldZone: technician.zone,
          attachmentName: evidence?.name,
          attachmentUrl: evidence?.url,
          audioNoteName: audioNote?.name,
        }),
      });

      if (!response.ok) throw new Error("No se pudo completar el diagnóstico");

      const payload = (await response.json()) as FieldChatApiResponse;
      const nextTurn: FieldTurn = {
        id: crypto.randomUUID(),
        userText: cleanMessage || evidence?.name || audioNote?.name || "Diagnóstico de terreno",
        assistantText: payload.response.assistantMessage,
        response: payload.response,
        ticket: payload.ticket,
        evidenceName: evidence?.name,
        audioName: audioNote?.name,
        createdAt: new Date().toISOString(),
      };

      setTurns((current) => [...current, nextTurn]);
      setActiveContext(payload.sessionContext);
      onPersistTurn(nextTurn, payload.sessionContext);
      setEvidence(null);
      setAudioNote(null);
    } catch {
      const fallbackContext = activeContext ?? createFieldContext(technician);
      const fallbackResponse: ITSMResponse = {
        assistantMessage: "No pude contactar el motor de diagnóstico. Deja el síntoma registrado y vuelve a intentar; si impacta operación, escala por mesa Field con evidencia adjunta.",
        classification: "INCIDENT",
        priority: "P3",
        requiredFields: [],
        suggestedActions: ["Registrar síntoma", "Adjuntar evidencia", "Escalar si afecta continuidad operacional"],
        operationalStatuses: ["Detectando intención"],
        shouldCreateTicket: false,
        shouldEscalate: true,
        ticketDraft: {
          type: "INCIDENT",
          priority: "P3",
          category: "Field Copilot",
          description: cleanMessage,
          executedSteps: [],
          nextAction: "Reintentar diagnóstico",
          assignedTeam: "Soporte Field",
          estimatedSla: "8 horas hábiles",
          status: "draft",
        },
      };
      const failedTurn: FieldTurn = {
        id: crypto.randomUUID(),
        userText: cleanMessage,
        assistantText: fallbackResponse.assistantMessage,
        response: fallbackResponse,
        createdAt: new Date().toISOString(),
      };
      setTurns((current) => [...current, failedTurn]);
      onPersistTurn(failedTurn, fallbackContext);
    } finally {
      setIsLoading(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void sendDiagnostic(input);
  }

  function createTicketRequest() {
    const summary = latestTurn?.userText ?? input;
    void sendDiagnostic(`Crear ticket desde terreno para este caso. Síntoma: ${summary}. Técnico: ${technician.name}, correo: ${technician.email}, área: ${technician.zone}. Escalar con trazabilidad Field Copilot.`);
  }

  return (
    <>
      <header className="border-b border-[#D8E1EA] bg-white px-4 py-4">
        <div className="flex items-center gap-3">
          <button type="button" onClick={onBack} className="grid size-10 place-items-center rounded-xl bg-[#EEF3F7] text-[#34445A]" aria-label="Volver">
            <ChevronLeft size={20} />
          </button>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-[#6D7F95]">Diagnóstico técnico</p>
            <h1 className="truncate text-lg font-bold text-[#172033]">Asistente IA Field</h1>
          </div>
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-bold text-emerald-700">
            <ShieldCheck size={12} />
            Seguro
          </span>
        </div>
      </header>

      <section className="thin-scrollbar flex-1 overflow-y-auto px-4 py-4">
        <div className="rounded-2xl border border-[#D8E1EA] bg-white p-4">
          <p className="text-sm font-bold text-[#172033]">Describe el error o síntoma observado</p>
          <p className="mt-1 text-xs leading-5 text-[#6D7F95]">
            El caso quedará asociado a {technician.name} y al canal móvil seguro Field Copilot.
          </p>
        </div>

        <div className="mt-4 grid gap-3">
          {turns.map((turn) => (
            <DiagnosticTurn key={turn.id} turn={turn} />
          ))}
          {isLoading ? (
            <div className="rounded-2xl border border-[#D8E1EA] bg-white p-4">
              <p className="flex items-center gap-2 text-sm font-bold text-[#0F6CBD]">
                <Activity size={16} className="animate-pulse" />
                Analizando descartes y criticidad
              </p>
            </div>
          ) : null}
        </div>

        {latestTurn ? (
          <div className="mt-4 grid gap-3">
            <DiagnosticSummary response={latestTurn.response} />
            {quickChecklist.length ? <Checklist items={quickChecklist} /> : null}
            <button
              type="button"
              onClick={createTicketRequest}
              className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-[#243B53] text-sm font-bold text-white"
            >
              <TicketIcon size={16} />
              Crear ticket con este contexto
            </button>
          </div>
        ) : null}
      </section>

      <footer className="border-t border-[#D8E1EA] bg-white px-4 py-3">
        {evidence || audioNote ? (
          <div className="mb-3 grid gap-2">
            {evidence ? (
              <AttachmentPill icon={ImagePlus} label={evidence.name} onRemove={() => setEvidence(null)} />
            ) : null}
            {audioNote ? (
              <AttachmentPill icon={Mic} label={`${audioNote.name} · ${audioNote.seconds}s`} onRemove={() => setAudioNote(null)} />
            ) : null}
          </div>
        ) : null}

        <form onSubmit={submit} className="flex items-end gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              const reader = new FileReader();
              reader.onload = () => {
                // Adapter preparado para futura integración multimodal: hoy se persiste la evidencia y su metadata sin bloquear el flujo si no hay análisis de imagen real.
                setEvidence({ name: file.name, url: String(reader.result) });
              };
              reader.readAsDataURL(file);
            }}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="grid size-11 shrink-0 place-items-center rounded-2xl border border-[#D8E1EA] bg-[#F6F9FC] text-[#0F6CBD]"
            aria-label="Adjuntar imagen o foto"
          >
            <Camera size={18} />
          </button>
          <button
            type="button"
            onClick={() => {
              // Punto de extensión STT: este mock representa una nota de audio móvil hasta conectar transcripción real server-side.
              setAudioNote({ name: `nota-audio-${new Date().getHours()}${new Date().getMinutes()}.m4a`, seconds: 18 });
            }}
            className="grid size-11 shrink-0 place-items-center rounded-2xl border border-[#D8E1EA] bg-[#F6F9FC] text-[#A65300]"
            aria-label="Adjuntar nota de audio"
          >
            <Mic size={18} />
          </button>
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            rows={1}
            placeholder="Error, síntoma o código..."
            className="max-h-24 min-h-11 flex-1 resize-none rounded-2xl border border-[#D8E1EA] bg-[#F6F9FC] px-3 py-3 text-sm font-medium text-[#172033] outline-none placeholder:text-[#7A8CA3] focus:border-[#0F6CBD]"
          />
          <button
            type="submit"
            disabled={isLoading || (!input.trim() && !evidence && !audioNote)}
            className="grid size-11 shrink-0 place-items-center rounded-2xl bg-[#0F6CBD] text-white disabled:bg-[#CAD5E2]"
            aria-label="Enviar diagnóstico"
          >
            <Send size={17} />
          </button>
        </form>
      </footer>
    </>
  );
}

function DiagnosticTurn({ turn }: { turn: FieldTurn }) {
  return (
    <article className="grid gap-2">
      <div className="ml-auto max-w-[88%] rounded-2xl bg-[#0F6CBD] px-4 py-3 text-white">
        <p className="whitespace-pre-line text-sm font-semibold leading-5">{turn.userText}</p>
        {turn.evidenceName || turn.audioName ? (
          <p className="mt-2 flex items-center gap-1 text-xs text-blue-100">
            <Paperclip size={12} />
            {[turn.evidenceName, turn.audioName].filter(Boolean).join(" · ")}
          </p>
        ) : null}
      </div>
      <div className="max-w-[94%] rounded-2xl border border-[#D8E1EA] bg-white px-4 py-3">
        <FormattedMessage content={turn.assistantText} className="text-sm font-medium leading-6 text-[#243B53]" />
        {turn.ticket ? (
          <div className="mt-3 rounded-xl bg-emerald-50 px-3 py-2">
            <p className="text-xs font-bold text-emerald-700">Ticket registrado: {turn.ticket.id}</p>
          </div>
        ) : null}
      </div>
    </article>
  );
}

function DiagnosticSummary({ response }: { response: ITSMResponse }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <SummaryTile label="Posible causa" value={response.ticketDraft.category} />
      <SummaryTile label="Criticidad" value={response.priority} tone={response.priority === "P1" || response.priority === "P2" ? "danger" : "normal"} />
      <SummaryTile label="Cuándo escalar" value={response.shouldEscalate ? "Escalar ahora" : "Tras descartes"} />
      <SummaryTile label="Ticket" value={response.shouldCreateTicket ? "Recomendado" : "Opcional"} />
    </div>
  );
}

function SummaryTile({ label, value, tone = "normal" }: { label: string; value: string; tone?: "normal" | "danger" }) {
  return (
    <div className="rounded-2xl border border-[#D8E1EA] bg-white p-3">
      <p className="text-[10px] font-bold uppercase text-[#6D7F95]">{label}</p>
      <p className={`mt-1 text-sm font-bold ${tone === "danger" ? "text-red-600" : "text-[#172033]"}`}>{value}</p>
    </div>
  );
}

function Checklist({ items }: { items: string[] }) {
  return (
    <div className="rounded-2xl border border-[#D8E1EA] bg-white p-4">
      <p className="text-sm font-bold text-[#172033]">Checklist de descartes</p>
      <div className="mt-3 grid gap-2">
        {items.map((item) => (
          <div key={item} className="flex items-start gap-2 text-sm leading-5 text-[#34445A]">
            <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-600" />
            <span>{item}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function AttachmentPill({ icon: Icon, label, onRemove }: { icon: typeof ImagePlus; label: string; onRemove: () => void }) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-[#D8E1EA] bg-[#F6F9FC] px-3 py-2">
      <span className="flex min-w-0 items-center gap-2 text-xs font-bold text-[#34445A]">
        <Icon size={14} className="shrink-0 text-[#0F6CBD]" />
        <span className="truncate">{label}</span>
      </span>
      <button type="button" onClick={onRemove} className="grid size-6 place-items-center rounded-full text-[#6D7F95]" aria-label="Quitar adjunto">
        <X size={14} />
      </button>
    </div>
  );
}

function FieldMetric({ icon: Icon, label, value }: { icon: typeof ShieldCheck; label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[#D8E1EA] bg-white p-3">
      <Icon size={17} className="text-[#0F6CBD]" />
      <p className="mt-2 text-[10px] font-bold uppercase text-[#6D7F95]">{label}</p>
      <p className="mt-1 text-sm font-bold text-[#172033]">{value}</p>
    </div>
  );
}

function SectionTitle({ title }: { title: string }) {
  return <h2 className="mb-3 mt-6 text-sm font-bold text-[#172033]">{title}</h2>;
}

function createFieldContext(technician: TechnicianSession): SessionContext {
  return {
    sessionId: `field-${crypto.randomUUID()}`,
    collectedFields: {
      nombre: technician.name,
      correo: technician.email,
      area: `Field Copilot - ${technician.zone}`,
    },
    messages: [],
    stepsExecuted: [],
  };
}

function readJson<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function storeJson<T>(key: string, value: T) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(value));
}
