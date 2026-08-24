import { AdminDashboard } from "@/components/admin/AdminDashboard";
import { getTenantByHost } from "@/lib/tenant/server";
import { headers } from "next/headers";
import { notFound } from "next/navigation";

export default async function RealtimeDashboardPage() {
  const requestHeaders = await headers();
  const tenant = getTenantByHost(requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host"));
  if (!tenant) notFound();
  return <AdminDashboard initialSection="realtime" tenantId={tenant.id} />;
}
