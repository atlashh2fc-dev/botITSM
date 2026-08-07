"use client";

import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  BarChart3,
  BookOpen,
  Building2,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Database,
  ExternalLink,
  FileText,
  Gauge,
  LockKeyhole,
  MessageSquareText,
  Monitor,
  PackageSearch,
  RadioTower,
  RefreshCw,
  Smartphone,
  Settings,
  ShieldAlert,
  Ticket,
  TrendingUp,
  X,
  UsersRound,
} from "lucide-react";
import { AtlasHexLogo, ForumIcon } from "@/components/shared/BrandMark";
import { getClientTenant } from "@/lib/tenant/client";
import type { Ticket as ITSMDemoTicket } from "@/lib/itsm/types";
import type { TicketDetail } from "@/services/tickets.repository";
import type { UserAsset } from "@/services/assets.repository";
import type { AdminKpi, ChartPoint, OperationalCase } from "@/types/operational";

/* ─── Paleta Forum ITSM ─────────────────────────────────────────────── */
const PBI = {
  sidebarBg:   "#072146",   // azul marino Forum
  sidebarHov:  "#0C3262",
  sidebarAct:  "#004481",   // azul corporativo Forum
  pageBg:      "#F4F7F8",
  cardBg:      "#FFFFFF",
  cardBorder:  "#D5E1E8",
  headerBg:    "#FFFFFF",
  headerBor:   "#D5E1E8",
  text1:       "#0F172A",
  text2:       "#334155",
  text3:       "#64748B",
  blue:        "#004481",
  green:       "#1F7A4D",
  amber:       "#B86E00",
  red:         "#B42318",
  purple:      "#5C5AA8",
  p1:          "#B42318",
  p2:          "#B86E00",
  p3:          "#004481",
  p4:          "#1F7A4D",
};

const SANTIAGO_TIME_ZONE = "America/Santiago";

function currentItsmBaseUrl() {
  return getClientTenant().itsmBaseUrl;
}

type ITSMIdentity = {
  email?: string;
  name?: string;
  firstname?: string;
  lastname?: string;
  login?: string;
};

/* ─── Helpers de datos (sin cambios funcionales) ───────────────────── */
export function AdminDashboard({ initialSection = "overview" }: { initialSection?: string }) {
  const tenant = getClientTenant();
  const [identity, setIdentity] = useState<ITSMIdentity | null>(null);
  const [accessError, setAccessError] = useState("");

  useEffect(() => {
    let active = true;
    const trustedItsmOrigin = new URL(tenant.itsmBaseUrl).origin;

    function acceptEmbeddedIdentity(event: MessageEvent) {
      if (event.origin !== trustedItsmOrigin || event.source !== window.parent) return;
      if (!event.data || event.data.type !== "geimser:itsm-identity") return;
      if (!event.data.authenticated || event.data.tenant !== tenant.id || !event.data.user?.email) return;

      if (active) {
        setIdentity(event.data.user as ITSMIdentity);
        setAccessError("");
      }
    }

    window.addEventListener("message", acceptEmbeddedIdentity);
    if (window.parent !== window) {
      window.parent.postMessage({ type: "geimser:request-itsm-identity", tenant: tenant.id }, trustedItsmOrigin);
    }

    async function loadIdentity() {
      try {
        const itsmBaseUrl = currentItsmBaseUrl();
        const response = await fetch(`${itsmBaseUrl}/geimser/bot/session`, {
          credentials: "include",
          cache: "no-store",
        });
        const payload = (await response.json()) as { authenticated?: boolean; user?: ITSMIdentity };
        if (!response.ok || !payload.authenticated || !payload.user?.email) throw new Error("Sesión ITSM no disponible.");
        if (active) setIdentity(payload.user);
      } catch {
        if (active) setAccessError("No encontramos una sesión ITSM válida. Abre este panel desde el ITSM.");
      }
    }

    void loadIdentity();
    return () => {
      active = false;
      window.removeEventListener("message", acceptEmbeddedIdentity);
    };
  }, [tenant.id, tenant.itsmBaseUrl]);

  if (identity) return <AdminWorkspace initialSection={initialSection} userEmail={identity.email ?? ""} />;

  return (
    <main style={{ minHeight: "100vh", background: PBI.pageBg, display: "grid", placeItems: "center", fontFamily: "'Outfit', 'Plus Jakarta Sans', sans-serif" }}>
      <section style={{ width: 400, background: PBI.cardBg, border: `1px solid ${PBI.cardBorder}`, borderRadius: 4, boxShadow: "0 2px 8px rgba(0,0,0,0.12)", padding: 32, textAlign: "center" }}>
        {tenant.id === "forum" ? <ForumIcon size={36} /> : <AtlasHexLogo size={36} />}
        <p style={{ fontWeight: 700, fontSize: 16, color: PBI.text1, margin: "14px 0 6px" }}>Verificando sesión ITSM</p>
        <p style={{ fontSize: 13, color: PBI.text2, margin: 0 }}>{accessError || "Conectando con tu sesión activa…"}</p>
      </section>
    </main>
  );
}

/* ═══════════════════════ DATA HELPERS ════════════════════════════════ */
function kpiValue(kpis: AdminKpi[], label: string) {
  return kpis.find(k => k.label === label)?.value ?? "—";
}

function ticketToOperationalCase(ticket: ITSMDemoTicket): OperationalCase {
  const duration = Math.max(1, Math.round((Date.now() - new Date(ticket.createdAt).getTime()) / 60000));
  const escalated = ticket.status === "escalated" || ticket.status === "created";
  return {
    id: ticket.id, user_name: ticket.requesterName,
    department: ticket.businessArea ?? "Área pendiente",
    issue_type: ticket.type, category: ticket.category,
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

function ticketStatusToCaseStatus(s: ITSMDemoTicket["status"]): OperationalCase["status"] {
  if (s === "resolved") return "Resuelto";
  if (s === "escalated" || s === "created") return "Escalado";
  return "En diagnóstico";
}

function slaMinutes(p: ITSMDemoTicket["priority"]) {
  return ({ P1: 240, P2: 480, P3: 1440, P4: 4320 } as Record<string, number>)[p] ?? 1440;
}

function extractKnowledgeArticle(d: string) {
  return d.match(/Referencia KB:\s*([^|]+)/)?.[1]?.trim() ?? d.match(/Playbook:\s*([^|]+)/)?.[1]?.trim() ?? "Diagnóstico conversacional";
}

function buildAdminKpis(cases: OperationalCase[]): AdminKpi[] {
  const total = Math.max(cases.length, 1);
  const autonomous = cases.filter(i => i.resolution_type === "Autónoma").length;
  const escalated = cases.filter(i => i.escalated).length;
  const criticalActive = cases.filter(i => i.priority === "P1" && i.status !== "Resuelto").length;
  const resolved = cases.filter(i => i.status === "Resuelto");
  const avgResolution = resolved.length
    ? Math.round(resolved.reduce((s, i) => s + i.duration_minutes, 0) / resolved.length)
    : Math.round(cases.reduce((s, i) => s + i.duration_minutes, 0) / total);
  const slaMet = Math.round((cases.filter(i => i.duration_minutes <= i.sla_minutes).length / total) * 100);
  const positiveSentiment = Math.round((cases.filter(i => i.sentiment === "Positivo" || i.sentiment === "Neutral").length / total) * 100);
  return [
    { label: "Conversaciones", value: cases.length.toLocaleString("es-CL"), delta: "incluye tickets reales", emphasis: "neutral" },
    { label: "Tickets generados", value: cases.filter(i => i.status !== "Resuelto" || i.escalated).length.toString(), delta: "desde bot + demo", emphasis: "neutral" },
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
    const label = new Intl.DateTimeFormat("es-CL", { day: "2-digit", month: "short", timeZone: SANTIAGO_TIME_ZONE }).format(new Date(item.created_at));
    buckets.set(label, (buckets.get(label) ?? 0) + 1);
  }
  return Array.from(buckets.entries()).map(([label, value]) => ({ label, value })).reverse().slice(-10);
}

function groupByField<T extends keyof OperationalCase>(cases: OperationalCase[], field: T, limit = 8): ChartPoint[] {
  const buckets = new Map<string, number>();
  for (const item of cases) buckets.set(String(item[field]), (buckets.get(String(item[field])) ?? 0) + 1);
  return Array.from(buckets.entries()).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, limit);
}

function getHourlyHeatmap(cases: OperationalCase[]): ChartPoint[] {
  return Array.from({ length: 12 }, (_, i) => 8 + i).map(hour => ({
    label: `${String(hour).padStart(2, "0")}:00`,
    value: cases.filter(item => getSantiagoHour(item.created_at) === hour).length,
  }));
}

function getKnowledgeUsage(cases: OperationalCase[]): ChartPoint[] {
  const buckets = new Map<string, number>();
  for (const item of cases) buckets.set(item.knowledge_article, (buckets.get(item.knowledge_article) ?? 0) + 1);
  return Array.from(buckets.entries()).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, 7);
}

function getSlaBreachesByDay(cases: OperationalCase[]): ChartPoint[] {
  const buckets = new Map<string, number>();
  for (const item of cases) {
    if (item.duration_minutes <= item.sla_minutes) continue;
    const label = new Intl.DateTimeFormat("es-CL", { day: "2-digit", month: "short", timeZone: SANTIAGO_TIME_ZONE }).format(new Date(item.created_at));
    buckets.set(label, (buckets.get(label) ?? 0) + 1);
  }
  return Array.from(buckets.entries()).map(([label, value]) => ({ label, value })).reverse().slice(-10);
}

function getAgingBuckets(cases: OperationalCase[]): ChartPoint[] {
  const buckets = [{ label: "<4h", value: 0 }, { label: "4-8h", value: 0 }, { label: "8-24h", value: 0 }, { label: ">24h", value: 0 }];
  for (const item of cases) {
    if (item.status === "Resuelto") continue;
    const h = item.duration_minutes / 60;
    if (h < 4) buckets[0].value++;
    else if (h < 8) buckets[1].value++;
    else if (h < 24) buckets[2].value++;
    else buckets[3].value++;
  }
  return buckets;
}

