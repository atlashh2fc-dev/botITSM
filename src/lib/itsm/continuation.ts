import { findKnowledgeArticleById } from "@/data/mock/knowledgeBase";
import {
  buildTicketDraft,
  determinePriority,
  extractFields,
  getMissingFields,
} from "@/lib/itsm/engine";
import type { ITSMResponse, ITSMResponseInput, KnowledgeArticle, SessionContext } from "@/lib/itsm/types";

export function resolveContextualContinuation(input: ITSMResponseInput): ITSMResponse | undefined {
  if (!input.sessionContext.activeArticleId) {
    return undefined;
  }

  const storedArticle = findKnowledgeArticleById(input.sessionContext.activeArticleId);
  const activeArticle = storedArticle ?? input.knowledgeMatches[0];

  if (!activeArticle || !isFollowUp(input.userMessage, input.sessionContext)) {
    return undefined;
  }

  if (activeArticle.id === "kb-excel-wont-open") {
    return buildContinuationResponse({
      input,
      article: activeArticle,
      message: resolveExcelFollowUp(input.userMessage),
      suggestedActions: activeArticle.resolutionSteps,
    });
  }

  if (activeArticle.id === "kb-windows-taskbar-missing") {
    return buildContinuationResponse({
      input,
      article: activeArticle,
      message: resolveTaskbarFollowUp(input.userMessage),
      suggestedActions: activeArticle.resolutionSteps,
    });
  }

  if (activeArticle.id === "kb-external-display") {
    return buildContinuationResponse({
      input,
      article: activeArticle,
      message: resolveExternalMonitorFollowUp(input.userMessage),
      suggestedActions: activeArticle.resolutionSteps,
    });
  }

  const nextStep = resolveNextKnowledgeStep(activeArticle, input.sessionContext);
  if (!nextStep) {
    return undefined;
  }

  return buildContinuationResponse({
    input,
    article: activeArticle,
    message: `Avancemos con el siguiente descarte.\n\n${toUserInstruction(nextStep)}`,
    suggestedActions: [nextStep],
  });
}

function buildContinuationResponse({
  input,
  article,
  message,
  suggestedActions,
}: {
  input: ITSMResponseInput;
  article: KnowledgeArticle;
  message: string;
  suggestedActions: string[];
}): ITSMResponse {
  const context: SessionContext = {
    ...input.sessionContext,
    collectedFields: extractFields(input.userMessage, input.sessionContext),
  };
  const priority = determinePriority(input.userMessage, article.intent, context);
  const ticketDraft = buildTicketDraft({
    message: input.userMessage,
    intent: article.intent,
    priority,
    article,
    context,
  });

  return {
    assistantMessage: message,
    classification: article.intent,
    priority,
    requiredFields: getMissingFields(context, priority),
    suggestedActions,
    operationalStatuses: ["Detectando intención", "Consultando base de conocimiento", "Ejecutando guía de descarte"],
    shouldCreateTicket: false,
    shouldEscalate: false,
    ticketDraft,
  };
}

function resolveExcelFollowUp(message: string) {
  const text = normalizeText(message);

  if (hasAny(text, ["como", "cómo", "modo seguro", "safe mode", "excel /safe", "abrirlo"])) {
    return [
      "Para abrir Excel en modo seguro en Windows:",
      "Presiona Windows + R, escribe `excel /safe` y pulsa Enter. Si Excel abre así, probablemente el problema está en un complemento; dime si abre en modo seguro o si también se cierra.",
    ].join("\n\n");
  }

  if (hasAny(text, ["se cierra", "cierra de inmediato", "se cae", "crashea", "crash", "abre y se cierra"])) {
    return [
      "Eso apunta a un cierre al iniciar Excel.",
      "Probemos modo seguro: presiona Windows + R, escribe `excel /safe` y pulsa Enter. ¿Excel abre así o también se cierra?",
    ].join("\n\n");
  }

  if (hasAny(text, ["solo excel", "solo con excel", "solo esa app"])) {
    return [
      "Perfecto, queda acotado a Excel.",
      "Abre Excel en modo seguro con Windows + R, escribe `excel /safe` y pulsa Enter. ¿Abre de esa forma?",
    ].join("\n\n");
  }

  if (hasAny(text, ["word", "outlook", "powerpoint", "tambien", "también", "todo office"])) {
    return [
      "Si también fallan otras aplicaciones de Office, ya no parece un problema aislado de Excel.",
      "Reinicia el equipo y vuelve a probar una aplicación de Office. Si persiste, lo escalamos con versión de Office, equipo afectado y mensaje de error.",
    ].join("\n\n");
  }

  return [
    "Sigo con el caso de Excel.",
    "El siguiente descarte es abrirlo en modo seguro: Windows + R, escribe `excel /safe` y pulsa Enter. ¿Abre así?",
  ].join("\n\n");
}

