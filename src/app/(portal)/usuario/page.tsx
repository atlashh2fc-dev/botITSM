import { SupportPortal } from "@/components/portal/SupportPortal";
import { getTenantByHost } from "@/lib/tenant/server";
import { headers } from "next/headers";
import { notFound } from "next/navigation";

export default async function UsuarioPage() {
  const requestHeaders = await headers();
  const tenant = getTenantByHost(requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host"));
  if (!tenant) notFound();
  return <SupportPortal tenantId={tenant.id} />;
}
