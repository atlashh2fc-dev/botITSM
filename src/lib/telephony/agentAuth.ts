import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import type { TenantId } from "@/lib/tenant/server";

export const PHONE_SESSION_COOKIE = "atlas_phone_session";
export const PHONE_SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: "strict" as const,
  path: "/api/telephony/agent",
};
const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;

type PhoneSession = {
  tenantId: TenantId;
  email: string;
  expiresAt: number;
};

export class PhoneAgentConfigurationError extends Error {}

export class PhoneAgentForbiddenError extends Error {
  constructor() {
    super("Esta cuenta no tiene un puesto telefónico asignado.");
  }
}

function sessionSecret(tenantId: TenantId): string {
  const secret = process.env[`TELEPHONY_${tenantId.toUpperCase()}_AGENT_SESSION_SECRET`]?.trim();
  if (!secret || secret.length < 32) {
    throw new PhoneAgentConfigurationError("La sesión del softphone no está configurada.");
  }
  return secret;
}

function activationToken(tenantId: TenantId): string {
  const token = process.env[`TELEPHONY_${tenantId.toUpperCase()}_AGENT_ACCESS_TOKEN`]?.trim();
  if (!token || token.length < 24) {
    throw new PhoneAgentConfigurationError("La activación del softphone no está configurada.");
  }
  return token;
}

function constantTimeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function sign(encodedPayload: string, tenantId: TenantId): string {
  return createHmac("sha256", sessionSecret(tenantId)).update(encodedPayload).digest("base64url");
}

export function verifyPhoneActivationToken(tenantId: TenantId, supplied: string): boolean {
  return constantTimeEqual(activationToken(tenantId), supplied.trim());
}

export function requireAssignedPhoneAgent(tenantId: TenantId, email: string): string {
  const normalizedEmail = email.trim().toLowerCase();
  const configuredEmails = process.env[`TELEPHONY_${tenantId.toUpperCase()}_AGENT_EMAILS`]
    ?.split(",")
    .map(value => value.trim().toLowerCase())
    .filter(Boolean) ?? [];

  if (configuredEmails.length === 0) {
    throw new PhoneAgentConfigurationError("No hay agentes telefónicos asignados.");
  }
  if (!configuredEmails.includes(normalizedEmail)) {
    throw new PhoneAgentForbiddenError();
  }
  return normalizedEmail;
}

export function createPhoneSession(tenantId: TenantId, email: string): {
  token: string;
  maxAge: number;
} {
  const normalizedEmail = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    throw new Error("Correo de agente inválido.");
  }

  const payload: PhoneSession = {
    tenantId,
    email: normalizedEmail,
    expiresAt: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return { token: `${encoded}.${sign(encoded, tenantId)}`, maxAge: SESSION_TTL_SECONDS };
}

export function requirePhoneSession(request: NextRequest, tenantId: TenantId): PhoneSession {
  const token = request.cookies.get(PHONE_SESSION_COOKIE)?.value ?? "";
  const [encoded, suppliedSignature, extra] = token.split(".");
  if (!encoded || !suppliedSignature || extra) throw new PhoneAgentUnauthorizedError();

  const expectedSignature = sign(encoded, tenantId);
  if (!constantTimeEqual(expectedSignature, suppliedSignature)) throw new PhoneAgentUnauthorizedError();

  let payload: PhoneSession;
  try {
    payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as PhoneSession;
  } catch {
    throw new PhoneAgentUnauthorizedError();
  }

  if (
    payload.tenantId !== tenantId
    || !payload.email
    || payload.expiresAt <= Math.floor(Date.now() / 1000)
  ) {
    throw new PhoneAgentUnauthorizedError();
  }
  return payload;
}

export class PhoneAgentUnauthorizedError extends Error {
  constructor() {
    super("Debes activar la telefonía para esta sesión.");
  }
}
