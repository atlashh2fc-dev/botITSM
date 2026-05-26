import { operationalCases } from "@/data/mock/operationalCases";
import type { AdminKpi, ChartPoint, OperationalCase } from "@/types/operational";

export function listOperationalCases(limit = 100): OperationalCase[] {
  return operationalCases.slice(0, limit);
}

export function getAdminKpis(): AdminKpi[] {
  const total = operationalCases.length;
  const generatedTickets = operationalCases.filter((item) => item.status !== "Resuelto" || item.escalated).length;
  const autonomous = operationalCases.filter((item) => item.resolution_type === "Autónoma").length;
  const escalated = operationalCases.filter((item) => item.escalated).length;
  const criticalActive = operationalCases.filter((item) => item.priority === "P1" && item.status !== "Resuelto").length;
  const resolved = operationalCases.filter((item) => item.status === "Resuelto");
  const avgResolution = Math.round(resolved.reduce((sum, item) => sum + item.duration_minutes, 0) / resolved.length);
  const slaMet = Math.round(
    (operationalCases.filter((item) => item.duration_minutes <= item.sla_minutes * (item.priority === "P1" ? 8 : 1.6)).length /
      total) *
      100,
  );
  const positiveSentiment = Math.round(
    (operationalCases.filter((item) => item.sentiment === "Positivo" || item.sentiment === "Neutral").length / total) * 100,
  );

  return [
    { label: "Conversaciones", value: total.toLocaleString("es-CL"), delta: "+18% últimos 7 días", emphasis: "neutral" },
    { label: "Tickets generados", value: generatedTickets.toString(), delta: "derivación controlada", emphasis: "neutral" },
    { label: "Resolución autónoma", value: `${Math.round((autonomous / total) * 100)}%`, delta: "+7 pts mensual", emphasis: "positive" },
    { label: "Escalados humanos", value: escalated.toString(), delta: "con contexto completo", emphasis: "neutral" },
    { label: "Tiempo promedio", value: `${avgResolution} min`, delta: "casos resueltos", emphasis: "positive" },
    { label: "Cumplimiento SLA", value: `${slaMet}%`, delta: "objetivo 95%", emphasis: slaMet >= 95 ? "positive" : "critical" },
    { label: "Sentiment usuarios", value: `${positiveSentiment}%`, delta: "positivo o neutral", emphasis: "positive" },
    { label: "Críticos activos", value: criticalActive.toString(), delta: "requiere seguimiento", emphasis: criticalActive ? "critical" : "positive" },
  ];
}

export function getVolumeByDay(): ChartPoint[] {
  const buckets = new Map<string, number>();
  for (const item of operationalCases) {
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

export function groupByField<T extends keyof OperationalCase>(field: T, limit = 8): ChartPoint[] {
  const buckets = new Map<string, number>();
  for (const item of operationalCases) {
    buckets.set(String(item[field]), (buckets.get(String(item[field])) ?? 0) + 1);
  }

  return Array.from(buckets.entries())
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, limit);
}

export function getHourlyHeatmap(): ChartPoint[] {
  const hours = Array.from({ length: 12 }, (_, index) => 8 + index);

  return hours.map((hour) => ({
    label: `${String(hour).padStart(2, "0")}:00`,
    value: operationalCases.filter((item) => new Date(item.created_at).getUTCHours() === hour).length,
  }));
}

export function getKnowledgeUsage(): ChartPoint[] {
  const buckets = new Map<string, number>();
  for (const item of operationalCases) {
    buckets.set(item.knowledge_article, (buckets.get(item.knowledge_article) ?? 0) + 1);
  }

  return Array.from(buckets.entries())
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 7);
}

export function getSlaBreachesByDay(): ChartPoint[] {
  const buckets = new Map<string, number>();
  for (const item of operationalCases) {
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

export function getAgingBuckets(): ChartPoint[] {
  const buckets = [
    { label: "<4h", value: 0 },
    { label: "4-8h", value: 0 },
    { label: "8-24h", value: 0 },
    { label: ">24h", value: 0 },
  ];

  for (const item of operationalCases) {
    if (item.status === "Resuelto") continue;
    const hours = item.duration_minutes / 60;
    if (hours < 4) buckets[0].value += 1;
    else if (hours < 8) buckets[1].value += 1;
    else if (hours < 24) buckets[2].value += 1;
    else buckets[3].value += 1;
  }

  return buckets;
}

export function getEscalationFunnel(): ChartPoint[] {
  return [
    { label: "Intake", value: operationalCases.length },
    { label: "Clasificados", value: operationalCases.filter((item) => item.issue_type).length },
    { label: "Con KB", value: operationalCases.filter((item) => item.knowledge_article).length },
    { label: "Escalados", value: operationalCases.filter((item) => item.escalated).length },
    { label: "Resueltos", value: operationalCases.filter((item) => item.status === "Resuelto").length },
  ];
}

export function getSentimentBreakdown(): ChartPoint[] {
  const buckets = new Map<string, number>();
  for (const item of operationalCases) {
    buckets.set(item.sentiment, (buckets.get(item.sentiment) ?? 0) + 1);
  }

  return Array.from(buckets.entries())
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);
}
