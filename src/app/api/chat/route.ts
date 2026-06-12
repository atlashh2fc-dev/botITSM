import { NextResponse } from "next/server";
import { findKnowledgeMatches, knowledgeBase } from "@/data/mock/knowledgeBase";
import { createSessionContext, detectTurnIntent, extractFields, isResolvedMessage } from "@/lib/itsm/engine";
import { createTicketThroughITSM } from "@/lib/itsm/itsmGateway";
import type { ChatMessage, SessionContext, TicketDraft } from "@/lib/itsm/types";
import { generateITSMResponse } from "@/lib/llm";
import { getPersistedSessionContext, persistChatTurn } from "@/services/chat.repository";
import { getUserMemory, upsertUserMemory } from "@/services/memory.repository";
import { extractTicketNumber, isTicketCreationMessage, isTicketLookupCorrectionMessage, isTicketQueryMessage, resolveTicketQuery, type TicketQueryResult } from "@/lib/itsm/ticketLookup";

type ChatRequest = {
  userMessage: string;
  sessionContext?: SessionContext;
  sessionId?: string;
  attachmentName?: string;
  attachmentUrl?: string;
  sourceChannel?: "portal-web" | "field-copilot" | string;
  userEmail?: string;
  userName?: string;
  userArea?: string;
  fieldRole?: string;
  fieldZone?: string;
  audioNoteName?: string;
};

