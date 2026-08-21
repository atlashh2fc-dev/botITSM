import { SondaAssistant } from "@/components/chat/AtlasAssistant";
import { getTenantByHost } from "@/lib/tenant/server";
import { headers } from "next/headers";
import { notFound } from "next/navigation";

/** Minimal surface for the installed desktop client: only the Forum assistant. */
export default async function AssistantPage({
  searchParams,
}: {
  searchParams: Promise<{ desktop?: string }>;
}) {
  const { desktop } = await searchParams;
  const isDesktopClient = desktop === "1";
  const requestHeaders = await headers();
  const tenant = getTenantByHost(requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host"));
  if (!tenant) notFound();

  return (
    <main
      data-desktop-assistant={isDesktopClient ? "true" : undefined}
      aria-label="Asistente ITSM Forum"
      style={{ minHeight: "100dvh", overflow: "hidden", background: isDesktopClient ? "transparent" : "#07101d", display: isDesktopClient ? "grid" : undefined, placeItems: isDesktopClient ? "center" : undefined }}
    >
      <SondaAssistant standalone desktop={isDesktopClient} tenantId={tenant.id} />
    </main>
  );
}
