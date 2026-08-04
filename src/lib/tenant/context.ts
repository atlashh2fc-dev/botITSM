import { AsyncLocalStorage } from "node:async_hooks";
import { requireTenant, TenantResolutionError, type Tenant } from "@/lib/tenant/server";

const tenantStore = new AsyncLocalStorage<Tenant>();

export function currentTenant(): Tenant | undefined {
  return tenantStore.getStore();
}

/**
 * Data repositories must never guess a tenant or fall back to shared data.
 * Every request that touches persisted tenant data enters through withTenant.
 */
export function requireCurrentTenant(): Tenant {
  const tenant = currentTenant();
  if (!tenant) throw new TenantResolutionError();
  return tenant;
}

export function withTenant<T>(request: Request, operation: () => T): T {
  return tenantStore.run(requireTenant(request), operation);
}
