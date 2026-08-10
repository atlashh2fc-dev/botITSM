import { NextRequest, NextResponse } from "next/server";
import {
  PhoneAgentConfigurationError,
  PhoneAgentForbiddenError,
  PhoneAgentUnauthorizedError,
  requireAssignedPhoneAgent,
  requirePhoneSession,
} from "@/lib/telephony/agentAuth";
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
    const prefix = `TELEPHONY_${tenant.id.toUpperCase()}_SIP_`;
    const extension = process.env[`${prefix}EXTENSION`]?.trim() || "6020";
    const password = process.env[`${prefix}PASSWORD`]?.trim();
    const domain = process.env[`${prefix}DOMAIN`]?.trim() || "ws-atlas.geimser.cl";
    const webSocketServer = process.env[`${prefix}WSS`]?.trim() || "wss://ws-atlas.geimser.cl:8089/ws";

    if (!password) throw new PhoneAgentConfigurationError("La credencial SIP del agente no está configurada.");

    const response = NextResponse.json({
      extension,
      authorizationUsername: extension,
      password,
      aor: `sip:${extension}@${domain}`,
      webSocketServer,
      agentEmail: session.email,
    });
    response.headers.set("Cache-Control", "private, no-store, max-age=0");
    response.headers.set("Pragma", "no-cache");
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
    return NextResponse.json({ error: "No fue posible cargar el softphone." }, { status: 500 });
  }
}
