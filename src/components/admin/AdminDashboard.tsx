"use client";

import type { ReactNode } from "react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  Activity,
  BarChart3,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Gauge,
  KeyRound,
  LockKeyhole,
  MessageSquareText,
  Settings,
  ShieldAlert,
  Ticket,
  UsersRound,
} from "lucide-react";
import { BrandMark } from "@/components/shared/BrandMark";
import { StatusBadge } from "@/components/shared/StatusBadge";
import {
  listOperationalCasesSync as listOperationalCases,
} from "@/services/operations.repository";
import type { Ticket as ITSMDemoTicket } from "@/lib/itsm/types";
import type { AdminKpi, ChartPoint, OperationalCase } from "@/types/operational";

const navItems = [
  { id: "overview", label: "Overview", icon: Gauge },
  { id: "incidents", label: "Incidents", icon: ShieldAlert },
  { id: "requests", label: "Requests", icon: Ticket },
  { id: "access", label: "Access", icon: KeyRound },
  { id: "knowledge", label: "Knowledge", icon: BookOpen },
  { id: "analytics", label: "Analytics", icon: BarChart3 },
  { id: "cases", label: "Conversaciones", icon: MessageSquareText },
  { id: "configuration", label: "Configuration", icon: Settings },
];

export function AdminDashboard() {
  const [authenticated, setAuthenticated] = useState(false);

  if (!authenticated) {
    return <AdminLogin onSuccess={() => setAuthenticated(true)} />;
  }

  return <AdminWorkspace />;
}

function AdminLogin({ onSuccess }: { onSuccess: () => void }) {
  const [user, setUser] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const demoUser = "admin";
  const demoPassword = "sonda2026demo";

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (user.trim().toLowerCase() === demoUser && (password === demoPassword || password === "demo")) {
      setError("");
      onSuccess();
      return;
    }
    setError("Credenciales no válidas para el panel.");
  }

  function enterDemo() {
    setUser(demoUser);
    setPassword(demoPassword);
    setError("");
    onSuccess();
  }

  return (
    <main className="grid min-h-screen place-items-center bg-[radial-gradient(circle_at_20%_0%,rgba(14,165,233,0.22),transparent_34%),linear-gradient(135deg,#07111f_0%,#0f172a_48%,#111827_100%)] px-4 py-8 text-white">
      <section className="w-full max-w-md rounded-3xl border border-white/10 bg-white/[0.07] p-6 shadow-2xl shadow-black/30 backdrop-blur-2xl">
        <BrandMark variant="dark" />
        <div className="mt-8">
          <div className="mb-5 grid size-12 place-items-center rounded-2xl bg-cyan-400/12 text-cyan-200">
            <LockKeyhole size={22} aria-hidden />
          </div>
          <h1 className="text-2xl font-semibold tracking-[-0.025em]">Consola operacional</h1>
          <p className="mt-2 text-sm leading-6 text-slate-300">
            Acceso restringido para monitoreo, gobierno y seguimiento de casos ITSM.
          </p>
        </div>

        <div className="mt-6 rounded-2xl border border-cyan-200/20 bg-cyan-200/[0.08] p-4">
          <div className="flex items-start gap-3">
            <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-cyan-200/12 text-cyan-100">
              <KeyRound size={17} aria-hidden />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-white">Credenciales demo</p>
              <div className="mt-3 grid gap-2 text-sm">
                <CredentialLine label="Usuario" value={demoUser} />
                <CredentialLine label="Clave" value={demoPassword} />
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={enterDemo}
            className="mt-4 flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-cyan-100/20 bg-white/10 text-sm font-semibold text-cyan-50 transition hover:bg-white/15"
          >
            Ingresar como demo
            <ChevronRight size={16} aria-hidden />
          </button>
        </div>

        <form onSubmit={submit} className="mt-6 space-y-4">
          <div>
            <label className="text-xs font-medium uppercase tracking-[0.12em] text-slate-400" htmlFor="admin-user">
              Usuario
            </label>
            <input
              id="admin-user"
              value={user}
              onChange={(event) => setUser(event.target.value)}
              className="mt-2 h-11 w-full rounded-xl border border-white/10 bg-white/10 px-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-300/70"
              autoComplete="username"
            />
          </div>
          <div>
            <label className="text-xs font-medium uppercase tracking-[0.12em] text-slate-400" htmlFor="admin-password">
              Clave
            </label>
            <input
              id="admin-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-2 h-11 w-full rounded-xl border border-white/10 bg-white/10 px-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-300/70"
              autoComplete="current-password"
            />
          </div>
          {error ? <p className="text-sm text-rose-200">{error}</p> : null}
          <button
            type="submit"
            className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-cyan-300 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200"
          >
            Entrar
            <ChevronRight size={16} aria-hidden />
          </button>
        </form>
      </section>
    </main>
  );
}

function CredentialLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-slate-950/24 px-3 py-2">
      <span className="text-xs font-medium uppercase tracking-[0.12em] text-slate-400">{label}</span>
      <span className="font-mono text-xs font-semibold text-cyan-100">{value}</span>
    </div>
  );
}

function kpiValue(kpis: AdminKpi[], label: string) {
  return kpis.find((kpi) => kpi.label === label)?.value ?? "-";
}

