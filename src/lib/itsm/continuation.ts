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

  // Extraer historial del asistente para que los handlers puedan detectar
  // qué pasos ya fueron propuestos y no repetirlos.
  const assistantHistory = input.sessionContext.messages
    .filter((m) => m.role === "assistant")
    .map((m) => normalizeText(m.content));

  if (activeArticle.id === "kb-excel-wont-open") {
    return buildContinuationResponse({
      input,
      article: activeArticle,
      message: resolveExcelFollowUp(input.userMessage, assistantHistory),
      suggestedActions: activeArticle.resolutionSteps,
    });
  }

  if (activeArticle.id === "kb-windows-taskbar-missing") {
    return buildContinuationResponse({
      input,
      article: activeArticle,
      message: resolveTaskbarFollowUp(input.userMessage, assistantHistory),
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

// ─── Excel ────────────────────────────────────────────────────────────────────

/**
 * Maneja el flujo multi-turno de Excel no abre.
 * Recibe el historial del asistente para detectar qué pasos ya fueron
 * propuestos y avanzar en lugar de repetirlos.
 */
function resolveExcelFollowUp(message: string, assistantHistory: string[]): string {
  const text = normalizeText(message);

  // ¿El asistente ya propuso modo seguro en algún turno anterior?
  const safeModeAlreadyProposed = assistantHistory.some(
    (h) => h.includes("excel /safe") || h.includes("modo seguro"),
  );

  // ¿El usuario indica que el último paso NO funcionó?
  const userReportsFailure = hasAny(text, [
    "no",
    "tampoco",
    "igual",
    "sigue",
    "sigue igual",
    "no abre",
    "no funciona",
    "no resulto",
    "no resultó",
    "tampoco abre",
    "tambien falla",
    "también falla",
    "vez",         // "2 vez", "otra vez"
    "de nuevo",
    "mismo",
  ]);

  // ── Modo seguro ya propuesto Y usuario reporta que falló ─────────────────
  if (safeModeAlreadyProposed && userReportsFailure) {
    return resolveAfterSafeModeFailed(text);
  }

  // ── Cómo abrir en modo seguro (usuario pregunta) ─────────────────────────
  if (hasAny(text, ["como", "cómo", "modo seguro", "safe mode", "excel /safe", "abrirlo"])) {
    return [
      "Para abrir Excel en modo seguro en Windows:",
      "Presiona Windows + R, escribe `excel /safe` y pulsa Enter. Si Excel abre así, el problema está en un complemento; dime si abre así o también se cierra.",
    ].join("\n\n");
  }

  // ── Excel se cierra al abrirlo (primera mención) ─────────────────────────
  if (hasAny(text, ["se cierra", "cierra de inmediato", "se cae", "crashea", "crash", "abre y se cierra"])) {
    if (safeModeAlreadyProposed) {
      return resolveAfterSafeModeFailed(text);
    }
    return [
      "Eso apunta a un cierre al iniciar Excel.",
      "Probemos modo seguro: presiona Windows + R, escribe `excel /safe` y pulsa Enter. ¿Excel abre así o también se cierra?",
    ].join("\n\n");
  }

  // ── Solo Excel (no Word ni Outlook) ─────────────────────────────────────
  if (hasAny(text, ["solo excel", "solo con excel", "solo esa app"])) {
    if (safeModeAlreadyProposed) {
      return resolveAfterSafeModeFailed(text);
    }
    return [
      "Perfecto, queda acotado a Excel.",
      "Abre Excel en modo seguro: Windows + R, escribe `excel /safe` y pulsa Enter. ¿Abre de esa forma?",
    ].join("\n\n");
  }

  // ── También fallan otras aplicaciones de Office ──────────────────────────
  if (hasAny(text, ["word", "outlook", "powerpoint", "tambien", "también", "todo office"])) {
    return [
      "Si también fallan otras aplicaciones de Office, el problema no es aislado de Excel.",
      "Reinicia el equipo y vuelve a probar. Si persiste, lo escalamos con versión de Office y mensaje de error.",
    ].join("\n\n");
  }

  // ── Default: si modo seguro no fue propuesto, proponerlo ─────────────────
  if (!safeModeAlreadyProposed) {
    return [
      "Primer descarte para Excel: modo seguro.",
      "Presiona Windows + R, escribe `excel /safe` y pulsa Enter. ¿Excel abre así?",
    ].join("\n\n");
  }

  // Si llegamos aquí, el modo seguro fue propuesto y la respuesta del usuario
  // no matcheó ningún patrón de éxito → tratar como fallo y avanzar.
  return resolveAfterSafeModeFailed(text);
}

/**
 * Siguiente paso cuando el modo seguro también falló.
 * Paso 3 del KB: reiniciar equipo + buscar mensaje de error.
 */
function resolveAfterSafeModeFailed(text: string): string {
  // Si el usuario menciona un mensaje de error → pedirlo
  if (hasAny(text, ["mensaje", "error", "codigo", "código", "dice", "sale"])) {
    return [
      "El modo seguro también falla: el problema no es un complemento.",
      "Anota el mensaje o código exacto que aparece al cerrarse Excel. Con ese dato lo derivamos con el contexto completo.",
    ].join("\n\n");
  }

  // Si el usuario menciona que ya reinició
  if (hasAny(text, ["reinicie", "reinicié", "reinicie", "ya reinicie", "ya lo reinicie"])) {
    return [
      "Reinicio hecho y sigue fallando. Necesito dos datos para derivarlo:",
      "¿Qué versión de Office tienes (Office 365, 2021, 2019)? ¿Aparece algún mensaje o simplemente se cierra sin aviso?",
    ].join("\n\n");
  }

  return [
    "Modo seguro también falla: el problema no es un complemento dañado.",
    "Reinicia el equipo ahora (especialmente si lleva muchas horas encendido) y vuelve a intentar. ¿Aparece algún mensaje de error al cerrarse, o se cierra sin aviso?",
  ].join("\n\n");
}

// ─── Barra de tareas ──────────────────────────────────────────────────────────

function resolveTaskbarFollowUp(message: string, assistantHistory: string[]): string {
  const text = normalizeText(message);

  const explorerRestartAlreadyProposed = assistantHistory.some(
    (h) => h.includes("explorador de windows") || h.includes("ctrl + shift + esc"),
  );

  const userReportsFailure = hasAny(text, [
    "no", "tampoco", "igual", "sigue", "no aparece", "no funciona", "no responde",
  ]);

  // Si ya se propuso reiniciar el Explorador y falló → reinicio completo
  if (explorerRestartAlreadyProposed && userReportsFailure) {
    return [
      "Si reiniciar el Explorador no resolvió, el siguiente paso es cerrar sesión y volver a entrar.",
      "Si después del cierre de sesión sigue igual, corresponde reiniciar el equipo completo. ¿Puedes hacerlo ahora?",
    ].join("\n\n");
  }

  if (hasAny(text, ["como", "cómo", "explorador", "reinicio", "reiniciar"])) {
    return [
      "Para reiniciar la barra de tareas en Windows:",
      "Presiona Ctrl + Shift + Esc, busca `Explorador de Windows`, selecciónalo y elige Reiniciar. Si no aparece, cierra sesión y vuelve a entrar.",
    ].join("\n\n");
  }

  if (hasAny(text, ["no aparece", "no se ve", "desaparece", "barra de abajo", "barra inferior"])) {
    return [
      "Eso suena a barra de tareas oculta o Explorador de Windows congelado.",
      "Presiona la tecla Windows. ¿Aparece el menú Inicio o tampoco responde?",
    ].join("\n\n");
  }

  if (!explorerRestartAlreadyProposed) {
    return [
      "Para recuperar la barra de tareas:",
      "Presiona la tecla Windows para validar si aparece el menú Inicio. Si no responde, reiniciamos el Explorador de Windows con Ctrl + Shift + Esc.",
    ].join("\n\n");
  }

  return [
    "Si el menú Inicio tampoco responde, el Explorador de Windows está congelado.",
    "Presiona Ctrl + Shift + Esc, busca `Explorador de Windows` y elige Reiniciar. ¿La barra vuelve después de eso?",
  ].join("\n\n");
}

// ─── Monitor externo ──────────────────────────────────────────────────────────

function resolveExternalMonitorFollowUp(message: string): string {
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function resolveNextKnowledgeStep(article: KnowledgeArticle, context: SessionContext) {
  return article.resolutionSteps.find((step) => !context.stepsExecuted.includes(step)) ?? article.resolutionSteps[0];
}

/**
 * Detecta si el mensaje actual es una continuación de un diagnóstico activo.
 * Más permisivo que antes: reconoce negaciones cortas ("no", "tampoco")
 * cuando ya hay un artículo KB activo.
 */
function isFollowUp(message: string, context: SessionContext) {
  if (!context.activeArticleId && context.messages.length === 0) return false;

  const text = normalizeText(message);

  // Si hay artículo activo, una respuesta corta como "no" o "tampoco" es
  // claramente una continuación del diagnóstico.
  if (context.activeArticleId && isShortNegation(text)) {
    return true;
  }

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
      "tampoco",
      "tambien",
      "también",
      "solo",
      "de inmediato",
      "modo seguro",
      "ya lo hice",
      "lo hice",
      "no resulto",
      "no resultó",
      "vez",
      "misma respuesta",
      "mismo error",
    ])
  );
}

/** "no", "no.", "no!", "tampoco", "igual" sin contexto adicional. */
function isShortNegation(text: string): boolean {
  return /^(no|nop|nope|tampoco|igual|sigue igual)[.!,\s]*$/.test(text.trim());
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
  return message.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}
