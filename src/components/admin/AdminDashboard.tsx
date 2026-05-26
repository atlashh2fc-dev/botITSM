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
  Settings,
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
  { label: "Conversaciones", icon: MessageSquareText },
  { label: "Tickets", icon: Ticket },
  { label: "Analytics", icon: BarChart3 },
  { label: "Knowledge", icon: BookOpen },
  { label: "Configuración", icon: Settings },
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

function AdminWorkspace() {
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

  return (
    <main className="min-h-screen bg-[#07111f] text-slate-100">
      <div className="grid min-h-screen lg:grid-cols-[260px_1fr]">
        <aside className="border-b border-white/10 bg-[#0a1525] p-5 lg:border-b-0 lg:border-r">
          <BrandMark variant="dark" />
          <nav className="mt-10 grid gap-1">
            {navItems.map((item, index) => (
              <button
                key={item.label}
                className={`flex h-10 items-center gap-3 rounded-xl px-3 text-sm font-medium transition ${
                  index === 2 ? "bg-cyan-300/12 text-cyan-100" : "text-slate-400 hover:bg-white/5 hover:text-white"
                }`}
              >
                <item.icon size={17} aria-hidden />
                {item.label}
              </button>
            ))}
          </nav>
          <div className="mt-10 rounded-2xl border border-cyan-300/20 bg-cyan-300/8 p-4">
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-cyan-200">Gobierno</p>
            <p className="mt-3 text-sm leading-6 text-slate-300">
              Trazabilidad activa por conversación, decisión, clasificación y grupo resolutor.
            </p>
          </div>
        </aside>

        <section className="min-w-0">
          <header className="border-b border-white/10 bg-[#07111f]/92 px-5 py-5 backdrop-blur-xl lg:px-8">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.16em] text-cyan-200">Operations Command Center</p>
                <h1 className="mt-2 text-2xl font-semibold tracking-[-0.025em] text-white">Panel ejecutivo ITSM</h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
                  Monitoreo de conversaciones, tickets, resolución autónoma, escalamiento humano y uso de conocimiento.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <StatusBadge tone="cyan">Mercury-ready</StatusBadge>
                <StatusBadge tone="green">Supabase-ready</StatusBadge>
                <StatusBadge tone="slate">ITIL aligned</StatusBadge>
              </div>
            </div>
          </header>

          <div className="space-y-5 p-5 lg:p-8">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {kpis.map((kpi) => (
                <AdminKpiCard key={kpi.label} kpi={kpi} />
              ))}
            </div>

            <div className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr_0.8fr]">
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

            <div className="grid gap-5 xl:grid-cols-4">
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

            <div className="grid gap-5 xl:grid-cols-[0.78fr_1.22fr]">
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
      ? "border-rose-300/25 bg-rose-400/8 text-rose-100"
      : kpi.emphasis === "positive"
        ? "border-emerald-300/25 bg-emerald-400/8 text-emerald-100"
        : "border-white/10 bg-white/[0.055] text-white";

  return (
    <article className={`rounded-2xl border p-4 shadow-xl shadow-black/10 ${tone}`}>
      <p className="text-xs font-medium text-slate-400">{kpi.label}</p>
      <p className="mt-3 text-2xl font-semibold tracking-[-0.03em]">{kpi.value}</p>
      <p className="mt-3 text-xs text-slate-400">{kpi.delta}</p>
    </article>
  );
}

function Panel({ title, icon: Icon, children }: { title: string; icon: typeof Activity; children: ReactNode }) {
  return (
    <article className="rounded-2xl border border-white/10 bg-white/[0.055] p-5 shadow-xl shadow-black/10">
      <div className="mb-5 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-white">
          <Icon size={17} className="text-cyan-200" aria-hidden />
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
    <div className="flex h-52 items-end gap-2">
      {items.map((item) => (
        <div key={item.label} className="flex flex-1 flex-col items-center gap-2">
          <div className="flex h-40 w-full items-end rounded-xl bg-white/[0.045] p-1">
            <div
              className="w-full rounded-lg bg-gradient-to-t from-cyan-400 to-sky-200"
              style={{ height: `${Math.max((item.value / max) * 100, 10)}%` }}
            />
          </div>
          <span className="text-[11px] text-slate-500">{item.label}</span>
        </div>
      ))}
    </div>
  );
}