function ticketToOperationalCase(ticket: ITSMDemoTicket): OperationalCase {
  const duration = Math.max(1, Math.round((Date.now() - new Date(ticket.createdAt).getTime()) / 60000));
  const escalated = ticket.status === "escalated" || ticket.status === "created";

  return {
    id: ticket.id,
    user_name: ticket.requesterName,
    department: ticket.businessArea ?? "Área pendiente",
    issue_type: ticket.type,
    category: ticket.category,
    priority: ticket.priority,
    status: ticketStatusToCaseStatus(ticket.status),
    created_at: ticket.createdAt,
    resolved_at: ticket.status === "resolved" ? ticket.createdAt : null,
    resolution_type: ticket.status === "resolved" ? "Autónoma" : escalated ? "Escalada" : "Pendiente",
    escalated,
    assigned_technician: ticket.assignedTeam,
    sentiment: ticket.priority === "P1" ? "Crítico" : escalated ? "Tenso" : "Neutral",
    conversation_summary: ticket.description,
    sla_minutes: slaMinutes(ticket.priority),
    duration_minutes: duration,
    knowledge_article: extractKnowledgeArticle(ticket.description),
  };
}

function mergeOperationalCases(realCases: OperationalCase[], mockCases: OperationalCase[]) {
  const seen = new Set(realCases.map((item) => item.id));
  return [...realCases, ...mockCases.filter((item) => !seen.has(item.id))]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 100);
}

function ticketStatusToCaseStatus(status: ITSMDemoTicket["status"]): OperationalCase["status"] {
  if (status === "resolved") return "Resuelto";
  if (status === "escalated" || status === "created") return "Escalado";
  return "En diagnóstico";
}

function slaMinutes(priority: ITSMDemoTicket["priority"]) {
  const minutes: Record<ITSMDemoTicket["priority"], number> = {
    P1: 240,
    P2: 480,
    P3: 1440,
    P4: 4320,
  };

  return minutes[priority];
}

function extractKnowledgeArticle(description: string) {
  return description.match(/Referencia KB:\s*([^|]+)/)?.[1]?.trim() ?? description.match(/Playbook:\s*([^|]+)/)?.[1]?.trim() ?? "Diagnóstico conversacional";
}

function buildAdminKpis(cases: OperationalCase[]): AdminKpi[] {
  const total = Math.max(cases.length, 1);
  const generatedTickets = cases.filter((item) => item.status !== "Resuelto" || item.escalated).length;
  const autonomous = cases.filter((item) => item.resolution_type === "Autónoma").length;
  const escalated = cases.filter((item) => item.escalated).length;
  const criticalActive = cases.filter((item) => item.priority === "P1" && item.status !== "Resuelto").length;
  const resolved = cases.filter((item) => item.status === "Resuelto");
  const avgResolution = resolved.length
    ? Math.round(resolved.reduce((sum, item) => sum + item.duration_minutes, 0) / resolved.length)
    : Math.round(cases.reduce((sum, item) => sum + item.duration_minutes, 0) / total);
  const slaMet = Math.round((cases.filter((item) => item.duration_minutes <= item.sla_minutes).length / total) * 100);
  const positiveSentiment = Math.round(
    (cases.filter((item) => item.sentiment === "Positivo" || item.sentiment === "Neutral").length / total) * 100,
  );

  return [
    { label: "Conversaciones", value: cases.length.toLocaleString("es-CL"), delta: "incluye tickets reales", emphasis: "neutral" },
    { label: "Tickets generados", value: generatedTickets.toString(), delta: "desde bot + demo", emphasis: "neutral" },
    { label: "Resolución autónoma", value: `${Math.round((autonomous / total) * 100)}%`, delta: "sin derivación humana", emphasis: "positive" },
    { label: "Escalados humanos", value: escalated.toString(), delta: "con contexto completo", emphasis: "neutral" },
    { label: "Tiempo promedio", value: `${avgResolution} min`, delta: "casos gestionados", emphasis: "positive" },
    { label: "Cumplimiento SLA", value: `${slaMet}%`, delta: "según prioridad", emphasis: slaMet >= 95 ? "positive" : "critical" },
    { label: "Sentiment usuarios", value: `${positiveSentiment}%`, delta: "positivo o neutral", emphasis: "positive" },
    { label: "Críticos activos", value: criticalActive.toString(), delta: "requiere seguimiento", emphasis: criticalActive ? "critical" : "positive" },
  ];
}

function getVolumeByDay(cases: OperationalCase[]): ChartPoint[] {
  const buckets = new Map<string, number>();
  for (const item of cases) {
    const label = new Intl.DateTimeFormat("es-CL", { day: "2-digit", month: "short", timeZone: "UTC" }).format(
      new Date(item.created_at),
    );
    buckets.set(label, (buckets.get(label) ?? 0) + 1);
  }

  return Array.from(buckets.entries())
    .map(([label, value]) => ({ label, value }))
    .reverse()
    .slice(-10);
}

function groupByField<T extends keyof OperationalCase>(cases: OperationalCase[], field: T, limit = 8): ChartPoint[] {
  const buckets = new Map<string, number>();
  for (const item of cases) {
    buckets.set(String(item[field]), (buckets.get(String(item[field])) ?? 0) + 1);
  }

  return Array.from(buckets.entries())
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, limit);
}

