import { TecnicoCopilot } from "@/components/field/TecnicoCopilot";
import { AgentSessionGate } from "@/components/auth/AgentSessionGate";
import { headers } from "next/headers";
import { getTenantByHost } from "@/lib/tenant/server";

export default async function TecnicoPage() {
  const requestHeaders = await headers();
  const tenant = getTenantByHost(requestHeaders.get("x-forwarded-host")?.split(",", 1)[0] ?? requestHeaders.get("host"));
  return <AgentSessionGate><TecnicoCopilot tenantId={tenant?.id ?? "geimser"} /></AgentSessionGate>;
}
