"use client";

import type { TenantId } from "@/lib/tenant/server";

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
    itsmBaseUrl: "https://atlasitsm.geimser.cl",
    botLoginUrl: "https://atlasitsm.geimser.cl/geimser/bot/login",
  },
};

const HOST_TENANTS: Record<string, TenantId> = {
  "iabot.geimser.cl": "geimser",
  "iabot.atlasitsm.geimser.cl": "forum",
};

/**
 * Client-side companion to the server tenant resolver. The host is the only
 * input: query strings and browser storage never select an ITSM tenant.
 */
export function getClientTenant(): ClientTenant {
  const host = typeof window === "undefined" ? "" : window.location.hostname.toLowerCase();
  return CLIENT_TENANTS[HOST_TENANTS[host] ?? "geimser"];
}

/** Prevent a browser profile from reusing one tenant's local chat/session in another tenant. */
export function tenantStorageKey(key: string) {
  return `${key}:${getClientTenant().id}`;
}