export async function POST(request: Request) {
  const body = (await request.json()) as ChatRequest;
  const userMessage = body.userMessage?.trim();

  if (!userMessage) {
    return NextResponse.json({ error: "Mensaje requerido" }, { status: 400 });
  }

  const sessionContext = body.sessionContext ?? (body.sessionId ? await getPersistedSessionContext(body.sessionId) : undefined) ?? createSessionContext();
  const channel = body.sourceChannel === "field-copilot" ? "field-copilot" : "portal-web";
  
  const now = new Date().toISOString();
  const userChatMessage: ChatMessage = {
    id: crypto.randomUUID(),
    role: "user",
    content: userMessage,
    createdAt: now,
    attachmentName: body.attachmentName,
    attachmentUrl: body.attachmentUrl,
  };

  // Insertar el mensaje del usuario con su adjunto en el contexto del motor
  const sessionContextForEngine = {
    ...sessionContext,
    messages: [...sessionContext.messages, userChatMessage]
  };

  // ── Reconocimiento de usuario + Memoria Relacional ──────────────────────
  const emailInMessage = userMessage.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/)?.[0];
  const knownEmail = (body.userEmail ?? emailInMessage ?? sessionContext.collectedFields?.correo ?? sessionContext.userMemory?.email)?.toLowerCase();
  const wantsTicketCreation = isTicketCreationMessage(userMessage);

  if (knownEmail && sessionContextForEngine.userMemory?.email !== knownEmail) {
    const memory = await getUserMemory(knownEmail);
    if (memory) {
      sessionContextForEngine.userMemory = memory;
      sessionContextForEngine.collectedFields = {
        ...sessionContextForEngine.collectedFields,
        correo: sessionContextForEngine.collectedFields?.correo ?? memory.email,
        nombre: sessionContextForEngine.collectedFields?.nombre ?? memory.name ?? undefined,
        area: sessionContextForEngine.collectedFields?.area ?? memory.area ?? body.userArea,
      };
    } else {
      sessionContextForEngine.collectedFields = {
        ...sessionContextForEngine.collectedFields,
        correo: sessionContextForEngine.collectedFields?.correo ?? knownEmail,
        nombre: sessionContextForEngine.collectedFields?.nombre ?? body.userName,
        area: sessionContextForEngine.collectedFields?.area ?? body.userArea,
      };
    }
  }

  // ── Consulta de tickets (omnicanal, determinístico) ─────────────────────
  const ticketNumberInMessage = extractTicketNumber(userMessage) ?? extractShownTicketNumber(userMessage, sessionContext);
  const isTicketEmailContinuation = Boolean(sessionContext.lastTicketLookup?.needsEmail && emailInMessage);
  const isCorrection = isTicketLookupCorrectionMessage(userMessage, sessionContext);
  const isTicketLookupTurn =
    !wantsTicketCreation &&
    !sessionContext.awaitingCloseConfirmation &&
    (isTicketQueryMessage(userMessage) || isCorrection || isTicketEmailContinuation || Boolean(ticketNumberInMessage));

  if (isTicketLookupTurn) {
    const lookupMessage = ticketNumberInMessage
      ? `ticket ${ticketNumberInMessage}`
      : (isCorrection || isTicketEmailContinuation) && sessionContext.lastTicketLookup?.topics.length
      ? sessionContext.lastTicketLookup.topics.join(" ")
      : userMessage;
    const queryResult = await resolveTicketQuery(lookupMessage, knownEmail, {
      fallbackTopics: isCorrection || isTicketEmailContinuation ? sessionContext.lastTicketLookup?.topics : undefined,
      lenient: isCorrection || isTicketEmailContinuation,
      lenientReason: isCorrection ? "correction" : isTicketEmailContinuation ? "continuation" : undefined,
    });

    if (queryResult.handled) {
      const assistantChatMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: queryResult.message,
        createdAt: new Date().toISOString(),
      };

      const nextContext: SessionContext = {
        ...sessionContextForEngine,
        messages: [...sessionContextForEngine.messages, assistantChatMessage],
        lastTicketLookup: {
          topics: queryResult.topics,
          found: queryResult.matched,
          needsEmail: queryResult.needsEmail,
          email: knownEmail,
          ticketNumbers: queryResult.tickets.map((ticket) => ticket.number),
          selectedTicketNumber: queryResult.tickets.length === 1 && queryResult.matched ? queryResult.tickets[0].number : undefined,
          createdAt: new Date().toISOString(),
        },
      };

      if (knownEmail && !queryResult.needsEmail) {
        const recentTicketLookups = buildRecentTicketLookups(sessionContext.userMemory?.profile?.recentTicketLookups, queryResult);
        await upsertUserMemory(knownEmail, {
          episodicEvent: queryResult.topics.length
            ? `Consultó tickets por ${queryResult.topics.join(", ")} (${queryResult.tickets.length} encontrados).`
            : `Consultó el estado de sus tickets (${queryResult.tickets.length} encontrados).`,
          profile: recentTicketLookups.length ? { recentTicketLookups } : undefined,
        });
      }

      await persistChatTurn(nextContext, [userChatMessage, assistantChatMessage], "active", channel);

      return NextResponse.json({
        response: {
          assistantMessage: queryResult.message,
          classification: "SERVICE_REQUEST",
          priority: sessionContext.priority ?? "P4",
          requiredFields: queryResult.needsEmail ? ["correo"] : [],
          suggestedActions: ["Consulta de tickets en ITSM Geimser"],
          operationalStatuses: ["Consultando base de conocimiento"],
          shouldCreateTicket: false,
          shouldEscalate: false,
          ticketDraft: sessionContext.ticketDraft,
        },
        tickets: queryResult.tickets,
        sessionContext: nextContext,
      });
    }
  }

  // ── Intercepción de Confirmación de Cierre (ITIL) ───────────────────────
  if (sessionContext.awaitingCloseConfirmation) {
    const textNorm = userMessage.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const isClosingConfirmation = 
      /^(si|ciérralo|cierralo|cierra|si, ciérralo|sí, ciérralo|no, nada más|no, nada mas|no gracias|gracias|no, gracias, todo bien|podemos cerrarlo|listo|cerrar caso|cerralo)[.!,\s]*$/.test(textNorm.trim()) ||
      /^(no|nop|nope|nada|ninguno|tampoco|igual)[.!,\s]*$/.test(textNorm.trim());

    if (isClosingConfirmation) {
      // Registrar el cierre oficial en Supabase
      const draft = sessionContext.ticketDraft || {
        id: `INC-${new Date().getFullYear()}-${Math.floor(10000 + Math.random() * 90000)}`,
        type: "INCIDENT" as const,
        priority: "P3" as const,
        category: "Cierre autónomo",
        description: "Caso cerrado por confirmación del usuario tras aplicar descartes automáticos.",
        status: "resolved" as const,
        requesterName: sessionContext.collectedFields?.nombre || "Sin identificar",
        requesterEmail: sessionContext.collectedFields?.correo || "sin-datos@sonda.cl",
        executedSteps: ["Reinicio", "Confirmación de usuario"],
        nextAction: "Cerrar caso",
        assignedTeam: "Atlas IA",
        estimatedSla: "8 horas hábiles",
      };

      const resolvedDraft = {
        ...draft,
        status: "resolved" as const,
        executedSteps: draft.executedSteps || ["Reinicio", "Confirmación de usuario"],
        nextAction: draft.nextAction || "Cerrar caso",
        assignedTeam: draft.assignedTeam || "Atlas IA",
        estimatedSla: draft.estimatedSla || "8 horas hábiles",
        requesterName: draft.requesterName || sessionContext.collectedFields?.nombre || "Sin identificar",
        requesterEmail: draft.requesterEmail || sessionContext.collectedFields?.correo || "sin-datos@sonda.cl",
      };

      const assistantChatMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: "Perfecto. Procedo a registrar la solución y dar por cerrado este caso de manera autónoma en el sistema de soporte de SONDA. ¡Muchas gracias por tu confirmación y que tengas un excelente día!",
        createdAt: new Date().toISOString(),
        metadata: {
          intent: resolvedDraft.type,
          priority: resolvedDraft.priority,
          ticketId: resolvedDraft.id,
        },
      };

      const fullTranscript = [...sessionContextForEngine.messages, assistantChatMessage];

      const itsmResult = await createTicketThroughITSM({
        draft: resolvedDraft,
        sessionId: sessionContextForEngine.sessionId,
        transcript: fullTranscript,
        diagnostic: sessionContextForEngine.diagnostic,
        source: channel,
      });

      const nextContext: SessionContext = {
        ...sessionContextForEngine,
        messages: fullTranscript,
        awaitingCloseConfirmation: false,
        ticketDraft: itsmResult?.ticket ?? resolvedDraft,
      };

      const closeEmail = (sessionContext.collectedFields?.correo ?? sessionContext.userMemory?.email)?.toLowerCase();
      if (closeEmail?.includes("@") && !closeEmail.includes("sin-datos")) {
        await upsertUserMemory(closeEmail, {
          name: sessionContext.collectedFields?.nombre,
          area: sessionContext.collectedFields?.area,
          episodicEvent: `Caso resuelto de forma autónoma y cerrado (${resolvedDraft.category}).`,
        });
      }

      await persistChatTurn(nextContext, [userChatMessage, assistantChatMessage], "resolved", channel);

      return NextResponse.json({
        response: {
          assistantMessage: assistantChatMessage.content,
          classification: resolvedDraft.type,
          priority: resolvedDraft.priority,
          requiredFields: [],
          suggestedActions: ["Iniciar nueva consulta"],
          operationalStatuses: ["Cerrando caso"],
          shouldCreateTicket: true,
          shouldEscalate: false,
          ticketDraft: resolvedDraft,
        },
        ticket: itsmResult?.ticket ?? resolvedDraft,
        itsm: itsmResult,
        sessionContext: nextContext,
      });
    } else {
      // El usuario reportó otro síntoma o no quiere cerrar el caso.
      // Limpiamos el flag de confirmación de cierre y el artículo activo anterior para evitar bucles.
      sessionContextForEngine.awaitingCloseConfirmation = false;
      sessionContextForEngine.activeArticleId = undefined;
      if (sessionContextForEngine.diagnostic) {
        sessionContextForEngine.diagnostic.stage = "identify_asset";
      }
    }
  }

  // ── Agradecimiento contextual sobre caso derivado/preparado ─────────────
  // "ok gracias" después de preparar o crear ticket no significa que la falla
  // se resolvió; solo confirma que el usuario entendió la derivación.
  if (isCourtesyAcknowledgement(userMessage) && hasActiveSupportCase(sessionContextForEngine)) {
    const activeTicket = getExistingCreatedTicket(sessionContextForEngine.ticketDraft);
    const ticketLabel = activeTicket?.id ?? activeTicket?.externalId;
    const assistantText = ticketLabel
      ? `De nada. El caso queda registrado como ${ticketLabel}; soporte continuará con la revisión usando el contexto que ya entregaste.`
      : "De nada. El caso queda preparado para soporte con el contexto que ya entregaste. No lo cerraré como resuelto.";

    const assistantChatMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: assistantText,
      createdAt: new Date().toISOString(),
      metadata: {
        intent: sessionContextForEngine.detectedIntent,
        priority: sessionContextForEngine.priority,
        ticketId: activeTicket?.id,
      },
    };

    const nextContext: SessionContext = {
      ...sessionContextForEngine,
      messages: [...sessionContextForEngine.messages, assistantChatMessage],
      awaitingResolutionConfirmation: false,
      awaitingCloseConfirmation: false,
      ticketDraft: activeTicket ?? sessionContextForEngine.ticketDraft,
    };

    await persistChatTurn(nextContext, [userChatMessage, assistantChatMessage], "active", channel);

    return NextResponse.json({
      response: {
        assistantMessage: assistantText,
        classification: sessionContextForEngine.detectedIntent ?? activeTicket?.type ?? "SERVICE_REQUEST",
        priority: sessionContextForEngine.priority ?? activeTicket?.priority ?? "P4",
        requiredFields: [],
        suggestedActions: ["Mantener caso derivado abierto"],
        operationalStatuses: ["Preparando ticket"],
        shouldCreateTicket: false,
        shouldEscalate: Boolean(activeTicket?.status === "escalated" || activeTicket?.status === "created"),
        ticketDraft: activeTicket ?? sessionContextForEngine.ticketDraft,
      },
      ticket: activeTicket,
      sessionContext: nextContext,
    });
  }

  const llmUserMessage = buildChannelAwareMessage(userMessage, body);
  const detectedIntent = detectTurnIntent(llmUserMessage, sessionContextForEngine);
  const knowledgeMatches = findKnowledgeMatches(llmUserMessage, detectedIntent);
  const existingTicket = getExistingCreatedTicket(sessionContextForEngine.ticketDraft);
  const rawLlmResponse = await generateITSMResponse({
    userMessage: llmUserMessage,
    sessionContext: sessionContextForEngine,
    detectedIntent,
    knowledgeMatches,
    ticketDraft: sessionContextForEngine.ticketDraft,
  });
  const conversationTurns = sessionContextForEngine.messages.filter((m) => m.role === "user").length;
  const shouldHonorTicketCreation = wantsTicketCreation && conversationTurns >= 1 && !existingTicket;
  const llmResponse = wantsTicketCreation && existingTicket
    ? {
        ...rawLlmResponse,
        assistantMessage: `Ya dejé este caso registrado como ${existingTicket.id}. Agregaré cualquier dato nuevo a la conversación para que soporte mantenga el contexto.`,
        shouldEscalate: false,
        shouldCreateTicket: false,
        suggestedActions: ["Mantener contexto en ticket existente"],
        ticketDraft: existingTicket,
      }
    : shouldHonorTicketCreation
    ? {
        ...rawLlmResponse,
        assistantMessage: [
          "Entendido. Abriré un ticket con el contexto de esta conversación.",
          "Lo enviaré con las pruebas ya realizadas para que Identidad/Soporte no te vuelva a pedir los mismos descartes.",
        ].join("\n\n"),
        shouldEscalate: true,
        operationalStatuses: ["Detectando intención", "Consultando base de conocimiento", "Preparando ticket"] as const,
        suggestedActions: Array.from(new Set([
          ...rawLlmResponse.suggestedActions,
          "Crear ticket solicitado por el usuario",
        ])),
        ticketDraft: {
          ...rawLlmResponse.ticketDraft,
          status: "escalated" as const,
          nextAction: rawLlmResponse.ticketDraft.nextAction || "Crear ticket solicitado por el usuario",
        },
      }
    : rawLlmResponse;

  const assistantChatMessage: ChatMessage = {
    id: crypto.randomUUID(),
    role: "assistant",
    content: llmResponse.assistantMessage,
    createdAt: new Date().toISOString(),
    metadata: {
      intent: llmResponse.classification,
      priority: llmResponse.priority,
    },
  };
  const diagnosticForTurn = llmResponse.diagnostic ?? sessionContextForEngine.diagnostic;
  const isAccessActionDone =
    sessionContextForEngine.activeArticleId === "kb-account-locked" &&
    /^(listo|hecho|realizado|ya lo hice|ya lo realice|ya lo realicé|ok|dale)[.!,\s]*$/i.test(
      userMessage
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim(),
    );
  const isResolved = isResolvedMessage(userMessage) && sessionContextForEngine.diagnostic?.stage !== "isolate_component" && !isAccessActionDone;

  // ── Determinar si crear ticket ────────────────────────────────────────────
  // Además del flujo normal (shouldCreateTicket = true), registramos:
  // 1. Resolución autónoma del usuario → ticket status "resolved"
  // 2. Conversación con ≥2 turnos y escalación pendiente sin datos completos
  //    → ticket con datos parciales para que no se pierda la conversación
  const shouldForceTicket =
    !llmResponse.shouldCreateTicket &&
    (isResolved ||
      shouldHonorTicketCreation ||
      (llmResponse.shouldEscalate && conversationTurns >= 2));

  const draftForTicket = enrichRequesterDraft(
    shouldForceTicket
      ? {
          ...llmResponse.ticketDraft,
          status: isResolved ? ("resolved" as const) : ("escalated" as const),
        }
      : llmResponse.ticketDraft,
    sessionContextForEngine,
    knownEmail,
  );

  const fullTranscript = [...sessionContextForEngine.messages, assistantChatMessage];

  const itsmResult = !existingTicket && (llmResponse.shouldCreateTicket || shouldForceTicket)
    ? await createTicketThroughITSM({
        draft: draftForTicket,
        sessionId: sessionContextForEngine.sessionId,
        transcript: fullTranscript,
        diagnostic: diagnosticForTurn,
        source: channel,
      })
    : undefined;

  if (itsmResult) {
    assistantChatMessage.metadata = {
      ...assistantChatMessage.metadata,
      ticketId: itsmResult.ticket.id,
    };

    const memoryEmail = knownEmail ?? draftForTicket.requesterEmail?.toLowerCase();
    if (memoryEmail?.includes("@") && !memoryEmail.includes("sin-datos") && !memoryEmail.includes("pendiente")) {
      const updatedMemory = await upsertUserMemory(memoryEmail, {
        name: nextContextFields(sessionContextForEngine, userMessage).nombre ?? draftForTicket.requesterName,
        area: nextContextFields(sessionContextForEngine, userMessage).area,
        episodicEvent: `Ticket ${itsmResult.externalId} (${draftForTicket.type}/${draftForTicket.priority}): ${draftForTicket.category}.`,
      });
      if (updatedMemory) sessionContextForEngine.userMemory = updatedMemory;
    }
  }
  const nextDiagnostic = itsmResult && diagnosticForTurn
    ? {
        ...diagnosticForTurn,
        stage: "ticket_created" as const,
        facts: {
          ...diagnosticForTurn.facts,
          ticketCreated: true,
          ticketId: itsmResult.ticket.id,
          itsmProvider: itsmResult.provider,
        },
        completedSteps: Array.from(new Set([...diagnosticForTurn.completedSteps, "Ticket creado en ITSM"])),
        updatedAt: new Date().toISOString(),
      }
    : diagnosticForTurn;

  // Estado de la sesión según el desenlace del turno
  const sessionOutcome: "resolved" | "escalated" | "active" =
    itsmResult ? "escalated"
    : "active";

  const nextContext: SessionContext = {
    ...sessionContextForEngine,
    collectedFields: extractFields(userMessage, sessionContextForEngine),
    messages: fullTranscript,
    detectedIntent: llmResponse.classification,
    priority: llmResponse.priority,
    activeArticleId: resolveActiveArticleId(llmResponse.ticketDraft.description, knowledgeMatches, sessionContextForEngine),
    diagnostic: nextDiagnostic,
    ticketDraft: itsmResult?.ticket ?? existingTicket ?? llmResponse.ticketDraft,
    stepsExecuted: Array.from(new Set([...sessionContextForEngine.stepsExecuted, ...llmResponse.suggestedActions])),
    awaitingResolutionConfirmation: !llmResponse.shouldCreateTicket && !isResolved,
    awaitingCloseConfirmation: isResolved ? true : undefined,
  };

  await persistChatTurn(nextContext, [userChatMessage, assistantChatMessage], sessionOutcome, channel);

  return NextResponse.json({
    response: llmResponse,
    ticket: itsmResult?.ticket ?? (wantsTicketCreation ? existingTicket : undefined),
    itsm: itsmResult
      ? {
          provider: itsmResult.provider,
          mode: itsmResult.mode,
          externalId: itsmResult.externalId,
          externalUrl: itsmResult.externalUrl,
        }
      : undefined,
    sessionContext: nextContext,
    knowledgeMatches,
  });
}

