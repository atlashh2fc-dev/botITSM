import { SondaAssistant } from "@/components/chat/AtlasAssistant";

/** Minimal surface for the installed desktop client: only the Forum assistant. */
export default async function AssistantPage({
  searchParams,
}: {
  searchParams: Promise<{ desktop?: string }>;
}) {
  const { desktop } = await searchParams;
  const isDesktopClient = desktop === "1";

  return (
    <main
      data-desktop-assistant={isDesktopClient ? "true" : undefined}
      aria-label="Asistente ITSM Forum"
      style={{ minHeight: "100dvh", overflow: "hidden", background: isDesktopClient ? "transparent" : "#07101d", display: isDesktopClient ? "grid" : undefined, placeItems: isDesktopClient ? "center" : undefined }}
    >
      <SondaAssistant standalone desktop={isDesktopClient} />
    </main>
  );
}
