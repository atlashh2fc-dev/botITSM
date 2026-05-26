import { findKnowledgeMatches } from "@/data/mock/knowledgeBase";
import {
  buildTicketDraft,
  detectIntent,
  determinePriority,
  extractFields,
  getMissingFields,
  isResolvedMessage,
  shouldCreateTicketFromMessage,
} from "@/lib/itsm/engine";
import type { ITSMIntent, ITSMResponse, ITSMResponseInput, SessionContext } from "@/lib/itsm/types";

export async function generateMockITSMResponse(input: ITSMResponseInput): Promise<ITSMResponse> {
  const mergedContext: SessionContext = {
    ...input.sessionContext,
    collectedFields: extractFields(input.userMessage, input.sessionContext),
  };
  const detectedIntent = input.detectedIntent ?? detectIntent(input.userMessage);
  const priority = determinePriority(input.userMessage, detectedIntent, mergedContext);
  const knowledgeMatches = input.knowledgeMatches.length
    ? input.knowledgeMatches
    : findKnowledgeMatches(input.userMessage, detectedIntent);
  const article = knowledgeMatches[0];
  const requiredFields = getMissingFields(mergedContext, priority);
  const ticketDraft = buildTicketDraft({
    message: input.userMessage,
    intent: detectedIntent,
    priority,
    article,
    context: mergedContext,
  });
  const shouldEscalate =
    priority === "P1" || detectedIntent === "SECURITY_INCIDENT" || shouldCreateTicketFromMessage(input.userMessage, priority, detectedIntent);
  const shouldCreateTicket = shouldEscalate && !isResolvedMessage(input.userMessage);

  if (isGreetingOnly(input.userMessage)) {
    return {
      assistantMessage: "Hola. ¿Qué necesitas resolver?",
      classification: detectedIntent,
      priority,
      requiredFields: [],
      suggestedActions: ["Esperar descripción del caso"],
      operationalStatuses: ["Detectando intención"],
      shouldCreateTicket: false,
      shouldEscalate: false,
      ticketDraft,
    };
  }

  if (isResolvedMessage(input.userMessage)) {
    return {
      assistantMessage:
        "Perfecto, lo dejo cerrado. Si vuelve a ocurrir, escríbeme el sistema afectado y el mensaje de error.",
      classification: detectedIntent,
      priority,
      requiredFields: [],
      suggestedActions: ["Registrar cierre autónomo", "Actualizar base de conocimiento si aplica"],
      operationalStatuses: ["Detectando intención", "Consultando base de conocimiento", "Cerrando caso"],
      shouldCreateTicket: false,
      shouldEscalate: false,
      ticketDraft: { ...ticketDraft, status: "resolved" },
    };
  }

  return {
    assistantMessage: buildConciergeMessage({
      intent: detectedIntent,
      message: input.userMessage,
      requiredFields,
      shouldCreateTicket,
    }),
    classification: detectedIntent,
    priority,
    requiredFields,
    suggestedActions: article?.resolutionSteps ?? ["Recopilar contexto", "Clasificar prioridad", "Escalar si persiste"],
    operationalStatuses: shouldCreateTicket
      ? ["Detectando intención", "Consultando base de conocimiento", "Preparando ticket"]
      : ["Detectando intención", "Consultando base de conocimiento", "Ejecutando guía de descarte"],
    shouldCreateTicket,
    shouldEscalate,
    ticketDraft,
  };
}

function buildConciergeMessage({
  intent,
  message,
  requiredFields,
  shouldCreateTicket,
}: {
  intent: ITSMIntent;
  message: string;
  requiredFields: string[];
  shouldCreateTicket: boolean;
}) {
  if (shouldCreateTicket) {
    return [
      "Entendido. Lo dejo listo para derivar con el contexto actual.",
      requiredFields.length ? `Confírmame solo esto: ${requiredFields.join(", ")}.` : "Te aviso el siguiente paso apenas quede registrado.",
    ].join("\n\n");
  }

  const introByIntent: Record<ITSMIntent, string> = {
    INCIDENT: "Te ayudo. Necesito ubicar el impacto.",
    SERVICE_REQUEST: "Te ayudo. Revisemos lo mínimo para gestionarlo.",
    ACCESS_REQUEST: "Te ayudo con el acceso.",
    SOFTWARE_REQUEST: "Te ayudo con la instalación.",
    HARDWARE_ISSUE: "Te ayudo. Aislemos la causa.",
    NETWORK_ISSUE: "Te ayudo con la conectividad.",
    SECURITY_INCIDENT: "Lo tomo con prioridad. Evita hacer cambios por ahora.",
    HUMAN_ESCALATION: "Puedo derivarlo con contexto.",
  };

  const questionsByIntent: Record<ITSMIntent, string> = {
    INCIDENT: "¿Qué sistema falla y afecta solo a tu usuario o a más personas?",
    SERVICE_REQUEST: "Cuéntame qué necesitas resolver.",
    ACCESS_REQUEST: "¿A qué sistema o carpeta necesitas entrar y ya está aprobado?",
    SOFTWARE_REQUEST: "¿Qué software necesitas y en qué equipo?",
    HARDWARE_ISSUE: "¿Desde cuándo pasa y afecta todo el equipo o una app?",
    NETWORK_ISSUE: "¿Estás por VPN, Wi-Fi o cable, y qué error aparece?",
    SECURITY_INCIDENT: "¿Qué viste y qué servicio está afectado?",
    HUMAN_ESCALATION: "¿Qué debe revisar soporte y qué tan urgente es?",
  };

  return [
    introByIntent[intent],
    hardwareQuestion(message) ?? questionsByIntent[intent],
  ]
    .filter(Boolean)
    .join("\n\n");
}

function hardwareQuestion(message: string) {
  const text = message.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  if (text.includes("mouse") || text.includes("raton")) {
    return "¿Es USB o inalámbrico, y el equipo lo detecta al conectarlo?";
  }

  if (text.includes("teclado")) {
    return "¿Es USB o inalámbrico, y falla completo o solo algunas teclas?";
  }

  if (text.includes("monitor") || text.includes("pantalla")) {
    return "¿El monitor enciende y el cable queda bien conectado al equipo?";
  }

  if (text.includes("impresora")) {
    return "¿La impresora aparece conectada y te muestra algún error?";
  }

  return undefined;
}

function isGreetingOnly(message: string) {
  const text = message.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return /^(hola|buenas|buenos dias|buenas tardes|buenas noches|hello|hi)[.!¡! ]*$/.test(text);
}
