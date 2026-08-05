import { demoITSMAdapter } from "@/lib/itsm/adapters/demoAdapter";
import { zammadITSMAdapter } from "@/lib/itsm/adapters/zammadAdapter";
import { hasZammadConfig } from "@/lib/zammad/client";
import type { ITSMAdapter, ITSMCreateTicketInput, ITSMCreateTicketResult, ITSMProvider } from "@/lib/itsm/adapters/types";

const adapters: Record<ITSMProvider, ITSMAdapter | undefined> = {
  demo: demoITSMAdapter,
  zammad: zammadITSMAdapter,
  servicenow: undefined,
  "jira-service-management": undefined,
  freshservice: undefined,
  glpi: undefined,
};

export async function createTicketThroughITSM(input: ITSMCreateTicketInput): Promise<ITSMCreateTicketResult> {
  const adapter = resolveAdapter();

  try {
    return await adapter.createTicket(input);
  } catch (error) {
    // Un fallo del ITSM real no debe aparentar que el ticket fue creado:
    // evita registros locales que no existen en Zammad.
    console.error(`[itsmGateway] ${adapter.provider} falló al crear ticket:`, error);
    throw error;
  }
}

export function resolveAdapter() {
  const provider = resolveProvider();
  return adapters[provider] ?? demoITSMAdapter;
}

function resolveProvider(): ITSMProvider {
  const configured = process.env.ITSM_PROVIDER?.trim().toLowerCase();

  if (
    configured === "zammad" ||
    configured === "servicenow" ||
    configured === "jira-service-management" ||
    configured === "freshservice" ||
    configured === "glpi"
  ) {
    return configured;
  }

  // Sin configuración explícita: si hay credenciales Zammad, usarlas.
  if (!configured && hasZammadConfig()) {
    return "zammad";
  }

  return "demo";
}