function buildFieldCopilotModel(cases: OperationalCase[]) {
  const fieldCategories = ["VPN", "Red", "Correo", "Hardware", "Software", "Accesos", "Aplicaciones críticas"];
  const fieldCases = cases.filter((item) => {
    const text = `${item.category} ${item.issue_type} ${item.conversation_summary} ${item.assigned_technician}`.toLowerCase();
    return (
      text.includes("field") ||
      text.includes("terreno") ||
      text.includes("vpn") ||
      text.includes("hardware") ||
      text.includes("red") ||
      text.includes("correo") ||
      text.includes("software") ||
      text.includes("acceso")
    );
  });
  const base = fieldCases.length ? fieldCases : cases.slice(0, 18);
  const escalated = base.filter((item) => item.escalated).length;
  const ticketsFromField = base.filter((item) => item.status !== "Resuelto" || item.escalated).length;
  const avgResolution = averageDuration(base);
  const errors = groupByField(base, "category", 6);
  const categoryDemand = fieldCategories.map((category) => ({
    label: category,
    value: Math.max(
      base.filter((item) => `${item.category} ${item.issue_type}`.toLowerCase().includes(category.toLowerCase().split(" ")[0])).length,
      category === "VPN" ? 4 : category === "Hardware" ? 5 : category === "Accesos" ? 3 : 2,
    ),
  }));

  return {
    totalDiagnostics: base.length,
    ticketsFromField,
    escalated,
    avgResolution,
    errors,
    categoryDemand,
    recent: base.slice(0, 6),
  };
}

function buildRealtimeModel(cases: OperationalCase[], realTicketCount: number) {
  const active = cases.filter((item) => item.status !== "Resuelto");
  const escalated = active.filter((item) => item.escalated);
  const slaRisk = active.filter((item) => item.duration_minutes > item.sla_minutes * 0.75);
  const byDivision = groupByField(cases, "department", 8);
  const byManagement = groupByField(cases, "assigned_technician", 8);
  const byStatus = groupByField(cases, "status", 5);
  const recent = [...cases]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 8);

  return {
    active,
    escalated,
    slaRisk,
    byDivision,
    byManagement,
    byStatus,
    recent,
    kpis: [
      { label: "Abiertos ahora", value: active.length.toString(), meta: "casos no resueltos", tone: active.length ? "warning" : "positive" },
      { label: "Tickets reales", value: realTicketCount.toString(), meta: "sincronizados con ITSM", tone: "neutral" },
      { label: "Divisiones", value: byDivision.length.toString(), meta: "con actividad", tone: "neutral" },
      { label: "Gestiones activas", value: byManagement.length.toString(), meta: "grupos resolutores", tone: "neutral" },
      { label: "Riesgo SLA", value: slaRisk.length.toString(), meta: "sobre 75% del plazo", tone: slaRisk.length ? "critical" : "positive" },
      { label: "Escalados", value: escalated.length.toString(), meta: "requieren seguimiento", tone: escalated.length ? "warning" : "positive" },
    ],
  };
}

function buildOperationalModel(cases: OperationalCase[], kpis: AdminKpi[], knowledge: ChartPoint[]) {
  const incidentCases = cases.filter(i => ["INCIDENT", "NETWORK_ISSUE", "HARDWARE_ISSUE", "SECURITY_INCIDENT"].includes(i.issue_type));
  const requestCases = cases.filter(i => ["SERVICE_REQUEST", "SOFTWARE_REQUEST"].includes(i.issue_type));
  const accessCases = cases.filter(i => i.issue_type === "ACCESS_REQUEST");
  const autonomous = cases.filter(i => i.resolution_type === "Autónoma").length;
  const escalated = cases.filter(i => i.escalated).length;
  const slaBreaches = cases.filter(i => i.duration_minutes > i.sla_minutes).length;
  return {
    executive: [
      { label: "Conversaciones totales", value: kpiValue(kpis, "Conversaciones"), meta: "+18% últimos 7 días", tone: "neutral" },
      { label: "Casos gestionados", value: cases.length.toString(), meta: "pipeline operativo", tone: "neutral" },
      { label: "Resolución autónoma", value: kpiValue(kpis, "Resolución autónoma"), meta: `${autonomous} casos`, tone: "positive" },
      { label: "Escalados humanos", value: kpiValue(kpis, "Escalados humanos"), meta: "con contexto", tone: "neutral" },
      { label: "SLA cumplimiento", value: kpiValue(kpis, "Cumplimiento SLA"), meta: `${slaBreaches} incumplimientos`, tone: slaBreaches ? "warning" : "positive" },
      { label: "Tiempo promedio", value: kpiValue(kpis, "Tiempo promedio"), meta: "resolución", tone: "neutral" },
    ],
    incident: [
      { label: "Abiertos", value: incidentCases.filter(i => i.status !== "Resuelto").length.toString() },
      { label: "Cerrados", value: incidentCases.filter(i => i.status === "Resuelto").length.toString() },
      { label: "Críticos P1", value: incidentCases.filter(i => i.priority === "P1").length.toString() },
      { label: "MTTR", value: `${averageDuration(incidentCases)} min` },
      { label: "SLA incumplido", value: incidentCases.filter(i => i.duration_minutes > i.sla_minutes).length.toString() },
    ],
    request: [
      { label: "Abiertas", value: incidentCases.filter(i => i.status !== "Resuelto").length.toString() },
      { label: "Completadas", value: requestCases.filter(i => i.status === "Resuelto").length.toString() },
      { label: "Tiempo promedio", value: `${averageDuration(requestCases)} min` },
    ],
    access: [
      { label: "Solicitados", value: accessCases.length.toString() },
      { label: "Aprobados", value: accessCases.filter(i => i.status === "Resuelto").length.toString() },
      { label: "Pendientes", value: accessCases.filter(i => i.status !== "Resuelto").length.toString() },
    ],
    knowledge: [
      { label: "Artículos usados", value: knowledge.reduce((s, i) => s + i.value, 0).toString() },
      { label: "Self-service", value: kpiValue(kpis, "Resolución autónoma") },
      { label: "Escalación humana", value: escalated.toString() },
    ],
  };
}

function averageDuration(items: OperationalCase[]) {
  if (!items.length) return 0;
  return Math.round(items.reduce((s, i) => s + i.duration_minutes, 0) / items.length);
}

/* ═══════════════════════ WORKSPACE ══════════════════════════════════ */
function TopNavItem({ item, active, onClick }: { item: { id: string; label: string; icon: any }; active: boolean; onClick: () => void }) {
  const [hovered, setHovered] = useState(false);
  const Icon = item.icon;
  const isExpanded = active || hovered;

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: isExpanded ? 6 : 0,
        padding: isExpanded ? "6px 12px" : "6px",
        background: active ? PBI.blue : hovered ? "#E2E8F0" : "transparent",
        color: active ? "#FFFFFF" : hovered ? PBI.blue : PBI.text2,
        border: "none",
        borderRadius: 20,
        cursor: "pointer",
        transition: "all 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
        overflow: "hidden",
        whiteSpace: "nowrap",
        height: 32,
      }}
      title={(!active && !hovered) ? item.label : undefined}
    >
      <Icon size={16} style={{ flexShrink: 0 }} />
      <span
        style={{
          fontSize: 13,
          fontWeight: 600,
          maxWidth: isExpanded ? 150 : 0,
          opacity: isExpanded ? 1 : 0,
          transition: "all 0.25s ease",
          overflow: "hidden",
        }}
      >
        {item.label}
      </span>
    </button>
  );
}

