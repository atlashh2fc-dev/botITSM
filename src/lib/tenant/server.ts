/** Server-only tenant resolution. Tenant identity always comes from the host,
 * never from a browser supplied query/body parameter. */
import { configuredTenantHosts, normalizeTenantHost, TENANT_IDS, type TenantId } from "@/lib/tenant/hosts";

export type { TenantId } from "@/lib/tenant/hosts";

export type Tenant = {
  id: TenantId;
  name: string;
  host: string;
  zammadBaseUrl?: string;
  zammadApiToken?: string;
  zammadGroup: string;
  zammadGroups: string[];
  assetGroups: string[];
  zammadCtiUrl?: string;
  telephonyFallbackEmail?: string;
  cmdbToken?: string;
};

const TENANTS: Record<TenantId, Omit<Tenant, "host">> = {
  geimser: {
    id: "geimser",
    name: "Geimser",
    // The existing Geimser deployment used these names before multitenancy.
    // This compatibility path is deliberately Geimser-only: Forum must never
    // fall back to shared credentials or it could expose the wrong ITSM data.
    zammadBaseUrl: process.env.ZAMMAD_GEIMSER_BASE_URL ?? process.env.ZAMMAD_BASE_URL,
    zammadApiToken: process.env.ZAMMAD_GEIMSER_API_TOKEN ?? process.env.ZAMMAD_API_TOKEN,
    zammadGroup: process.env.ZAMMAD_GEIMSER_GROUP ?? process.env.ZAMMAD_GROUP ?? "Users",
    zammadGroups: configuredGroups("GEIMSER", process.env.ZAMMAD_GEIMSER_GROUP ?? process.env.ZAMMAD_GROUP ?? "Users"),
    assetGroups: configuredAssetGroups("GEIMSER"),
    zammadCtiUrl: process.env.ZAMMAD_GEIMSER_CTI_URL,
    telephonyFallbackEmail: process.env.TELEPHONY_GEIMSER_FALLBACK_EMAIL,
    cmdbToken: process.env.GEIMSER_CMDB_TOKEN,
  },
  forum: {
    id: "forum",
    name: "Forum",
    // Public, non-secret endpoint. Keep the environment override for staged
    // migrations, but provide the production Forum URL as a safe default.
    zammadBaseUrl: process.env.ZAMMAD_FORUM_BASE_URL ?? "https://mda.demoitsm.cl",
    zammadApiToken: process.env.ZAMMAD_FORUM_API_TOKEN,
    zammadGroup: process.env.ZAMMAD_FORUM_GROUP || "TI Forum",
    zammadGroups: configuredGroups("FORUM", process.env.ZAMMAD_FORUM_GROUP || "TI Forum"),
    assetGroups: configuredAssetGroups("FORUM"),
    zammadCtiUrl: process.env.ZAMMAD_FORUM_CTI_URL,
    telephonyFallbackEmail: process.env.TELEPHONY_FORUM_FALLBACK_EMAIL,
    cmdbToken: process.env.FORUM_CMDB_TOKEN,
  },
};

function commaSeparated(value?: string) {
  return Array.from(new Set((value ?? "").split(",").map(item => item.trim()).filter(Boolean)));
}

function configuredGroups(prefix: "GEIMSER" | "FORUM", fallback: string) {
  const groups = commaSeparated(process.env[`ZAMMAD_${prefix}_GROUPS`]);
  return groups.length ? groups : [fallback];
}

function configuredAssetGroups(prefix: "GEIMSER" | "FORUM") {
  return commaSeparated(process.env[`ZAMMAD_${prefix}_ASSET_GROUPS`]);
}

export function tenantAllowsZammadGroup(tenant: Tenant, group?: string) {
  const normalized = group?.trim().toLocaleLowerCase("es-CL");
  return Boolean(normalized && tenant.zammadGroups.some(allowed => allowed.toLocaleLowerCase("es-CL") === normalized));
}

export function tenantAllowsAssetGroup(tenant: Tenant, group?: string) {
  if (tenant.assetGroups.length === 0) return false;
  const normalized = group?.trim().toLocaleLowerCase("es-CL");
  return Boolean(normalized && tenant.assetGroups.some(allowed => allowed.toLocaleLowerCase("es-CL") === normalized));
}

function hostsFor(tenant: TenantId) {
  const configured = process.env["TENANT_" + tenant.toUpperCase() + "_HOSTS"];
  return configuredTenantHosts(tenant, configured);
}

export function getTenantByHost(hostHeader: string | null): Tenant | null {
  const host = normalizeTenantHost(hostHeader);
  const matches = TENANT_IDS.filter((tenantId) => hostsFor(tenantId).includes(host));
  // A missing or conflicting host assignment is unsafe: never choose a tenant
  // based on iteration order when configuration overlaps.
  const tenantId = matches.length === 1 ? matches[0] : null;
  return tenantId ? { ...TENANTS[tenantId], host } : null;
}

export function requireTenant(request: Request): Tenant {
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0] ?? null;
  const tenant = getTenantByHost(forwardedHost ?? request.headers.get("host"));
  if (!tenant) throw new TenantResolutionError();
  return tenant;
}

export class TenantResolutionError extends Error {
  constructor() {
    super("Dominio no registrado para este portal ITSM.");
  }
}