function buildChannelAwareMessage(userMessage: string, body: ChatRequest) {
  if (body.sourceChannel !== "field-copilot") return userMessage;

  return [
    "[Field IT Copilot]",
    "Canal: móvil seguro para técnico en terreno.",
    body.fieldRole ? `Rol técnico: ${body.fieldRole}.` : undefined,
    body.fieldZone ? `Zona o cliente: ${body.fieldZone}.` : undefined,
    body.attachmentName ? `Evidencia visual adjunta: ${body.attachmentName}.` : undefined,
    body.audioNoteName ? `Nota de audio adjunta pendiente de transcripción STT: ${body.audioNoteName}.` : undefined,
    "Responder con enfoque operativo de terreno: posible causa, checklist de descartes, pasos sugeridos, criticidad, criterio de escalamiento y si corresponde crear ticket.",
    `Síntoma reportado: ${userMessage}`,
  ]
    .filter(Boolean)
    .join("\n");
}

function resolveActiveArticleId(
  ticketDescription: string,
  knowledgeMatches: ReturnType<typeof findKnowledgeMatches>,
  sessionContext: SessionContext,
) {
  // ── Interruptor de Contexto (Context Switching) ──────────────────────────
  // Si el usuario reporta un nuevo problema que matchea un artículo KB diferente,
  // liberamos el tema anterior para que no se quede bloqueado y transicione de inmediato.
  const topMatch = knowledgeMatches[0];
  if (topMatch && sessionContext.activeArticleId && topMatch.id !== sessionContext.activeArticleId) {
    return topMatch.id;
  }

  const referencedArticle = knowledgeBase.find((article) => ticketDescription.includes(`Referencia KB: ${article.title}`));
  if (referencedArticle && referencedArticle.id === sessionContext.activeArticleId) {
    return referencedArticle.id;
  }

  if (sessionContext.activeArticleId && !referencesKnowledgeArticle(ticketDescription)) {
    return sessionContext.activeArticleId;
  }

  return referencedArticle?.id ?? knowledgeMatches[0]?.id ?? sessionContext.activeArticleId;
}

