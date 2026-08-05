import { SondaAssistant } from "@/components/chat/AtlasAssistant";

/** Minimal surface for the installed desktop client: only the Forum assistant. */
export default function AssistantPage() {
  return (
    <main data-desktop-assistant aria-label="Asistente ITSM Forum" style={{ minHeight: "100dvh", overflow: "hidden", background: "transparent" }}>
      <SondaAssistant standalone />
    </main>
  );
}
