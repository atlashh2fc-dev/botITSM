import { AsyncLocalStorage } from "node:async_hooks";
import { requireTenant, type Tenant } from "@/lib/tenant/server";

const tenantStore = new AsyncLocalStorage<Tenant>();

export function currentTenant(): Tenant | undefined {
  return tenantStore.getStore();
}

export function withTenant<T>(request: Request, operation: () => T): T {
  return tenantStore.run(requireTenant(request), operation);
}