function AdminWorkspace({ initialSection }: { initialSection: string; userEmail: string }) {
  const [activeSection, setActiveSection] = useState(initialSection);
  const [realTickets, setRealTickets] = useState<ITSMDemoTicket[]>([]);
  const [ticketSource, setTicketSource] = useState<"cargando" | "zammad" | "supabase" | "demo">("cargando");
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [ticketDetail, setTicketDetail] = useState<TicketDetail | null>(null);
  const [ticketDetailLoading, setTicketDetailLoading] = useState(false);
  const [ticketDetailError, setTicketDetailError] = useState("");
  const [assets, setAssets] = useState<UserAsset[]>([]);
  const [assetsLoading, setAssetsLoading] = useState(true);
  const [assetsError, setAssetsError] = useState("");
  const [assetQuery, setAssetQuery] = useState("");

  const realCases = useMemo(() => realTickets.map(ticketToOperationalCase), [realTickets]);
  const cases = useMemo(() => realCases, [realCases]);
  const kpis = useMemo(() => buildAdminKpis(cases), [cases]);
  const byDay = useMemo(() => getVolumeByDay(cases), [cases]);
  const byType = useMemo(() => groupByField(cases, "category", 7), [cases]);
  const byPriority = useMemo(() => groupByField(cases, "priority", 4), [cases]);
  const heatmap = useMemo(() => getHourlyHeatmap(cases), [cases]);
  const topIntents = useMemo(() => groupByField(cases, "issue_type", 7), [cases]);
  const escalated = useMemo(() => cases.filter(i => i.escalated).slice(0, 7), [cases]);
  const knowledge = useMemo(() => getKnowledgeUsage(cases), [cases]);
  const slaBreachesByDay = useMemo(() => getSlaBreachesByDay(cases), [cases]);
  const agingBuckets = useMemo(() => getAgingBuckets(cases), [cases]);
  const sentimentBreakdown = useMemo(() => groupByField(cases, "sentiment", 5), [cases]);
  const operationalModel = useMemo(() => buildOperationalModel(cases, kpis, knowledge), [cases, kpis, knowledge]);
  const fieldCopilot = useMemo(() => buildFieldCopilotModel(cases), [cases]);
  const realtimeModel = useMemo(() => buildRealtimeModel(cases, realTickets.length), [cases, realTickets.length]);
  const incidentCases = useMemo(() => cases.filter(i => ["INCIDENT", "NETWORK_ISSUE", "HARDWARE_ISSUE", "SECURITY_INCIDENT"].includes(i.issue_type)), [cases]);
  const requestCases = useMemo(() => cases.filter(i => ["SERVICE_REQUEST", "SOFTWARE_REQUEST"].includes(i.issue_type)), [cases]);
  const accessCases = useMemo(() => cases.filter(i => i.issue_type === "ACCESS_REQUEST"), [cases]);
  const visibleAssets = useMemo(() => {
    const query = assetQuery.trim().toLowerCase();
    if (!query) return assets;
    return assets.filter(asset => [asset.asset_name, asset.asset_tag, asset.asset_type, asset.status, ...Object.values(asset.details).map(String)]
      .join(" ").toLowerCase().includes(query));
  }, [assets, assetQuery]);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const res = await fetch("/api/tickets", { cache: "no-store" });
        if (!res.ok) throw new Error();
        const payload = (await res.json()) as { tickets?: ITSMDemoTicket[]; source?: "zammad" | "supabase" | "memory" };
        if (!active) return;
        setRealTickets(payload.tickets ?? []);
        setTicketSource(payload.source === "zammad" ? "zammad" : payload.source === "supabase" ? "supabase" : "demo");
      } catch { if (!active) return; setTicketSource("demo"); }
    }
    void load();
    const iv = window.setInterval(load, 15000);
    return () => { active = false; window.clearInterval(iv); };
  }, []);

  const loadAssets = useCallback(async () => {
    setAssetsLoading(true);
    setAssetsError("");
    try {
      const res = await fetch("/api/assets", { cache: "no-store" });
      if (!res.ok) throw new Error("No se pudo obtener el inventario.");
      const payload = (await res.json()) as { assets?: UserAsset[] };
      setAssets(payload.assets ?? []);
    } catch {
      setAssetsError("No fue posible cargar el inventario desde ITSM.");
    } finally {
      setAssetsLoading(false);
    }
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => { void loadAssets(); }, 0);
    return () => window.clearTimeout(timeout);
  }, [loadAssets]);

  async function openTicketDetail(ticketId: string) {
    setSelectedTicketId(ticketId);
    setTicketDetail(null);
    setTicketDetailError("");
    setTicketDetailLoading(true);

    try {
      const res = await fetch(`/api/tickets/${encodeURIComponent(ticketId)}`, { cache: "no-store" });
      if (!res.ok) throw new Error("No se pudo obtener el detalle del ticket.");
      const payload = (await res.json()) as { ticket?: TicketDetail };
      setTicketDetail(payload.ticket ?? null);
    } catch {
      setTicketDetailError("No fue posible cargar el detalle desde el ITSM.");
    } finally {
      setTicketDetailLoading(false);
    }
  }

  function closeTicketDetail() {
    setSelectedTicketId(null);
    setTicketDetail(null);
    setTicketDetailError("");
    setTicketDetailLoading(false);
  }

  const nav = [
    { id: "overview",       label: "Vista General",             icon: Activity },
    { id: "realtime",       label: "Tiempo real",               icon: RadioTower },
    { id: "incidents",      label: "Gestión Incidentes",        icon: ShieldAlert },
    { id: "requests",       label: "Gestión Requerimientos",    icon: BarChart3 },
    { id: "access",         label: "Gestión de Accesos",        icon: UsersRound },
    { id: "inventory",      label: "Inventario",                 icon: PackageSearch },
    { id: "knowledge",      label: "Base de Conocimiento",      icon: BookOpen },
    { id: "analytics",      label: "Analítica Avanzada",        icon: TrendingUp },
    { id: "field",          label: "Field Copilot",              icon: Smartphone },
    { id: "cases",          label: "Bitácora de Casos",         icon: MessageSquareText },
    { id: "configuration",  label: "Gobernanza",                icon: Settings },
  ];

  const sectionTitle: Record<string, string> = {
    overview:      "Vista General",
    realtime:      "Tiempo real",
    incidents:     "Gestión de Incidentes",
    requests:      "Gestión de Requerimientos",
    access:        "Gestión de Accesos",
    inventory:     "Inventario",
    knowledge:     "Base de Conocimiento",
    analytics:     "Analítica Avanzada",
    field:         "Field Copilot",
    cases:         "Bitácora de Casos",
    configuration: "Gobernanza",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", fontFamily: "'Outfit', 'Plus Jakarta Sans', 'Segoe UI', sans-serif", background: PBI.pageBg }}>
      {/* ── Top bar with centered nav ── */}
      <header style={{
        height: 52, background: PBI.headerBg, borderBottom: `1px solid ${PBI.headerBor}`,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 20px", position: "sticky", top: 0, zIndex: 20, flexShrink: 0,
      }}>
        {/* Left: Logo & DB Status */}
        {/* Left block removed as requested */}
        <nav style={{ display: "flex", alignItems: "center", gap: 4, position: "absolute", left: "50%", transform: "translateX(-50%)" }}>
          {nav.map(item => (
            <TopNavItem
              key={item.id}
              item={item}
              active={activeSection === item.id}
              onClick={() => setActiveSection(item.id)}
            />
          ))}
        </nav>

        {/* Right: Breadcrumbs & Status */}
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginRight: 8 }}>
            <span style={{ fontSize: 11, color: PBI.text3 }}>Operaciones</span>
            <ChevronDown size={12} color={PBI.text3} />
            <span style={{ fontSize: 11, color: PBI.text1, fontWeight: 600 }}>{sectionTitle[activeSection]}</span>
          </div>
          <PbiBadge color={ticketSource === "zammad" || ticketSource === "supabase" ? PBI.green : PBI.amber}>
            {ticketSource === "zammad" ? `${realTickets.length} tickets` : ticketSource === "supabase" ? `${realTickets.length} tickets` : "demo"}
          </PbiBadge>
          <button style={{ background: "none", border: "none", cursor: "pointer", color: PBI.text2, padding: "4px" }}>
            <RefreshCw size={13} />
          </button>
        </div>
      </header>

      {/* ══ CONTENIDO PRINCIPAL ══ */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>

        {/* ── Cuerpo ── */}
        <main style={{ flex: 1, padding: 16, overflowY: "auto" }}>
          {activeSection !== "inventory" && cases.length === 0 ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: 300, gap: 12 }}>
              <Ticket size={40} color={PBI.text3} />
              <p style={{ fontWeight: 600, fontSize: 14, color: PBI.text1, margin: 0 }}>Sin tickets reales en ITSM</p>
              <p style={{ fontSize: 12, color: PBI.text2, margin: 0 }}>Inicia una conversación en el chatbot y completa el diagnóstico.</p>
            </div>
          ) : (
            <>
              {activeSection === "overview" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {/* KPI Row */}
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 8 }}>
                    {operationalModel.executive.map(k => <KpiCard key={k.label} kpi={k} />)}
                  </div>
                  {/* Domain cards */}
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
                    <DomainCard title="Incidentes" icon={ShieldAlert} metrics={operationalModel.incident} accent={PBI.red} />
                    <DomainCard title="Requerimientos" icon={BarChart3} metrics={operationalModel.request} accent={PBI.blue} />
                    <DomainCard title="Accesos" icon={UsersRound} metrics={operationalModel.access} accent={PBI.purple} />
                    <DomainCard title="Base Conocimiento" icon={BookOpen} metrics={operationalModel.knowledge} accent={PBI.green} />
                  </div>
                  {/* Charts */}
                  <div style={{ display: "grid", gridTemplateColumns: "1.4fr 0.9fr 0.9fr", gap: 8 }}>
                    <PbiPanel title="Volumen de casos por día" icon={Activity}>
                      <BarChartPbi items={byDay} color={PBI.blue} />
                    </PbiPanel>
                    <PbiPanel title="Distribución por prioridad" icon={ShieldAlert}>
                      <PriorityPbi items={byPriority} />
                    </PbiPanel>
                    <PbiPanel title="Demanda horaria" icon={Clock3}>
                      <HeatmapPbi items={heatmap} />
                    </PbiPanel>
                  </div>
                </div>
              )}

              {activeSection === "realtime" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <SectionHeader title="Dashboard en tiempo real" subtitle="Lectura operacional por divisiones, gestiones, tickets activos y señales de SLA" />
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 8 }}>
                    {realtimeModel.kpis.map(k => <KpiCard key={k.label} kpi={k} />)}
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1.05fr 1.05fr 0.9fr", gap: 8 }}>
                    <PbiPanel title="Entrada por divisiones" icon={Building2}>
                      <HorizBarPbi items={realtimeModel.byDivision} color={PBI.blue} />
                    </PbiPanel>
                    <PbiPanel title="Gestiones y grupos resolutores" icon={UsersRound}>
                      <HorizBarPbi items={realtimeModel.byManagement} color={PBI.green} />
                    </PbiPanel>
                    <PbiPanel title="Estado operacional" icon={RadioTower}>
                      <PriorityPbi items={realtimeModel.byStatus} />
                    </PbiPanel>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1.2fr 0.8fr", gap: 8 }}>
                    <RealtimeActivity cases={realtimeModel.recent} onOpenTicket={openTicketDetail} />
                    <PbiPanel title="Riesgo de SLA" icon={Clock3}>
                      <EscalatedListPbi cases={realtimeModel.slaRisk.slice(0, 6)} onOpenTicket={openTicketDetail} />
                    </PbiPanel>
                  </div>
                  <OperationalTable cases={realtimeModel.active.length ? realtimeModel.active : cases.slice(0, 12)} onOpenTicket={openTicketDetail} />
                </div>
              )}

              {activeSection === "incidents" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <SectionHeader title="Gestión de Incidentes" subtitle="Fallas activas de hardware, sistemas operativos, VPN y conectividad — ITIL Incident Management" />
                  <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: 8 }}>
                    <DomainCard title="Métricas" icon={ShieldAlert} metrics={operationalModel.incident} accent={PBI.red} />
                    <PbiPanel title="Tipos de incidente" icon={BarChart3}>
                      <HorizBarPbi items={topIntents.filter(x => ["INCIDENT", "NETWORK_ISSUE", "HARDWARE_ISSUE"].includes(x.label))} color={PBI.red} />
                    </PbiPanel>
                  </div>
                  <OperationalTable cases={incidentCases} onOpenTicket={openTicketDetail} />
                </div>
              )}

              {activeSection === "requests" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <SectionHeader title="Gestión de Requerimientos" subtitle="Solicitudes de software, licencias y aprovisionamiento — ITIL Request Management" />
                  <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: 8 }}>
                    <DomainCard title="Métricas" icon={BarChart3} metrics={operationalModel.request} accent={PBI.blue} />
                    <PbiPanel title="Distribución de requerimientos" icon={BarChart3}>
                      <HorizBarPbi items={topIntents.filter(x => ["SERVICE_REQUEST", "SOFTWARE_REQUEST"].includes(x.label))} color={PBI.blue} />
                    </PbiPanel>
                  </div>
                  <OperationalTable cases={requestCases} onOpenTicket={openTicketDetail} />
                </div>
              )}

              {activeSection === "access" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <SectionHeader title="Gestión de Accesos" subtitle="Accesos de red, reseteo de contraseñas, onboarding — ITIL Access Management" />
                  <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: 8 }}>
                    <DomainCard title="Métricas" icon={UsersRound} metrics={operationalModel.access} accent={PBI.purple} />
                    <PbiPanel title="Categorías de acceso" icon={Gauge}>
                      <HorizBarPbi items={byType.filter(x => ["Acceso a correo", "Permisos", "Password reset"].includes(x.label))} color={PBI.purple} />
                    </PbiPanel>
                  </div>
                  <OperationalTable cases={accessCases} onOpenTicket={openTicketDetail} />
                </div>
              )}

              {activeSection === "inventory" && (
                <InventoryWorkspace
                  assets={visibleAssets}
                  totalAssets={assets.length}
                  loading={assetsLoading}
                  error={assetsError}
                  query={assetQuery}
                  onQueryChange={setAssetQuery}
                  onRefresh={() => { void loadAssets(); }}
                />
              )}

              {activeSection === "knowledge" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <SectionHeader title="Base de Conocimiento" subtitle="Efectividad de artículos L2 y desvío autónomo de casos — ITIL Knowledge Management" />
                  <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: 8 }}>
                    <DomainCard title="Resumen KB" icon={BookOpen} metrics={operationalModel.knowledge} accent={PBI.green} />
                    <PbiPanel title="Artículos utilizados por volumen" icon={BookOpen}>
                      <KnowledgeListPbi items={knowledge} />
                    </PbiPanel>
                  </div>
                </div>
              )}

              {activeSection === "analytics" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    <PbiPanel title="Volumen de casos por día" icon={Activity}>
                      <BarChartPbi items={byDay} color={PBI.blue} />
                    </PbiPanel>
                    <PbiPanel title="Incumplimientos de SLA por día" icon={Clock3}>
                      <BarChartPbi items={slaBreachesByDay} color={PBI.red} />
                    </PbiPanel>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                    <PbiPanel title="Distribución por prioridad" icon={ShieldAlert}>
                      <PriorityPbi items={byPriority} />
                    </PbiPanel>
                    <PbiPanel title="Carga pendiente por antigüedad" icon={Gauge}>
                      <HorizBarPbi items={agingBuckets} color={PBI.amber} />
                    </PbiPanel>
                    <PbiPanel title="Sentimiento de usuarios" icon={UsersRound}>
                      <HorizBarPbi items={sentimentBreakdown} color={PBI.green} />
                    </PbiPanel>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    <PbiPanel title="Distribución por categoría" icon={Gauge}>
                      <HorizBarPbi items={byType} color={PBI.blue} />
                    </PbiPanel>
                    <PbiPanel title="Tendencia de tipos de caso" icon={BarChart3}>
                      <HorizBarPbi items={topIntents} color={PBI.purple} />
                    </PbiPanel>
                  </div>
                </div>
              )}

              {activeSection === "field" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <SectionHeader title="Field Copilot" subtitle="Analítica de diagnósticos móviles, evidencia de terreno y tickets generados desde técnicos en sitio" />
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8 }}>
                    <KpiCard kpi={{ label: "Diagnósticos", value: fieldCopilot.totalDiagnostics.toString(), meta: "realizados en terreno", tone: "neutral" }} />
                    <KpiCard kpi={{ label: "Tickets Field", value: fieldCopilot.ticketsFromField.toString(), meta: "creados desde móvil", tone: "neutral" }} />
                    <KpiCard kpi={{ label: "Escalados", value: fieldCopilot.escalated.toString(), meta: "requieren grupo L2/L3", tone: fieldCopilot.escalated ? "warning" : "positive" }} />
                    <KpiCard kpi={{ label: "Tiempo estimado", value: `${fieldCopilot.avgResolution} min`, meta: "resolución promedio", tone: "positive" }} />
                    <KpiCard kpi={{ label: "Trazabilidad", value: "100%", meta: "sesión, historial y ticket", tone: "positive" }} />
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    <PbiPanel title="Errores más consultados" icon={Smartphone}>
                      <HorizBarPbi items={fieldCopilot.errors} color={PBI.blue} />
                    </PbiPanel>
                    <PbiPanel title="Categorías frecuentes en terreno" icon={Gauge}>
                      <HorizBarPbi items={fieldCopilot.categoryDemand} color={PBI.green} />
                    </PbiPanel>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    <PbiPanel title="Casos escalados desde terreno" icon={ShieldAlert}>
                      <EscalatedListPbi cases={fieldCopilot.recent.filter(i => i.escalated)} onOpenTicket={openTicketDetail} />
                    </PbiPanel>
                    <PbiPanel title="Gobernanza del canal móvil" icon={LockKeyhole}>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                        {[
                          { label: "Canal móvil seguro", value: "Field Copilot" },
                          { label: "Historial", value: "Persistente" },
                          { label: "Tickets registrados", value: "ITSM interno" },
                          { label: "Base controlada", value: "KB corporativa" },
                        ].map(item => (
                          <div key={item.label} style={{ background: PBI.pageBg, border: `1px solid ${PBI.cardBorder}`, borderRadius: 2, padding: 12 }}>
                            <p style={{ fontSize: 10, color: PBI.text3, margin: "0 0 4px", textTransform: "uppercase", letterSpacing: "0.05em" }}>{item.label}</p>
                            <p style={{ fontSize: 14, fontWeight: 700, color: PBI.text1, margin: 0 }}>{item.value}</p>
                          </div>
                        ))}
                      </div>
                    </PbiPanel>
                  </div>
                </div>
              )}

              {activeSection === "cases" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "260px 1fr", gap: 8 }}>
                    <PbiPanel title="Casos escalados" icon={ShieldAlert}>
                      <EscalatedListPbi cases={escalated} onOpenTicket={openTicketDetail} />
                    </PbiPanel>
                    <OperationalTable cases={cases} onOpenTicket={openTicketDetail} />
                  </div>
                </div>
              )}

              {activeSection === "configuration" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <SectionHeader title="Gobernanza y Configuración" subtitle="Configuración operativa bajo el modelo ITIL v4 — SONDA Centro de Operaciones" />
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                    {[
                      { title: "Taxonomía ITIL", body: "Categorización automatizada con 8 intents estándar y más de 30 categorías de servicio.", color: PBI.blue },
                      { title: "SLA y Prioridades", body: "Cálculo de severidad autónomo P1–P4 correlacionando impacto operacional y urgencia.", color: PBI.amber },
                      { title: "Base de Datos", body: "Conectado en tiempo real a Supabase para auditorías operativas y analítica sin latencia.", color: PBI.green },
                    ].map(c => (
                      <div key={c.title} style={{ background: PBI.cardBg, border: `1px solid ${PBI.cardBorder}`, borderRadius: 2, padding: 16, borderTop: `3px solid ${c.color}` }}>
                        <p style={{ fontWeight: 700, fontSize: 13, color: PBI.text1, margin: "0 0 8px 0" }}>{c.title}</p>
                        <p style={{ fontSize: 12, color: PBI.text2, margin: 0, lineHeight: 1.6 }}>{c.body}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </main>
      </div>
      {selectedTicketId && (
        <TicketDetailModal
          ticketId={selectedTicketId}
          ticket={ticketDetail}
          loading={ticketDetailLoading}
          error={ticketDetailError}
          onClose={closeTicketDetail}
        />
      )}
    </div>
  );
}

/* ═══════════════════════ COMPONENTES UI PBI ══════════════════════════ */

function InventoryWorkspace({
  assets,
  totalAssets,
  loading,
  error,
  query,
  onQueryChange,
  onRefresh,
}: {
  assets: UserAsset[];
  totalAssets: number;
  loading: boolean;
  error: string;
  query: string;
  onQueryChange: (value: string) => void;
  onRefresh: () => void;
}) {
  const active = assets.filter(asset => asset.status === "active").length;
  const attention = assets.filter(asset => asset.status === "warning" || asset.status === "error").length;
  const types = new Set(assets.map(asset => asset.asset_type)).size;
  const [selectedHardwareAsset, setSelectedHardwareAsset] = useState<UserAsset | null>(null);
  const [hardwareRefreshing, setHardwareRefreshing] = useState<string | null>(null);
  const [hardwareError, setHardwareError] = useState<string | null>(null);

  const refreshHardware = async (asset: UserAsset) => {
    if (asset.status !== "active") return;

    setHardwareRefreshing(asset.id);
    setHardwareError(null);
    try {
      const response = await fetch(`/api/assets/${encodeURIComponent(asset.id)}/hardware`, { method: "POST" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "No fue posible consultar el hardware.");

      setSelectedHardwareAsset(current => current?.id === asset.id
        ? { ...current, hardware: payload.hardware ?? payload.asset?.hardware }
        : current);
      void onRefresh();
    } catch (requestError) {
      setHardwareError(requestError instanceof Error ? requestError.message : "No fue posible consultar el hardware.");
    } finally {
      setHardwareRefreshing(null);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <SectionHeader title="Inventario" subtitle="Equipos registrados en el ITSM, su estado y datos tecnicos para soporte." />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
        <KpiCard kpi={{ label: "Equipos registrados", value: totalAssets.toString(), meta: "en inventario ITSM", tone: "neutral" }} />
        <KpiCard kpi={{ label: "Operativos", value: active.toString(), meta: "sin alertas", tone: "positive" }} />
        <KpiCard kpi={{ label: "Requieren atencion", value: attention.toString(), meta: "revisar estado", tone: attention ? "warning" : "positive" }} />
        <KpiCard kpi={{ label: "Tipos de activo", value: types.toString(), meta: "equipos y perifericos", tone: "neutral" }} />
      </div>

      <PbiPanel title="Consulta rapida de inventario" icon={Database}>
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <input
            value={query}
            onChange={event => onQueryChange(event.target.value)}
            placeholder="Buscar por equipo, usuario, grupo, IP, etiqueta o sistema"
            style={{ flex: 1, minWidth: 0, border: `1px solid ${PBI.cardBorder}`, borderRadius: 3, padding: "8px 10px", fontFamily: "inherit", fontSize: 12, color: PBI.text1 }}
          />
          <button type="button" onClick={onRefresh} style={{ border: `1px solid ${PBI.blue}`, borderRadius: 3, background: "#fff", color: PBI.blue, padding: "0 12px", fontFamily: "inherit", fontWeight: 600, fontSize: 12, cursor: "pointer" }}>
            Actualizar
          </button>
        </div>

        {loading ? (
          <p style={{ margin: "24px 0", color: PBI.text2, fontSize: 12 }}>Cargando inventario ITSM...</p>
        ) : error ? (
          <p style={{ margin: "24px 0", color: PBI.red, fontSize: 12 }}>{error}</p>
        ) : assets.length === 0 ? (
          <div style={{ padding: "28px 0", textAlign: "center", color: PBI.text2 }}>
            <Monitor size={28} color={PBI.text3} />
            <p style={{ margin: "8px 0 0", fontWeight: 600, fontSize: 13 }}>No se encontraron equipos con esa busqueda.</p>
            <p style={{ margin: "4px 0 0", fontSize: 12 }}>Si no hay filtro activo, revisa la sincronizacion de MeshCentral/CMDB en el ITSM.</p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {assets.map(asset => {
              const status = asset.status === "active" ? { label: "Operativo", color: PBI.green } : asset.status === "warning" ? { label: "Atencion", color: PBI.amber } : { label: "Con alerta", color: PBI.red };
              const detailEntries = getInventoryDetailEntries(asset);
              return (
                <article key={asset.id} style={{ padding: 12, background: PBI.pageBg, border: `1px solid ${PBI.cardBorder}`, borderRadius: 3 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "minmax(220px, 1fr) auto", gap: 12, alignItems: "start", minWidth: 0 }}>
                    <div style={{ minWidth: 0 }}>
                      <p style={{ margin: 0, color: PBI.text1, fontWeight: 700, fontSize: 13, overflowWrap: "anywhere" }}>{asset.asset_name}</p>
                      <p style={{ margin: "3px 0 0", color: PBI.text2, fontSize: 11, overflowWrap: "anywhere" }}>{asset.asset_tag}</p>
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "flex-end", gap: 6, minWidth: 0 }}>
                      <span style={{ color: PBI.text2, background: "#fff", border: `1px solid ${PBI.cardBorder}`, borderRadius: 999, padding: "3px 8px", fontSize: 11, textTransform: "capitalize" }}>{asset.asset_type}</span>
                      <span style={{ color: status.color, background: `${status.color}14`, borderRadius: 999, padding: "3px 8px", fontSize: 11, fontWeight: 700 }}>{status.label}</span>
                    </div>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 8, marginTop: 10, minWidth: 0 }}>
                    {detailEntries.map(([key, value]) => {
                      const remoteUrl = key === "remoto" ? getInventoryRemoteUrl(value) : "";
                      return (
                        <div key={key} style={{ background: "#fff", border: `1px solid ${PBI.cardBorder}`, borderRadius: 3, padding: "7px 8px", minWidth: 0 }}>
                          <p style={{ margin: "0 0 3px", color: PBI.text3, fontSize: 10, fontWeight: 700, textTransform: "uppercase" }}>{formatInventoryDetailLabel(key)}</p>
                          {remoteUrl ? (
                            <a href={remoteUrl} target="_blank" rel="noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 5, color: PBI.blue, fontSize: 12, fontWeight: 700, textDecoration: "none" }}>
                              Abrir remoto <ExternalLink size={12} />
                            </a>
                          ) : (
                            <p style={{ margin: 0, color: PBI.text1, fontSize: 12, lineHeight: 1.35, overflowWrap: "anywhere", whiteSpace: "normal" }}>{formatInventoryDetailValue(key, value)}</p>
                          )}
                        </div>
                      );
                    })}
                    <button type="button" onClick={() => { setSelectedHardwareAsset(asset); if (asset.status === "active" && !asset.hardware) void refreshHardware(asset); }} style={{ background: PBI.blue, color: "#fff", border: `1px solid ${PBI.blue}`, borderRadius: 3, padding: "7px 8px", minWidth: 0, cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: 700, textAlign: "left" }}>
                      Detalles del equipo
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </PbiPanel>
      {selectedHardwareAsset && <HardwareDetailsModal asset={selectedHardwareAsset} refreshing={hardwareRefreshing === selectedHardwareAsset.id} error={hardwareError} onRefresh={() => void refreshHardware(selectedHardwareAsset)} onClose={() => setSelectedHardwareAsset(null)} />}
    </div>
  );
}

function HardwareDetailsModal({ asset, refreshing, error, onRefresh, onClose }: { asset: UserAsset; refreshing: boolean; error: string | null; onRefresh: () => void; onClose: () => void }) {
  const hardware = asset.hardware;
  const entries = hardware ? Object.entries(hardware).filter(([key, value]) => !["status", "collected_at", "error"].includes(key) && value && (!Array.isArray(value) || value.length)) : [];
  const meshEntries = Object.entries(asset.details).filter(([key, value]) => key !== "remoto" && Boolean(value));
  const canRefresh = asset.status === "active";
  return <div role="dialog" aria-modal="true" style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(7,33,70,.58)", display: "grid", placeItems: "center", padding: 20 }} onClick={onClose}>
    <section style={{ width: "min(900px, 100%)", maxHeight: "88vh", overflow: "auto", background: "#fff", border: `1px solid ${PBI.cardBorder}`, borderRadius: 5, padding: 20 }} onClick={event => event.stopPropagation()}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "start" }}><div><p style={{ margin: 0, color: PBI.text3, fontSize: 11, fontWeight: 700, textTransform: "uppercase" }}>Ficha técnica</p><h2 style={{ margin: "4px 0", color: PBI.text1, fontSize: 20 }}>{asset.asset_name}</h2><p style={{ margin: 0, color: PBI.text2, fontSize: 12 }}>{canRefresh ? "Agente disponible para consulta técnica." : "El agente está fuera de línea; se muestra la última información conocida."}</p></div><button type="button" onClick={onClose} style={{ border: 0, background: "transparent", fontSize: 24, cursor: "pointer" }} aria-label="Cerrar">×</button></div>
      {canRefresh && <button type="button" onClick={onRefresh} disabled={refreshing} style={{ marginTop: 14, background: PBI.blue, color: "#fff", border: 0, borderRadius: 3, padding: "8px 10px", fontSize: 12, fontWeight: 700, cursor: refreshing ? "wait" : "pointer" }}>{refreshing ? "Consultando pantalla, periféricos e impresoras…" : "Actualizar ficha técnica"}</button>}
      {error && <p style={{ margin: "10px 0 0", color: PBI.red, fontSize: 13 }}>{error}</p>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: 10, marginTop: 16 }}>
        <section style={{ border: `1px solid ${PBI.cardBorder}`, borderRadius: 3, padding: 10 }}><p style={{ margin: "0 0 7px", fontSize: 12, fontWeight: 700, color: PBI.blue }}>Datos de MeshCentral</p>{meshEntries.map(([key, value]) => <p key={key} style={{ margin: "5px 0", color: PBI.text2, fontSize: 12 }}><strong>{formatInventoryDetailLabel(key)}: </strong>{formatInventoryDetailValue(key, value)}</p>)}</section>
        {!entries.length ? <section style={{ border: `1px solid ${PBI.cardBorder}`, borderRadius: 3, padding: 10 }}><p style={{ margin: 0, color: PBI.text2, fontSize: 13 }}>{canRefresh ? "La consulta se iniciará automáticamente y también puedes actualizarla desde este botón." : "Conecta el equipo para obtener pantalla, mouse, teclado, audio, impresoras, discos y red."}</p></section> : entries.map(([key, value]) => <section key={key} style={{ border: `1px solid ${PBI.cardBorder}`, borderRadius: 3, padding: 10 }}><p style={{ margin: "0 0 7px", fontSize: 12, fontWeight: 700, color: PBI.blue, textTransform: "capitalize" }}>{key.replaceAll("_", " ")}</p><pre style={{ margin: 0, color: PBI.text2, font: "12px/1.45 ui-monospace, monospace", whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{JSON.stringify(value, null, 2)}</pre></section>)}
      </div>
    </section>
  </div>;
}

const INVENTORY_DETAIL_LABELS: Record<string, string> = {
  grupo: "Grupo",
  usuario: "Usuario",
  ip: "IP",
  sistema: "Sistema",
  fabricante: "Fabricante",
  modelo: "Modelo",
  ultimo_contacto: "Ultimo contacto",
  actualizado: "Actualizado",
  remoto: "Acceso remoto",
};

function getInventoryDetailEntries(asset: UserAsset) {
  return Object.entries(asset.details ?? {}).filter(([key, value]) => {
    if (value === null || value === undefined) return false;
    if (key === "remoto") return getInventoryRemoteUrl(value).length > 0;
    return String(value).trim().length > 0;
  });
}

function getInventoryRemoteUrl(value: unknown) {
  if (typeof value !== "string") return "";
  const remoteUrl = value.trim();
  if (!remoteUrl) return "";
  if (remoteUrl.startsWith("http://") || remoteUrl.startsWith("https://")) return remoteUrl;
  if (remoteUrl.startsWith("/")) return `${currentItsmBaseUrl()}${remoteUrl}`;
  return "";
}

function formatInventoryDetailLabel(key: string) {
  return INVENTORY_DETAIL_LABELS[key] ?? key.replaceAll("_", " ");
}

function formatInventoryDetailValue(key: string, value: unknown) {
  const rawValue = String(value ?? "").trim();
  if (!rawValue) return "Sin dato";

  if (key === "ultimo_contacto" || key === "actualizado") {
    const date = new Date(rawValue);
    if (!Number.isNaN(date.getTime())) {
      return date.toLocaleString("es-CL", {
        dateStyle: "short",
        timeStyle: "short",
        timeZone: SANTIAGO_TIME_ZONE,
      });
    }
  }

  return rawValue;
}

function PbiBadge({ color, children }: { color: string; children: ReactNode }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      padding: "2px 8px", borderRadius: 2, fontSize: 11, fontWeight: 600,
      background: `${color}18`, color, border: `1px solid ${color}30`,
    }}>
      {children}
    </span>
  );
}

function SectionHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div style={{ marginBottom: 4 }}>
      <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: PBI.text1 }}>{title}</h2>
      <p style={{ margin: "3px 0 0", fontSize: 12, color: PBI.text2 }}>{subtitle}</p>
    </div>
  );
}

