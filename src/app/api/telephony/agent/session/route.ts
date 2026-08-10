import { NextRequest, NextResponse } from "next/server";
import {
  createPhoneSession,
  PHONE_SESSION_COOKIE,
  PhoneAgentConfigurationError,
  PhoneAgentForbiddenError,
  requireAssignedPhoneAgent,
  verifyPhoneActivationToken,
} from "@/lib/telephony/agentAuth";
import { requireTenant, TenantResolutionError } from "@/lib/tenant/server";

export const runtime = "nodejs";

async function readActivationBody(request: NextRequest): Promise<{ accessCode?: string; email?: string } | null> {
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  if (contentType.includes("application/json")) {
    return request.json().catch(() => null) as Promise<{ accessCode?: string; email?: string } | null>;
  }
  if (contentType.includes("application/x-www-form-urlencoded") || contentType.includes("multipart/form-data")) {
    const form = await request.formData().catch(() => null);
    if (!form) return null;
    return {
      accessCode: typeof form.get("accessCode") === "string" ? String(form.get("accessCode")) : undefined,
      email: typeof form.get("email") === "string" ? String(form.get("email")) : undefined,
    };
  }
  return null;
}

export async function POST(request: NextRequest) {
  try {
    const tenant = requireTenant(request);
    if (tenant.id !== "forum") {
      return NextResponse.json({ error: "Telefonía de agentes no habilitada para este portal." }, { status: 404 });
    }

    const body = await readActivationBody(request);
    if (!body?.accessCode || !body.email) {
      return NextResponse.json({ error: "Código y correo son obligatorios." }, { status: 400 });
    }
    if (!verifyPhoneActivationToken(tenant.id, body.accessCode)) {
      return NextResponse.json({ error: "Código de activación inválido." }, { status: 401 });
    }

    const assignedEmail = requireAssignedPhoneAgent(tenant.id, body.email);
    const session = createPhoneSession(tenant.id, assignedEmail);
    const response = NextResponse.json({ ok: true });
    response.cookies.set(PHONE_SESSION_COOKIE, session.token, {
      httpOnly: true,
      secure: true,
      sameSite: "strict",
      path: "/api/telephony/agent",
      maxAge: session.maxAge,
    });
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    if (error instanceof TenantResolutionError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof PhoneAgentConfigurationError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    if (error instanceof PhoneAgentForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : "No fue posible activar la telefonía." }, { status: 400 });
  }
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(PHONE_SESSION_COOKIE, "", {
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    path: "/api/telephony/agent",
    maxAge: 0,
  });
  response.headers.set("Cache-Control", "no-store");
  return response;
}
