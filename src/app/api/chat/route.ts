import { NextResponse } from "next/server";
import { findKnowledgeMatches } from "@/data/mock/knowledgeBase";
import { createSessionContext, detectTurnIntent, extractFields } from "@/lib/itsm/engine";
import type { ChatMessage, SessionContext } from "@/lib/itsm/types";
import { generateITSMResponse } from "@/lib/llm";
import { persistChatTurn } from "@/services/chat.repository";

type ChatRequest = {
  userMessage: string;
  sessionContext?: SessionContext;
};

export async function POST(request: Request) {
  const body = (await request.json()) as ChatRequest;
  const userMessage = body.userMessage?.trim();

  if (!userMessage) {
    return NextResponse.json({ error: "Mensaje requerido" }, { status: 400 });
  }

  const sessionContext = body.sessionContext ?? createSessionContext();
  const detectedIntent = detectTurnIntent(userMessage, sessionContext);
  const knowledgeMatches = findKnowledgeMatches(userMessage, detectedIntent);
  const llmResponse = await generateITSMResponse({
    userMessage,
    sessionContext,
    detectedIntent,
    knowledgeMatches,
    ticketDraft: sessionContext.ticketDraft,
  });

  const now = new Date().toISOString();
  const userChatMessage: ChatMessage = {
    id: crypto.randomUUID(),
    role: "user",
    content: userMessage,
    createdAt: now,
  };
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

  const nextContext: SessionContext = {
    ...sessionContext,
    collectedFields: extractFields(userMessage, sessionContext),
    messages: [...sessionContext.messages, userChatMessage, assistantChatMessage],
    detectedIntent: llmResponse.classification,
    priority: llmResponse.priority,
    activeArticleId: knowledgeMatches[0]?.id ?? sessionContext.activeArticleId,
    ticketDraft: llmResponse.ticketDraft,
    stepsExecuted: Array.from(new Set([...sessionContext.stepsExecuted, ...llmResponse.suggestedActions])),
    awaitingResolutionConfirmation: !llmResponse.shouldCreateTicket,
  };

  await persistChatTurn(nextContext, [userChatMessage, assistantChatMessage]);

  return NextResponse.json({
    response: llmResponse,
    sessionContext: nextContext,
    knowledgeMatches,
  });
}