function KpiCard({ kpi }: { kpi: { label: string; value: string; meta: string; tone: string } }) {
  const accent = kpi.tone === "positive" ? PBI.green : kpi.tone === "warning" ? PBI.amber : kpi.tone === "critical" ? PBI.red : PBI.blue;
  return (
    <div style={{
      background: PBI.cardBg, border: `1px solid ${PBI.cardBorder}`,
      borderRadius: 2, padding: "12px 14px", borderTop: `3px solid ${accent}`,
    }}>
      <p style={{ fontSize: 10, fontWeight: 600, color: PBI.text3, margin: "0 0 6px 0", textTransform: "uppercase", letterSpacing: "0.05em" }}>{kpi.label}</p>
      <p style={{ fontSize: 24, fontWeight: 700, color: PBI.text1, margin: "0 0 4px 0", lineHeight: 1 }}>{kpi.value}</p>
      <p style={{ fontSize: 11, color: PBI.text2, margin: 0 }}>{kpi.meta}</p>
    </div>
  );
}

function DomainCard({ title, icon: Icon, metrics, accent }: {
  title: string; icon: typeof Activity;
  metrics: Array<{ label: string; value: string }>; accent: string;
}) {
  return (
    <div style={{ background: PBI.cardBg, border: `1px solid ${PBI.cardBorder}`, borderRadius: 2, padding: 14, borderTop: `3px solid ${accent}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12 }}>
        <Icon size={13} color={accent} />
        <p style={{ fontWeight: 700, fontSize: 12, color: PBI.text1, margin: 0 }}>{title}</p>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
        {metrics.map(m => (
          <div key={m.label} style={{ background: PBI.pageBg, borderRadius: 2, padding: "8px 10px", border: `1px solid ${PBI.cardBorder}` }}>
            <p style={{ fontSize: 10, color: PBI.text3, margin: "0 0 3px 0", textTransform: "uppercase", letterSpacing: "0.05em" }}>{m.label}</p>
            <p style={{ fontSize: 18, fontWeight: 700, color: PBI.text1, margin: 0 }}>{m.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function PbiPanel({ title, icon: Icon, children }: { title: string; icon: typeof Activity; children: ReactNode }) {
  return (
    <div style={{ background: PBI.cardBg, border: `1px solid ${PBI.cardBorder}`, borderRadius: 2, padding: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12, paddingBottom: 10, borderBottom: `1px solid ${PBI.cardBorder}` }}>
        <Icon size={13} color={PBI.text3} />
        <p style={{ fontWeight: 600, fontSize: 12, color: PBI.text1, margin: 0 }}>{title}</p>
      </div>
      {children}
    </div>
  );
}

/* ─── Gráfico de barras verticales Power BI ───────────────────────── */
function BarChartPbi({ items, color }: { items: ChartPoint[]; color: string }) {
  const max = Math.max(...items.map(i => i.value), 1);
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 120 }}>
      {items.map(item => (
        <div key={item.label} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, height: "100%" }}>
          <div style={{ flex: 1, width: "100%", display: "flex", alignItems: "flex-end" }}>
            <div style={{
              width: "100%", background: color, opacity: 0.8,
              height: `${Math.max((item.value / max) * 100, 4)}%`,
              borderRadius: "2px 2px 0 0",
              transition: "height 0.4s",
            }} />
          </div>
          <span style={{ fontSize: 9, color: PBI.text3, whiteSpace: "nowrap" }}>{item.label}</span>
        </div>
      ))}
    </div>
  );
}

/* ─── Barras horizontales Power BI ───────────────────────────────── */
function HorizBarPbi({ items, color }: { items: ChartPoint[]; color: string }) {
  const max = Math.max(...items.map(i => i.value), 1);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {items.map(item => (
        <div key={item.label} style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ fontSize: 11, color: PBI.text2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "75%" }}>
              {item.label.replaceAll("_", " ")}
            </span>
            <span style={{ fontSize: 11, fontWeight: 700, color: PBI.text1 }}>{item.value}</span>
          </div>
          <div style={{ height: 6, background: PBI.pageBg, borderRadius: 2, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${Math.max((item.value / max) * 100, 3)}%`, background: color, borderRadius: 2, transition: "width 0.4s" }} />
          </div>
        </div>
      ))}
    </div>
  );
}