function referencesKnowledgeArticle(ticketDescription: string) {
  return ticketDescription.includes("Referencia KB:");
}


function nextContextFields(context: SessionContext, userMessage: string) {
  return extractFields(userMessage, context) ?? context.collectedFields ?? {};
}

function enrichRequesterDraft(
  draft: TicketDraft,
  context: SessionContext,
  knownEmail?: string,
) {
  const fields = context.collectedFields ?? {};
  const memory = context.userMemory;
  const requesterName = normalizePendingValue(draft.requesterName)
    ?? fields.nombre
    ?? memory?.name
    ?? "Usuario autenticado ITSM";
  const requesterEmail = normalizePendingValue(draft.requesterEmail)
    ?? knownEmail
    ?? fields.correo
    ?? memory?.email
    ?? "sin-datos@sonda.cl";
  const businessArea = normalizePendingValue(draft.businessArea)
    ?? fields.area
    ?? memory?.area
    ?? (requesterEmail.includes("@") ? "No informada (usuario autenticado ITSM)" : "Área pendiente");

  return {
    ...draft,
    requesterName,
    requesterEmail,
    businessArea,
  };
}

function normalizePendingValue(value?: string | null) {
  if (!value) return undefined;
  const normalized = value.toLowerCase();
  if (normalized.includes("pendiente") || normalized.includes("sin identificar") || normalized.includes("sin-datos")) {
    return undefined;
  }
  return value;
}

