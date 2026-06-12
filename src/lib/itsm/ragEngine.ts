import { findKnowledgeMatchesWithScore } from "@/data/mock/knowledgeBase";
import {
  buildTicketDraft,
  determinePriority,
  extractFields,
  getMissingFields,
  isResolvedMessage,
} from "@/lib/itsm/engine";
import { resolveContextualContinuation } from "@/lib/itsm/continuation";
import { generateMockITSMResponse } from "@/lib/llm/mockClient";
import type { ITSMResponse, ITSMResponseInput, KnowledgeArticle, SessionContext } from "@/lib/itsm/types";

const RAG_CONFIDENCE_THRESHOLD = 6;

const HARDWARE_PLAYBOOK_ARTICLE_IDS = new Set([
  "kb-wired-peripheral",
  "kb-external-display",
  "kb-notebook-display",
  "kb-printer-not-printing",
  "kb-printer-paper-toner",
  "kb-scanner-issue",
  "kb-laptop-no-power",
  "kb-battery-charger",
  "kb-camera-microphone-system",
  "pub-ms-windows-printer",
  "pub-ms-windows-display",
]);

export type RagDecision = {
  response?: ITSMResponse;
  satisfied: boolean;
  confidence: "none" | "low" | "medium" | "high";
  reason:
    | "no_match"
    | "active_context"
    | "hardware_playbook"
    | "high_confidence_article"
    | "ready_for_ticket"
    | "repeated_response"
    | "missing_itsm_convergence";
  article?: KnowledgeArticle;
  score?: number;
};

export async function resolveRagTurn(input: ITSMResponseInput): Promise<RagDecision> {
  const scoredMatches = findKnowledgeMatchesWithScore(input.userMessage, input.detectedIntent);
  const topMatch = scoredMatches[0];

  const candidate = await buildRagCandidate(input, topMatch);
  if (!candidate.response) {
    return candidate;
  }

  if (isRepeatedResponse(input, candidate.response)) {
    return {
      ...candidate,
      satisfied: false,
      reason: "repeated_response",
    };
  }

  if (!hasITSMConvergence(candidate.response)) {
    return {
      ...candidate,
      satisfied: false,
      reason: "missing_itsm_convergence",
    };
  }

  return {
    ...candidate,
    satisfied: true,
  };
}

async function buildRagCandidate(
  input: ITSMResponseInput,
  topMatch: ReturnType<typeof findKnowledgeMatchesWithScore>[number] | undefined,
): Promise<RagDecision> {
  const activeArticle = resolveActiveArticle(input, topMatch?.article);
  const terminalEvidenceResponse = buildTerminalEvidenceResponse(input, activeArticle);
  if (terminalEvidenceResponse) {
    return {
      response: terminalEvidenceResponse,
      satisfied: true,
      confidence: "high",
      reason: "ready_for_ticket",
      article: activeArticle,
      score: topMatch?.score,
    };
  }

  if (input.sessionContext.diagnostic?.stage === "prepare_escalation") {
    return {
      response: await generateMockITSMResponse(withRagArticle(input, activeArticle)),
      satisfied: true,
      confidence: "high",
      reason: "ready_for_ticket",
      article: activeArticle,
      score: topMatch?.score,
    };
  }

  const contextualResponse = resolveContextualContinuation(input);
  if (contextualResponse) {
    return {
      response: contextualResponse,
      satisfied: true,
      confidence: "high",
      reason: "active_context",
      article: topMatch?.article,
      score: topMatch?.score,
    };
  }

  if (isHardwareTroubleshooting(input)) {
    return {
      response: await generateMockITSMResponse(withRagArticle(input, activeArticle)),
      satisfied: true,
      confidence: "high",
      reason: "hardware_playbook",
      article: activeArticle,
      score: topMatch?.score,
    };
  }

  if (!topMatch) {
    return {
      satisfied: false,
      confidence: "none",
      reason: "no_match",
    };
  }

  if (topMatch.score < RAG_CONFIDENCE_THRESHOLD) {
    return {
      satisfied: false,
      confidence: topMatch.score >= 3 ? "low" : "none",
      reason: "no_match",
      article: topMatch.article,
      score: topMatch.score,
    };
  }

  return {
    response: await generateMockITSMResponse(withRagArticle(input, topMatch.article)),
    satisfied: true,
    confidence: topMatch.score >= 10 ? "high" : "medium",
    reason: "high_confidence_article",
    article: topMatch.article,
    score: topMatch.score,
  };
}