/* ─── Prioridades ─────────────────────────────────────────────────── */
function PriorityPbi({ items }: { items: ChartPoint[] }) {
  const total = Math.max(items.reduce((s, i) => s + i.value, 0), 1);
  const colors: Record<string, string> = { P1: PBI.p1, P2: PBI.p2, P3: PBI.p3, P4: PBI.p4 };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {/* Barra stacked */}
      <div style={{ display: "flex", height: 18, borderRadius: 2, overflow: "hidden", gap: 1 }}>
        {items.map(i => (
          <div key={i.label} style={{ width: `${(i.value / total) * 100}%`, background: colors[i.label] ?? PBI.text3 }} />
        ))}
      </div>
      {/* Leyenda */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
        {items.map(i => (
          <div key={i.label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 10, height: 10, borderRadius: 1, background: colors[i.label] ?? PBI.text3, flexShrink: 0 }} />
            <span style={{ fontSize: 11, color: PBI.text2 }}>{i.label}</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: PBI.text1, marginLeft: "auto" }}>{i.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Heatmap Power BI ───────────────────────────────────────────── */
function HeatmapPbi({ items }: { items: ChartPoint[] }) {
  const max = Math.max(...items.map(i => i.value), 1);
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 4 }}>
      {items.map(item => {
        const intensity = item.value / max;
        return (
          <div key={item.label} style={{
            background: `rgba(0,120,212,${0.08 + intensity * 0.55})`,
            border: `1px solid rgba(0,120,212,${0.15 + intensity * 0.25})`,
            borderRadius: 2, padding: "6px 4px", textAlign: "center",
          }}>
            <p style={{ fontSize: 10, color: intensity > 0.5 ? "#fff" : PBI.text2, margin: 0, fontWeight: 600 }}>{item.label}</p>
            <p style={{ fontSize: 13, fontWeight: 700, color: intensity > 0.5 ? "#fff" : PBI.text1, margin: 0 }}>{item.value}</p>
          </div>
        );
      })}
    </div>
  );
}

