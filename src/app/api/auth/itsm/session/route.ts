import { NextResponse } from "next/server";
import {
  createITSMSessionToken,
  ITSMAuthenticationError,
  ITSMConfigurationError,
  verifyITSMAssertion,
} from "@/lib/auth/assertion";
import {
  authenticateITSMRequest,
  ITSM_SESSION_COOKIE,
  ITSM_SESSION_COOKIE_OPTIONS,
} from "@/lib/auth/apiAuth";
import { requireTenant, TenantResolutionError } from "@/lib/tenant/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const tenant = requireTenant(request);
    const origin = request.headers.get("origin");
    if (!origin || origin !== new URL(request.url).origin) {
      return NextResponse.json({ error: "Origen de solicitud no autorizado." }, { status: 403 });
    }
    if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
      return NextResponse.json({ error: "Tipo de contenido no autorizado." }, { status: 415 });
    }
    const body = await request.json().catch(() => null) as { assertion?: unknown } | null;
    if (typeof body?.assertion !== "string" || body.assertion.length > 8192) {
      return NextResponse.json({ error: "Assertion ITSM requerida." }, { status: 400 });
    }

    const identity = verifyITSMAssertion(body.assertion, tenant.id);
    const session = createITSMSessionToken(identity);
    const response = NextResponse.json({
      authenticated: true,
      user: { email: identity.email, name: identity.name, roles: identity.roles },
    });
    response.cookies.set(ITSM_SESSION_COOKIE, session.token, {
      ...ITSM_SESSION_COOKIE_OPTIONS,
      maxAge: session.maxAge,
    });
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    if (error instanceof TenantResolutionError) return NextResponse.json({ error: error.message }, { status: 404 });
    if (error instanceof ITSMAuthenticationError) return NextResponse.json({ error: error.message }, { status: 401 });
    if (error instanceof ITSMConfigurationError) return NextResponse.json({ error: error.message }, { status: 503 });
    return NextResponse.json({ error: "No fue posible iniciar la sesión ITSM." }, { status: 500 });
  }
}

export async function GET(request: Request) {
  try {
    const identity = authenticateITSMRequest(request);
    return NextResponse.json({
      authenticated: true,
      user: { email: identity.email, name: identity.name, roles: identity.roles },
    }, { headers: { "Cache-Control": "private, no-store, max-age=0" } });
  } catch (error) {
    if (error instanceof TenantResolutionError) return NextResponse.json({ authenticated: false }, { status: 404 });
    if (error instanceof ITSMConfigurationError) return NextResponse.json({ authenticated: false, error: error.message }, { status: 503 });
    return NextResponse.json({ authenticated: false }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }
}

export async function DELETE(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) {
    return NextResponse.json({ error: "Origen de solicitud no autorizado." }, { status: 403 });
  }
  const response = NextResponse.json({ ok: true });
  response.cookies.set(ITSM_SESSION_COOKIE, "", { ...ITSM_SESSION_COOKIE_OPTIONS, maxAge: 0 });
  response.headers.set("Cache-Control", "no-store");
  return response;
}

