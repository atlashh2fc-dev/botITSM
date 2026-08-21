import { TecnicoCopilot } from "@/components/field/TecnicoCopilot";
import { AgentSessionGate } from "@/components/auth/AgentSessionGate";

export default function TecnicoPage() {
  return <AgentSessionGate><TecnicoCopilot /></AgentSessionGate>;
}
