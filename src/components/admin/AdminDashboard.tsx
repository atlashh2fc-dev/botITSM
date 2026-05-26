"use client";

import type { ReactNode } from "react";
import { FormEvent, useMemo, useState } from "react";
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
  ShieldAlert,
  Ticket,
  UsersRound,
} from "lucide-react";
import { BrandMark } from "@/components/shared/BrandMark";
import { StatusBadge } from "@/components/shared/StatusBadge";
import {
  getAdminKpis,
  getHourlyHeatmap,
  getKnowledgeUsage,
  getVolumeByDay,
  groupByField,
  listOperationalCases,
} from "@/services/operations.repository";
import type { AdminKpi, ChartPoint, OperationalCase } from "@/types/operational";

const navItems = [
  { id: "kpis", label: "Analytics", icon: BarChart3 },
  { id: "itil-report", label: "Reporte ITIL", icon: CheckCircle2 },
  { id: "tickets", label: "Tickets", icon: Ticket },
  { id: "knowledge", label: "Knowledge", icon: BookOpen },
  { id: "cases", label: "Conversaciones", icon: MessageSquareText },
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

function AdminWorkspace() {
  const [activeSection, setActiveSection] = useState("kpis");
  const kpis = useMemo(() => getAdminKpis(), []);
  const cases = useMemo(() => listOperationalCases(100), []);
  const byDay = useMemo(() => getVolumeByDay(), []);
  const byType = useMemo(() => groupByField("category", 7), []);
  const byPriority = useMemo(() => groupByField("priority", 4), []);
  const heatmap = useMemo(() => getHourlyHeatmap(), []);
  const topIntents = useMemo(() => groupByField("issue_type", 7), []);
  const escalated = useMemo(() => cases.filter((item) => item.escalated).slice(0, 7), [cases]);
  const technicians = useMemo(() => groupByField("assigned_technician", 8), []);
  const knowledge = useMemo(() => getKnowledgeUsage(), []);

  function goToSection(id: string) {
    setActiveSection(id);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <main className="min-h-screen bg-[#07111f] text-slate-100">
      <div className="grid min-h-screen lg:grid-cols-[188px_1fr]">
        <aside className="border-b border-white/10 bg-[#0a1525] p-3 lg:border-b-0 lg:border-r">
          <div className="flex items-center gap-2.5">
            <BrandMark compact variant="dark" />
            <div className="min-w-0">
              <p className="text-[13px] font-semibold leading-4 text-white">Soporte ITSM</p>
              <p className="truncate text-[11px] text-slate-500">SONDA · Geimser</p>
            </div>
          </div>
          <nav className="mt-6 grid gap-1">
            {navItems.map((item) => (
              <button
                key={item.label}
                type="button"
                onClick={() => goToSection(item.id)}
                className={`flex h-8 items-center gap-2 rounded-lg px-2 text-[12px] font-medium transition ${
                  activeSection === item.id ? "bg-cyan-300/10 text-cyan-100 ring-1 ring-cyan-300/15" : "text-slate-400 hover:bg-white/[0.045] hover:text-white"
                }`}
              >
                <item.icon size={14} aria-hidden />
                {item.label}
              </button>
            ))}
          </nav>
          <div className="mt-6 rounded-lg border border-white/10 bg-white/[0.035] p-2.5">
            <p className="text-[9px] font-medium uppercase tracking-[0.16em] text-cyan-200/80">ITIL control</p>
            <p className="mt-1.5 text-[11px] leading-4 text-slate-400">
              Incidentes, solicitudes, SLA y escalamiento trazables.
            </p>
          </div>
        </aside>

        <section className="min-w-0">
          <header className="border-b border-white/10 bg-[#07111f]/92 px-5 py-4 backdrop-blur-xl lg:px-6">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
              <div>
                <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-cyan-200/80">Operations Command Center</p>
                <h1 className="mt-1.5 text-[28px] font-semibold leading-8 tracking-[-0.025em] text-white">Panel ejecutivo ITSM</h1>
                <p className="mt-1.5 max-w-2xl text-[13px] leading-5 text-slate-400">
                  Monitoreo de conversaciones, tickets, resolución autónoma, escalamiento humano y uso de conocimiento.
                </p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <StatusBadge tone="cyan">Mercury-ready</StatusBadge>
                <StatusBadge tone="cyan">Supabase-ready</StatusBadge>
                <StatusBadge tone="slate">ITIL aligned</StatusBadge>
              </div>
            </div>
          </header>

          <div className="space-y-3 p-3 lg:p-4">
            <div id="kpis" className="scroll-mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-8">
              {kpis.map((kpi) => (
                <AdminKpiCard key={kpi.label} kpi={kpi} />
              ))}
            </div>

            <section id="itil-report" className="scroll-mt-4">
              <ITILReportLine kpis={kpis} />
            </section>

            <div id="tickets" className="scroll-mt-4 grid gap-3 xl:grid-cols-[1.18fr_0.82fr_0.82fr]">
              <Panel title="Volumen por día" icon={Activity}>
                <LineBars items={byDay} />
              </Panel>
              <Panel title="Prioridades" icon={ShieldAlert}>
                <PriorityStack items={byPriority} />
              </Panel>
              <Panel title="Heatmap horario" icon={Clock3}>
                <Heatmap items={heatmap} />
              </Panel>
            </div>

            <div id="knowledge" className="scroll-mt-4 grid gap-3 xl:grid-cols-4">
              <Panel title="Incidentes por tipo" icon={Gauge}>
                <HorizontalBars items={byType} />
              </Panel>
              <Panel title="Top intents" icon={BarChart3}>
                <HorizontalBars items={topIntents} compact />
              </Panel>
              <Panel title="Agentes y técnicos" icon={UsersRound}>
                <HorizontalBars items={technicians} compact />
              </Panel>
              <Panel title="Knowledge usado" icon={BookOpen}>
                <KnowledgeList items={knowledge} />
              </Panel>
            </div>

            <div id="cases" className="scroll-mt-4 grid gap-3 xl:grid-cols-[0.72fr_1.28fr]">
              <Panel title="Casos escalados" icon={Ticket}>
                <EscalatedList cases={escalated} />
              </Panel>
              <OperationalTable cases={cases} />
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

function AdminKpiCard({ kpi }: { kpi: AdminKpi }) {
  const tone =
    kpi.emphasis === "critical"
      ? "border-rose-300/16 bg-rose-300/[0.045] text-rose-100"
      : kpi.emphasis === "positive"
        ? "border-cyan-300/16 bg-cyan-300/[0.045] text-cyan-50"
        : "border-white/10 bg-white/[0.04] text-white";

  return (
    <article className={`rounded-xl border p-2.5 shadow-sm shadow-black/10 ${tone}`}>
      <p className="text-[12px] font-medium text-slate-400">{kpi.label}</p>
      <p className="mt-1.5 text-[26px] font-semibold leading-7 tracking-[-0.03em]">{kpi.value}</p>
      <p className="mt-1.5 text-[12px] text-slate-500">{kpi.delta}</p>
    </article>
  );
}

function ITILReportLine({ kpis }: { kpis: AdminKpi[] }) {
  const items = [
    { label: "Incidentes", value: kpiValue(kpis, "Conversaciones"), meta: "intake ITSM" },
    { label: "Solicitudes", value: kpiValue(kpis, "Tickets generados"), meta: "tickets creados" },
    { label: "SLA", value: kpiValue(kpis, "Cumplimiento SLA"), meta: "cumplimiento" },
    { label: "Resolución", value: kpiValue(kpis, "Resolución autónoma"), meta: "autónoma" },
    { label: "Escalamiento", value: kpiValue(kpis, "Escalados humanos"), meta: "humano" },
    { label: "P1/P2 activos", value: kpiValue(kpis, "Críticos activos"), meta: "seguimiento" },
  ];

  return (
    <article className="rounded-xl border border-cyan-300/14 bg-cyan-300/[0.035] px-3 py-2.5">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h2 className="text-[12px] font-semibold uppercase tracking-[0.16em] text-cyan-100/85">KPI ITIL operativo</h2>
        <span className="text-[11px] text-slate-500">Incidentes · Solicitudes · SLA · Escalamiento</span>
      </div>
      <div className="grid gap-2 sm:grid-cols-3 2xl:grid-cols-6">
        {items.map((item) => (
          <div key={item.label} className="rounded-lg border border-white/8 bg-slate-950/24 px-2.5 py-2">
            <p className="text-[11px] font-medium text-slate-400">{item.label}</p>
            <div className="mt-1 flex items-end justify-between gap-2">
              <p className="text-xl font-semibold leading-6 text-white">{item.value}</p>
              <p className="text-[10px] text-slate-500">{item.meta}</p>
            </div>
          </div>
        ))}
      </div>
    </article>
  );
}

function Panel({ title, icon: Icon, children }: { title: string; icon: typeof Activity; children: ReactNode }) {
  return (
    <article className="rounded-xl border border-white/10 bg-white/[0.04] p-3.5 shadow-sm shadow-black/10">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-[14px] font-semibold text-white">
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
    <div className="flex h-40 items-end gap-1.5">
      {items.map((item) => (
        <div key={item.label} className="flex flex-1 flex-col items-center gap-1.5">
          <div className="flex h-32 w-full items-end rounded-lg bg-white/[0.04] p-1">
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
      <div className="mt-4 grid grid-cols-2 gap-2.5">
        {items.map((item) => (
          <div key={item.label} className="rounded-lg bg-white/[0.04] p-2.5">
            <p className="text-xs text-slate-400">{item.label}</p>
            <p className="mt-1 text-lg font-semibold text-white">{item.value}</p>
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

function OperationalTable({ cases }: { cases: OperationalCase[] }) {
  return (
    <article className="overflow-hidden rounded-xl border border-white/10 bg-white/[0.04] shadow-sm shadow-black/10">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <h2 className="flex items-center gap-2 text-[14px] font-semibold text-white">
          <CheckCircle2 size={15} className="text-cyan-200/80" aria-hidden />
          Últimos 100 casos
        </h2>
        <span className="text-[11px] text-slate-500">actualización operacional</span>
      </div>
      <div className="thin-scrollbar max-h-[520px] overflow-auto">
        <table className="w-full min-w-[1080px] border-collapse text-left text-xs">
          <thead className="sticky top-0 bg-[#0b1727] text-slate-500">
            <tr>
              {["Ticket", "Usuario", "Tipo", "Prioridad", "Estado", "Resolución", "Escalado", "Técnico", "Fecha", "Duración"].map(
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
                <td className="px-3 py-2.5 text-slate-300">{item.user_name}</td>
                <td className="px-3 py-2.5 text-slate-300">{item.category}</td>
                <td className="px-3 py-2.5">
                  <StatusBadge tone={item.priority === "P1" ? "red" : item.priority === "P2" ? "amber" : "cyan"}>
                    {item.priority}
                  </StatusBadge>
                </td>
                <td className="px-3 py-2.5 text-slate-300">{item.status}</td>
                <td className="px-3 py-2.5 text-slate-300">{item.resolution_type}</td>
                <td className="px-3 py-2.5 text-slate-300">{item.escalated ? "Sí" : "No"}</td>
                <td className="px-3 py-2.5 text-slate-300">{item.assigned_technician}</td>
                <td className="px-3 py-2.5 text-slate-400">{formatDate(item.created_at)}</td>
                <td className="px-3 py-2.5 text-slate-300">{item.duration_minutes} min</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </article>
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
