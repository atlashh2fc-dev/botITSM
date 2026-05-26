import { NextResponse } from "next/server";
import { findKnowledgeMatches, knowledgeBase } from "@/data/mock/knowledgeBase";
import { createSessionContext, detectTurnIntent, extractFields, isResolvedMessage } from "@/lib/itsm/engine";
import { createTicketThroughITSM } from "@/lib/itsm/itsmGateway";
import type { ChatMessage, SessionContext } from "@/lib/itsm/types";
import { generateITSMResponse } from "@/lib/llm";
import { getPersistedSessionContext, persistChatTurn } from "@/services/chat.repository";

type ChatRequest = {
  userMessage: string;
  sessionContext?: SessionContext;
  sessionId?: string;
  attachmentName?: string;
  attachmentUrl?: string;
};

export async function POST(request: Request) {
  const body = (await request.json()) as ChatRequest;
  const userMessage = body.userMessage?.trim();

  if (!userMessage) {
    return NextResponse.json({ error: "Mensaje requerido" }, { status: 400 });
  }

  const sessionContext = body.sessionContext ?? (body.sessionId ? await getPersistedSessionContext(body.sessionId) : undefined) ?? createSessionContext();
  
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
        source: "web-demo",
      });

      const nextContext: SessionContext = {
        ...sessionContextForEngine,
        messages: fullTranscript,
        awaitingCloseConfirmation: false,
        ticketDraft: itsmResult?.ticket ?? resolvedDraft,
      };

      await persistChatTurn(nextContext, [userChatMessage, assistantChatMessage], "resolved");

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

  const detectedIntent = detectTurnIntent(userMessage, sessionContextForEngine);
  const knowledgeMatches = findKnowledgeMatches(userMessage, detectedIntent);
  const llmResponse = await generateITSMResponse({
    userMessage,
    sessionContext: sessionContextForEngine,
    detectedIntent,
    knowledgeMatches,
    ticketDraft: sessionContextForEngine.ticketDraft,
  });

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
  const conversationTurns = sessionContextForEngine.messages.filter((m) => m.role === "user").length;
  const isResolved = isResolvedMessage(userMessage) && sessionContextForEngine.diagnostic?.stage !== "isolate_component";

  // ── Determinar si crear ticket ────────────────────────────────────────────
  // Además del flujo normal (shouldCreateTicket = true), registramos:
  // 1. Resolución autónoma del usuario → ticket status "resolved"
  // 2. Conversación con ≥2 turnos y escalación pendiente sin datos completos
  //    → ticket con datos parciales para que no se pierda la conversación
  const shouldForceTicket =
    !llmResponse.shouldCreateTicket &&
    (isResolved ||
      (llmResponse.shouldEscalate && conversationTurns >= 2));

  const draftForTicket = shouldForceTicket
    ? {
        ...llmResponse.ticketDraft,
        status: isResolved ? ("resolved" as const) : ("escalated" as const),
        requesterName: llmResponse.ticketDraft.requesterName?.includes("pendiente")
          ? "Sin identificar"
          : llmResponse.ticketDraft.requesterName,
        requesterEmail: llmResponse.ticketDraft.requesterEmail?.includes("pendiente")
          ? "sin-datos@sonda.cl"
          : llmResponse.ticketDraft.requesterEmail,
      }
    : llmResponse.ticketDraft;

  const fullTranscript = [...sessionContextForEngine.messages, assistantChatMessage];

  const itsmResult = (llmResponse.shouldCreateTicket || shouldForceTicket)
    ? await createTicketThroughITSM({
        draft: draftForTicket,
        sessionId: sessionContextForEngine.sessionId,
        transcript: fullTranscript,
        diagnostic: diagnosticForTurn,
        source: "web-demo",
      })
    : undefined;

  if (itsmResult) {
    assistantChatMessage.metadata = {
      ...assistantChatMessage.metadata,
      ticketId: itsmResult.ticket.id,
    };
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
    ticketDraft: itsmResult?.ticket ?? llmResponse.ticketDraft,
    stepsExecuted: Array.from(new Set([...sessionContextForEngine.stepsExecuted, ...llmResponse.suggestedActions])),
    awaitingResolutionConfirmation: !llmResponse.shouldCreateTicket && !isResolved,
    awaitingCloseConfirmation: isResolved ? true : undefined,
  };

  await persistChatTurn(nextContext, [userChatMessage, assistantChatMessage], sessionOutcome);

  return NextResponse.json({
    response: llmResponse,
    ticket: itsmResult?.ticket,
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
