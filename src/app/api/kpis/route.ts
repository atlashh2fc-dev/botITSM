import { NextResponse } from "next/server";
import {
  getAdminKpis,
  getHourlyHeatmap,
  getKnowledgeUsage,
  getVolumeByDay,
  groupByField,
  listOperationalCases,
} from "@/services/operations.repository";
import { withTenant } from "@/lib/tenant/context";

export async function GET(request: Request) {
  return withTenant(request, async () => {
  const [kpis, volumeByDay, incidentsByType, priorities, heatmap, topIntents, technicians, knowledge, recentCases] =
    await Promise.all([
      getAdminKpis(),
      getVolumeByDay(),
      groupByField("category", 10),
      groupByField("priority", 4),
      getHourlyHeatmap(),
      groupByField("issue_type", 10),
      groupByField("assigned_technician", 10),
      getKnowledgeUsage(),
      listOperationalCases(100),
    ]);

  return NextResponse.json({
    kpis,
    volumeByDay,
    incidentsByType,
    priorities,
    heatmap,
    topIntents,
    technicians,
    knowledge,
    recentCases,
  });
  });
}