/* ─── Knowledge list ─────────────────────────────────────────────── */
function KnowledgeListPbi({ items }: { items: ChartPoint[] }) {
  const max = Math.max(...items.map(i => i.value), 1);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {items.map(item => (
        <div key={item.label} style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 11, color: PBI.text2, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.label}</span>
          <div style={{ width: 120, height: 8, background: PBI.pageBg, borderRadius: 2, flexShrink: 0 }}>
            <div style={{ height: "100%", width: `${(item.value / max) * 100}%`, background: PBI.green, borderRadius: 2 }} />
          </div>
          <span style={{ fontSize: 12, fontWeight: 700, color: PBI.text1, width: 28, textAlign: "right" }}>{item.value}</span>
        </div>
      ))}
    </div>
  );
}

/* ─── Escalated list ─────────────────────────────────────────────── */
function EscalatedListPbi({ cases, onOpenTicket }: { cases: OperationalCase[]; onOpenTicket?: (ticketId: string) => void }) {
  const pColor: Record<string, string> = { P1: PBI.p1, P2: PBI.p2, P3: PBI.p3, P4: PBI.p4 };
  if (!cases.length) {
    return (
      <div style={{ display: "grid", placeItems: "center", minHeight: 120, color: PBI.text3, fontSize: 12 }}>
        Sin casos en alerta
      </div>
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {cases.map(item => (
        <div key={item.id} style={{ background: PBI.pageBg, border: `1px solid ${PBI.cardBorder}`, borderRadius: 2, padding: "8px 10px", borderLeft: `3px solid ${pColor[item.priority] ?? PBI.text3}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6 }}>
            <TicketIdButton id={item.id} onOpenTicket={onOpenTicket} color={PBI.text2} />
            <span style={{ fontSize: 10, fontWeight: 700, color: pColor[item.priority] ?? PBI.text3 }}>{item.priority}</span>
          </div>
          <p style={{ fontSize: 12, fontWeight: 600, color: PBI.text1, margin: "4px 0 2px" }}>{item.category}</p>
          <p style={{ fontSize: 11, color: PBI.text3, margin: 0 }}>{item.assigned_technician}</p>
        </div>
      ))}
    </div>
  );
}

function RealtimeActivity({ cases, onOpenTicket }: { cases: OperationalCase[]; onOpenTicket?: (ticketId: string) => void }) {
  return (
    <div style={{ background: PBI.cardBg, border: `1px solid ${PBI.cardBorder}`, borderRadius: 2, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "11px 14px", borderBottom: `1px solid ${PBI.cardBorder}` }}>
        <RadioTower size={13} color={PBI.blue} />
        <p style={{ fontWeight: 700, fontSize: 12, color: PBI.text1, margin: 0 }}>Actividad reciente</p>
        <span style={{ marginLeft: "auto", fontSize: 11, color: PBI.text3 }}>refresco cada 15 s</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column" }}>
        {cases.map((item) => {
          const pColor = P_COLOR[item.priority] ?? PBI.text2;
          const sColor = S_COLOR[item.status] ?? { bg: PBI.pageBg, text: PBI.text2 };
          return (
            <div key={item.id} style={{ display: "grid", gridTemplateColumns: "96px 1fr 160px 88px", gap: 10, alignItems: "center", padding: "9px 14px", borderBottom: `1px solid ${PBI.pageBg}` }}>
              <TicketIdButton id={item.id} onOpenTicket={onOpenTicket} />
              <div style={{ minWidth: 0 }}>
                <p style={{ margin: 0, color: PBI.text1, fontSize: 12, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.category}</p>
                <p style={{ margin: "2px 0 0", color: PBI.text3, fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.department} · {item.user_name}</p>
              </div>
              <span style={{ color: PBI.text2, fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.assigned_technician}</span>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 6 }}>
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: pColor }} />
                <span style={{ background: sColor.bg, color: sColor.text, padding: "2px 6px", borderRadius: 2, fontSize: 10, fontWeight: 700 }}>{item.status}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Tabla operacional ──────────────────────────────────────────── */
const P_COLOR: Record<string, string> = { P1: "#B42318", P2: "#B86E00", P3: "#004481", P4: "#1F7A4D" };
const S_COLOR: Record<string, { bg: string; text: string }> = {
  "Resuelto":      { bg: "#E6F7EE", text: "#1F7A4D" },
  "Escalado":      { bg: "#EEEAFB", text: "#5C5AA8" },
  "En diagnóstico":{ bg: "#D5EDFB", text: "#004481" },
};

function OperationalTable({ cases, onOpenTicket }: { cases: OperationalCase[]; onOpenTicket: (ticketId: string) => void }) {
  return (
    <div style={{ background: PBI.cardBg, border: `1px solid ${PBI.cardBorder}`, borderRadius: 2, overflow: "hidden" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 16px", borderBottom: `1px solid ${PBI.cardBorder}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <CheckCircle2 size={13} color={PBI.green} />
          <span style={{ fontWeight: 700, fontSize: 13, color: PBI.text1 }}>Bitácora de casos</span>
          <span style={{ fontSize: 11, color: PBI.text3, marginLeft: 4 }}>({cases.length} registros)</span>
        </div>
        <span style={{ fontSize: 11, color: PBI.text3 }}>Actualización en tiempo real</span>
      </div>
      <div style={{ overflowX: "auto", maxHeight: 460, overflowY: "auto" }}>
        <table style={{ width: "100%", minWidth: 960, borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr style={{ background: "#F9F8F7", position: "sticky", top: 0 }}>
              {["Ticket ID", "Usuario", "Tipo", "Categoría", "Prioridad", "Estado", "Asignado a", "Creado", "Duración", "SLA"].map(h => (
                <th key={h} style={{ padding: "8px 12px", textAlign: "left", fontWeight: 600, color: PBI.text2, fontSize: 11, borderBottom: `1px solid ${PBI.cardBorder}`, whiteSpace: "nowrap", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {cases.map((item, i) => {
              const sColor = S_COLOR[item.status] ?? { bg: PBI.pageBg, text: PBI.text2 };
              const pColor = P_COLOR[item.priority] ?? PBI.text2;
              const slaOk = item.duration_minutes <= item.sla_minutes;
              return (
                <tr key={item.id} style={{ background: i % 2 === 0 ? "#fff" : "#F8FAFB", borderBottom: `1px solid ${PBI.pageBg}` }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "#EFF6FC"}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = i % 2 === 0 ? "#fff" : "#F8FAFB"}
                >
                  <td style={{ padding: "7px 12px" }}>
                    <TicketIdButton id={item.id} onOpenTicket={onOpenTicket} />
                  </td>
                  <td style={{ padding: "7px 12px", fontWeight: 600, color: PBI.text1 }}>{item.user_name || "—"}</td>
                  <td style={{ padding: "7px 12px", color: PBI.text2 }}>{item.issue_type.replaceAll("_", " ")}</td>
                  <td style={{ padding: "7px 12px", color: PBI.text2 }}>{item.category}</td>
                  <td style={{ padding: "7px 12px" }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                      <span style={{ width: 8, height: 8, borderRadius: "50%", background: pColor, flexShrink: 0 }} />
                      <span style={{ fontWeight: 700, color: pColor, fontSize: 11 }}>{item.priority}</span>
                    </span>
                  </td>
                  <td style={{ padding: "7px 12px" }}>
                    <span style={{ background: sColor.bg, color: sColor.text, padding: "2px 7px", borderRadius: 2, fontSize: 11, fontWeight: 600 }}>
                      {item.status}
                    </span>
                  </td>
                  <td style={{ padding: "7px 12px", color: PBI.text2 }}>{item.assigned_technician}</td>
                  <td style={{ padding: "7px 12px", color: PBI.text3, fontFamily: "monospace", fontSize: 11 }}>{formatDate(item.created_at)}</td>
                  <td style={{ padding: "7px 12px", color: PBI.text2 }}>{item.duration_minutes} min</td>
                  <td style={{ padding: "7px 12px" }}>
                    <span style={{ background: slaOk ? "#DFF6DD" : "#FDE7E9", color: slaOk ? PBI.green : PBI.red, padding: "2px 7px", borderRadius: 2, fontSize: 11, fontWeight: 700 }}>
                      {slaOk ? "✓ OK" : "✗ Incumplido"}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TicketIdButton({ id, onOpenTicket, color = PBI.blue }: { id: string; onOpenTicket?: (ticketId: string) => void; color?: string }) {
  return (
    <button
      type="button"
      onClick={() => onOpenTicket?.(id)}
      title={`Ver detalle ${id}`}
      style={{
        appearance: "none",
        background: "transparent",
        border: "none",
        padding: 0,
        color,
        cursor: onOpenTicket ? "pointer" : "default",
        fontFamily: "monospace",
        fontSize: 11,
        fontWeight: 700,
        textAlign: "left",
        textDecoration: onOpenTicket ? "underline" : "none",
        textUnderlineOffset: 2,
      }}
    >
      {id}
    </button>
  );
}

function TicketDetailModal({ ticketId, ticket, loading, error, onClose }: {
  ticketId: string;
  ticket: TicketDetail | null;
  loading: boolean;
  error: string;
  onClose: () => void;
}) {
  const statusColor = ticket ? S_COLOR[ticket.status === "resolved" ? "Resuelto" : ticket.status === "escalated" ? "Escalado" : "En diagnóstico"] ?? { bg: PBI.pageBg, text: PBI.text2 } : { bg: PBI.pageBg, text: PBI.text2 };
  const priorityColor = ticket ? P_COLOR[ticket.priority] ?? PBI.text2 : PBI.text2;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="ticket-detail-title"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 80,
        background: "rgba(32,31,30,0.46)",
        display: "grid",
        placeItems: "center",
        padding: 24,
      }}
    >
      <section
        onClick={(event) => event.stopPropagation()}
        style={{
          width: "min(1120px, 96vw)",
          maxHeight: "88vh",
          background: PBI.cardBg,
          border: `1px solid ${PBI.cardBorder}`,
          borderRadius: 6,
          boxShadow: "0 24px 70px rgba(0,0,0,0.28)",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <header style={{ display: "flex", alignItems: "center", gap: 12, padding: "16px 18px", borderBottom: `1px solid ${PBI.cardBorder}`, background: "#FBFAF9" }}>
          <div style={{ width: 36, height: 36, borderRadius: 6, background: `${PBI.blue}14`, display: "grid", placeItems: "center", flexShrink: 0 }}>
            <Ticket size={18} color={PBI.blue} />
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <p id="ticket-detail-title" style={{ margin: 0, fontSize: 16, fontWeight: 800, color: PBI.text1 }}>
              {ticket?.id ?? ticketId}
            </p>
            <p style={{ margin: "3px 0 0", fontSize: 12, color: PBI.text2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {loading ? "Cargando detalle desde ITSM..." : ticket?.description ?? "Detalle operacional del ticket"}
            </p>
          </div>
          {ticket?.externalUrl && (
            <a href={ticket.externalUrl} target="_blank" rel="noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 6, color: PBI.blue, textDecoration: "none", fontSize: 12, fontWeight: 700 }}>
              <ExternalLink size={14} />
              ITSM
            </a>
          )}
          <button type="button" onClick={onClose} aria-label="Cerrar detalle" style={{ width: 32, height: 32, border: `1px solid ${PBI.cardBorder}`, background: "#fff", borderRadius: 4, display: "grid", placeItems: "center", cursor: "pointer", color: PBI.text2 }}>
            <X size={16} />
          </button>
        </header>

        <div style={{ overflowY: "auto", padding: 18 }}>
          {loading && (
            <div style={{ display: "grid", placeItems: "center", minHeight: 260, color: PBI.text2, fontSize: 13 }}>
              Consultando información completa del ticket...
            </div>
          )}

          {!loading && error && (
            <div style={{ border: `1px solid #F3C0C7`, background: "#FFF4F5", color: PBI.red, borderRadius: 4, padding: 14, fontSize: 13, fontWeight: 700 }}>
              {error}
            </div>
          )}

          {!loading && ticket && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {(() => {
                const story = buildTicketStory(ticket);
                return story.length ? (
                  <PbiPanel title="Historia operacional" icon={MessageSquareText}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      {story.map((event, index) => (
                        <TicketStoryEventCard key={`${event.title}-${index}`} event={event} index={index} />
                      ))}
                    </div>
                  </PbiPanel>
                ) : null;
              })()}

              <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8 }}>
                <DetailMetric label="Prioridad" value={ticket.priority} color={priorityColor} />
                <DetailMetric label="Estado" value={ticket.stateLabel ?? ticket.status} color={statusColor.text} />
                <DetailMetric label="SLA" value={ticket.estimatedSla} />
                <DetailMetric label="Artículos" value={String(ticket.articleCount ?? ticket.timeline.length)} />
                <DetailMetric label="Proveedor" value={ticket.provider ?? "dashboard"} />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1.15fr 0.85fr", gap: 12 }}>
                <PbiPanel title="Resumen del caso" icon={FileText}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <DetailRow label="Tipo" value={ticket.type.replaceAll("_", " ")} />
                    <DetailRow label="Categoría" value={ticket.category} />
                    <DetailRow label="Sistema afectado" value={ticket.affectedSystem} />
                    <DetailRow label="Activo" value={ticket.affectedAsset} />
                    <DetailRow label="Impacto" value={ticket.impact} />
                    <DetailRow label="Urgencia" value={ticket.urgency} />
                  </div>
                  <p style={{ margin: "12px 0 0", color: PBI.text1, fontSize: 13, lineHeight: 1.55 }}>{ticket.description}</p>
                </PbiPanel>

                <PbiPanel title="Solicitante y asignación" icon={UsersRound}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    <DetailRow label="Usuario" value={ticket.requesterName} />
                    <DetailRow label="Correo" value={ticket.requesterEmail} />
                    <DetailRow label="Área / organización" value={ticket.businessArea ?? ticket.organization} />
                    <DetailRow label="Grupo" value={ticket.group ?? ticket.assignedTeam} />
                    <DetailRow label="Owner" value={ticket.owner} />
                  </div>
                </PbiPanel>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <PbiPanel title="Gestión operacional" icon={CheckCircle2}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <DetailRow label="Siguiente acción" value={ticket.nextAction} />
                    <DetailRow label="Equipo asignado" value={ticket.assignedTeam} />
                    <DetailRow label="Creado" value={formatLongDate(ticket.createdAt)} />
                    <DetailRow label="Actualizado" value={formatLongDate(ticket.updatedAt)} />
                    <DetailRow label="Último contacto" value={formatLongDate(ticket.lastContactAt)} />
                    <DetailRow label="Escalamiento" value={formatLongDate(ticket.escalationAt)} />
                  </div>
                </PbiPanel>

                <PbiPanel title="Pasos ejecutados" icon={Activity}>
                  {ticket.executedSteps.length ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                      {ticket.executedSteps.map((step, index) => (
                        <div key={`${step}-${index}`} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                          <span style={{ width: 18, height: 18, borderRadius: 9, background: `${PBI.green}18`, color: PBI.green, display: "grid", placeItems: "center", fontSize: 10, fontWeight: 800, flexShrink: 0 }}>{index + 1}</span>
                          <span style={{ color: PBI.text2, fontSize: 12, lineHeight: 1.45 }}>{step}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p style={{ margin: 0, color: PBI.text3, fontSize: 12 }}>Sin pasos registrados en el resumen del dashboard.</p>
                  )}
                </PbiPanel>
              </div>

              <PbiPanel title="Registro original del ITSM" icon={MessageSquareText}>
                {ticket.timeline.length ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {ticket.timeline.map((entry) => (
                      <details key={entry.id} style={{ border: `1px solid ${PBI.cardBorder}`, borderLeft: `3px solid ${entry.internal ? PBI.amber : PBI.blue}`, borderRadius: 4, padding: 12, background: entry.internal ? "#FFF9ED" : "#fff" }}>
                        <summary style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", listStyle: "none" }}>
                          <span style={{ fontSize: 12, fontWeight: 800, color: PBI.text1 }}>{entry.subject}</span>
                          <span style={{ fontSize: 10, fontWeight: 700, color: entry.internal ? PBI.amber : PBI.blue, background: entry.internal ? "#FFF2CC" : "#EAF4FD", padding: "2px 6px", borderRadius: 2 }}>
                            {entry.internal ? "Interno" : "Visible"}
                          </span>
                          <span style={{ marginLeft: "auto", fontSize: 11, color: PBI.text3 }}>{formatLongDate(entry.createdAt)}</span>
                        </summary>
                        <p style={{ margin: "10px 0 0", whiteSpace: "pre-wrap", color: PBI.text2, fontSize: 12, lineHeight: 1.5 }}>{cleanArticleBody(entry.body)}</p>
                      </details>
                    ))}
                  </div>
                ) : (
                  <p style={{ margin: 0, color: PBI.text3, fontSize: 12 }}>No hay comentarios disponibles para este ticket.</p>
                )}
              </PbiPanel>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function DetailMetric({ label, value, color = PBI.blue }: { label: string; value?: string; color?: string }) {
  return (
    <div style={{ border: `1px solid ${PBI.cardBorder}`, borderTop: `3px solid ${color}`, borderRadius: 4, padding: "10px 12px", background: "#fff" }}>
      <p style={{ margin: "0 0 5px", color: PBI.text3, fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</p>
      <p style={{ margin: 0, color: PBI.text1, fontSize: 14, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{value || "—"}</p>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <div style={{ minWidth: 0 }}>
      <p style={{ margin: "0 0 3px", color: PBI.text3, fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</p>
      <p style={{ margin: 0, color: PBI.text1, fontSize: 12, fontWeight: 650, overflowWrap: "anywhere", lineHeight: 1.35 }}>{value || "—"}</p>
    </div>
  );
}

type TicketStoryEvent = {
  title: string;
  time?: string | null;
  tone: "bot" | "ticket" | "internal" | "user" | "resolution";
  summary: string;
  details: Array<{ label: string; value: string }>;
};

function TicketStoryEventCard({ event, index }: { event: TicketStoryEvent; index: number }) {
  const tone = {
    bot: { color: PBI.blue, bg: "#EAF4FD" },
    ticket: { color: PBI.purple, bg: "#F4ECFB" },
    internal: { color: PBI.amber, bg: "#FFF4DD" },
    user: { color: PBI.green, bg: "#EAF6EA" },
    resolution: { color: PBI.red, bg: "#FDE7E9" },
  }[event.tone];

  return (
    <article style={{ display: "grid", gridTemplateColumns: "34px 1fr", gap: 10, alignItems: "flex-start" }}>
      <div style={{ width: 28, height: 28, borderRadius: 14, background: tone.bg, color: tone.color, display: "grid", placeItems: "center", fontSize: 12, fontWeight: 900, border: `1px solid ${tone.color}30` }}>
        {index + 1}
      </div>
      <div style={{ border: `1px solid ${PBI.cardBorder}`, borderLeft: `3px solid ${tone.color}`, borderRadius: 4, padding: 12, background: "#fff" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <p style={{ margin: 0, color: PBI.text1, fontSize: 13, fontWeight: 850 }}>{event.title}</p>
          {event.time && <span style={{ marginLeft: "auto", color: PBI.text3, fontSize: 11 }}>{formatLongDate(event.time)}</span>}
        </div>
        <p style={{ margin: 0, color: PBI.text2, fontSize: 12, lineHeight: 1.5 }}>{event.summary}</p>
        {event.details.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8, marginTop: 10 }}>
            {event.details.map((detail) => (
              <div key={`${event.title}-${detail.label}`} style={{ background: PBI.pageBg, border: `1px solid ${PBI.cardBorder}`, borderRadius: 3, padding: "7px 9px" }}>
                <p style={{ margin: "0 0 3px", color: PBI.text3, fontSize: 9, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.05em" }}>{detail.label}</p>
                <p style={{ margin: 0, color: PBI.text1, fontSize: 12, fontWeight: 650, lineHeight: 1.35, overflowWrap: "anywhere" }}>{detail.value}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </article>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("es-CL", {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: SANTIAGO_TIME_ZONE,
  }).format(new Date(value));
}

function formatLongDate(value?: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("es-CL", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: SANTIAGO_TIME_ZONE,
  }).format(new Date(value));
}

function getSantiagoHour(value: string) {
  return Number(
    new Intl.DateTimeFormat("es-CL", {
      hour: "2-digit",
      hour12: false,
      timeZone: SANTIAGO_TIME_ZONE,
    }).format(new Date(value)),
  );
}

function buildTicketStory(ticket: TicketDetail): TicketStoryEvent[] {
  const entries = [...ticket.timeline].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  const events: TicketStoryEvent[] = [];
  const botEntry = entries.find((entry) => looksLikeBotContext(entry.body)) ?? entries.find((entry) => !entry.internal);
  const botText = botEntry ? cleanArticleBody(botEntry.body) : "";
  const allText = entries.map((entry) => cleanArticleBody(entry.body)).join("\n\n");

  if (botEntry) {
    const firstUser = extractTranscriptMessage(botText, "user", "first");
    const firstBot = extractTranscriptMessage(botText, "bot", "first");
    const channel = extractField(botText, ["Canal"]);
    const session = extractField(botText, ["Sesión", "Sesion"]);
    events.push({
      title: "Primer contacto con la mesa",
      time: botEntry.createdAt,
      tone: "user",
      summary: firstUser
        ? `El usuario contactó al bot y reportó: ${firstUser}`
        : `El usuario contactó al canal de soporte por ${ticket.category.toLowerCase()}.`,
      details: compactDetails([
        ["Canal", channel ?? "Bot ITSM / portal"],
        ["Primera respuesta", firstBot],
        ["Sesión", session],
      ]),
    });

    const playbook = extractField(botText, ["Playbook"]);
    const stage = extractField(botText, ["Etapa"]);
    const asset = extractField(botText, ["Activo", "Activo afectado"]);
    const criteria = extractField(botText, ["Criterio aplicado"]);
    const completed = extractField(botText, ["Pasos completados"]);
    const diagnosticSummary = criteria
      ?? (completed ? `El bot completó ${completed}.` : "El bot clasificó el caso y dejó trazabilidad del diagnóstico aplicado.");
    events.push({
      title: "Diagnóstico ejecutado por el bot",
      time: botEntry.createdAt,
      tone: "bot",
      summary: diagnosticSummary,
      details: compactDetails([
        ["Playbook", playbook],
        ["Etapa", stage],
        ["Activo", asset],
        ["Pasos", completed],
      ]),
    });
  }

  const problem = extractField(allText, ["Problema reportado", "Descripción", "Descripcion"]) ?? ticket.description;
  const asset = extractField(allText, ["Activo afectado"]) ?? ticket.affectedAsset;
  const impact = extractField(allText, ["Impacto"]) ?? ticket.impact;
  const action = extractField(allText, ["Acción requerida", "Accion requerida", "Siguiente acción", "Siguiente accion"]) ?? ticket.nextAction;
  events.push({
    title: "Ticket creado con contexto",
    time: ticket.createdAt,
    tone: "ticket",
    summary: `Se registró el ticket ${ticket.id} como ${ticket.type.replaceAll("_", " ")} con prioridad ${ticket.priority}.`,
    details: compactDetails([
      ["Problema", problem],
      ["Activo", asset],
      ["Impacto", impact],
      ["Acción requerida", action],
    ]),
  });

  const nonBotEntries = entries.filter((entry) => entry !== botEntry);
  for (const entry of nonBotEntries) {
    const text = cleanArticleBody(entry.body);
    const lower = normalizeText(text);
    const isRebuiltContext = lower.includes("contexto completo reconstruido");
    const asksPhone = lower.includes("telefono") || lower.includes("numero de telefono");
    const scheduled = lower.includes("programa") || lower.includes("agend") || lower.includes("lunes") || lower.includes("hora");
    const userAsked = lower.includes("usuario pregunta") || lower.includes("si el usuario pregunta") || lower.includes("cliente");
    const tone: TicketStoryEvent["tone"] = entry.internal ? "internal" : userAsked ? "user" : scheduled ? "resolution" : "ticket";

    events.push({
      title: entry.internal ? "Gestión interna de la mesa" : isRebuiltContext ? "Contexto consolidado del bot" : "Seguimiento registrado",
      time: entry.createdAt,
      tone: isRebuiltContext ? "bot" : tone,
      summary: isRebuiltContext
        ? "El bot agregó un resumen consolidado para que la mesa no dependa de leer toda la conversación."
        : summarizeOperationalNote(text),
      details: compactDetails([
        ["Tipo", entry.internal ? "Nota interna" : "Comentario visible"],
        ["Problema", isRebuiltContext ? extractField(text, ["Problema reportado"]) : undefined],
        ["Acción", isRebuiltContext ? extractField(text, ["Acción requerida", "Accion requerida"]) : undefined],
        ["Dato requerido", asksPhone ? "Número telefónico actualizado" : undefined],
        ["Agenda", scheduled ? extractScheduleHint(text) : undefined],
      ]),
    });
  }

  return mergeNearbyTicketEvents(events);
}

function looksLikeBotContext(value: string) {
  const text = normalizeText(value);
  return text.includes("bot itsm") || text.includes("chatbot") || text.includes("playbook") || text.includes("transcripcion");
}

function compactDetails(items: Array<[string, string | null | undefined]>): Array<{ label: string; value: string }> {
  return items
    .filter((item): item is [string, string] => Boolean(item[1]?.trim()))
    .map(([label, value]) => ({ label, value: value.trim() }));
}

function extractField(text: string, labels: string[]) {
  for (const label of labels) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = text.match(new RegExp(`(?:^|\\n)\\s*${escaped}\\s*:\\s*([^\\n]+)`, "i"));
    if (match?.[1]) return match[1].trim();
  }
  return undefined;
}

function extractTranscriptMessage(text: string, role: "user" | "bot", position: "first" | "last") {
  const rolePattern = role === "user" ? "(?:Usuario|Cliente)" : "(?:Atlas \\(bot\\)|Bot ITSM|Bot|Asistente)";
  const matches = Array.from(text.matchAll(new RegExp(`(?:^|\\n)\\s*(?:\\d+\\.\\s*)?${rolePattern}\\s*:?\\s*([^\\n]+(?:\\n\\s{2,}[^\\n]+)*)`, "gi")));
  const selected = position === "first" ? matches[0] : matches[matches.length - 1];
  return selected?.[1]?.replace(/\s+/g, " ").trim();
}

function summarizeOperationalNote(text: string) {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= 220) return normalized;
  const firstSentence = normalized.match(/^(.{80,220}?[.!?])\s/)?.[1];
  return firstSentence ?? `${normalized.slice(0, 217).trim()}...`;
}

function extractScheduleHint(text: string) {
  const normalized = text.replace(/\s+/g, " ").trim();
  const match = normalized.match(/(?:se programa|programa|agend[ao])[^.]{0,140}/i);
  return match?.[0]?.trim() ?? undefined;
}

function mergeNearbyTicketEvents(events: TicketStoryEvent[]) {
  const seen = new Set<string>();
  return events.filter((event) => {
    const key = `${event.title}-${event.time}-${event.summary}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizeText(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function cleanArticleBody(value: string) {
  return value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}