function getExistingCreatedTicket(ticket?: TicketDraft) {
  if (!ticket?.id && !ticket?.externalId) return undefined;
  return ticket;
}

function extractShownTicketNumber(message: string, context: SessionContext) {
  const normalized = normalizePlainText(message);
  const shownNumbers = context.lastTicketLookup?.ticketNumbers ?? [];

  if (!shownNumbers.length) return undefined;

  const directNumber = normalized.match(/\b(\d{4,})\b/)?.[1];
  if (directNumber && shownNumbers.includes(directNumber)) return directNumber;

  if (/\b(el primero|el 1|primero|primer)\b/.test(normalized)) return shownNumbers[0];
  if (/\b(el segundo|el 2|segundo)\b/.test(normalized)) return shownNumbers[1];
  if (/\b(el tercero|el 3|tercero)\b/.test(normalized)) return shownNumbers[2];

  return undefined;
}

function buildRecentTicketLookups(previous: unknown, queryResult: TicketQueryResult) {
  const previousItems = Array.isArray(previous)
    ? previous.filter(isRecentTicketLookup)
    : [];

  const nextItems = queryResult.tickets.map((ticket) => ({
    number: ticket.number,
    title: ticket.title,
    state: ticket.state,
    priority: ticket.priority,
    topics: queryResult.topics,
    matched: queryResult.matched,
    lookedAt: new Date().toISOString(),
  }));

  return [...nextItems, ...previousItems]
    .filter((item, index, items) => items.findIndex((candidate) => candidate.number === item.number) === index)
    .slice(0, 10);
}

