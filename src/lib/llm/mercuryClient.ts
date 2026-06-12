/**
 * mercuryClient.ts
 * Cliente para Mercury-2 (InceptionLabs) como motor LLM secundario.
 *
 * CORRECCIONES vs versión anterior:
 * - Pasa el historial conversacional como mensajes separados (no como JSON embebido)
 * - Inyecta artículos KB relevantes en el system prompt
 * - Pide respuesta textual natural (no JSON complejo de una sola pasada)
 * - Usa el motor de engine.ts para extracción estructurada posterior
 * - Parsing robusto con fallback limpio al mock
 */

import { itsmSystemPrompt } from "@/lib/llm/prompts/itsmSystemPrompt";
import { buildMemoryPromptSection } from "@/services/memory.repository";
import { generateMockITSMResponse } from "@/lib/llm/mockClient";
import {
  buildTicketDraft,
  detectIntent,
  determinePriority,
  extractFields,
  getMissingFields,
  shouldCreateTicketFromMessage,
} from "@/lib/itsm/engine";
import type {
  ITSMIntent,
  ITSMPriority,
  ITSMResponse,
  ITSMResponseInput,
  KnowledgeArticle,
  OperationalStatus,
  SessionContext,
} from "@/lib/itsm/types";

// ─── Config ───────────────────────────────────────────────────────────────────

export function hasMercuryConfig(): boolean {
  return Boolean(process.env.MERCURY_API_KEY);
}

// ─── Context builders ────────────────────────────────────────────────────────

function buildKBSection(matches: KnowledgeArticle[]): string {
  if (!matches.length) return "";

  const top = matches.slice(0, 3);
  const sections = top.map((a) =>
    [
      `### KB: ${a.title}`,
      `Síntomas: ${a.symptoms.join("; ")}`,
      `Pasos:`,
      a.resolutionSteps.map((s, i) => `  ${i + 1}. ${s}`).join("\n"),
      `Escalar si: ${a.escalationCriteria.join("; ")}`,
      a.sourceUrls?.length ? `Fuentes públicas: ${a.sourceUrls.join("; ")}` : undefined,
    ].filter(Boolean).join("\n")
  );

  return (
    "\n\n---\n## Artículos KB relevantes\n\n" + sections.join("\n\n---\n")
  );
}

function buildCaseContext(context: SessionContext): string {
  const fields = context.collectedFields;
  const parts: string[] = [];

  if (fields.nombre) parts.push(`Nombre: ${fields.nombre}`);
  if (fields.correo) parts.push(`Correo: ${fields.correo}`);
  if (fields.area) parts.push(`Área: ${fields.area}`);
  if (fields.sistema) parts.push(`Sistema: ${fields.sistema}`);
  if (fields.activo) parts.push(`Activo: ${fields.activo}`);
  if (context.stepsExecuted.length)
    parts.push(`Pasos ejecutados: ${context.stepsExecuted.slice(-3).join("; ")}`);

  if (!parts.length) return "";
  return "\n\n---\n## Estado del caso\n" + parts.join("\n");
}

// ─── Types ────────────────────────────────────────────────────────────────────

type OpenAIMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type OpenAICompletion = {
  choices?: Array<{
    message?: { content?: string };
    finish_reason?: string;
  }>;
};

// ─── Main function ────────────────────────────────────────────────────────────

export async function generateMercuryITSMResponse(
  input: ITSMResponseInput
): Promise<ITSMResponse> {
  if (!hasMercuryConfig()) {
    return generateMockITSMResponse(input);
  }

  const kbSection = buildKBSection(input.knowledgeMatches);
  const caseCtx = buildCaseContext(input.sessionContext);
  const memorySection = buildMemoryPromptSection(input.sessionContext.userMemory ?? null);
  const systemFull = itsmSystemPrompt + kbSection + caseCtx + memorySection;

  // Historial conversacional como mensajes separados (NO como JSON embebido)
  const messages: OpenAIMessage[] = [
    { role: "system", content: systemFull },
    // Contexto de sesión anterior como mensajes reales
    ...input.sessionContext.messages
      .filter((m) => m.role === "user" || m.role === "assistant")
      .slice(-10) // últimos 10 mensajes para no exceder contexto
      .map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
    // Mensaje actual del usuario
    { role: "user", content: input.userMessage },
  ];

  const baseUrl = (process.env.MERCURY_BASE_URL ?? "https://api.inceptionlabs.ai/v1").replace(/\/$/, "");

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.MERCURY_API_KEY}`,
      },
      body: JSON.stringify({
        model: process.env.MERCURY_MODEL ?? "mercury-2",
        messages,
        max_tokens: 512,
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      console.warn(`[MercuryClient] API error ${response.status}, falling back`);
      return generateMockITSMResponse(input);
    }

    const completion = (await response.json()) as OpenAICompletion;
    const assistantMessage =
      completion.choices?.[0]?.message?.content?.trim() ?? "";

    if (!assistantMessage) {
      console.warn("[MercuryClient] Empty response, falling back");
      return generateMockITSMResponse(input);
    }

    // El LLM generó la respuesta textual. Ahora usamos el motor de reglas
    // para extraer la clasificación estructurada (más fiable que pedirle JSON a Mercury).
    const mergedContext: SessionContext = {
      ...input.sessionContext,
      collectedFields: extractFields(input.userMessage, input.sessionContext),
    };

    const classification: ITSMIntent =
      input.detectedIntent ?? detectIntent(input.userMessage);
    const priority: ITSMPriority = determinePriority(
      input.userMessage,
      classification,
      mergedContext
    );

    const article = input.knowledgeMatches[0] as KnowledgeArticle | undefined;
    const ticketDraft = buildTicketDraft({
      message: input.userMessage,
      intent: classification,
      priority,
      article,
      context: mergedContext,
    });

    const requiredFields = getMissingFields(mergedContext, priority);
    const shouldEscalate =
      priority === "P1" ||
      classification === "SECURITY_INCIDENT" ||
      shouldCreateTicketFromMessage(input.userMessage, priority, classification);
    const shouldCreateTicket =
      shouldEscalate && requiredFields.length === 0;

    const operationalStatuses: OperationalStatus[] = shouldCreateTicket
      ? [
          "Detectando intención",
          "Consultando base de conocimiento",
          "Preparando ticket",
        ]
      : [
          "Detectando intención",
          "Consultando base de conocimiento",
          "Ejecutando guía de descarte",
        ];

    return {
      assistantMessage,
      classification,
      priority,
      requiredFields,
      suggestedActions: [
        article?.resolutionSteps[0] ?? "Continuar diagnóstico",
      ],
      operationalStatuses,
      shouldCreateTicket,
      shouldEscalate,
      ticketDraft,
    };
  } catch (err) {
    console.error("[MercuryClient] Unexpected error:", err);
    return generateMockITSMResponse(input);
  }
}
