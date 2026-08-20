import { createHmac, timingSafeEqual } from "node:crypto";
import type { TenantId } from "@/lib/tenant/server";

const ASSERTION_MAX_LIFETIME_SECONDS = 5 * 60;
const SESSION_LIFETIME_SECONDS = 8 * 60 * 60;
const CLOCK_SKEW_SECONDS = 30;

export type ITSMRole = "admin" | "agent" | "customer";

export type ITSMIdentity = {
  tenantId: TenantId;
  subject: string;
  email: string;
  name: string;
  roles: ITSMRole[];
};

type SignedIdentityPayload = {
  v: 1;
  kind?: "assertion" | "session";
  tenant: TenantId;
  sub: string;
  email: string;
  name: string;
  roles: ITSMRole[];
  iat: number;
  exp: number;
  jti: string;
};

export class ITSMAuthenticationError extends Error {}
export class ITSMConfigurationError extends Error {}
export class ITSMForbiddenError extends Error {}

function signingSecret(tenantId: TenantId): string {
  const secret = (
    process.env[`ITSM_BOT_${tenantId.toUpperCase()}_SESSION_SECRET`]
    ?? ""
  ).trim();
  if (secret.length < 32) {
    throw new ITSMConfigurationError(`La sesión ITSM de ${tenantId} no está configurada.`);
  }
  return secret;
}

function base64UrlJson(value: SignedIdentityPayload) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function signature(encodedPayload: string, tenantId: TenantId) {
  return createHmac("sha256", signingSecret(tenantId))
    .update(encodedPayload, "ascii")
    .digest("base64url");
}

function constantTimeEqual(left: string, right: string) {
  const a = Buffer.from(left, "ascii");
  const b = Buffer.from(right, "ascii");
  return a.length === b.length && timingSafeEqual(a, b);
}

function parseToken(token: string, tenantId: TenantId): SignedIdentityPayload {
  const [encoded, suppliedSignature, extra] = token.trim().split(".");
  if (!encoded || !suppliedSignature || extra) throw new ITSMAuthenticationError("Sesión ITSM inválida.");
  if (!constantTimeEqual(signature(encoded, tenantId), suppliedSignature)) {
    throw new ITSMAuthenticationError("Sesión ITSM inválida.");
  }

  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    throw new ITSMAuthenticationError("Sesión ITSM inválida.");
  }
  if (!isSignedIdentityPayload(payload) || payload.tenant !== tenantId) {
    throw new ITSMAuthenticationError("Sesión ITSM inválida.");
  }
  return payload;
}

function isSignedIdentityPayload(value: unknown): value is SignedIdentityPayload {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<SignedIdentityPayload>;
  return candidate.v === 1
    && (candidate.tenant === "forum" || candidate.tenant === "geimser")
    && typeof candidate.sub === "string"
    && candidate.sub.length > 0
    && typeof candidate.email === "string"
    && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidate.email)
    && typeof candidate.name === "string"
    && Array.isArray(candidate.roles)
    && candidate.roles.length > 0
    && candidate.roles.every(role => role === "admin" || role === "agent" || role === "customer")
    && Number.isInteger(candidate.iat)
    && Number.isInteger(candidate.exp)
    && typeof candidate.jti === "string"
    && candidate.jti.length >= 16;
}

function validateTimes(payload: SignedIdentityPayload, maxLifetime: number, nowSeconds: number) {
  if (payload.iat > nowSeconds + CLOCK_SKEW_SECONDS) throw new ITSMAuthenticationError("Sesión ITSM inválida.");
  if (payload.exp <= nowSeconds - CLOCK_SKEW_SECONDS) throw new ITSMAuthenticationError("Sesión ITSM expirada.");
  if (payload.exp <= payload.iat || payload.exp - payload.iat > maxLifetime) {
    throw new ITSMAuthenticationError("Sesión ITSM inválida.");
  }
}

function toIdentity(payload: SignedIdentityPayload): ITSMIdentity {
  return {
    tenantId: payload.tenant,
    subject: payload.sub,
    email: payload.email.trim().toLowerCase(),
    name: payload.name.trim() || payload.email.trim().toLowerCase(),
    roles: Array.from(new Set(payload.roles)),
  };
}

/** Validates the short-lived proof issued by the authenticated Zammad session. */
export function verifyITSMAssertion(token: string, tenantId: TenantId, nowSeconds = Math.floor(Date.now() / 1000)) {
  const payload = parseToken(token, tenantId);
  if (payload.kind && payload.kind !== "assertion") throw new ITSMAuthenticationError("Assertion ITSM inválida.");
  validateTimes(payload, ASSERTION_MAX_LIFETIME_SECONDS, nowSeconds);
  return toIdentity(payload);
}

/** Exchanges the assertion for a tenant-bound, HttpOnly bot session. */
export function createITSMSessionToken(identity: ITSMIdentity, nowSeconds = Math.floor(Date.now() / 1000)) {
  const payload: SignedIdentityPayload = {
    v: 1,
    kind: "session",
    tenant: identity.tenantId,
    sub: identity.subject,
    email: identity.email.trim().toLowerCase(),
    name: identity.name.trim(),
    roles: identity.roles,
    iat: nowSeconds,
    exp: nowSeconds + SESSION_LIFETIME_SECONDS,
    jti: crypto.randomUUID(),
  };
  const encoded = base64UrlJson(payload);
  return {
    token: `${encoded}.${signature(encoded, identity.tenantId)}`,
    maxAge: SESSION_LIFETIME_SECONDS,
  };
}

export function verifyITSMSessionToken(token: string, tenantId: TenantId, nowSeconds = Math.floor(Date.now() / 1000)) {
  const payload = parseToken(token, tenantId);
  if (payload.kind !== "session") throw new ITSMAuthenticationError("Sesión ITSM inválida.");
  validateTimes(payload, SESSION_LIFETIME_SECONDS, nowSeconds);
  return toIdentity(payload);
}

export function identityHasAnyRole(identity: ITSMIdentity, roles: ITSMRole[]) {
  if (identity.roles.includes("admin")) return true;
  return roles.some(role => identity.roles.includes(role));
}