function getHourlyHeatmap(cases: OperationalCase[]): ChartPoint[] {
  const hours = Array.from({ length: 12 }, (_, index) => 8 + index);

  return hours.map((hour) => ({
    label: `${String(hour).padStart(2, "0")}:00`,
    value: cases.filter((item) => new Date(item.created_at).getUTCHours() === hour).length,
  }));
}

function getKnowledgeUsage(cases: OperationalCase[]): ChartPoint[] {
  const buckets = new Map<string, number>();
  for (const item of cases) {
    buckets.set(item.knowledge_article, (buckets.get(item.knowledge_article) ?? 0) + 1);
  }

  return Array.from(buckets.entries())
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 7);
}

function getSlaBreachesByDay(cases: OperationalCase[]): ChartPoint[] {
  const buckets = new Map<string, number>();
  for (const item of cases) {
    if (item.duration_minutes <= item.sla_minutes) continue;

    const label = new Intl.DateTimeFormat("es-CL", { day: "2-digit", month: "short", timeZone: "UTC" }).format(
      new Date(item.created_at),
    );
    buckets.set(label, (buckets.get(label) ?? 0) + 1);
  }

  return Array.from(buckets.entries())
    .map(([label, value]) => ({ label, value }))
    .reverse()
    .slice(-10);
}

function getEscalationFunnel(cases: OperationalCase[]): ChartPoint[] {
  return [
    { label: "Intake", value: cases.length },
    { label: "Clasificados", value: cases.filter((item) => item.issue_type).length },
    { label: "Con KB", value: cases.filter((item) => item.knowledge_article).length },
    { label: "Escalados", value: cases.filter((item) => item.escalated).length },
    { label: "Resueltos", value: cases.filter((item) => item.status === "Resuelto").length },
  ];
}

function getAgingBuckets(cases: OperationalCase[]): ChartPoint[] {
  const buckets = [
    { label: "<4h", value: 0 },
    { label: "4-8h", value: 0 },
    { label: "8-24h", value: 0 },
    { label: ">24h", value: 0 },
  ];

  for (const item of cases) {
    if (item.status === "Resuelto") continue;
    const hours = item.duration_minutes / 60;
    if (hours < 4) buckets[0].value += 1;
    else if (hours < 8) buckets[1].value += 1;
    else if (hours < 24) buckets[2].value += 1;
    else buckets[3].value += 1;
  }

  return buckets;
}