function buildTerminalEvidenceResponse(
  input: ITSMResponseInput,
  article: KnowledgeArticle | undefined,
): ITSMResponse | undefined {
  if (!hasTerminalEvidence(input.userMessage)) return undefined;

  const classification = article?.intent ?? input.detectedIntent ?? "INCIDENT";
  const context: SessionContext = {
    ...input.sessionContext,
    collectedFields: extractFields(input.userMessage, input.sessionContext),
  };
  const priority = determinePriority(input.userMessage, classification, context);
  const ticketDraft = {
    ...buildTicketDraft({
      message: input.userMessage,
      intent: classification,
      priority,
      article,
      context,
    }),
    status: "escalated" as const,
    nextAction: "Derivar a soporte con evidencia concluyente; no seguir descartes de usuario.",
  };
  const requiredFields = getMissingFields(context, priority);
  const evidenceLabel = describeTerminalEvidence(input.userMessage);

  return {
    assistantMessage: [
      `Entendido: ${evidenceLabel}.`,
      "No corresponde seguir repitiendo descartes. Dejo el caso preparado para soporte con esa evidencia y el historial de conversación.",
    ].join("\n\n"),
    classification,
    priority,
    requiredFields,
    suggestedActions: ["Detener troubleshooting por evidencia concluyente", "Preparar ticket con contexto ITSM"],
    operationalStatuses: ["Detectando intención", "Consultando base de conocimiento", "Preparando ticket"],
    shouldCreateTicket: requiredFields.length === 0,
    shouldEscalate: true,
    ticketDraft,
  };
}

function withRagArticle(input: ITSMResponseInput, article: KnowledgeArticle | undefined): ITSMResponseInput {
  if (!article) return input;

  const remaining = input.knowledgeMatches.filter((item) => item.id !== article.id);
  return {
    ...input,
    detectedIntent: article.intent,
    knowledgeMatches: [article, ...remaining],
  };
}

function resolveActiveArticle(input: ITSMResponseInput, fallback?: KnowledgeArticle) {
  return input.knowledgeMatches.find((article) => article.id === input.sessionContext.activeArticleId) ?? fallback;
}

function hasTerminalEvidence(message: string) {
  const text = normalize(message);
  return TERMINAL_EVIDENCE_TERMS.some((term) => text.includes(term));
}

function describeTerminalEvidence(message: string) {
  const text = normalize(message);
  if (text.includes("cortad") || text.includes("rot") || text.includes("quebrad") || text.includes("partid") || text.includes("pelad")) {
    return "hay daño físico declarado";
  }
  if (text.includes("liquido") || text.includes("mojad")) {
    return "hay posible daño por líquido";
  }
  if (text.includes("perdi") || text.includes("rob")) {
    return "hay pérdida o robo del activo/dispositivo";
  }
  return "hay evidencia concluyente para derivar";
}

function isHardwareTroubleshooting(input: ITSMResponseInput): boolean {
  return (
    input.detectedIntent === "HARDWARE_ISSUE" ||
    HARDWARE_PLAYBOOK_ARTICLE_IDS.has(input.sessionContext.activeArticleId ?? "")
  );
}

function isRepeatedResponse(input: ITSMResponseInput, response: ITSMResponse): boolean {
  if (isResolvedMessage(input.userMessage)) return false;

  const lastAssistant = input.sessionContext.messages
    .filter((message) => message.role === "assistant")
    .at(-1)?.content;

  return Boolean(lastAssistant && normalize(lastAssistant) === normalize(response.assistantMessage));
}

function hasITSMConvergence(response: ITSMResponse): boolean {
  return Boolean(
    response.classification &&
      response.priority &&
      response.ticketDraft?.type &&
      response.ticketDraft?.category &&
      response.ticketDraft?.assignedTeam &&
      response.ticketDraft?.nextAction &&
      response.ticketDraft?.estimatedSla &&
      response.suggestedActions.length > 0,
  );
}

function normalize(message: string) {
  return message
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const TERMINAL_EVIDENCE_TERMS = [
  "cable cortado",
  "cable roto",
  "cable quebrado",
  "cable partido",
  "cable pelado",
  "esta cortado",
  "esta cortada",
  "esta roto",
  "esta rota",
  "esta quebrado",
  "esta quebrada",
  "pantalla quebrada",
  "monitor quebrado",
  "equipo quebrado",
  "se mojo",
  "mojado",
  "liquido",
  "derrame",
  "quemado",
  "olor a quemado",
  "se perdio",
  "perdi el",
  "me robaron",
  "robado",
];
