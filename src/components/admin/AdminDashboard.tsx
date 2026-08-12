"use client";

import type { CSSProperties, ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import {
  Activity,
  AudioLines,
  BarChart3,
  BookOpen,
  Building2,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Cpu,
  Database,
  ExternalLink,
  FileText,
  Gauge,
  Headphones,
  HardDrive,
  Keyboard,
  LockKeyhole,
  MapPinned,
  Mail,
  MessageSquareText,
  Monitor,
  Mouse,
  Network,
  PackageSearch,
  PhoneCall,
  Printer,
  RadioTower,
  RefreshCw,
  Smartphone,
  Settings,
  ShieldAlert,
  Ticket,
  TrendingUp,
  X,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import { AtlasHexLogo, ForumIcon } from "@/components/shared/BrandMark";
import { AgentSoftphone } from "@/components/telephony/AgentSoftphone";
import { getClientTenant } from "@/lib/tenant/client";
import type { Ticket as ITSMDemoTicket } from "@/lib/itsm/types";
import type { TicketDetail } from "@/services/tickets.repository";
import type { UserAsset } from "@/services/assets.repository";
import type { ContactCenterReport } from "@/services/contact-center.repository";
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

const FORUM_PHONE_AGENT_EMAILS = new Set(
  (process.env.NEXT_PUBLIC_TELEPHONY_FORUM_AGENT_EMAILS || "admin@atlas.local")
    .split(",")
    .map(email => email.trim().toLowerCase())
    .filter(Boolean),
);

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

  if (identity) {
    return (
      <AdminWorkspace
        initialSection={initialSection}
        userEmail={identity.email ?? ""}
        phoneEnabled={tenant.id === "forum" && FORUM_PHONE_AGENT_EMAILS.has((identity.email ?? "").trim().toLowerCase())}
      />
    );
  }

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

type ReportPeriod = "daily" | "weekly" | "monthly";

const REPORT_PERIODS: Record<ReportPeriod, { label: string; duration: number; description: string }> = {
  daily: { label: "Diario", duration: 24 * 60 * 60 * 1000, description: "Últimas 24 horas" },
  weekly: { label: "Semanal", duration: 7 * 24 * 60 * 60 * 1000, description: "Últimos 7 días" },
  monthly: { label: "Mensual", duration: 30 * 24 * 60 * 60 * 1000, description: "Últimos 30 días" },
};

function casesInsideWindow(cases: OperationalCase[], start: number, end: number) {
  return cases.filter(item => {
    const timestamp = new Date(item.created_at).getTime();
    return Number.isFinite(timestamp) && timestamp >= start && timestamp < end;
  });
}

function reportDelta(current: number, previous: number) {
  if (previous === 0) return current === 0 ? "Sin variación" : "+100% vs. período anterior";
  const delta = Math.round(((current - previous) / previous) * 100);
  return `${delta > 0 ? "+" : ""}${delta}% vs. período anterior`;
}

function reportTimeline(cases: OperationalCase[], period: ReportPeriod, now: number): ChartPoint[] {
  const config = REPORT_PERIODS[period];
  const segments = period === "daily" ? 8 : period === "weekly" ? 7 : 6;
  const segmentDuration = config.duration / segments;
  return Array.from({ length: segments }, (_, index) => {
    const start = now - config.duration + index * segmentDuration;
    const end = start + segmentDuration;
    const label = period === "daily"
      ? new Intl.DateTimeFormat("es-CL", { hour: "2-digit", minute: "2-digit", timeZone: SANTIAGO_TIME_ZONE }).format(new Date(start))
      : new Intl.DateTimeFormat("es-CL", { day: "2-digit", month: "short", timeZone: SANTIAGO_TIME_ZONE }).format(new Date(start));
    return { label, value: casesInsideWindow(cases, start, end).length };
  });
}

/* ═══════════════════════ WORKSPACE ══════════════════════════════════ */
function TopNavItem({ item, active, onClick }: { item: { id: string; label: string; icon: LucideIcon }; active: boolean; onClick: () => void }) {
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

function AdminWorkspace({
  initialSection,
  userEmail,
  phoneEnabled,
}: {
  initialSection: string;
  userEmail: string;
  phoneEnabled: boolean;
}) {
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
  const [contactCenterReport, setContactCenterReport] = useState<ContactCenterReport | null>(null);
  const [contactCenterLoading, setContactCenterLoading] = useState(false);
  const [contactCenterError, setContactCenterError] = useState("");

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

  const loadContactCenter = useCallback(async () => {
    setContactCenterLoading(true);
    setContactCenterError("");
    try {
      const response = await fetch("/api/contact-center", { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "No fue posible cargar Contact Center.");
      setContactCenterReport(payload.report ?? null);
    } catch (requestError) {
      setContactCenterError(requestError instanceof Error ? requestError.message : "No fue posible cargar Contact Center.");
    } finally {
      setContactCenterLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeSection !== "contact-center" && activeSection !== "reports") return;
    void loadContactCenter();
    const interval = window.setInterval(() => { void loadContactCenter(); }, 60_000);
    return () => window.clearInterval(interval);
  }, [activeSection, loadContactCenter]);

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
    { id: "contact-center", label: "Contact Center",            icon: Headphones },
    { id: "incidents",      label: "Gestión Incidentes",        icon: ShieldAlert },
    { id: "requests",       label: "Gestión Requerimientos",    icon: BarChart3 },
    { id: "access",         label: "Gestión de Accesos",        icon: UsersRound },
    { id: "inventory",      label: "Inventario",                 icon: PackageSearch },
    { id: "knowledge",      label: "Base de Conocimiento",      icon: BookOpen },
    { id: "analytics",      label: "Analítica Avanzada",        icon: TrendingUp },
    { id: "reports",        label: "Reportes",                   icon: FileText },
    { id: "field",          label: "Field Copilot",              icon: Smartphone },
    { id: "cases",          label: "Bitácora de Casos",         icon: MessageSquareText },
    { id: "configuration",  label: "Gobernanza",                icon: Settings },
  ];

  const sectionTitle: Record<string, string> = {
    overview:      "Vista General",
    realtime:      "Tiempo real",
    "contact-center": "Contact Center",
    incidents:     "Gestión de Incidentes",
    requests:      "Gestión de Requerimientos",
    access:        "Gestión de Accesos",
    inventory:     "Inventario",
    knowledge:     "Base de Conocimiento",
    analytics:     "Analítica Avanzada",
    reports:       "Reportes",
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

              {activeSection === "contact-center" && (
                <ContactCenterWorkspace report={contactCenterReport} loading={contactCenterLoading} error={contactCenterError} onRefresh={loadContactCenter} />
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

              {activeSection === "reports" && (
                <ReportsWorkspace
                  cases={cases}
                  assets={assets}
                  contactCenter={contactCenterReport}
                  loadingChannels={contactCenterLoading}
                  onOpenTicket={openTicketDetail}
                />
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
      {phoneEnabled && (
        <AgentSoftphone userEmail={userEmail} onOpenTicket={(ticketId) => { void openTicketDetail(ticketId); }} />
      )}
    </div>
  );
}

/* ═══════════════════════ COMPONENTES UI PBI ══════════════════════════ */

function ReportsWorkspace({ cases, assets, contactCenter, loadingChannels, onOpenTicket }: { cases: OperationalCase[]; assets: UserAsset[]; contactCenter: ContactCenterReport | null; loadingChannels: boolean; onOpenTicket: (ticketId: string) => void }) {
  const [period, setPeriod] = useState<ReportPeriod>("weekly");
  const [generatedAt, setGeneratedAt] = useState(() => Date.now());
  const config = REPORT_PERIODS[period];
  const start = generatedAt - config.duration;
  const previousStart = start - config.duration;
  const current = useMemo(() => casesInsideWindow(cases, start, generatedAt), [cases, start, generatedAt]);
  const previous = useMemo(() => casesInsideWindow(cases, previousStart, start), [cases, previousStart, start]);
  const resolved = current.filter(item => item.status === "Resuelto");
  const open = current.filter(item => item.status !== "Resuelto");
  const escalated = current.filter(item => item.escalated);
  const slaMet = current.filter(item => item.duration_minutes <= item.sla_minutes).length;
  const slaPercent = current.length ? Math.round((slaMet / current.length) * 100) : 0;
  const previousSlaMet = previous.filter(item => item.duration_minutes <= item.sla_minutes).length;
  const previousSlaPercent = previous.length ? Math.round((previousSlaMet / previous.length) * 100) : 0;
  const channels = useMemo(() => {
    const rows = (contactCenter?.rows ?? []).filter(row => {
      const timestamp = new Date(row.createdAt).getTime();
      return Number.isFinite(timestamp) && timestamp >= start && timestamp < generatedAt;
    });
    return (["bot", "email", "phone", "portal", "unclassified"] as const).map(channel => ({
      label: { bot: "Bot ITSM", email: "Correo", phone: "Llamada", portal: "Portal", unclassified: "Sin clasificar" }[channel],
      value: rows.filter(row => row.channel === channel).length,
    }));
  }, [contactCenter, generatedAt, start]);
  const timeline = useMemo(() => reportTimeline(current, period, generatedAt), [current, generatedAt, period]);
  const priorities = useMemo(() => groupByField(current, "priority", 4), [current]);
  const statuses = useMemo(() => groupByField(current, "status", 6), [current]);
  const categories = useMemo(() => groupByField(current, "category", 8), [current]);
  const departments = useMemo(() => groupByField(current, "department", 8), [current]);
  const resolverGroups = useMemo(() => groupByField(current, "assigned_technician", 8), [current]);
  const activeAssets = assets.filter(asset => asset.status === "active").length;
  const attentionAssets = assets.length - activeAssets;
  const rangeLabel = `${new Intl.DateTimeFormat("es-CL", { dateStyle: "medium", timeStyle: period === "daily" ? "short" : undefined, timeZone: SANTIAGO_TIME_ZONE }).format(new Date(start))} — ${new Intl.DateTimeFormat("es-CL", { dateStyle: "medium", timeStyle: period === "daily" ? "short" : undefined, timeZone: SANTIAGO_TIME_ZONE }).format(new Date(generatedAt))}`;

  function downloadCsv() {
    const header = ["Ticket", "Creado", "Solicitante", "Área", "Tipo", "Categoría", "Prioridad", "Estado", "Grupo resolutor", "Duración min", "SLA min", "Cumple SLA"];
    const rows = current.map(item => [item.id, item.created_at, item.user_name, item.department, item.issue_type, item.category, item.priority, item.status, item.assigned_technician, item.duration_minutes, item.sla_minutes, item.duration_minutes <= item.sla_minutes ? "Sí" : "No"]);
    const csv = [header, ...rows].map(row => row.map(value => `"${String(value ?? "").replaceAll('"', '""')}"`).join(";")).join("\r\n");
    const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `reporte-forum-${period}-${new Date(generatedAt).toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, padding: 14, border: `1px solid ${PBI.cardBorder}`, borderRadius: 3, background: "#fff" }}>
      <div><SectionHeader title="Reportes operativos" subtitle="Consolidado de tickets, SLA, canales, áreas, resolución e inventario Forum." /><p style={{ margin: "5px 0 0", color: PBI.text3, fontSize: 11 }}>{rangeLabel} · Generado en horario de Santiago</p></div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div role="group" aria-label="Período del reporte" style={{ display: "flex", padding: 3, border: `1px solid ${PBI.cardBorder}`, borderRadius: 4, background: PBI.pageBg }}>
          {(Object.keys(REPORT_PERIODS) as ReportPeriod[]).map(option => <button key={option} type="button" onClick={() => setPeriod(option)} aria-pressed={period === option} style={{ minHeight: 32, padding: "5px 12px", border: 0, borderRadius: 3, background: period === option ? PBI.blue : "transparent", color: period === option ? "#fff" : PBI.text2, cursor: "pointer", fontFamily: "inherit", fontSize: 11, fontWeight: 800 }}>{REPORT_PERIODS[option].label}</button>)}
        </div>
        <button type="button" onClick={() => setGeneratedAt(Date.now())} style={{ minHeight: 38, border: `1px solid ${PBI.blue}`, borderRadius: 3, background: "#fff", color: PBI.blue, padding: "6px 10px", cursor: "pointer", fontFamily: "inherit", fontSize: 11, fontWeight: 800 }}>Actualizar</button>
        <button type="button" onClick={downloadCsv} disabled={!current.length} style={{ minHeight: 38, border: 0, borderRadius: 3, background: current.length ? PBI.blue : "#91A9BC", color: "#fff", padding: "6px 11px", cursor: current.length ? "pointer" : "not-allowed", fontFamily: "inherit", fontSize: 11, fontWeight: 800 }}>Descargar CSV</button>
      </div>
    </div>

    <div style={{ display: "grid", gridTemplateColumns: "repeat(6, minmax(0, 1fr))", gap: 8 }}>
      <KpiCard kpi={{ label: "Tickets recibidos", value: current.length.toString(), meta: reportDelta(current.length, previous.length), tone: "neutral" }} />
      <KpiCard kpi={{ label: "Abiertos", value: open.length.toString(), meta: `${current.length ? Math.round(open.length / current.length * 100) : 0}% del período`, tone: open.length ? "warning" : "positive" }} />
      <KpiCard kpi={{ label: "Resueltos", value: resolved.length.toString(), meta: `${current.length ? Math.round(resolved.length / current.length * 100) : 0}% del período`, tone: "positive" }} />
      <KpiCard kpi={{ label: "Cumplimiento SLA", value: `${slaPercent}%`, meta: `${slaPercent - previousSlaPercent >= 0 ? "+" : ""}${slaPercent - previousSlaPercent} pts vs. anterior`, tone: slaPercent >= 90 ? "positive" : "critical" }} />
      <KpiCard kpi={{ label: "Tiempo promedio", value: `${averageDuration(current)} min`, meta: "gestión del período", tone: "neutral" }} />
      <KpiCard kpi={{ label: "Escalados", value: escalated.length.toString(), meta: `${current.length ? Math.round(escalated.length / current.length * 100) : 0}% del período`, tone: escalated.length ? "warning" : "positive" }} />
    </div>

    <div style={{ display: "grid", gridTemplateColumns: "1.35fr .9fr .9fr", gap: 8 }}>
      <PbiPanel title={`Volumen ${REPORT_PERIODS[period].label.toLowerCase()}`} icon={Activity}><BarChartPbi items={timeline} color={PBI.blue} /></PbiPanel>
      <PbiPanel title="Estado de tickets" icon={RadioTower}><HorizBarPbi items={statuses} color={PBI.green} /></PbiPanel>
      <PbiPanel title="Prioridad" icon={ShieldAlert}><PriorityPbi items={priorities} /></PbiPanel>
    </div>

    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 }}>
      <PbiPanel title="Canales de entrada" icon={Headphones}>{loadingChannels && !contactCenter ? <p style={{ color: PBI.text2, fontSize: 12 }}>Clasificando canales del ITSM…</p> : <HorizBarPbi items={channels} color={PBI.purple} />}</PbiPanel>
      <PbiPanel title="Categorías principales" icon={Gauge}><HorizBarPbi items={categories} color={PBI.blue} /></PbiPanel>
      <PbiPanel title="Áreas solicitantes" icon={Building2}><HorizBarPbi items={departments} color={PBI.amber} /></PbiPanel>
    </div>

    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
      <PbiPanel title="Grupos resolutores" icon={UsersRound}><HorizBarPbi items={resolverGroups} color={PBI.green} /></PbiPanel>
      <PbiPanel title="Inventario actual" icon={PackageSearch}><div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}><ReportMiniMetric label="Equipos registrados" value={assets.length} color={PBI.blue} /><ReportMiniMetric label="Operativos" value={activeAssets} color={PBI.green} /><ReportMiniMetric label="Requieren atención" value={attentionAssets} color={attentionAssets ? PBI.amber : PBI.green} /></div><p style={{ margin: "12px 0 0", color: PBI.text3, fontSize: 10 }}>Inventario es una fotografía actual; no se atribuye históricamente al período.</p></PbiPanel>
    </div>

    <OperationalTable cases={[...current].sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime())} onOpenTicket={onOpenTicket} />
  </div>;
}

function ReportMiniMetric({ label, value, color }: { label: string; value: number; color: string }) {
  return <div style={{ borderTop: `3px solid ${color}`, background: PBI.pageBg, padding: 12 }}><p style={{ margin: 0, color: PBI.text3, fontSize: 10, fontWeight: 800, textTransform: "uppercase" }}>{label}</p><strong style={{ display: "block", marginTop: 6, color: PBI.text1, fontSize: 24 }}>{value}</strong></div>;
}

function ContactCenterWorkspace({ report, loading, error, onRefresh }: { report: ContactCenterReport | null; loading: boolean; error: string; onRefresh: () => void }) {
  const channels = report?.channels ?? { bot: 0, email: 0, phone: 0, portal: 0, unclassified: 0 };
  const channelCards = [
    { label: "Bot ITSM", value: channels.bot, meta: "marcador del bot", color: PBI.purple, icon: MessageSquareText },
    { label: "Correo", value: channels.email, meta: "artículo email", color: PBI.blue, icon: Mail },
    { label: "Llamada", value: channels.phone, meta: "artículo phone", color: PBI.green, icon: PhoneCall },
    { label: "Portal web", value: channels.portal, meta: "artículo web", color: PBI.amber, icon: UsersRound },
    { label: "Sin clasificar", value: channels.unclassified, meta: "sin evidencia", color: PBI.text3, icon: Database },
  ];

  return <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
    <SectionHeader title="Contact Center" subtitle="Trazabilidad inbound basada en el primer artículo externo de cada ticket." />
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "9px 12px", border: `1px solid ${PBI.cardBorder}`, background: "#fff", borderRadius: 3 }}>
      <p style={{ margin: 0, color: PBI.text2, fontSize: 12 }}>Cobertura: últimos {report?.sampleSize ?? 0} tickets disponibles. Los indicadores CTI sin fuente de telefonía no se inventan.</p>
      <button type="button" onClick={onRefresh} disabled={loading} style={{ flexShrink: 0, border: `1px solid ${PBI.blue}`, borderRadius: 3, background: "#fff", color: PBI.blue, padding: "7px 10px", fontFamily: "inherit", fontSize: 12, fontWeight: 700, cursor: loading ? "wait" : "pointer" }}>{loading ? "Actualizando…" : "Actualizar reporte"}</button>
    </div>
    {error && <p style={{ margin: 0, color: PBI.red, fontSize: 12 }}>{error}</p>}
    <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8 }}>
      <KpiCard kpi={{ label: "Inbound recibido", value: String(report?.inbound ?? 0), meta: "tickets con entrada", tone: "neutral" }} />
      <KpiCard kpi={{ label: "Respuesta inicial", value: report?.firstResponseAverageMinutes === null || report?.firstResponseAverageMinutes === undefined ? "Sin dato" : `${report.firstResponseAverageMinutes} min`, meta: `${report?.firstResponseMeasured ?? 0} casos medidos`, tone: "positive" }} />
      <KpiCard kpi={{ label: "Sin primera respuesta", value: String(report?.awaitingFirstResponse ?? 0), meta: "tickets abiertos", tone: (report?.awaitingFirstResponse ?? 0) ? "critical" : "positive" }} />
      <KpiCard kpi={{ label: "Escalados", value: String(report?.escalated ?? 0), meta: "marca SLA del ITSM", tone: (report?.escalated ?? 0) ? "critical" : "positive" }} />
      <KpiCard kpi={{ label: "Resueltos", value: String(report?.resolved ?? 0), meta: "estado informado", tone: "positive" }} />
    </div>
    <div style={{ display: "grid", gridTemplateColumns: "1.05fr .95fr", gap: 8 }}>
      <PbiPanel title="Entrada por canal" icon={Headphones}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8, marginBottom: 14 }}>
          {channelCards.map(item => { const Icon = item.icon; return <div key={item.label} style={{ minWidth: 0, borderTop: `3px solid ${item.color}`, background: PBI.pageBg, padding: 10 }}><Icon size={16} color={item.color} /><p style={{ margin: "8px 0 2px", color: PBI.text3, fontSize: 10, fontWeight: 800, textTransform: "uppercase" }}>{item.label}</p><p style={{ margin: 0, color: PBI.text1, fontSize: 21, fontWeight: 800 }}>{item.value}</p><p style={{ margin: "3px 0 0", color: PBI.text2, fontSize: 10, lineHeight: 1.3 }}>{item.meta}</p></div>; })}
        </div>
        <HorizBarPbi items={channelCards.map(item => ({ label: item.label, value: item.value }))} color={PBI.blue} />
      </PbiPanel>
      <PbiPanel title="Criterio de medición" icon={FileText}>
        <div style={{ display: "grid", gap: 9, fontSize: 12, color: PBI.text2, lineHeight: 1.5 }}>
          <p style={{ margin: 0 }}><strong style={{ color: PBI.text1 }}>Bot:</strong> marcador del Bot ITSM en el artículo inicial.</p>
          <p style={{ margin: 0 }}><strong style={{ color: PBI.text1 }}>Correo, llamada y portal:</strong> tipo real de artículo (`email`, `phone`, `web`).</p>
          <p style={{ margin: 0 }}><strong style={{ color: PBI.text1 }}>Sin clasificar:</strong> se conserva cuando el ITSM no entrega evidencia suficiente.</p>
          {(report?.unavailable ?? []).map(item => <p key={item} style={{ margin: 0, color: PBI.amber }}><strong>Nota:</strong> {item}</p>)}
        </div>
      </PbiPanel>
    </div>
    <PbiPanel title="Trazabilidad de solicitudes inbound" icon={Database}>
      {loading && !report ? <p style={{ margin: "24px 0", color: PBI.text2, fontSize: 12 }}>Leyendo los artículos del ITSM…</p> : !report?.rows.length ? <p style={{ margin: "24px 0", color: PBI.text2, fontSize: 12 }}>No hay tickets con evidencia disponible.</p> : <div style={{ overflowX: "auto", border: `1px solid ${PBI.cardBorder}`, borderRadius: 3 }}><table style={{ width: "100%", minWidth: 920, borderCollapse: "collapse", fontSize: 12 }}><thead><tr style={{ background: "#EEF4F7", color: PBI.text2, textAlign: "left" }}>{["Ticket", "Canal de entrada", "Evidencia", "Creado", "Primera respuesta", "Estado", "SLA"].map(label => <th key={label} style={{ padding: "9px 10px", fontSize: 10, fontWeight: 800, letterSpacing: .35, textTransform: "uppercase", borderBottom: `1px solid ${PBI.cardBorder}` }}>{label}</th>)}</tr></thead><tbody>{report.rows.map(row => <tr key={row.id} style={{ background: "#fff", borderBottom: `1px solid ${PBI.cardBorder}` }}><td style={{ padding: 10, color: PBI.blue, fontWeight: 800 }}>#{row.number}<span style={{ display: "block", color: PBI.text2, fontWeight: 400, maxWidth: 220, overflowWrap: "anywhere" }}>{row.subject}</span></td><td style={{ padding: 10 }}><ContactChannelBadge channel={row.channel} /></td><td style={{ padding: 10, color: PBI.text2, maxWidth: 220 }}>{row.channelEvidence}</td><td style={{ padding: 10, color: PBI.text2, whiteSpace: "nowrap" }}>{formatContactDate(row.createdAt)}</td><td style={{ padding: 10, color: PBI.text2 }}>{row.firstResponseMinutes === null ? "Sin dato" : `${row.firstResponseMinutes} min`}</td><td style={{ padding: 10, color: PBI.text2 }}>{row.state}</td><td style={{ padding: 10 }}><InventoryCellBadge label={row.escalated ? "Escalado" : "Sin escalación"} color={row.escalated ? PBI.red : PBI.green} /></td></tr>)}</tbody></table></div>}
    </PbiPanel>
  </div>;
}

function ContactChannelBadge({ channel }: { channel: "bot" | "email" | "phone" | "portal" | "unclassified" }) {
  const config = { bot: ["Bot ITSM", PBI.purple], email: ["Correo", PBI.blue], phone: ["Teléfono", PBI.green], portal: ["Portal web", PBI.amber], unclassified: ["Sin clasificar", PBI.text3] } as const;
  const [label, color] = config[channel];
  return <InventoryCellBadge label={label} color={color} />;
}

function formatContactDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Sin fecha" : new Intl.DateTimeFormat("es-CL", { dateStyle: "short", timeStyle: "short", timeZone: SANTIAGO_TIME_ZONE }).format(date);
}

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
  const [selectedHardwareAsset, setSelectedHardwareAsset] = useState<UserAsset | null>(null);
  const [hardwareRefreshing, setHardwareRefreshing] = useState<string | null>(null);
  const [hardwareError, setHardwareError] = useState<string | null>(null);
  const [communeMapOpen, setCommuneMapOpen] = useState(false);
  const [inventoryGridFilter, setInventoryGridFilter] = useState<InventoryGridFilter>("all");
  const [hardwareByAssetId, setHardwareByAssetId] = useState<Record<string, Record<string, unknown>>>({});

  const inventoryRows = useMemo(
    () => assets.map(asset => buildInventoryGridRow(asset, hardwareByAssetId[asset.id] ?? asset.hardware)),
    [assets, hardwareByAssetId],
  );
  const inventoryTotals = useMemo(() => ({
    withoutMonitor: inventoryRows.filter(row => row.monitorState === "without-monitor").length,
    allInOne: inventoryRows.filter(row => row.deviceKind === "all-in-one").length,
    tower: inventoryRows.filter(row => row.deviceKind === "tower").length,
    pending: inventoryRows.filter(row => row.monitorState === "pending").length,
  }), [inventoryRows]);
  const filteredInventoryRows = inventoryRows.filter(row => {
    if (inventoryGridFilter === "without-monitor") return row.monitorState === "without-monitor";
    if (inventoryGridFilter === "all-in-one") return row.deviceKind === "all-in-one";
    if (inventoryGridFilter === "tower") return row.deviceKind === "tower";
    if (inventoryGridFilter === "pending") return row.monitorState === "pending";
    return true;
  });

  const refreshHardware = async (asset: UserAsset) => {
    setHardwareRefreshing(asset.id);
    setHardwareError(null);
    try {
      const response = await fetch(`/api/assets/${encodeURIComponent(asset.id)}/hardware`, { method: "POST" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "No fue posible consultar el hardware.");

      const hardware = payload.hardware ?? payload.asset?.hardware;
      if (hardware && typeof hardware === "object" && !Array.isArray(hardware)) {
        setHardwareByAssetId(current => ({ ...current, [asset.id]: hardware as Record<string, unknown> }));
      }

      setSelectedHardwareAsset(current => current?.id === asset.id
        ? { ...current, hardware }
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
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <SectionHeader title="Inventario" subtitle="Equipos registrados en el ITSM, su estado y datos tecnicos para soporte." />
        <button type="button" onClick={() => setCommuneMapOpen(true)} style={{ display: "inline-flex", alignItems: "center", gap: 7, minHeight: 36, border: `1px solid ${PBI.blue}`, borderRadius: 4, background: "#fff", color: PBI.blue, padding: "0 13px", cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: 800 }}>
          <MapPinned size={16} /> Mapa por comunas
        </button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
        <KpiCard kpi={{ label: "Equipos registrados", value: totalAssets.toString(), meta: "en inventario ITSM", tone: "neutral" }} />
        <KpiCard kpi={{ label: "All-in-One", value: inventoryTotals.allInOne.toString(), meta: "equipos integrados", tone: "neutral" }} />
        <KpiCard kpi={{ label: "PC de torre", value: inventoryTotals.tower.toString(), meta: "gabinetes detectados", tone: "positive" }} />
        <KpiCard kpi={{ label: "Sin pantalla detectada", value: inventoryTotals.withoutMonitor.toString(), meta: inventoryTotals.pending ? `${inventoryTotals.pending} pendiente${inventoryTotals.pending === 1 ? "" : "s"} de ficha` : "fichas consultadas", tone: inventoryTotals.withoutMonitor ? "warning" : "positive" }} />
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
              const hardware = hardwareByAssetId[asset.id] ?? asset.hardware;
              const currentNetworkIp = getPrimaryHardwareIPv4(hardware);
              const assetWithCurrentNetworkIp = currentNetworkIp ? { ...asset, details: { ...asset.details, ip: currentNetworkIp }, hardware } : { ...asset, hardware };
              const detailEntries = getInventoryDetailEntries(assetWithCurrentNetworkIp);
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
                    <button type="button" onClick={() => { setSelectedHardwareAsset(assetWithCurrentNetworkIp); if (!hardware) void refreshHardware(asset); }} style={{ background: PBI.blue, color: "#fff", border: `1px solid ${PBI.blue}`, borderRadius: 3, padding: "7px 8px", minWidth: 0, cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: 700, textAlign: "left" }}>
                      Detalles del equipo
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </PbiPanel>

      <PbiPanel title="Matriz de control técnico" icon={PackageSearch}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
          <InventoryFilterButton active={inventoryGridFilter === "all"} onClick={() => setInventoryGridFilter("all")} label={`Todos (${inventoryRows.length})`} />
          <InventoryFilterButton active={inventoryGridFilter === "without-monitor"} onClick={() => setInventoryGridFilter("without-monitor")} label={`Sin pantalla (${inventoryTotals.withoutMonitor})`} tone={inventoryTotals.withoutMonitor ? PBI.red : undefined} />
          <InventoryFilterButton active={inventoryGridFilter === "all-in-one"} onClick={() => setInventoryGridFilter("all-in-one")} label={`All-in-One (${inventoryTotals.allInOne})`} />
          <InventoryFilterButton active={inventoryGridFilter === "tower"} onClick={() => setInventoryGridFilter("tower")} label={`Torres (${inventoryTotals.tower})`} />
          <InventoryFilterButton active={inventoryGridFilter === "pending"} onClick={() => setInventoryGridFilter("pending")} label={`Pendientes de ficha (${inventoryTotals.pending})`} tone={inventoryTotals.pending ? PBI.amber : undefined} />
        </div>
        <p style={{ margin: "0 0 12px", color: PBI.text2, fontSize: 12, lineHeight: 1.45 }}>
          La clasificación se obtiene de los datos informados por el agente. Los equipos sin ficha técnica se muestran como pendientes, sin asumir que no tienen periféricos.
        </p>
        {filteredInventoryRows.length === 0 ? (
          <p style={{ margin: "20px 0", color: PBI.text2, fontSize: 12 }}>No hay equipos para este filtro.</p>
        ) : (
          <div style={{ overflowX: "auto", border: `1px solid ${PBI.cardBorder}`, borderRadius: 3 }}>
            <table style={{ width: "100%", minWidth: 920, borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ background: "#EEF4F7", color: PBI.text2, textAlign: "left" }}>
                  {['Equipo', 'Tipo', 'Pantalla', 'Periféricos', 'Red', 'Estado', 'Acciones'].map(column => <th key={column} style={{ padding: "9px 10px", fontSize: 10, fontWeight: 800, letterSpacing: .35, textTransform: "uppercase", borderBottom: `1px solid ${PBI.cardBorder}` }}>{column}</th>)}
                </tr>
              </thead>
              <tbody>
                {filteredInventoryRows.map(row => (
                  <tr key={row.asset.id} style={{ background: "#fff", borderBottom: `1px solid ${PBI.cardBorder}` }}>
                    <td style={{ padding: "10px", color: PBI.text1, fontWeight: 700, maxWidth: 190, overflowWrap: "anywhere" }}>
                      {row.asset.asset_name}
                      <span style={{ display: "block", marginTop: 3, color: PBI.text3, fontSize: 11, fontWeight: 400 }}>{row.asset.asset_tag || "Sin identificador"}</span>
                    </td>
                    <td style={{ padding: "10px" }}><InventoryCellBadge label={row.deviceKindLabel} color={row.deviceKind === "all-in-one" ? PBI.purple : row.deviceKind === "tower" ? PBI.blue : PBI.text2} /></td>
                    <td style={{ padding: "10px" }}><InventoryCellBadge label={row.monitorLabel} color={row.monitorState === "connected" ? PBI.green : row.monitorState === "without-monitor" ? PBI.red : PBI.amber} /></td>
                    <td style={{ padding: "10px", color: PBI.text2, lineHeight: 1.45, maxWidth: 210 }}>{row.peripheralsLabel}</td>
                    <td style={{ padding: "10px", color: PBI.text2, lineHeight: 1.45, maxWidth: 180 }}>{row.networkLabel}</td>
                    <td style={{ padding: "10px" }}><InventoryCellBadge label={row.statusLabel} color={row.statusColor} /></td>
                    <td style={{ padding: "10px" }}><button type="button" onClick={() => { setSelectedHardwareAsset({ ...row.asset, hardware: row.hardware }); if (!row.hardware) void refreshHardware(row.asset); }} style={{ background: PBI.blue, color: "#fff", border: 0, borderRadius: 3, padding: "7px 9px", cursor: "pointer", fontFamily: "inherit", fontSize: 11, fontWeight: 700, whiteSpace: "nowrap" }}>Ver ficha</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </PbiPanel>
      {selectedHardwareAsset && <HardwareDetailsModal asset={selectedHardwareAsset} refreshing={hardwareRefreshing === selectedHardwareAsset.id} error={hardwareError} onRefresh={() => void refreshHardware(selectedHardwareAsset)} onClose={() => setSelectedHardwareAsset(null)} />}
      {communeMapOpen && <CommuneInventoryModal onClose={() => setCommuneMapOpen(false)} />}
    </div>
  );
}

type CommuneMapAsset = {
  id: string | number;
  name?: string;
  hostname?: string;
  ip?: string;
  os?: string;
  status?: string;
  raw_status?: string;
  demo?: boolean;
};

type CommuneMapAssignment = {
  id: string | number;
  commune: string;
  asset: CommuneMapAsset;
};

type CommuneMapPayload = {
  communes: string[];
  assignments: CommuneMapAssignment[];
  assets: CommuneMapAsset[];
};

const COMMUNE_MAP_HOTSPOTS = [
  ["Quilicura", 25.7, 15.8, 9, 5], ["Huechuraba", 42.2, 18.3, 10, 5],
  ["Conchalí", 36.6, 21.2, 8, 4], ["Renca", 25.4, 25.4, 7, 4],
  ["Recoleta", 44.4, 26, 8, 4], ["Independencia", 37.9, 28.8, 8, 7],
  ["Cerro Navia", 20.1, 31, 10, 4], ["Quinta Normal", 31.1, 31, 9, 6],
  ["Pudahuel", 14.3, 34.7, 9, 5], ["Lo Prado", 26.2, 37, 8, 4],
  ["Estación Central", 31, 40.8, 10, 6], ["Santiago", 41.4, 38.3, 8, 5],
  ["Providencia", 49.6, 32.3, 11, 5], ["Vitacura", 58, 20, 9, 5],
  ["Lo Barnechea", 72.1, 10.9, 12, 5], ["Las Condes", 75, 30.2, 12, 5],
  ["La Reina", 66.1, 37.2, 9, 5], ["Ñuñoa", 52, 39.7, 7, 5],
  ["Peñalolén", 67, 46, 11, 5], ["Macul", 52.5, 47, 7, 5],
  ["Pedro Aguirre Cerda", 37, 47.6, 10, 8], ["San Miguel", 42.4, 50.5, 7, 6],
  ["San Joaquín", 47.8, 50.7, 8, 6], ["Cerrillos", 29.4, 53.6, 8, 5],
  ["Maipú", 19.1, 56, 7, 5], ["Lo Espejo", 33.5, 57.5, 8, 6],
  ["La Cisterna", 40, 58.8, 8, 6], ["La Granja", 48.2, 60.4, 8, 6],
  ["La Florida", 58.9, 58.7, 10, 5], ["San Ramón", 43.5, 64, 7, 6],
  ["El Bosque", 36, 67, 8, 5], ["La Pintana", 45.7, 74.5, 9, 5],
  ["San Bernardo", 32.4, 77, 11, 5], ["Puente Alto", 59, 76, 11, 5],
  ["Padre Hurtado", 9, 71, 9, 7],
] as const;

const COMMUNE_DEMO_TOTAL = 80;

function buildCommuneDemoPayload(): CommuneMapPayload {
  const communes = COMMUNE_MAP_HOTSPOTS.map(([commune]) => commune);
  const assets: CommuneMapAsset[] = Array.from({ length: COMMUNE_DEMO_TOTAL }, (_, index) => {
    const communeIndex = index % communes.length;
    const deviceNumber = index + 1;
    const communeMode = communeIndex % 7 === 0 ? "offline" : communeIndex % 5 === 0 ? "mixed" : "online";
    const online = communeMode === "online" || (communeMode === "mixed" && index % 2 === 0);
    return {
      id: `demo-rm-${String(deviceNumber).padStart(3, "0")}`,
      name: `RM-DEMO-${String(deviceNumber).padStart(3, "0")}`,
      hostname: `RM-DEMO-${String(deviceNumber).padStart(3, "0")}`,
      ip: `10.${20 + (communeIndex % 10)}.${Math.floor(index / 35) + 1}.${20 + (index % 200)}`,
      os: index % 9 === 0 ? "Windows 10 Pro" : "Windows 11 Pro",
      status: online ? "En línea" : "Fuera de Línea",
      raw_status: online ? "online" : "offline",
      demo: true,
    };
  });

  return {
    communes: [...communes],
    assets,
    assignments: assets.map((asset, index) => ({
      id: `demo-assignment-${index + 1}`,
      commune: communes[index % communes.length],
      asset,
    })),
  };
}

type CommuneEquipmentState = "empty" | "online" | "offline" | "mixed";

function isCommuneAssetOnline(asset: CommuneMapAsset) {
  const status = `${asset.raw_status ?? ""} ${asset.status ?? ""}`.trim().toLowerCase();
  if (/offline|fuera de l[ií]nea|apagado|disconnected/.test(status)) return false;
  return /online|activo|active|operativo|connected/.test(status);
}

function getCommuneEquipmentState(commune: string, assignments: CommuneMapAssignment[]): CommuneEquipmentState {
  const communeAssignments = assignments.filter(item => item.commune === commune);
  if (!communeAssignments.length) return "empty";

  const online = communeAssignments.filter(item => isCommuneAssetOnline(item.asset)).length;
  if (online === communeAssignments.length) return "online";
  if (online === 0) return "offline";
  return "mixed";
}

function communeStatePresentation(state: CommuneEquipmentState) {
  if (state === "online") return { color: PBI.green, background: "rgba(31, 122, 77, .24)", label: "Todos los equipos en línea" };
  if (state === "offline") return { color: PBI.red, background: "rgba(180, 35, 24, .24)", label: "Equipos apagados u offline" };
  if (state === "mixed") return { color: PBI.amber, background: "rgba(184, 110, 0, .24)", label: "Equipos en línea y offline" };
  return { color: "transparent", background: "transparent", label: "Sin equipos asignados" };
}

function CommuneInventoryModal({ onClose }: { onClose: () => void }) {
  const [payload, setPayload] = useState<CommuneMapPayload | null>(null);
  const [demoMode, setDemoMode] = useState(true);
  const [selectedCommune, setSelectedCommune] = useState<string | null>(null);
  const [selectedAssetId, setSelectedAssetId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/inventory/communes", { cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "No se pudo cargar el mapa territorial.");
      setPayload(body as CommuneMapPayload);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "No se pudo cargar el mapa territorial.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previousOverflow; };
  }, []);

  const demoPayload = useMemo(() => buildCommuneDemoPayload(), []);
  const visiblePayload = demoMode ? demoPayload : payload;
  const assignments = visiblePayload?.assignments ?? [];
  const assets = visiblePayload?.assets ?? [];
  const communeAssets = selectedCommune
    ? assignments.filter(item => item.commune === selectedCommune)
    : [];
  const assignedByAsset = new Map(assignments.map(item => [String(item.asset.id), item.commune]));
  const onlineAssets = assets.filter(isCommuneAssetOnline).length;
  const offlineAssets = Math.max(0, assets.length - onlineAssets);

  const saveAssignment = async () => {
    if (!selectedCommune || !selectedAssetId) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/inventory/communes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ asset_id: selectedAssetId, commune: selectedCommune }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "No se pudo guardar la asignación.");
      setSelectedAssetId("");
      await load();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "No se pudo guardar la asignación.");
    } finally {
      setSaving(false);
    }
  };

  const removeAssignment = async (assetId: string | number) => {
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/inventory/communes", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ asset_id: String(assetId) }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || "No se pudo quitar el equipo.");
      }
      await load();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "No se pudo quitar el equipo.");
    } finally {
      setSaving(false);
    }
  };

  const activeCommunes = new Set(assignments.map(item => item.commune)).size;

  return (
    <div role="dialog" aria-modal="true" aria-label="Mapa de equipos por comuna" style={{ position: "fixed", inset: 0, zIndex: 5000, display: "grid", placeItems: "center", padding: 18 }}>
      <button type="button" onClick={onClose} aria-label="Cerrar mapa" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: 0, background: "rgba(3, 19, 40, .70)", cursor: "default" }} />
      <section style={{ position: "relative", width: "min(1380px, 96vw)", height: "min(900px, 94vh)", display: "grid", gridTemplateRows: "auto auto auto minmax(0, 1fr)", overflow: "hidden", border: `1px solid ${PBI.cardBorder}`, borderRadius: 10, background: PBI.pageBg, boxShadow: "0 26px 70px rgba(0, 31, 67, .34)" }}>
        <style>{`@keyframes commune-live-pulse { 0% { box-shadow: 0 0 0 0 var(--pulse-color); } 72% { box-shadow: 0 0 0 9px transparent; } 100% { box-shadow: 0 0 0 0 transparent; } } @media (prefers-reduced-motion: reduce) { .commune-live-marker { animation: none !important; } }`}</style>
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 20, padding: "16px 20px", borderBottom: `1px solid ${PBI.cardBorder}`, background: "#fff" }}>
          <div><p style={{ margin: 0, color: PBI.text3, fontSize: 10, fontWeight: 800, letterSpacing: .5, textTransform: "uppercase" }}>Inventario territorial</p><h2 style={{ margin: "3px 0", color: PBI.text1, fontSize: 21 }}>Equipos por comuna</h2><p style={{ margin: 0, color: PBI.text2, fontSize: 12 }}>Selecciona el nombre de una comuna y asigna los equipos sincronizados desde MeshCentral.</p></div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button type="button" role="switch" aria-checked={demoMode} onClick={() => { setDemoMode(current => !current); setSelectedCommune(null); setSelectedAssetId(""); setError(""); }} style={{ display: "inline-flex", alignItems: "center", gap: 8, minHeight: 36, padding: "6px 10px", border: `1px solid ${demoMode ? PBI.blue : PBI.cardBorder}`, borderRadius: 4, background: demoMode ? "#E8F4FB" : "#fff", color: demoMode ? PBI.blue : PBI.text2, cursor: "pointer", fontFamily: "inherit", fontSize: 11, fontWeight: 800 }}><span aria-hidden style={{ position: "relative", width: 30, height: 16, borderRadius: 99, background: demoMode ? PBI.green : "#A8B5C0" }}><i style={{ position: "absolute", top: 2, left: demoMode ? 16 : 2, width: 12, height: 12, borderRadius: 99, background: "#fff", transition: "left .18s ease" }} /></span>Demo 80 equipos</button>
            <button type="button" onClick={onClose} aria-label="Cerrar" style={{ width: 36, height: 36, display: "grid", placeItems: "center", border: `1px solid ${PBI.cardBorder}`, borderRadius: 4, background: "#fff", color: PBI.text2, cursor: "pointer" }}><X size={19} /></button>
          </div>
        </header>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(6, minmax(0, 1fr))", gap: 1, borderBottom: `1px solid ${PBI.cardBorder}`, background: PBI.cardBorder }}>
          {[[assets.length, demoMode ? "Equipos demo" : "Equipos Mesh"], [onlineAssets, "En línea"], [offlineAssets, "Offline"], [assignments.length, "Con comuna"], [Math.max(0, assets.length - assignments.length), "Sin comuna"], [activeCommunes, "Comunas activas"]].map(([value, label]) => (
            <div key={String(label)} style={{ padding: "10px 16px", background: "#fff" }}><strong style={{ display: "block", color: PBI.blue, fontSize: 20, lineHeight: 1 }}>{value}</strong><span style={{ display: "block", marginTop: 4, color: PBI.text3, fontSize: 10, fontWeight: 800, textTransform: "uppercase" }}>{label}</span></div>
          ))}
        </div>

        <div aria-label="Leyenda del estado de comunas" style={{ display: "flex", alignItems: "center", justifyContent: "center", flexWrap: "wrap", gap: 18, padding: "8px 14px", borderBottom: `1px solid ${PBI.cardBorder}`, background: "#fff" }}>
          <MapLegendItem color={PBI.green} label="Asignada · equipos en línea" pulse />
          <MapLegendItem color={PBI.red} label="Asignada · equipos apagados/offline" pulse />
          <MapLegendItem color={PBI.amber} label="Estado mixto" pulse />
          <MapLegendItem color="#FFFFFF" border={PBI.cardBorder} label="Sin equipos asignados" />
        </div>

        <div style={{ minHeight: 0, display: "grid", gridTemplateColumns: "minmax(0, 1.55fr) minmax(300px, .75fr)", gap: 14, padding: 14, overflow: "hidden" }}>
          <div style={{ position: "relative", justifySelf: "center", width: "auto", maxWidth: "100%", height: "100%", aspectRatio: "1 / 1", border: `1px solid ${PBI.cardBorder}`, borderRadius: 6, overflow: "hidden", background: "#fff" }}>
            {/* La imagen conserva únicamente los límites y nombres; estas áreas transparentes hacen clicable cada nombre. */}
            <Image src="/images/forum-santiago-communes.png" alt="Mapa de comunas de Santiago" fill sizes="(max-width: 900px) 92vw, 760px" priority style={{ objectFit: "contain" }} />
            {COMMUNE_MAP_HOTSPOTS.map(([commune, x, y, width, height]) => {
              const communeState = getCommuneEquipmentState(commune, assignments);
              const presentation = communeStatePresentation(communeState);
              const assignedCount = assignments.filter(item => item.commune === commune).length;
              return <div key={commune}>
                <button type="button" onClick={() => { setSelectedCommune(commune); setSelectedAssetId(""); setError(""); }} aria-label={`Seleccionar ${commune}. ${presentation.label}`} title={`${commune}: ${presentation.label}${assignedCount ? ` (${assignedCount})` : ""}`} style={{ position: "absolute", zIndex: 1, left: `${x}%`, top: `${y}%`, width: `${width}%`, height: `${height}%`, transform: "translate(-50%, -50%)", border: "1px solid transparent", borderRadius: 6, background: "transparent", boxShadow: "none", cursor: "pointer" }} />
                {communeState !== "empty" && <span className="commune-live-marker" aria-hidden style={{ "--pulse-color": `${presentation.color}88`, position: "absolute", zIndex: 3, left: `${x + width * .42}%`, top: `${y - height * .42}%`, width: 18, height: 18, display: "grid", placeItems: "center", transform: "translate(-50%, -50%)", border: selectedCommune === commune ? "3px solid #00A0D2" : "2px solid #fff", outline: selectedCommune === commune ? "2px solid #fff" : "none", borderRadius: 999, background: presentation.color, color: "#fff", fontSize: 8, fontWeight: 900, lineHeight: 1, pointerEvents: "none", animation: "commune-live-pulse 1.8s ease-out infinite" } as CSSProperties}>{assignedCount}</span>}
              </div>;
            })}
          </div>

          <aside style={{ minWidth: 0, minHeight: 0, overflow: "auto", border: `1px solid ${PBI.cardBorder}`, borderRadius: 6, background: "#fff" }}>
            {loading ? <MapEmptyState title="Cargando equipos de MeshCentral..." /> : error && !payload ? <MapEmptyState title={error} error /> : !selectedCommune ? <MapEmptyState title="Selecciona una comuna" text="Haz clic sobre su nombre en el mapa para consultar o asignar equipos." /> : (
              <>
                <div style={{ padding: 16, background: `linear-gradient(135deg, ${PBI.sidebarBg}, ${PBI.blue})`, color: "#fff" }}><p style={{ margin: 0, color: "#D8EFFB", fontSize: 10, fontWeight: 800, textTransform: "uppercase" }}>Comuna seleccionada</p><h3 style={{ margin: "4px 0", fontSize: 21 }}>{selectedCommune}</h3><p style={{ margin: 0, color: "#D8EFFB", fontSize: 11 }}>{communeAssets.length} equipo{communeAssets.length === 1 ? "" : "s"} asignado{communeAssets.length === 1 ? "" : "s"}</p></div>
                <div style={{ display: "grid", gap: 8, padding: 13 }}>
                  {communeAssets.length ? communeAssets.map(item => { const online = isCommuneAssetOnline(item.asset); return <article key={String(item.asset.id)} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: 10, border: `1px solid ${PBI.cardBorder}`, borderLeft: `4px solid ${online ? PBI.green : PBI.red}`, borderRadius: 4, background: PBI.pageBg }}><div style={{ minWidth: 0 }}><strong style={{ display: "block", color: PBI.text1, fontSize: 12, overflowWrap: "anywhere" }}>{item.asset.name || item.asset.hostname || "Equipo"}</strong><span style={{ display: "block", marginTop: 3, color: PBI.text3, fontSize: 10, overflowWrap: "anywhere" }}>{[item.asset.ip, item.asset.os].filter(Boolean).join(" · ") || "Sin detalle"}</span><span style={{ display: "inline-flex", alignItems: "center", gap: 5, marginTop: 5, color: online ? PBI.green : PBI.red, fontSize: 10, fontWeight: 800 }}><i aria-hidden style={{ width: 7, height: 7, borderRadius: 999, background: online ? PBI.green : PBI.red }} />{online ? "En línea" : "Apagado / offline"}</span></div>{!item.asset.demo && <button type="button" disabled={saving} onClick={() => void removeAssignment(item.asset.id)} style={{ border: 0, background: "transparent", color: PBI.red, cursor: "pointer", fontFamily: "inherit", fontSize: 10, fontWeight: 800 }}>Quitar</button>}</article>; }) : <MapEmptyState title="Sin equipos asignados" compact />}
                </div>
                {!demoMode && <div style={{ display: "grid", gap: 8, margin: "0 13px 14px", padding: 13, border: `1px solid ${PBI.cardBorder}`, borderRadius: 5, background: "#EEF6FB" }}>
                  <label htmlFor="commune-map-asset" style={{ color: PBI.text2, fontSize: 11, fontWeight: 800 }}>Agregar equipo MeshCentral</label>
                  <select id="commune-map-asset" value={selectedAssetId} onChange={event => setSelectedAssetId(event.target.value)} style={{ width: "100%", minHeight: 39, border: `1px solid ${PBI.cardBorder}`, borderRadius: 4, background: "#fff", color: PBI.text1, fontFamily: "inherit", fontSize: 11 }}><option value="">Selecciona un equipo...</option>{assets.map(asset => { const location = assignedByAsset.get(String(asset.id)); return <option key={String(asset.id)} value={String(asset.id)}>{asset.name || asset.hostname || `Equipo ${asset.id}`} — {location ? `actualmente en ${location}` : "sin comuna"}</option>; })}</select>
                  <button type="button" disabled={!selectedAssetId || saving} onClick={() => void saveAssignment()} style={{ minHeight: 39, border: 0, borderRadius: 4, background: !selectedAssetId || saving ? "#91A9BC" : PBI.blue, color: "#fff", cursor: !selectedAssetId || saving ? "not-allowed" : "pointer", fontFamily: "inherit", fontSize: 11, fontWeight: 800 }}>{saving ? "Guardando..." : `Asignar a ${selectedCommune}`}</button>
                  {error && <p style={{ margin: 0, color: PBI.red, fontSize: 11 }}>{error}</p>}
                </div>}
              </>
            )}
          </aside>
        </div>
      </section>
    </div>
  );
}

function MapEmptyState({ title, text, error = false, compact = false }: { title: string; text?: string; error?: boolean; compact?: boolean }) {
  return <div style={{ minHeight: compact ? 70 : 250, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 6, padding: compact ? 12 : 24, color: error ? PBI.red : PBI.text3, textAlign: "center" }}><strong style={{ color: error ? PBI.red : PBI.text1, fontSize: compact ? 12 : 14 }}>{title}</strong>{text && <span style={{ maxWidth: 280, fontSize: 11, lineHeight: 1.45 }}>{text}</span>}</div>;
}

function MapLegendItem({ color, label, border, pulse = false }: { color: string; label: string; border?: string; pulse?: boolean }) {
  return <span style={{ display: "inline-flex", alignItems: "center", gap: 7, color: PBI.text2, fontSize: 10, fontWeight: 700 }}><i className={pulse ? "commune-live-marker" : undefined} aria-hidden style={{ "--pulse-color": `${color}75`, width: 12, height: 12, borderRadius: pulse ? 999 : 3, border: `1px solid ${border ?? color}`, background: color, animation: pulse ? "commune-live-pulse 1.8s ease-out infinite" : undefined } as CSSProperties} />{label}</span>;
}

type InventoryGridFilter = "all" | "without-monitor" | "all-in-one" | "tower" | "pending";
type InventoryMonitorState = "connected" | "without-monitor" | "pending";
type InventoryDeviceKind = "all-in-one" | "tower" | "notebook" | "unclassified";
type InventoryGridRow = {
  asset: UserAsset;
  hardware?: Record<string, unknown>;
  deviceKind: InventoryDeviceKind;
  deviceKindLabel: string;
  monitorState: InventoryMonitorState;
  monitorLabel: string;
  peripheralsLabel: string;
  networkLabel: string;
  statusLabel: string;
  statusColor: string;
};

function InventoryFilterButton({ active, label, tone, onClick }: { active: boolean; label: string; tone?: string; onClick: () => void }) {
  const color = active ? "#fff" : tone ?? PBI.blue;
  return <button type="button" onClick={onClick} style={{ border: `1px solid ${active ? PBI.blue : tone ?? PBI.cardBorder}`, background: active ? PBI.blue : "#fff", color, borderRadius: 999, padding: "6px 10px", cursor: "pointer", fontFamily: "inherit", fontSize: 11, fontWeight: 700 }}>{label}</button>;
}

function InventoryCellBadge({ label, color }: { label: string; color: string }) {
  return <span style={{ display: "inline-block", maxWidth: 180, color, background: `${color}12`, border: `1px solid ${color}30`, borderRadius: 999, padding: "4px 8px", fontSize: 11, fontWeight: 700, lineHeight: 1.25, overflowWrap: "anywhere" }}>{label}</span>;
}

function buildInventoryGridRow(asset: UserAsset, hardware?: Record<string, unknown>): InventoryGridRow {
  const monitors = asHardwareRecords(hardware?.monitors);
  const activeMonitors = monitors.filter(monitor => monitor.active !== false);
  const source = [
    asset.asset_name,
    asset.asset_type,
    ...Object.values(asset.details ?? {}).map(value => hardwareString(value)),
    hardwareString(asHardwareRecord(hardware?.system)?.manufacturer),
    hardwareString(asHardwareRecord(hardware?.system)?.model),
  ].join(" ").toLowerCase();

  const allInOne = /all[-\s]?in[-\s]?one|\baio\b|todo en uno/.test(source);
  const notebook = /notebook|laptop|elitebook|thinkpad|latitude|macbook/.test(source);
  const tower = !allInOne && !notebook && /desktop|tower|prodesk|elitedesk|optiplex|thinkcentre|small form factor|\bsff\b|\bmt\b/.test(source);
  const deviceKind: InventoryDeviceKind = allInOne ? "all-in-one" : tower ? "tower" : notebook ? "notebook" : "unclassified";
  const deviceKindLabel = deviceKind === "all-in-one" ? "All-in-One" : deviceKind === "tower" ? "PC de torre" : deviceKind === "notebook" ? "Notebook" : "PC sin clasificar";

  const monitorState: InventoryMonitorState = !hardware ? "pending" : activeMonitors.length ? "connected" : "without-monitor";
  const monitorNames = activeMonitors.map(monitor => hardwareString(monitor.name)).filter(Boolean);
  const monitorLabel = monitorState === "pending"
    ? "Pendiente de consulta"
    : monitorState === "without-monitor"
      ? "Sin pantalla detectada"
      : `${activeMonitors.length} conectada${activeMonitors.length === 1 ? "" : "s"}${monitorNames.length ? ` · ${monitorNames.join(", ")}` : ""}`;

  const peripheralGroups: Array<[string, string, number]> = [
    ["Teclado", "keyboards", asHardwareRecords(hardware?.keyboards).length],
    ["Mouse", "mice", asHardwareRecords(hardware?.mice).length],
    ["Audio", "audio", asHardwareRecords(hardware?.audio).length],
    ["Impresora", "printers", asHardwareRecords(hardware?.printers).length],
  ];
  const peripherals = peripheralGroups.filter(([, , count]) => count > 0).map(([label, , count]) => `${label}${count > 1 ? ` (${count})` : ""}`);
  const peripheralsLabel = !hardware ? "Pendiente de ficha técnica" : peripherals.length ? peripherals.join(" · ") : "Sin periféricos detectados";

  const network = asHardwareRecords(hardware?.network);
  const ips = network.flatMap(entry => Array.isArray(entry.ips) ? entry.ips.map(hardwareString) : [hardwareString(entry.ips)]).filter(Boolean);
  const networkLabel = !hardware ? "Pendiente de ficha técnica" : ips.length ? ips.slice(0, 3).join(" · ") : "Sin red detectada";
  const status = asset.status === "active" ? { label: "Operativo", color: PBI.green } : asset.status === "warning" ? { label: "Atención", color: PBI.amber } : { label: "Con alerta", color: PBI.red };

  return { asset, hardware, deviceKind, deviceKindLabel, monitorState, monitorLabel, peripheralsLabel, networkLabel, statusLabel: status.label, statusColor: status.color };
}

function getPrimaryHardwareIPv4(hardware?: Record<string, unknown>): string {
  const adapters = asHardwareRecords(hardware?.network).sort((left, right) => Number(isVirtualNetworkAdapter(left)) - Number(isVirtualNetworkAdapter(right)));
  for (const adapter of adapters) {
    const addresses = Array.isArray(adapter.ips) ? adapter.ips : [adapter.ips];
    const address = addresses.map(hardwareString).find(isUsableIPv4);
    if (address) return address;
  }
  return "";
}

function isVirtualNetworkAdapter(adapter: Record<string, unknown>) {
  return /virtual|vmware|hyper-v|docker|wsl|vpn|tunnel|teredo|bluetooth|loopback/i.test(hardwareString(adapter.name));
}

function isUsableIPv4(value: string) {
  const trimmed = value.trim();
  const parts = trimmed.split(".");
  return parts.length === 4 && parts.every(part => /^\d{1,3}$/.test(part) && Number(part) <= 255) && !trimmed.startsWith("127.") && !trimmed.startsWith("169.254.") && trimmed !== "0.0.0.0";
}

function HardwareDetailsModal({ asset, refreshing, error, onRefresh, onClose }: { asset: UserAsset; refreshing: boolean; error: string | null; onRefresh: () => void; onClose: () => void }) {
  const hardware = asset.hardware;
  const hardwareSections = buildHardwareSections(hardware);
  const meshEntries = Object.entries(asset.details).filter(([key, value]) => key !== "remoto" && Boolean(value));
  const canRefresh = true;
  const inventoryMessage = "La consulta se valida directamente con el agente MeshCentral.";
  return <div role="dialog" aria-modal="true" style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(7,33,70,.58)", display: "grid", placeItems: "center", padding: 20 }} onClick={onClose}>
    <section style={{ width: "min(900px, 100%)", maxHeight: "88vh", overflow: "auto", background: "#fff", border: `1px solid ${PBI.cardBorder}`, borderRadius: 5, padding: 20 }} onClick={event => event.stopPropagation()}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "start" }}><div><p style={{ margin: 0, color: PBI.text3, fontSize: 11, fontWeight: 700, textTransform: "uppercase" }}>Ficha técnica</p><h2 style={{ margin: "4px 0", color: PBI.text1, fontSize: 20 }}>{asset.asset_name}</h2><p style={{ margin: 0, color: PBI.text2, fontSize: 12 }}>{inventoryMessage}</p></div><button type="button" onClick={onClose} style={{ border: 0, background: "transparent", fontSize: 24, cursor: "pointer" }} aria-label="Cerrar">×</button></div>
      {canRefresh && <button type="button" onClick={onRefresh} disabled={refreshing} style={{ marginTop: 14, background: PBI.blue, color: "#fff", border: 0, borderRadius: 3, padding: "8px 10px", fontSize: 12, fontWeight: 700, cursor: refreshing ? "wait" : "pointer" }}>{refreshing ? "Consultando pantalla, periféricos e impresoras…" : "Actualizar ficha técnica"}</button>}
      {error && <p style={{ margin: "10px 0 0", color: PBI.red, fontSize: 13 }}>{error}</p>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: 10, marginTop: 16 }}>
        <section style={{ border: `1px solid ${PBI.cardBorder}`, borderRadius: 3, padding: 10 }}><p style={{ margin: "0 0 7px", fontSize: 12, fontWeight: 700, color: PBI.blue }}>Datos de MeshCentral</p>{meshEntries.map(([key, value]) => <p key={key} style={{ margin: "5px 0", color: PBI.text2, fontSize: 12 }}><strong>{formatInventoryDetailLabel(key)}: </strong>{formatInventoryDetailValue(key, value)}</p>)}</section>
        {!hardwareSections.length ? <section style={{ border: `1px solid ${PBI.cardBorder}`, borderRadius: 3, padding: 10 }}><p style={{ margin: 0, color: PBI.text2, fontSize: 13 }}>{canRefresh ? "La consulta se iniciará automáticamente y también puedes actualizarla desde este botón." : "Conecta el equipo para obtener pantalla, mouse, teclado, audio, impresoras, discos y red."}</p></section> : hardwareSections.map(section => <HardwareSectionCard key={section.key} section={section} />)}
      </div>
    </section>
  </div>;
}

type HardwareRow = { label: string; value: string };
type HardwareItem = { title: string; rows: HardwareRow[] };
type HardwareSection = { key: string; title: string; icon: ReactNode; accent: string; items: HardwareItem[] };

function HardwareSectionCard({ section }: { section: HardwareSection }) {
  return <section style={{ border: `1px solid ${PBI.cardBorder}`, borderTop: `3px solid ${section.accent}`, borderRadius: 3, padding: 12, background: "#fff" }}>
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, color: section.accent }}>
      {section.icon}
      <p style={{ margin: 0, color: PBI.text1, fontSize: 13, fontWeight: 800 }}>{section.title}</p>
      <span style={{ marginLeft: "auto", color: PBI.text3, fontSize: 11, fontWeight: 700 }}>{section.items.length}</span>
    </div>
    <div style={{ display: "grid", gap: 8 }}>
      {section.items.map((item, index) => <div key={`${item.title}-${index}`} style={{ borderLeft: `2px solid ${section.accent}40`, paddingLeft: 8 }}>
        <p style={{ margin: 0, color: PBI.text1, fontSize: 12, fontWeight: 700, overflowWrap: "anywhere" }}>{item.title}</p>
        <div style={{ display: "grid", gap: 3, marginTop: 4 }}>
          {item.rows.map(row => <p key={row.label} style={{ margin: 0, color: PBI.text2, fontSize: 11, lineHeight: 1.35, overflowWrap: "anywhere" }}><span style={{ color: PBI.text3, fontWeight: 700 }}>{row.label}: </span>{row.value}</p>)}
        </div>
      </div>)}
    </div>
  </section>;
}

function buildHardwareSections(hardware?: Record<string, unknown>): HardwareSection[] {
  if (!hardware) return [];
  const sections: HardwareSection[] = [];
  const system = asHardwareRecord(hardware.system);
  if (system) sections.push({ key: "system", title: "Equipo", icon: <Cpu size={17} />, accent: PBI.blue, items: [{ title: [hardwareString(system.manufacturer), hardwareString(system.model)].filter(Boolean).join(" · ") || "Equipo detectado", rows: compactHardwareRows([["Tipo", system.system_type], ["Memoria", formatHardwareBytes(system.memory_bytes)]]) }] });

  addHardwareListSection(sections, "monitors", "Pantallas", <Monitor size={17} />, PBI.purple, hardware.monitors, entry => ({ title: hardwareString(entry.name) || "Pantalla", rows: compactHardwareRows([["Marca", entry.manufacturer], ["Serie", entry.serial], ["Año", entry.year], ["Estado", entry.active === true ? "Activa" : entry.active === false ? "Inactiva" : "Sin dato"]]) }));
  addHardwareListSection(sections, "audio", "Audio", <AudioLines size={17} />, PBI.green, hardware.audio, entry => ({ title: hardwareString(entry.name) || "Dispositivo de audio", rows: compactHardwareRows([["Fabricante", entry.manufacturer], ["Estado", entry.status]]) }));
  addHardwareListSection(sections, "keyboards", "Teclados", <Keyboard size={17} />, PBI.blue, hardware.keyboards, entry => ({ title: hardwareString(entry.name) || "Teclado", rows: compactHardwareRows([["Descripción", entry.description], ["Estado", entry.status]]) }));
  addHardwareListSection(sections, "mice", "Mouse", <Mouse size={17} />, PBI.blue, hardware.mice, entry => ({ title: hardwareString(entry.name) || "Mouse", rows: compactHardwareRows([["Descripción", entry.description], ["Estado", entry.status]]) }));
  addHardwareListSection(sections, "printers", "Impresoras", <Printer size={17} />, PBI.amber, hardware.printers, entry => ({ title: hardwareString(entry.name) || "Impresora", rows: compactHardwareRows([["Controlador", entry.driver], ["Puerto", entry.port], ["Conexión", entry.network === true ? "Red" : "Local"], ["Predeterminada", entry.default === true ? "Sí" : "No"], ["Estado", entry.offline === true ? "Sin conexión" : "Disponible"]]) }));
  addHardwareListSection(sections, "storage", "Almacenamiento", <HardDrive size={17} />, PBI.green, hardware.storage, entry => ({ title: hardwareString(entry.name) || "Disco", rows: compactHardwareRows([["Capacidad", formatHardwareBytes(entry.size_bytes)], ["Interfaz", entry.interface], ["Serie", entry.serial]]) }));
  addHardwareListSection(sections, "network", "Red", <Network size={17} />, PBI.purple, hardware.network, entry => ({ title: hardwareString(entry.name) || "Adaptador de red", rows: compactHardwareRows([["Direcciones IP", Array.isArray(entry.ips) ? entry.ips.map(hardwareString).filter(Boolean).join(", ") : entry.ips], ["DHCP", entry.dhcp === true ? "Sí" : entry.dhcp === false ? "No" : "Sin dato"]]) }));

  return sections;
}

function addHardwareListSection(sections: HardwareSection[], key: string, title: string, icon: ReactNode, accent: string, value: unknown, mapItem: (entry: Record<string, unknown>) => HardwareItem) {
  const items = asHardwareRecords(value).map(mapItem).filter(item => item.title || item.rows.length);
  if (items.length) sections.push({ key, title, icon, accent, items });
}

function asHardwareRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function asHardwareRecords(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.map(asHardwareRecord).filter((entry): entry is Record<string, unknown> => Boolean(entry)) : [];
}

function compactHardwareRows(rows: Array<[string, unknown]>): HardwareRow[] {
  return rows.map(([label, value]) => ({ label, value: hardwareString(value) })).filter(row => row.value && row.value !== "Sin dato");
}

function hardwareString(value: unknown): string {
  if (value === null || value === undefined || value === "") return "";
  if (typeof value === "boolean") return value ? "Sí" : "No";
  if (Array.isArray(value)) return value.map(hardwareString).filter(Boolean).join(", ");
  return String(value);
}

function formatHardwareBytes(value: unknown): string {
  const bytes = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(bytes) || bytes <= 0) return "";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toLocaleString("es-CL", { maximumFractionDigits: 1 })} ${units[index]}`;
}

const INVENTORY_DETAIL_LABELS: Record<string, string> = {
  grupo: "Grupo",
  usuario: "Usuario",
  ip: "IP de red actual",
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
  const contactEntry = entries.find((entry) => !entry.internal) ?? entries[0];
  const contactText = contactEntry ? cleanArticleBody(contactEntry.body) : "";
  const allText = entries.map((entry) => cleanArticleBody(entry.body)).join("\n\n");

  if (contactEntry) {
    const isBotContact = looksLikeBotContext(contactEntry.body);
    const firstUser = isBotContact ? extractTranscriptMessage(contactText, "user", "first") : undefined;
    const firstBot = isBotContact ? extractTranscriptMessage(contactText, "bot", "first") : undefined;
    const channel = extractField(contactText, ["Canal"]) ?? timelineChannelLabel(contactEntry);
    const session = extractField(contactText, ["Sesión", "Sesion"]);
    events.push({
      title: "Primer contacto con la mesa",
      time: contactEntry.createdAt,
      tone: "user",
      summary: channel === "Teléfono"
        ? "El usuario contactó a la mesa mediante una llamada telefónica entrante."
        : firstUser
          ? `El usuario contactó al bot y reportó: ${firstUser}`
          : `El usuario contactó al canal de soporte por ${ticket.category.toLowerCase()}.`,
      details: compactDetails([
        ["Canal", channel],
        ["Primera respuesta", firstBot],
        ["Sesión", session],
      ]),
    });

    if (isBotContact) {
      const playbook = extractField(contactText, ["Playbook"]);
      const stage = extractField(contactText, ["Etapa"]);
      const asset = extractField(contactText, ["Activo", "Activo afectado"]);
      const criteria = extractField(contactText, ["Criterio aplicado"]);
      const completed = extractField(contactText, ["Pasos completados"]);
      const diagnosticSummary = criteria
        ?? (completed ? `El bot completó ${completed}.` : "El bot clasificó el caso y dejó trazabilidad del diagnóstico aplicado.");
      events.push({
        title: "Diagnóstico ejecutado por el bot",
        time: contactEntry.createdAt,
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

  const nonBotEntries = entries.filter((entry) => entry !== contactEntry);
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

function timelineChannelLabel(entry: TicketDetail["timeline"][number]) {
  const type = normalizeText(entry.type ?? "");
  const body = normalizeText(entry.body);
  if (type.includes("phone") || body.includes("llamada registrada desde asterisk")) return "Teléfono";
  if (type.includes("email")) return "Correo";
  if (type === "web") return "Portal web";
  if (looksLikeBotContext(entry.body)) return "Bot ITSM / portal";
  return "Sin clasificar";
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
