import { AsyncLocalStorage } from "node:async_hooks";
import { NextResponse } from "next/server";
import {
  identityHasAnyRole,
  ITSMAuthenticationError,
  ITSMConfigurationError,
  ITSMForbiddenError,
  type ITSMIdentity,
  type ITSMRole,
  verifyITSMSessionToken,
} from "@/lib/auth/assertion";
import { withTenant } from "@/lib/tenant/context";
import { requireTenant, TenantResolutionError } from "@/lib/tenant/server";

export const ITSM_SESSION_COOKIE = "atlas_itsm_session";
export const ITSM_SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: "none" as const,
  path: "/",
};

const identityStore = new AsyncLocalStorage<ITSMIdentity>();

export function currentITSMIdentity() {
  return identityStore.getStore();
}

export function requireCurrentITSMIdentity() {
  const identity = currentITSMIdentity();
  if (!identity) throw new ITSMAuthenticationError("Debes iniciar sesión en ITSM.");
  return identity;
}

export function readCookie(request: Request, name: string) {
  const cookieHeader = request.headers.get("cookie") ?? "";
  for (const part of cookieHeader.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    if (part.slice(0, separator).trim() === name) {
      return decodeURIComponent(part.slice(separator + 1).trim());
    }
  }
  return "";
}

export function authenticateITSMRequest(request: Request, roles: ITSMRole[] = ["customer", "agent"]) {
  const tenant = requireTenant(request);
  const token = readCookie(request, ITSM_SESSION_COOKIE);
  if (!token) throw new ITSMAuthenticationError("Debes iniciar sesión en ITSM.");
  const identity = verifyITSMSessionToken(token, tenant.id);
  if (!identityHasAnyRole(identity, roles)) throw new ITSMForbiddenError("No tienes permisos para esta operación.");
  return identity;
}

function requireSameOriginMutation(request: Request) {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method.toUpperCase())) return;
  const origin = request.headers.get("origin");
  const expected = new URL(request.url).origin;
  if (!origin || origin !== expected) throw new ITSMForbiddenError("Origen de solicitud no autorizado.");
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.includes("application/json")) throw new ITSMForbiddenError("Tipo de contenido no autorizado.");
}

export async function withApiAuth(
  request: Request,
  options: { roles?: ITSMRole[]; sameOriginMutation?: boolean },
  operation: () => Promise<Response> | Response,
): Promise<Response> {
  try {
    const identity = authenticateITSMRequest(request, options.roles);
    if (options.sameOriginMutation !== false) requireSameOriginMutation(request);
    const response = await withTenant(request, () => identityStore.run(identity, operation));
    response.headers.set("Cache-Control", "private, no-store, max-age=0");
    response.headers.set("Vary", "Cookie, Host");
    return response;
  } catch (error) {
    if (error instanceof TenantResolutionError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof ITSMAuthenticationError) {
      return NextResponse.json({ error: error.message }, { status: 401, headers: { "Cache-Control": "no-store" } });
    }
    if (error instanceof ITSMForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: 403, headers: { "Cache-Control": "no-store" } });
    }
    if (error instanceof ITSMConfigurationError) {
      return NextResponse.json({ error: error.message }, { status: 503, headers: { "Cache-Control": "no-store" } });
    }
    throw error;
  }
}

