export const TENANT_IDS = ["geimser", "forum"] as const;

export type TenantId = (typeof TENANT_IDS)[number];

/**
 * Hosts owned by each tenant that must work even when an environment override
 * is present. Forum keeps the aliases used by previously distributed desktop
 * installers so those clients cannot be rebranded as another tenant.
 */
export const BUILT_IN_TENANT_HOSTS: Record<TenantId, readonly string[]> = {
  geimser: ["iabot.geimser.cl"],
  forum: [
    "portal.demoitsm.cl",
    "iabot.demoitsm.cl",
    "iabot.mda.demoitsm.cl",
    "iabot.atlasitsm.geimser.cl",
  ],
};

export function normalizeTenantHost(hostHeader?: string | null) {
  const firstHost = (hostHeader ?? "").split(",", 1)[0]?.trim().toLowerCase() ?? "";
  return firstHost
    .replace(/^\[|\]$/g, "")
    .replace(/:\d+$/, "")
    .replace(/\.$/, "");
}

export function configuredTenantHosts(tenant: TenantId, configured?: string) {
  return Array.from(new Set([
    ...BUILT_IN_TENANT_HOSTS[tenant],
    ...(configured ?? "").split(","),
  ].map(normalizeTenantHost).filter(Boolean)));
}

export function resolveBuiltInTenantIdByHost(hostHeader?: string | null): TenantId | null {
  const host = normalizeTenantHost(hostHeader);
  if (!host) return null;

  const matches = TENANT_IDS.filter((tenant) => BUILT_IN_TENANT_HOSTS[tenant].includes(host));
  return matches.length === 1 ? matches[0] : null;
}