function HorizontalBars({ items, compact = false }: { items: ChartPoint[]; compact?: boolean }) {
  const max = Math.max(...items.map((item) => item.value));
  return (
    <div className="space-y-3">
      {items.map((item) => (
        <div key={item.label}>
          <div className="mb-1 flex justify-between gap-3 text-xs">
            <span className="truncate text-slate-300">{item.label.replaceAll("_", " ")}</span>
            <span className="font-medium text-white">{item.value}</span>
          </div>
          <div className={`overflow-hidden rounded-full bg-white/10 ${compact ? "h-1.5" : "h-2"}`}>
            <div className="h-full rounded-full bg-cyan-300" style={{ width: `${Math.max((item.value / max) * 100, 8)}%` }} />
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
      <div className="flex h-4 overflow-hidden rounded-full bg-white/10">
        {items.map((item) => (
          <div key={item.label} className={colors[item.label] ?? "bg-slate-400"} style={{ width: `${(item.value / total) * 100}%` }} />
        ))}
      </div>
      <div className="mt-5 grid grid-cols-2 gap-3">
        {items.map((item) => (
          <div key={item.label} className="rounded-xl bg-white/[0.045] p-3">
            <p className="text-xs text-slate-400">{item.label}</p>
            <p className="mt-1 text-xl font-semibold text-white">{item.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function Heatmap({ items }: { items: ChartPoint[] }) {
  const max = Math.max(...items.map((item) => item.value));
  return (
    <div className="grid grid-cols-4 gap-2">
      {items.map((item) => (
        <div
          key={item.label}
          className="rounded-xl border border-white/8 px-2 py-3 text-center"
          style={{ backgroundColor: `rgba(34, 211, 238, ${0.08 + (item.value / max) * 0.34})` }}
        >
          <p className="text-xs font-medium text-white">{item.label}</p>
          <p className="mt-1 text-xs text-slate-400">{item.value} casos</p>
        </div>
      ))}
    </div>
  );
}

function KnowledgeList({ items }: { items: ChartPoint[] }) {
  return (
    <div className="space-y-3">
      {items.map((item) => (
        <div key={item.label} className="flex items-start justify-between gap-3 rounded-xl bg-white/[0.045] p-3">
          <p className="text-xs leading-5 text-slate-300">{item.label}</p>
          <span className="rounded-full bg-cyan-300/12 px-2 py-1 text-xs font-semibold text-cyan-100">{item.value}</span>
        </div>
      ))}
    </div>
  );
}

function EscalatedList({ cases }: { cases: OperationalCase[] }) {
  return (
    <div className="space-y-3">
      {cases.map((item) => (
        <div key={item.id} className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
          <div className="flex items-center justify-between gap-3">
            <p className="font-mono text-xs font-semibold text-cyan-100">{item.id}</p>
            <StatusBadge tone={item.priority === "P1" ? "red" : "amber"}>{item.priority}</StatusBadge>
          </div>
          <p className="mt-2 text-sm font-medium text-white">{item.category}</p>
          <p className="mt-1 text-xs text-slate-400">{item.assigned_technician}</p>
        </div>
      ))}
    </div>
  );
}

function OperationalTable({ cases }: { cases: OperationalCase[] }) {
  return (
    <article className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.055] shadow-xl shadow-black/10">
      <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-white">
          <CheckCircle2 size={17} className="text-cyan-200" aria-hidden />
          Últimos 100 casos
        </h2>
        <span className="text-xs text-slate-500">actualización operacional</span>
      </div>
      <div className="thin-scrollbar max-h-[560px] overflow-auto">
        <table className="w-full min-w-[1080px] border-collapse text-left text-xs">
          <thead className="sticky top-0 bg-[#0d1a2b] text-slate-400">
            <tr>
              {["Ticket", "Usuario", "Tipo", "Prioridad", "Estado", "Resolución", "Escalado", "Técnico", "Fecha", "Duración"].map(
                (header) => (
                  <th key={header} className="px-4 py-3 font-medium">
                    {header}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/8">
            {cases.map((item) => (
              <tr key={item.id} className="transition hover:bg-white/[0.035]">
                <td className="px-4 py-3 font-mono font-semibold text-cyan-100">{item.id}</td>
                <td className="px-4 py-3 text-slate-300">{item.user_name}</td>
                <td className="px-4 py-3 text-slate-300">{item.category}</td>
                <td className="px-4 py-3">
                  <StatusBadge tone={item.priority === "P1" ? "red" : item.priority === "P2" ? "amber" : "cyan"}>
                    {item.priority}
                  </StatusBadge>
                </td>
                <td className="px-4 py-3 text-slate-300">{item.status}</td>
                <td className="px-4 py-3 text-slate-300">{item.resolution_type}</td>
                <td className="px-4 py-3 text-slate-300">{item.escalated ? "Sí" : "No"}</td>
                <td className="px-4 py-3 text-slate-300">{item.assigned_technician}</td>
                <td className="px-4 py-3 text-slate-400">{formatDate(item.created_at)}</td>
                <td className="px-4 py-3 text-slate-300">{item.duration_minutes} min</td>
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
