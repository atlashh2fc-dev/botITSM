/** Server-only tenant resolution. Tenant identity always comes from the host,
 * never from a browser supplied query/body parameter. */
export type TenantId = "geimser" | "forum";

export type Tenant = {
  id: TenantId;
  name: string;
  host: string;
  zammadBaseUrl?: string;
  zammadApiToken?: string;
  zammadGroup: string;
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
    cmdbToken: process.env.GEIMSER_CMDB_TOKEN,
  },
  forum: {
    id: "forum",
    name: "Forum",
    zammadBaseUrl: process.env.ZAMMAD_FORUM_BASE_URL,
    zammadApiToken: process.env.ZAMMAD_FORUM_API_TOKEN,
    zammadGroup: process.env.ZAMMAD_FORUM_GROUP || "Users",
    cmdbToken: process.env.FORUM_CMDB_TOKEN,
  },
};

const DEFAULT_HOSTS: Record<TenantId, string[]> = {
  geimser: ["iabot.geimser.cl"],
  forum: ["iabot.atlasitsm.geimser.cl"],
};

function hostsFor(tenant: TenantId) {
  const configured = process.env["TENANT_" + tenant.toUpperCase() + "_HOSTS"];
  return (configured ? configured.split(",") : DEFAULT_HOSTS[tenant])
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);
}

export function getTenantByHost(hostHeader: string | null): Tenant | null {
  const host = (hostHeader ?? "").split(":")[0].trim().toLowerCase();
  const tenantId = (Object.keys(TENANTS) as TenantId[]).find((id) => hostsFor(id).includes(host));
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
