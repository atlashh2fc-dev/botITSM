"use client";

import { resolveBuiltInTenantIdByHost, type TenantId } from "@/lib/tenant/hosts";

export type ClientTenant = {
  id: TenantId;
  name: string;
  itsmBaseUrl: string;
  botLoginUrl: string;
};

const CLIENT_TENANTS: Record<TenantId, ClientTenant> = {
  geimser: {
    id: "geimser",
    name: "Geimser",
    itsmBaseUrl: "https://itsm.geimser.cl",
    botLoginUrl: "https://itsm.geimser.cl/geimser/bot/login",
  },
  forum: {
    id: "forum",
    name: "Forum",
    itsmBaseUrl: "https://mda.demoitsm.cl",
    botLoginUrl: "https://mda.demoitsm.cl/geimser/bot/login",
  },
};

export function resolveClientTenant(hostname: string): ClientTenant | null {
  const tenantId = resolveBuiltInTenantIdByHost(hostname);
  return tenantId ? CLIENT_TENANTS[tenantId] : null;
}

/**
 * Client-side companion to the server tenant resolver. The host is the only
 * input: query strings and browser storage never select an ITSM tenant.
 */
export function getClientTenant(serverTenantId?: TenantId): ClientTenant {
  // Client components are pre-rendered without request headers. Preserve the
  // existing placeholder only for callers not yet supplied a server hint. The
  // assistant surfaces pass the host-derived hint and never render another
  // tenant's branding while hydration is pending.
  if (typeof window === "undefined") return CLIENT_TENANTS[serverTenantId ?? "geimser"];

  const tenant = resolveClientTenant(window.location.hostname);
  if (!tenant) throw new ClientTenantResolutionError(window.location.hostname);
  if (serverTenantId && tenant.id !== serverTenantId) {
    throw new ClientTenantResolutionError(window.location.hostname);
  }
  return tenant;
}

export class ClientTenantResolutionError extends Error {
  constructor(hostname: string) {
    super(`Dominio no registrado para este portal ITSM: ${hostname}`);
    this.name = "ClientTenantResolutionError";
  }
}

/** Prevent a browser profile from reusing one tenant's local chat/session in another tenant. */
export function tenantStorageKey(key: string) {
  return `${key}:${getClientTenant().id}`;
}
