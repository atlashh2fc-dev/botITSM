import { FieldCopilotApp } from "@/components/field/FieldCopilotApp";
import { AgentSessionGate } from "@/components/auth/AgentSessionGate";

export default function MobilePage() {
  return <AgentSessionGate><FieldCopilotApp /></AgentSessionGate>;
}