function AdminWorkspace() {
  const [activeSection, setActiveSection] = useState("overview");
  const [realTickets, setRealTickets] = useState<ITSMDemoTicket[]>([]);
  const [ticketSource, setTicketSource] = useState<"cargando" | "supabase" | "demo">("cargando");
  const [showOnlyReal, setShowOnlyReal] = useState(false);

  const mockCases = useMemo(() => listOperationalCases(100), []);
  const realCases = useMemo(() => realTickets.map(ticketToOperationalCase), [realTickets]);
  const cases = useMemo(() => {
    if (showOnlyReal) {
      return realCases;
    }
    return mergeOperationalCases(realCases, mockCases);
  }, [realCases, mockCases, showOnlyReal]);

  const kpis = useMemo(() => buildAdminKpis(cases), [cases]);
  const byDay = useMemo(() => getVolumeByDay(cases), [cases]);
  const byType = useMemo(() => groupByField(cases, "category", 7), [cases]);
  const byPriority = useMemo(() => groupByField(cases, "priority", 4), [cases]);
  const heatmap = useMemo(() => getHourlyHeatmap(cases), [cases]);
  const topIntents = useMemo(() => groupByField(cases, "issue_type", 7), [cases]);
  const escalated = useMemo(() => cases.filter((item) => item.escalated).slice(0, 7), [cases]);
  const knowledge = useMemo(() => getKnowledgeUsage(cases), [cases]);
  const slaBreachesByDay = useMemo(() => getSlaBreachesByDay(cases), [cases]);
  const escalationFunnel = useMemo(() => getEscalationFunnel(cases), [cases]);
  const agingBuckets = useMemo(() => getAgingBuckets(cases), [cases]);
  const sentimentBreakdown = useMemo(() => groupByField(cases, "sentiment", 5), [cases]);
  const operationalModel = useMemo(() => buildOperationalModel(cases, kpis, knowledge), [cases, kpis, knowledge]);

  const incidentCases = useMemo(() => cases.filter((item) =>
    ["INCIDENT", "NETWORK_ISSUE", "HARDWARE_ISSUE", "SECURITY_INCIDENT"].includes(item.issue_type)
  ), [cases]);

  const requestCases = useMemo(() => cases.filter((item) => ["SERVICE_REQUEST", "SOFTWARE_REQUEST"].includes(item.issue_type)), [cases]);

  const accessCases = useMemo(() => cases.filter((item) => item.issue_type === "ACCESS_REQUEST"), [cases]);

  useEffect(() => {
    let active = true;

    async function loadTickets() {
      try {
        const response = await fetch("/api/tickets", { cache: "no-store" });
        if (!response.ok) throw new Error("tickets unavailable");
        const payload = (await response.json()) as { tickets?: ITSMDemoTicket[]; source?: "supabase" | "memory" };
        if (!active) return;
        setRealTickets(payload.tickets ?? []);
        setTicketSource(payload.source === "supabase" ? "supabase" : "demo");
      } catch {
        if (!active) return;
        setTicketSource("demo");
      }
    }

    void loadTickets();
    const interval = window.setInterval(loadTickets, 15000);

    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, []);

  function goToSection(id: string) {
    setActiveSection(id);
  }

  return (
    <main className="min-h-screen bg-[#07111f] text-[12px] text-slate-100">
      <div className="grid min-h-screen lg:grid-cols-[230px_1fr]">
        <aside className="border-b border-white/10 bg-[#0a1525] p-3 lg:sticky lg:top-0 lg:h-screen lg:border-b-0 lg:border-r">
          <div className="flex items-center gap-2.5">
            <BrandMark compact variant="dark" />
            <div className="min-w-0">
              <p className="text-[13px] font-semibold leading-4 text-white">Soporte ITSM</p>
              <p className="truncate text-[11px] text-slate-500">SONDA · Geimser</p>
            </div>
          </div>
          <nav className="mt-6 grid gap-1">
            {[
              { id: "overview", label: "Vista General", icon: Activity },
              { id: "incidents", label: "Gestión de Incidentes", icon: ShieldAlert },
              { id: "requests", label: "Gestión de Requerimientos", icon: BarChart3 },
              { id: "access", label: "Gestión de Accesos", icon: UsersRound },
              { id: "knowledge", label: "Base de Conocimiento", icon: BookOpen },
              { id: "analytics", label: "Analítica Avanzada", icon: Gauge },
              { id: "cases", label: "Bitácora de Casos", icon: Ticket },
              { id: "configuration", label: "Gobernanza", icon: Gauge },
            ].map((item) => (
              <button
                key={item.label}
                type="button"
                onClick={() => goToSection(item.id)}
                className={`flex w-full items-center text-left gap-2.5 rounded-lg px-2.5 py-1.5 text-[12px] font-medium transition ${
                  activeSection === item.id ? "bg-cyan-300/10 text-cyan-100 ring-1 ring-cyan-300/15" : "text-slate-400 hover:bg-white/[0.045] hover:text-white"
                }`}
              >
                <item.icon size={14} className="shrink-0" aria-hidden />
                <span className="truncate">{item.label}</span>
              </button>
            ))}
          </nav>
        </aside>

        <section className="min-w-0">
          <header className="border-b border-white/10 bg-[#07111f]/92 px-4 py-2.5 backdrop-blur-xl lg:px-5">
            <div className="flex flex-col gap-2 xl:flex-row xl:items-end xl:justify-between">
              <div>
                <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-cyan-200/75">Centro de Operaciones ITSM</p>
                <h1 className="mt-0.5 text-[22px] font-semibold leading-7 tracking-[-0.025em] text-white">Panel ejecutivo ITSM</h1>
                <p className="mt-1 max-w-2xl text-[12px] leading-4 text-slate-400">
                  Vista ejecutiva de incidentes, solicitudes, accesos, SLA, escalamiento y efectividad de conocimiento.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2 cursor-pointer select-none rounded-lg border border-cyan-300/20 bg-cyan-300/[0.07] px-2.5 py-1 text-cyan-200 transition hover:bg-cyan-300/12">
                  <input
                    type="checkbox"
                    checked={showOnlyReal}
                    onChange={(e) => setShowOnlyReal(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="relative w-7 h-4 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-cyan-400"></div>
                  <span className="text-[11px] font-medium tracking-tight">Solo reales (Supabase)</span>
                </label>
                <div className="flex flex-wrap gap-1.5">
                  <StatusBadge tone="cyan">Mercury-ready</StatusBadge>
                  <StatusBadge tone="cyan">Supabase-ready</StatusBadge>
                  <StatusBadge tone={ticketSource === "supabase" ? "green" : "amber"}>
                    {ticketSource === "supabase" ? `${realTickets.length} tickets reales` : "tickets demo"}
                  </StatusBadge>
                  <StatusBadge tone="slate">ITIL aligned</StatusBadge>
                </div>
              </div>
            </div>
          </header>

          <div className="space-y-2.5 p-3">
            {showOnlyReal && cases.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-12 text-center my-10">
                <div className="grid size-14 place-items-center rounded-2xl bg-cyan-400/10 text-cyan-200">
                  <Ticket size={28} />
                </div>
                <h3 className="mt-4 text-base font-semibold text-white">No hay tickets reales en Supabase</h3>
                <p className="mt-2 max-w-sm text-slate-400">
                  Aún no se han registrado casos reales en la base de datos de Supabase. Abre la interfaz del chatbot, inicia un caso y completa o resuelve el diagnóstico para poblar la base de datos en tiempo real.
                </p>
              </div>
            ) : (
              <>
                {activeSection === "overview" && (
                  <div className="space-y-3">
                    <section id="overview" className="scroll-mt-4">
                      <div className="grid gap-2 sm:grid-cols-3 xl:grid-cols-6">
                        {operationalModel.executive.map((kpi) => (
                          <ExecutiveKpiCard key={kpi.label} kpi={kpi} />
                        ))}
                      </div>
                    </section>
                    <section className="grid gap-2 xl:grid-cols-4">
                      <DomainCard id="incidents" title="Gestión de Incidentes" metrics={operationalModel.incident} />
                      <DomainCard id="requests" title="Gestión de Requerimientos" metrics={operationalModel.request} />
                      <DomainCard id="access" title="Gestión de Accesos" metrics={operationalModel.access} />
                      <DomainCard id="knowledge" title="Efectividad de Base de Conocimiento" metrics={operationalModel.knowledge} />
                    </section>
                    <div id="analytics" className="grid gap-2.5 xl:grid-cols-[1.15fr_0.85fr_0.85fr]">
                      <Panel title="Volumen por día" icon={Activity}>
                        <LineBars items={byDay} />
                      </Panel>
                      <Panel title="Prioridades" icon={ShieldAlert}>
                        <PriorityStack items={byPriority} />
                      </Panel>
                      <Panel title="Demanda horaria" icon={Clock3}>
                        <Heatmap items={heatmap} />
                      </Panel>
                    </div>
                  </div>
                )}
                {activeSection === "incidents" && (
                  <div className="space-y-3">
                    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
                      <h2 className="text-base font-semibold text-white">Gestión de Incidentes (Incident Management)</h2>
                      <p className="text-slate-400 mt-1">Monitoreo técnico de fallas activas de hardware, sistemas operativos, VPN y conectividad.</p>
                    </div>
                    <div className="grid gap-2.5 xl:grid-cols-[1fr_3fr]">
                      <DomainCard id="incidents-detail" title="Métricas de Incidentes" metrics={operationalModel.incident} />
                      <div className="grid gap-2.5">
                        <Panel title="Tendencia de Incidentes" icon={BarChart3}>
                          <HorizontalBars items={topIntents.filter(x => ["INCIDENT", "NETWORK_ISSUE", "HARDWARE_ISSUE"].includes(x.label))} />
                        </Panel>
                      </div>
                    </div>
                    <OperationalTable cases={incidentCases} />
                  </div>
                )}
                {activeSection === "requests" && (
                  <div className="space-y-3">
                    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
                      <h2 className="text-base font-semibold text-white">Gestión de Requerimientos (Request Management)</h2>
                      <p className="text-slate-400 mt-1">Seguimiento de solicitudes de instalación de software autorizado, compras de licencias y aprovisionamiento base.</p>
                    </div>
                    <div className="grid gap-2.5 xl:grid-cols-[1fr_3fr]">
                      <DomainCard id="requests-detail" title="Métricas de Requerimientos" metrics={operationalModel.request} />
                      <div className="grid gap-2.5">
                        <Panel title="Distribución de Requerimientos" icon={BarChart3}>
                          <HorizontalBars items={topIntents.filter(x => ["SERVICE_REQUEST", "SOFTWARE_REQUEST"].includes(x.label))} />
                        </Panel>
                      </div>
                    </div>
                    <OperationalTable cases={requestCases} />
                  </div>
                )}
                {activeSection === "access" && (
                  <div className="space-y-3">
                    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
                      <h2 className="text-base font-semibold text-white">Gestión de Accesos e Identidades (Access Management)</h2>
                      <p className="text-slate-400 mt-1">Aprobación y provisión de accesos de red, reseteo de contraseñas, onboarding y carpetas compartidas.</p>
                    </div>
                    <div className="grid gap-2.5 xl:grid-cols-[1fr_3fr]">
                      <DomainCard id="access-detail" title="Métricas de Accesos" metrics={operationalModel.access} />
                      <div className="grid gap-2.5">
                        <Panel title="Distribución de Categorías" icon={Gauge}>
                          <HorizontalBars items={byType.filter(x => ["Acceso a correo", "Permisos", "Password reset"].includes(x.label))} />
                        </Panel>
                      </div>
                    </div>
                    <OperationalTable cases={accessCases} />
                  </div>
                )}
                {activeSection === "knowledge" && (
                  <div className="space-y-3">
                    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
                      <h2 className="text-base font-semibold text-white">Efectividad de Base de Conocimiento (Knowledge Base)</h2>
                      <p className="text-slate-400 mt-1">Efectividad en el uso de artículos L2 y desvío autónomo de casos por el bot.</p>
                    </div>
                    <div className="grid gap-2.5 xl:grid-cols-[1fr_3fr]">
                      <DomainCard id="knowledge-detail" title="Resumen de Base de Conocimiento" metrics={operationalModel.knowledge} />
                      <Panel title="Artículos de Conocimiento Utilizados" icon={BookOpen}>
                        <KnowledgeList items={knowledge} />
                      </Panel>
                    </div>
                  </div>
                )}
                {activeSection === "analytics" && (
                  <div className="space-y-3">
                    <div className="grid gap-2.5 xl:grid-cols-2">
                      <Panel title="Volumen por día" icon={Activity}>
                        <LineBars items={byDay} />
                      </Panel>
                      <Panel title="Mapa de calor de demanda horaria" icon={Clock3}>
                        <Heatmap items={heatmap} />
                      </Panel>
                    </div>
                    <div className="grid gap-2.5 xl:grid-cols-3">
                      <Panel title="Prioridades" icon={ShieldAlert}>
                        <PriorityStack items={byPriority} />
                      </Panel>
                      <Panel title="Incumplimientos de SLA por día" icon={Clock3}>
                        <LineBars items={slaBreachesByDay} />
                      </Panel>
                      <Panel title="Carga de trabajo pendiente por antigüedad" icon={Gauge}>
                        <HorizontalBars items={agingBuckets} />
                      </Panel>
                    </div>
                    <div className="grid gap-2.5 xl:grid-cols-3">
                      <Panel title="Distribución por categorías" icon={Gauge}>
                        <HorizontalBars items={byType} />
                      </Panel>
                      <Panel title="Tendencia de incidentes" icon={BarChart3}>
                        <HorizontalBars items={topIntents} compact />
                      </Panel>
                      <Panel title="Distribución de sentimiento de usuarios" icon={UsersRound}>
                        <HorizontalBars items={sentimentBreakdown} />
                      </Panel>
                    </div>
                  </div>
                )}
                {activeSection === "cases" && (
                  <div className="space-y-3">
                    <div id="cases" className="grid gap-2.5 xl:grid-cols-[0.32fr_0.68fr]">
                      <Panel title="Casos escalados" icon={Ticket}>
                        <EscalatedList cases={escalated} />
                      </Panel>
                      <OperationalTable cases={cases} />
                    </div>
                  </div>
                )}
                {activeSection === "configuration" && (
                  <section id="configuration" className="rounded-xl border border-white/10 bg-white/[0.035] px-4 py-3.5 space-y-4">
                    <div>
                      <h2 className="text-base font-semibold text-white">Gobernanza y Configuración (Governance)</h2>
                      <p className="mt-1 text-[11px] text-slate-500">Detalles de configuración de la mesa de soporte inteligente en base al modelo ITIL v4 de SONDA.</p>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-3">
                      <div className="rounded-lg bg-slate-900/60 p-3 border border-white/5">
                        <p className="text-cyan-200 font-semibold text-xs">Taxonomía</p>
                        <p className="text-slate-400 mt-1 leading-4">Categorización inteligente automatizada con 8 intents estándar y más de 30 categorías de servicio.</p>
                      </div>
                      <div className="rounded-lg bg-slate-900/60 p-3 border border-white/5">
                        <p className="text-cyan-200 font-semibold text-xs">SLA y Prioridades</p>
                        <p className="text-slate-400 mt-1 leading-4">Cálculo de severidad autónomo (P1 a P4) correlacionando impacto operacional y urgencia reportada por el usuario.</p>
                      </div>
                      <div className="rounded-lg bg-slate-900/60 p-3 border border-white/5">
                        <p className="text-cyan-200 font-semibold text-xs">Base de Datos</p>
                        <p className="text-slate-400 mt-1 leading-4">Conectado en tiempo real a Supabase para auditorías operativas rápidas y analítica sin latencia.</p>
                      </div>
                    </div>
                  </section>
                )}
              </>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

function OperationalTable({ cases }: { cases: OperationalCase[] }) {
  return (
    <article className="overflow-hidden rounded-xl border border-white/10 bg-white/[0.04] shadow-sm shadow-black/10">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <h2 className="flex items-center gap-2 text-[14px] font-semibold text-white">
          <CheckCircle2 size={15} className="text-cyan-200/80" aria-hidden />
          Lista de casos analizados
        </h2>
        <span className="text-[11px] text-slate-500">actualización operacional en vivo</span>
      </div>
      <div className="thin-scrollbar max-h-[480px] overflow-auto">
        <table className="w-full min-w-[1040px] border-collapse text-left text-xs">
          <thead className="sticky top-0 bg-[#0b1727] text-slate-500">
            <tr>
              {["Ticket ID", "Usuario", "Tipo", "Categoría", "Prioridad", "Estado", "Soporte (Asignado)", "Creado", "Duración", "Escalado", "SLA"].map(
                (header) => (
                  <th key={header} className="px-3 py-2.5 font-medium">
                    {header}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/8">
            {cases.map((item) => (
              <tr key={item.id} className="transition hover:bg-white/[0.035]">
                <td className="px-3 py-2.5 font-mono font-semibold text-cyan-100">{item.id}</td>
                <td className="px-3 py-2.5 font-medium text-white">{item.user_name}</td>
                <td className="px-3 py-2.5 text-slate-300">{item.issue_type.replaceAll("_", " ")}</td>
                <td className="px-3 py-2.5 text-slate-300">{item.category}</td>
                <td className="px-3 py-2.5">
                  <StatusBadge tone={item.priority === "P1" ? "red" : item.priority === "P2" ? "amber" : "cyan"}>
                    {item.priority}
                  </StatusBadge>
                </td>
                <td className="px-3 py-2.5 text-slate-300">{item.status}</td>
                <td className="px-3 py-2.5 text-slate-300">{item.assigned_technician}</td>
                <td className="px-3 py-2.5 text-slate-400">{formatDate(item.created_at)}</td>
                <td className="px-3 py-2.5 text-slate-300">{item.duration_minutes} min</td>
                <td className="px-3 py-2.5 text-slate-300">{item.escalated ? "Sí" : "No"}</td>
                <td className="px-3 py-2.5">
                  <StatusBadge tone={item.duration_minutes > item.sla_minutes ? "red" : "green"}>
                    {item.duration_minutes > item.sla_minutes ? "Breach" : "OK"}
                  </StatusBadge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </article>
  );
}

function buildOperationalModel(cases: OperationalCase[], kpis: AdminKpi[], knowledge: ChartPoint[]) {
  const incidentCases = cases.filter((item) =>
    ["INCIDENT", "NETWORK_ISSUE", "HARDWARE_ISSUE", "SECURITY_INCIDENT"].includes(item.issue_type),
  );
  const requestCases = cases.filter((item) => ["SERVICE_REQUEST", "SOFTWARE_REQUEST"].includes(item.issue_type));
  const accessCases = cases.filter((item) => item.issue_type === "ACCESS_REQUEST");
  const autonomous = cases.filter((item) => item.resolution_type === "Autónoma").length;
  const escalated = cases.filter((item) => item.escalated).length;
  const slaBreaches = cases.filter((item) => item.duration_minutes > item.sla_minutes).length;

  return {
    executive: [
      { label: "Conversaciones totales", value: kpiValue(kpis, "Conversaciones"), meta: "+18% últimos 7 días", tone: "neutral" },
      { label: "Casos gestionados", value: cases.length.toString(), meta: "pipeline operativo", tone: "neutral" },
      { label: "Resolución autónoma", value: kpiValue(kpis, "Resolución autónoma"), meta: `${autonomous} casos`, tone: "positive" },
      { label: "Escalados humanos", value: kpiValue(kpis, "Escalados humanos"), meta: "con contexto", tone: "neutral" },
      { label: "SLA cumplimiento", value: kpiValue(kpis, "Cumplimiento SLA"), meta: `${slaBreaches} breaches`, tone: slaBreaches ? "warning" : "positive" },
      { label: "Tiempo promedio", value: kpiValue(kpis, "Tiempo promedio"), meta: "resolución", tone: "neutral" },
    ],
    incident: [
      { label: "abiertos", value: countOpen(incidentCases).toString() },
      { label: "cerrados", value: countClosed(incidentCases).toString() },
      { label: "críticos", value: incidentCases.filter((item) => item.priority === "P1").length.toString() },
      { label: "MTTR", value: `${averageDuration(incidentCases)} min` },
      { label: "aging", value: incidentCases.filter((item) => item.duration_minutes > item.sla_minutes).length.toString() },
    ],
    request: [
      { label: "abiertas", value: countOpen(requestCases).toString() },
      { label: "completadas", value: countClosed(requestCases).toString() },
      { label: "tiempo promedio", value: `${averageDuration(requestCases)} min` },
    ],
    access: [
      { label: "solicitados", value: accessCases.length.toString() },
      { label: "aprobados", value: countClosed(accessCases).toString() },
      { label: "pendientes", value: countOpen(accessCases).toString() },
    ],
    knowledge: [
      { label: "artículos usados", value: knowledge.reduce((sum, item) => sum + item.value, 0).toString() },
      { label: "self-service success", value: kpiValue(kpis, "Resolución autónoma") },
      { label: "fallback humano", value: escalated.toString() },
    ],
  };
}

function countOpen(items: OperationalCase[]) {
  return items.filter((item) => item.status !== "Resuelto").length;
}

function countClosed(items: OperationalCase[]) {
  return items.filter((item) => item.status === "Resuelto").length;
}

function averageDuration(items: OperationalCase[]) {
  if (!items.length) return 0;
  return Math.round(items.reduce((sum, item) => sum + item.duration_minutes, 0) / items.length);
}

function ExecutiveKpiCard({ kpi }: { kpi: { label: string; value: string; meta: string; tone: string } }) {
  const tone =
    kpi.tone === "warning"
      ? "border-amber-300/16 bg-amber-300/[0.045]"
      : kpi.tone === "positive"
        ? "border-cyan-300/16 bg-cyan-300/[0.045]"
        : "border-white/10 bg-white/[0.04]";

  return (
    <article className={`rounded-lg border px-2.5 py-2 shadow-sm shadow-black/10 ${tone}`}>
      <p className="text-[11px] font-medium text-slate-400">{kpi.label}</p>
      <p className="mt-1 text-[20px] font-semibold leading-6 tracking-[-0.03em] text-white">{kpi.value}</p>
      <p className="mt-1 text-[11px] text-slate-500">{kpi.meta}</p>
    </article>
  );
}

function DomainCard({ id, title, metrics }: { id: string; title: string; metrics: Array<{ label: string; value: string }> }) {
  return (
    <article id={id} className="scroll-mt-4 rounded-lg border border-white/10 bg-white/[0.035] p-2.5">
      <h2 className="text-[13px] font-semibold text-white">{title}</h2>
      <div className="mt-2 grid grid-cols-2 gap-1.5">
        {metrics.map((metric) => (
          <div key={metric.label} className="rounded-md border border-white/8 bg-slate-950/18 px-2 py-1.5">
            <p className="text-[10px] uppercase tracking-[0.08em] text-slate-500">{metric.label}</p>
            <p className="mt-0.5 text-[15px] font-semibold leading-5 text-slate-100">{metric.value}</p>
          </div>
        ))}
      </div>
    </article>
  );
}

function Panel({ title, icon: Icon, children }: { title: string; icon: typeof Activity; children: ReactNode }) {
  return (
    <article className="rounded-lg border border-white/10 bg-white/[0.04] p-3 shadow-sm shadow-black/10">
      <div className="mb-2.5 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-[13px] font-semibold text-white">
          <Icon size={15} className="text-cyan-200/80" aria-hidden />
          {title}
        </h2>
      </div>
      {children}
    </article>
  );
}

function LineBars({ items }: { items: ChartPoint[] }) {
  const max = Math.max(...items.map((item) => item.value));
  return (
    <div className="flex h-32 items-end gap-1.5">
      {items.map((item) => (
        <div key={item.label} className="flex flex-1 flex-col items-center gap-1.5">
          <div className="flex h-24 w-full items-end rounded-md bg-white/[0.04] p-1">
            <div
              className="w-full rounded-md bg-gradient-to-t from-cyan-400/90 to-sky-200/90"
              style={{ height: `${Math.max((item.value / max) * 100, 10)}%` }}
            />
          </div>
          <span className="text-[10px] text-slate-500">{item.label}</span>
        </div>
      ))}
    </div>
  );
}

function HorizontalBars({ items, compact = false }: { items: ChartPoint[]; compact?: boolean }) {
  const max = Math.max(...items.map((item) => item.value));
  return (
    <div className="space-y-2.5">
      {items.map((item) => (
        <div key={item.label}>
          <div className="mb-1 flex justify-between gap-3 text-xs">
            <span className="truncate text-slate-300">{item.label.replaceAll("_", " ")}</span>
            <span className="font-medium text-white">{item.value}</span>
          </div>
          <div className={`overflow-hidden rounded-full bg-white/[0.075] ${compact ? "h-1" : "h-1.5"}`}>
            <div className="h-full rounded-full bg-cyan-300/90" style={{ width: `${Math.max((item.value / max) * 100, 8)}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function FunnelBars({ items }: { items: ChartPoint[] }) {
  const max = Math.max(...items.map((item) => item.value));

  return (
    <div className="space-y-2">
      {items.map((item, index) => (
        <div key={item.label} className="grid grid-cols-[78px_1fr_34px] items-center gap-2 text-xs">
          <span className="truncate text-slate-400">{item.label}</span>
          <div className="h-5 overflow-hidden rounded-md bg-white/[0.055]">
            <div
              className={`h-full rounded-md ${index < 3 ? "bg-cyan-300/85" : index === 3 ? "bg-amber-300/80" : "bg-emerald-300/80"}`}
              style={{ width: `${Math.max((item.value / max) * 100, 6)}%` }}
            />
          </div>
          <span className="text-right font-semibold text-white">{item.value}</span>
        </div>
      ))}
    </div>
  );
}

function PriorityStack({ items }: { items: ChartPoint[] }) {
  const total = items.reduce((sum, item) => sum + item.value, 0);
  const colors: Record<string, string> = {
    P1: "bg-rose-400",
    P2: "bg-amber-300",
    P3: "bg-cyan-300",
    P4: "bg-emerald-300",
  };

  return (
    <div>
      <div className="flex h-3 overflow-hidden rounded-full bg-white/[0.075]">
        {items.map((item) => (
          <div key={item.label} className={`${colors[item.label] ?? "bg-slate-400"} opacity-90`} style={{ width: `${(item.value / total) * 100}%` }} />
        ))}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {items.map((item) => (
          <div key={item.label} className="rounded-md bg-white/[0.04] p-2">
            <p className="text-xs text-slate-400">{item.label}</p>
            <p className="mt-1 text-base font-semibold text-white">{item.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function Heatmap({ items }: { items: ChartPoint[] }) {
  const max = Math.max(...items.map((item) => item.value));
  return (
    <div className="grid grid-cols-4 gap-1.5">
      {items.map((item) => (
        <div
          key={item.label}
          className="rounded-md border border-white/8 px-2 py-2 text-center"
          style={{ backgroundColor: `rgba(34, 211, 238, ${0.045 + (item.value / max) * 0.22})` }}
        >
          <p className="text-[11px] font-medium text-white">{item.label}</p>
          <p className="mt-0.5 text-[10px] text-slate-400">{item.value}</p>
        </div>
      ))}
    </div>
  );
}

function KnowledgeList({ items }: { items: ChartPoint[] }) {
  return (
    <div className="space-y-2.5">
      {items.map((item) => (
        <div key={item.label} className="flex items-start justify-between gap-3 rounded-lg bg-white/[0.04] p-2.5">
          <p className="text-xs leading-5 text-slate-300">{item.label}</p>
          <span className="rounded-full bg-cyan-300/10 px-2 py-0.5 text-[11px] font-semibold text-cyan-100">{item.value}</span>
        </div>
      ))}
    </div>
  );
}

function EscalatedList({ cases }: { cases: OperationalCase[] }) {
  return (
    <div className="space-y-2.5">
      {cases.map((item) => (
        <div key={item.id} className="rounded-lg border border-white/10 bg-white/[0.035] p-2.5">
          <div className="flex items-center justify-between gap-3">
            <p className="font-mono text-xs font-semibold text-cyan-100">{item.id}</p>
            <StatusBadge tone={item.priority === "P1" ? "red" : "amber"}>{item.priority}</StatusBadge>
          </div>
          <p className="mt-1.5 text-[13px] font-medium text-white">{item.category}</p>
          <p className="mt-1 text-xs text-slate-400">{item.assigned_technician}</p>
        </div>
      ))}
    </div>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("es-CL", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(new Date(value));
}
