import { findKnowledgeArticleById, findKnowledgeMatches } from "@/data/mock/knowledgeBase";
import {
  buildSoftwareDiagnostic,
  buildSoftwareEntitlementMessage,
  buildSoftwareTicketMessage,
  resolveSoftwareEntitlement,
} from "@/lib/itsm/corporateContext";
import {
  buildTicketDraft,
  detectIntent,
  determinePriority,
  extractFields,
  getMissingFields,
  isResolvedMessage,
  shouldCreateTicketFromMessage,
} from "@/lib/itsm/engine";
import { resolveServiceDeskTurn, type ServiceDeskTurn } from "@/lib/itsm/serviceDeskLayer";
import type { ITSMIntent, ITSMResponse, ITSMResponseInput, KnowledgeArticle, SessionContext } from "@/lib/itsm/types";

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
  const serviceDeskTurn = detectedIntent === "HARDWARE_ISSUE" ? resolveServiceDeskTurn(input.userMessage, input.sessionContext) : undefined;
  const serviceDeskArticle = findKnowledgeArticleById(serviceDeskTurn?.knowledgeArticleId);
  const article = serviceDeskArticle ?? knowledgeMatches[0];
  const requiredFields = getMissingFields(mergedContext, priority);
  const hasMinimumRequesterData = requiredFields.length === 0;
  const ticketDraft = buildTicketDraft({
    message: input.userMessage,
    intent: detectedIntent,
    priority,
    article,
    context: mergedContext,
  });
  const softwareEntitlement = detectedIntent === "SOFTWARE_REQUEST" ? resolveSoftwareEntitlement(input.userMessage, ticketDraft) : undefined;
  const softwareDiagnostic = softwareEntitlement ? buildSoftwareDiagnostic(softwareEntitlement) : undefined;
  const softwareReadyForTicket = Boolean(softwareDiagnostic?.facts.escalationReady);
  const baseShouldEscalate =
    priority === "P1" || detectedIntent === "SECURITY_INCIDENT" || shouldCreateTicketFromMessage(input.userMessage, priority, detectedIntent);
  const serviceDeskReadyForEscalation = serviceDeskTurn?.stage === "prepare_escalation";
  const shouldEscalate = serviceDeskTurn && serviceDeskTurn.stage !== "prepare_escalation" ? false : baseShouldEscalate || serviceDeskReadyForEscalation;
  const shouldCreateTicket =
    ((shouldEscalate || serviceDeskReadyForEscalation || softwareReadyForTicket) && hasMinimumRequesterData) && !isResolvedMessage(input.userMessage);
  if (isGreetingOnly(input.userMessage)) {
    const userName = mergedContext.collectedFields.nombre;
    const userArea = mergedContext.collectedFields.area;
    const greeting = userName
      ? `Hola:\n\nSoy el asistente de soporte TI de SONDA. Veo que estás registrado como ${userName}, del área de ${userArea || "Operaciones"}.\n\nCuéntame: ¿qué inconveniente estás teniendo hoy?`
      : "Hola:\n\nSoy el asistente de soporte TI de SONDA.\n\nCuéntame: ¿qué está pasando?";

    return {
      assistantMessage: greeting,
      classification: detectedIntent,
      priority,
      requiredFields: [],
      suggestedActions: ["Esperar descripción del caso"],
      operationalStatuses: ["Detectando intención"],
      shouldCreateTicket: false,
      shouldEscalate: false,
      diagnostic: serviceDeskTurn?.diagnostic ?? softwareDiagnostic,
      ticketDraft,
    };
  }

  if (isResolvedMessage(input.userMessage) && input.sessionContext.diagnostic?.stage !== "isolate_component") {
    return {
      assistantMessage:
        "Excelente:\n\nQué bueno saber que se solucionó con el descarte realizado.\n\nNecesito confirmar: ¿podemos dar por cerrado este caso aquí?",
      classification: detectedIntent,
      priority,
      requiredFields: [],
      suggestedActions: ["Confirmar resolución del caso", "Registrar cierre autónomo"],
      operationalStatuses: ["Detectando intención", "Consultando base de conocimiento", "Cerrando caso"],
      shouldCreateTicket: false,
      shouldEscalate: false,
      diagnostic: serviceDeskTurn?.diagnostic
        ? { ...serviceDeskTurn.diagnostic, stage: "resolved", facts: { ...serviceDeskTurn.diagnostic.facts, resolvedByUser: true } }
        : softwareDiagnostic
          ? { ...softwareDiagnostic, stage: "resolved", facts: { ...softwareDiagnostic.facts, resolvedByUser: true } }
          : undefined,
      ticketDraft: { ...ticketDraft, status: "resolved" },
    };
  }

  const assistantMessage = normalizeRequesterDataPrompt(
    buildOperationalMessage({
      intent: detectedIntent,
      article,
      requiredFields,
      shouldCreateTicket,
      serviceDeskTurn,
      softwareEntitlement,
    }),
    requiredFields,
    mergedContext,
  );

  return {
    assistantMessage,
    classification: detectedIntent,
    priority,
    requiredFields,
    suggestedActions:
      serviceDeskTurn?.suggestedActions ??
      softwareDiagnostic?.completedSteps ??
      (article?.resolutionSteps[0] ? [article.resolutionSteps[0]] : ["Recopilar contexto"]),
    operationalStatuses: shouldCreateTicket
      ? ["Detectando intención", "Consultando base de conocimiento", "Preparando ticket"]
      : ["Detectando intención", "Consultando base de conocimiento", "Ejecutando guía de descarte"],
    shouldCreateTicket,
    shouldEscalate,
    diagnostic: serviceDeskTurn?.diagnostic ?? softwareDiagnostic,
    ticketDraft,
  };
}

