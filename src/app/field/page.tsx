import { FieldCopilotApp } from "@/components/field/FieldCopilotApp";
import { AgentSessionGate } from "@/components/auth/AgentSessionGate";

export default function FieldPage() {
  return <AgentSessionGate><FieldCopilotApp /></AgentSessionGate>;
}