function isRecentTicketLookup(value: unknown): value is {
  number: string;
  title: string;
  state: string;
  priority: string;
  topics: string[];
  matched: boolean;
  lookedAt: string;
} {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    typeof (value as { number?: unknown }).number === "string"
  );
}

function isCourtesyAcknowledgement(message: string) {
  const text = normalizePlainText(message);
  return /^(ok|oka|dale|vale|ya|perfecto|excelente|gracias|muchas gracias|ok gracias|oka gracias|dale gracias|vale gracias|listo gracias|entendido gracias)[.!¡! ]*$/.test(text);
}

function hasActiveSupportCase(context: SessionContext) {
  const ticket = context.ticketDraft;
  const lastAssistant = context.messages.filter((message) => message.role === "assistant").at(-1)?.content ?? "";
  const assistantText = normalizePlainText(lastAssistant);

  return Boolean(
    ticket?.id ||
      ticket?.externalId ||
      ticket?.status === "created" ||
      ticket?.status === "escalated" ||
      context.diagnostic?.stage === "ticket_created" ||
      context.diagnostic?.stage === "prepare_escalation" ||
      assistantText.includes("caso preparado") ||
      assistantText.includes("caso registrado") ||
      assistantText.includes("dejo el caso preparado") ||
      assistantText.includes("soporte con esa evidencia") ||
      assistantText.includes("derivar"),
  );
}

function normalizePlainText(message: string) {
  return message
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