function buildOperationalMessage({
  intent,
  article,
  requiredFields,
  shouldCreateTicket,
  serviceDeskTurn,
  softwareEntitlement,
}: {
  intent: ITSMIntent;
  article?: KnowledgeArticle;
  requiredFields: string[];
  shouldCreateTicket: boolean;
  serviceDeskTurn?: ServiceDeskTurn;
  softwareEntitlement?: ReturnType<typeof resolveSoftwareEntitlement>;
}) {
  if (shouldCreateTicket) {
    if (softwareEntitlement) {
      return buildSoftwareTicketMessage(softwareEntitlement);
    }

    if (serviceDeskTurn?.stage === "prepare_escalation") {
      if (serviceDeskTurn.diagnostic.facts.physicalDamageDeclared) {
        const damagedAsset = serviceDeskTurn.asset === "external_monitor" ? "monitor o cable de video" : "activo afectado";
        return [
          "¡Listo! Caso registrado por daño físico declarado.",
          `El equipo de soporte recibirá la solicitud de revisión o reemplazo del ${damagedAsset}. No tendrás que hacer más pruebas sobre ese equipo.`,
        ].join("\n\n");
      }

      return [
        "Caso listo para derivar:",
        "Registré los descartes realizados, el síntoma principal y el activo afectado.",
        "Siguiente paso: soporte recibirá el contexto completo para que no tengas que repetir la información.",
      ].join("\n\n");
    }

    const firstStep = article?.resolutionSteps[0] ? formatStepForUser(article.resolutionSteps[0]) : undefined;

    return [
      firstStep ? `Siguiente paso: ${firstStep}` : "Siguiente paso: lo dejaré listo para derivar con el contexto actual.",
      requiredFields.length ? `Necesito confirmar: ${requiredFields.join(", ")}.` : "Estado: te aviso apenas quede registrado.",
    ].join("\n\n");
  }

  if (article?.id === "kb-excel-wont-open") {
    return "Qué detecté: problema al abrir Excel/Office.\n\nSiguiente paso: intenta abrir Excel en modo seguro para descartar complementos.\n\nNecesito confirmar: ¿falla solo Excel o también Word/Outlook?";
  }

  if (article?.id === "kb-account-locked") {
    return [
      "Entendido. Revisemos el acceso desde identidad corporativa.",
      "Intenta ingresar a https://identidad.geimser.cl y dime el mensaje exacto que aparece: cuenta bloqueada, contraseña expirada, credenciales incorrectas u otro aviso. Con eso decido si corresponde autoservicio o derivación.",
    ].join("\n\n");
  }

  if (intent === "SOFTWARE_REQUEST" && softwareEntitlement) {
    return buildSoftwareEntitlementMessage(softwareEntitlement, requiredFields);
  }

  if (intent === "HARDWARE_ISSUE" && serviceDeskTurn) {
    return serviceDeskTurn.response;
  }

  if (article?.resolutionSteps.length) {
    return [
      "Qué detecté: tengo una guía de descarte para este caso.",
      `Siguiente paso: ${formatStepForUser(article.resolutionSteps[0])}`,
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
    `Qué detecté: ${introByIntent[intent]}`,
    `Necesito confirmar: ${questionsByIntent[intent]}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

function normalizeText(message: string) {
  return message.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function normalizeRequesterDataPrompt(message: string, requiredFields: string[], context: SessionContext) {
  const hasIdentity = Boolean(context.collectedFields.correo && context.collectedFields.nombre);
  if (!hasIdentity) return message;

  const missing = requiredFields.filter((field) => !["nombre", "correo"].includes(field));
  const replacement = missing.length
    ? `Lo registraré con tu sesión ITSM. Si falta ${missing.join(", ")}, soporte lo completará desde el perfil del ITSM.`
    : "Lo registraré con los datos de tu sesión ITSM.";

  return message
    .replace(/Lo registraré como solicitud de reemplazo; confírmame nombre completo, correo y área si falta algún dato\./gi, replacement)
    .replace(/Para dejar el caso preparado con todos los descartes, ¿podrías darme tu nombre completo, correo y área\?/gi, replacement)
    .replace(/Para dejar constancia en la bitácora y cerrar este caso, confírmame tu nombre completo, correo y área\./gi, replacement)
    .replace(/Corresponde preparar reemplazo\. ¿Me das tu nombre completo, correo y área para registrar el caso con el descarte completo\?/gi, `Corresponde preparar reemplazo. ${replacement}`)
    .replace(/Debemos escalar el caso a soporte en terreno\. ¿Me das tu nombre completo, correo y área para registrar la solicitud con todo el detalle de las pruebas realizadas\?/gi, `Debemos escalar el caso a soporte en terreno. ${replacement}`)
    .replace(/Para dejar el caso preparado, ¿podrías darme tu nombre completo, correo y área\?/gi, replacement)
    .replace(/Corresponde escalarlo a soporte técnico en terreno\. ¿Me compartes tu nombre completo, correo y área para derivarlo de inmediato con todo el contexto\?/gi, `Corresponde escalarlo a soporte técnico en terreno. ${replacement}`)
    .replace(/Para dejar el caso registrado y derivarlo de inmediato con esta evidencia, ¿podrías darme tu nombre completo, correo y área\?/gi, replacement)
    .replace(/Procederemos a registrar el ticket de derivación técnica\. ¿Me confirmas tu nombre completo, correo y área\?/gi, `Procederemos a registrar el ticket de derivación técnica. ${replacement}`)
    .replace(/Procederemos a registrar el ticket de derivación técnica para soporte en terreno\. ¿Me confirmas tu nombre completo, correo y área\?/gi, `Procederemos a registrar el ticket de derivación técnica para soporte en terreno. ${replacement}`)
    .replace(/Para gestionar el envío del nuevo tóner con el área de logística, ¿me confirmas tu nombre completo, correo y área\?/gi, `Para gestionar el envío del nuevo tóner con logística. ${replacement}`)
    .replace(/¿Me confirmas tu nombre completo, correo y área\?/gi, replacement)
    .replace(/confírmame tu nombre completo, correo y área/gi, replacement);
}

function formatStepForUser(step: string) {
  return step
    .replace(/^Confirmar si el usuario puede/i, "Confirma si puedes")
    .replace(/^Validar si el usuario puede/i, "Valida si puedes")
    .replace(/^Confirmar si el usuario conserva/i, "Confirma si conservas")
    .replace(/^Validar si el usuario está/i, "Valida si estás")
    .replace(/^Validar si el usuario esta/i, "Valida si estás")
    .replace(/\bsi usa\b/i, "si usas")
    .replace(/^Indicar al usuario que no abra/i, "No abras")
    .replace(/^Indicar al usuario que no apague/i, "No apagues")
    .replace(/^Indicar al usuario que /i, "")
    .replace(/^Confirmar si el usuario /i, "Confirma si ")
    .replace(/^Confirmar /i, "Confirma ")
    .replace(/^Validar /i, "Valida ")
    .replace(/^Revisar /i, "Revisa ")
    .replace(/^Probar /i, "Prueba ")
    .replace(/^Identificar /i, "Indícame ")
    .replace(/^Registrar /i, "Registra ")
    .replace("descargue adjuntos", "descargues adjuntos")
    .replace("manipule archivos", "manipules archivos");
}

function isGreetingOnly(message: string) {
  const text = normalizeText(message);
  return /^(hola|buenas|buenos dias|buenas tardes|buenas noches|hello|hi)[.!¡! ]*$/.test(text);
}