function resolveTaskbarFollowUp(message: string) {
  const text = normalizeText(message);

  if (hasAny(text, ["como", "cómo", "explorador", "reinicio", "reiniciar"])) {
    return [
      "Para reiniciar la barra de tareas en Windows:",
      "Presiona Ctrl + Shift + Esc, busca `Explorador de Windows`, selecciónalo y elige Reiniciar. Si no aparece, cierra sesión y vuelve a entrar.",
    ].join("\n\n");
  }

  if (hasAny(text, ["no aparece", "no se ve", "desaparece", "barra de abajo", "barra inferior"])) {
    return [
      "Eso suena a barra de tareas oculta o Explorador de Windows congelado, no a falla física de pantalla.",
      "Presiona la tecla Windows. ¿Aparece el menú Inicio o tampoco responde?",
    ].join("\n\n");
  }

  return [
    "Sigo con la barra de tareas de Windows.",
    "Presiona la tecla Windows para validar si aparece el menú Inicio. Si no responde, reiniciamos el Explorador de Windows.",
  ].join("\n\n");
}

function resolveExternalMonitorFollowUp(message: string) {
  const text = normalizeText(message);

  if (hasAny(text, ["hdmi", "displayport", "dp", "vga", "cable de video"])) {
    return [
      "HDMI confirma el cable de video, pero no alimenta el monitor.",
      "Como al presionar el botón queda apagado, revisa primero energía: cable de poder firme en el monitor y enchufe, prueba otro enchufe si puedes. ¿Enciende alguna luz del monitor?",
    ].join("\n\n");
  }

  if (hasAny(text, ["boton", "botón", "apagado", "no enciende", "no prende", "sin luz", "sin energia", "sin energía"])) {
    return [
      "Eso apunta primero a energía del monitor, no al cable de video.",
      "Revisa que el cable de poder esté firme en el monitor y en el enchufe. Si puedes, prueba otro enchufe o cable de poder. ¿Se enciende alguna luz en el monitor?",
    ].join("\n\n");
  }

  if (hasAny(text, ["cable esta firme", "cable está firme", "firme", "conectado", "conectada"])) {
    return [
      "Bien, dejamos el cable físico como revisado.",
      "Ahora valida energía y entrada: ¿el monitor muestra alguna luz al presionar el botón o queda totalmente apagado?",
    ].join("\n\n");
  }

  if (hasAny(text, ["luz", "enciende", "prende", "entrada", "input", "sin señal", "no signal"])) {
    return [
      "Si el monitor enciende pero muestra sin señal, el siguiente descarte es entrada de video.",
      "Selecciona la entrada HDMI correcta desde el menú del monitor y vuelve a conectar el cable al notebook. ¿Aparece imagen?",
    ].join("\n\n");
  }

  return [
    "Avancemos con el monitor externo.",
    "Primero separo energía de video: ¿queda totalmente apagado o enciende pero muestra sin señal?",
  ].join("\n\n");
}

function resolveNextKnowledgeStep(article: KnowledgeArticle, context: SessionContext) {
  return article.resolutionSteps.find((step) => !context.stepsExecuted.includes(step)) ?? article.resolutionSteps[0];
}

function isFollowUp(message: string, context: SessionContext) {
  if (!context.activeArticleId && context.messages.length === 0) return false;

  const text = normalizeText(message);
  return (
    context.awaitingResolutionConfirmation ||
    hasAny(text, [
      "como",
      "cómo",
      "se cierra",
      "sigue",
      "sigue igual",
      "no funciona",
      "no aparece",
      "no abre",
      "tambien",
      "también",
      "solo",
      "de inmediato",
      "modo seguro",
      "ya lo hice",
      "lo hice",
      "no resulto",
      "no resultó",
    ])
  );
}

function toUserInstruction(step: string) {
  return step
    .replace(/^Confirmar si el usuario puede/i, "Confirma si puedes")
    .replace(/^Validar si el usuario puede/i, "Valida si puedes")
    .replace(/^Confirmar si el usuario conserva/i, "Confirma si conservas")
    .replace(/^Validar si el usuario está/i, "Valida si estás")
    .replace(/^Validar si el usuario esta/i, "Valida si estás")
    .replace(/\bsi usa\b/i, "si usas")
    .replace(/^Confirmar /i, "Confirma ")
    .replace(/^Validar /i, "Valida ")
    .replace(/^Revisar /i, "Revisa ")
    .replace(/^Probar /i, "Prueba ")
    .replace(/^Intentar /i, "Intenta ")
    .replace(/^Registrar /i, "Registra ");
}

function hasAny(value: string, terms: string[]) {
  return terms.some((term) => value.includes(normalizeText(term)));
}

function normalizeText(message: string) {
  return message.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}
