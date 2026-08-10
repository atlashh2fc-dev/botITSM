import { NextRequest, NextResponse } from "next/server";
import {
  PhoneAgentConfigurationError,
  PhoneAgentForbiddenError,
  PhoneAgentUnauthorizedError,
  requireAssignedPhoneAgent,
  requirePhoneSession,
} from "@/lib/telephony/agentAuth";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { requireTenant, TenantResolutionError } from "@/lib/tenant/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const tenant = requireTenant(request);
    if (tenant.id !== "forum") {
      return NextResponse.json({ error: "Telefonía de agentes no habilitada para este portal." }, { status: 404 });
    }
    const session = requirePhoneSession(request, tenant.id);
    requireAssignedPhoneAgent(tenant.id, session.email);

    const db = getSupabaseServerClient();
    if (!db) return NextResponse.json({ call: null }, { headers: { "Cache-Control": "no-store" } });

    const did = process.env.TELEPHONY_FORUM_ALLOWED_DIDS?.split(",")[0]?.replace(/\D/g, "") || "56965906926";
    const since = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const { data, error } = await db
      .from("telephony_calls")
      .select("call_id,from_number,to_number,queue,agent_extension,status,cause,duration_seconds,zammad_ticket_id,zammad_ticket_number,local_ticket_id,started_at,answered_at,ended_at")
      .eq("tenant_id", tenant.id)
      .eq("to_number", did)
      .gte("started_at", since)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw new Error(error.message);
    const response = NextResponse.json({
      call: data ? {
        callId: data.call_id,
        fromNumber: data.from_number,
        toNumber: data.to_number,
        queue: data.queue,
        agentExtension: data.agent_extension,
        status: data.status,
        cause: data.cause,
        durationSeconds: data.duration_seconds,
        zammadTicketId: data.zammad_ticket_id,
        ticketId: data.local_ticket_id,
        ticketNumber: data.zammad_ticket_number,
        ticketUrl: data.zammad_ticket_id && tenant.zammadBaseUrl
          ? `${tenant.zammadBaseUrl.replace(/\/+$/, "")}/#ticket/zoom/${data.zammad_ticket_id}`
          : null,
        startedAt: data.started_at,
        answeredAt: data.answered_at,
        endedAt: data.ended_at,
      } : null,
    });
    response.headers.set("Cache-Control", "private, no-store, max-age=0");
    return response;
  } catch (error) {
    if (error instanceof TenantResolutionError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof PhoneAgentUnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    if (error instanceof PhoneAgentForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    if (error instanceof PhoneAgentConfigurationError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    return NextResponse.json({ error: "No fue posible consultar la llamada activa." }, { status: 500 });
  }
}
