/**
 * claudeClient.ts
 * Motor LLM primario basado en Anthropic Claude.
 * Usa tool calling para clasificación ITIL estructurada y pasa el historial
 * conversacional completo como mensajes separados (no como JSON embebido).
 */

import Anthropic from "@anthropic-ai/sdk";
import { itsmSystemPrompt, itsmToolCallingNote } from "@/lib/llm/prompts/itsmSystemPrompt";
import { buildMemoryPromptSection } from "@/services/memory.repository";
import { generateMockITSMResponse } from "@/lib/llm/mockClient";
import {
  buildTicketDraft,
  determinePriority,
  extractFields,
  getMissingFields,
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

// ─── Client singleton ────────────────────────────────────────────────────────

let _anthropic: Anthropic | null = null;

function getAnthropicClient(): Anthropic {
  if (!_anthropic) {
    _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return _anthropic;
}

export function hasAnthropicConfig(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

// ─── Context builders ────────────────────────────────────────────────────────

/**
 * Convierte los artículos KB más relevantes en texto estructurado para el
 * system prompt. El LLM los usa para guiar el descarte paso a paso.
 */
function buildKBSection(matches: KnowledgeArticle[]): string {
  if (!matches.length) return "";

  const top = matches.slice(0, 3);
  const sections = top.map((a) =>
    [
      `### KB: ${a.title}`,
      `Categoría: ${a.category}`,
      `Síntomas típicos: ${a.symptoms.join("; ")}`,
      `Pasos de descarte autorizados:`,
      a.resolutionSteps.map((s, i) => `  ${i + 1}. ${s}`).join("\n"),
      `Escalar si: ${a.escalationCriteria.join("; ")}`,
    ].join("\n")
  );

  return (
    "\n\n---\n## Artículos KB relevantes para este caso\n\n" +
    sections.join("\n\n---\n")
  );
}

/**
 * Resume el contexto del caso activo para que el LLM no pierda estado
 * entre turnos (datos ya recopilados, pasos ya ejecutados).
 */
function buildCaseContext(context: SessionContext): string {
  const fields = context.collectedFields;
  const parts: string[] = [];

  if (fields.nombre) parts.push(`Nombre: ${fields.nombre}`);
  if (fields.correo) parts.push(`Correo: ${fields.correo}`);
  if (fields.area) parts.push(`Área: ${fields.area}`);
  if (fields.sistema) parts.push(`Sistema afectado: ${fields.sistema}`);
  if (fields.activo) parts.push(`Activo: ${fields.activo}`);
  if (fields.impacto) parts.push(`Impacto declarado: ${fields.impacto}`);
  if (fields.urgencia) parts.push(`Urgencia: ${fields.urgencia}`);
  if (context.stepsExecuted.length)
    parts.push(`Pasos ya ejecutados: ${context.stepsExecuted.slice(-4).join("; ")}`);
  if (context.diagnostic?.stage)
    parts.push(`Etapa de diagnóstico: ${context.diagnostic.stage}`);

  if (!parts.length) return "";

  return "\n\n---\n## Estado actual del caso\n" + parts.join("\n");
}

// ─── Tool definition ─────────────────────────────────────────────────────────

const CLASSIFY_TOOL: Anthropic.Tool = {
  name: "clasificar_caso_itsm",
  description:
    "Registra la clasificación ITIL interna del caso. Llama esta tool SIEMPRE al final de cada turno, de forma invisible al usuario.",
  input_schema: {
    type: "object",
    properties: {
      classification: {
        type: "string",
        enum: [
          "INCIDENT",
          "SERVICE_REQUEST",
          "ACCESS_REQUEST",
          "SOFTWARE_REQUEST",
          "HARDWARE_ISSUE",
          "NETWORK_ISSUE",
          "SECURITY_INCIDENT",
          "HUMAN_ESCALATION",
        ],
        description: "Tipo ITIL del caso según la última interacción",
      },
      priority: {
        type: "string",
        enum: ["P1", "P2", "P3", "P4"],
        description:
          "Prioridad ITIL. P1=crítico/masivo, P2=alto/urgente, P3=individual/acotado, P4=bajo/planificable",
      },
      shouldCreateTicket: {
        type: "boolean",
        description:
          "true solo si en este turno el caso ya tiene suficiente contexto Y requiere formalización (P1, seguridad, falla persistente o usuario solicita escalar)",
      },
      shouldEscalate: {
        type: "boolean",
        description:
          "true si el caso debe ir a soporte humano de inmediato en este turno",
      },
      suggestedActions: {
        type: "array",
        items: { type: "string" },
        description:
          "Acciones operacionales concretas ejecutadas o propuestas en este turno (para el log interno)",
      },
    },
    required: [
      "classification",
      "priority",
      "shouldCreateTicket",
      "shouldEscalate",
      "suggestedActions",
    ],
  },
};

// ─── Main function ────────────────────────────────────────────────────────────

export async function generateAnthropicITSMResponse(
  input: ITSMResponseInput
): Promise<ITSMResponse> {
  if (!hasAnthropicConfig()) {
    return generateMockITSMResponse(input);
  }

  const kbSection = buildKBSection(input.knowledgeMatches);
  const caseContext = buildCaseContext(input.sessionContext);
  const memorySection = buildMemoryPromptSection(input.sessionContext.userMemory ?? null);
  const systemFull =
    itsmSystemPrompt + itsmToolCallingNote + kbSection + caseContext + memorySection;

  // Historial conversacional como mensajes reales (no JSON embebido)
  const conversationHistory: Anthropic.MessageParam[] =
    input.sessionContext.messages
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }));

  // Agregar el mensaje actual del usuario
  conversationHistory.push({ role: "user", content: input.userMessage });

  try {
    const anthropic = getAnthropicClient();
    const response = await anthropic.messages.create({
      model: process.env.ANTHROPIC_MODEL ?? "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      system: systemFull,
      tools: [CLASSIFY_TOOL],
      tool_choice: { type: "auto" },
      messages: conversationHistory,
    });

    // Extraer respuesta textual (lo que el usuario ve)
    const textBlock = response.content.find((b) => b.type === "text");
    const toolBlock = response.content.find(
      (b) => b.type === "tool_use" && b.name === "clasificar_caso_itsm"
    );

    const assistantMessage =
      textBlock?.type === "text" ? textBlock.text.trim() : "";

    if (!assistantMessage) {
      console.warn("[AnthropicClient] No text block in response, falling back");
      return generateMockITSMResponse(input);
    }

    // Extraer clasificación ITIL de la tool call
    let classification: ITSMIntent =
      input.detectedIntent ?? "INCIDENT";
    let priority: ITSMPriority = "P3";
    let shouldCreateTicket = false;
    let shouldEscalate = false;
    let suggestedActions: string[] = [];

    if (toolBlock?.type === "tool_use") {
      const ti = toolBlock.input as {
        classification: ITSMIntent;
        priority: ITSMPriority;
        shouldCreateTicket: boolean;
        shouldEscalate: boolean;
        suggestedActions: string[];
      };
      classification = ti.classification;
      priority = ti.priority;
      shouldCreateTicket = ti.shouldCreateTicket;
      shouldEscalate = ti.shouldEscalate;
      suggestedActions = Array.isArray(ti.suggestedActions)
        ? ti.suggestedActions
        : [];
    } else {
      // Sin tool call: usar el motor de reglas para clasificación
      priority = determinePriority(
        input.userMessage,
        classification,
        input.sessionContext
      );
    }

    // Construir contexto enriquecido con campos extraídos
    const mergedContext: SessionContext = {
      ...input.sessionContext,
      collectedFields: extractFields(
        input.userMessage,
        input.sessionContext
      ),
      detectedIntent: classification,
      priority,
    };

    // Generar ticket draft usando el motor existente (robusto para estructurar datos)
    const article = input.knowledgeMatches[0] as KnowledgeArticle | undefined;
    const ticketDraft = buildTicketDraft({
      message: input.userMessage,
      intent: classification,
      priority,
      article,
      context: mergedContext,
    });

    const requiredFields = getMissingFields(mergedContext, priority);

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
      suggestedActions: suggestedActions.length
        ? suggestedActions
        : [article?.resolutionSteps[0] ?? "Recopilar contexto inicial"],
      operationalStatuses,
      shouldCreateTicket,
      shouldEscalate,
      ticketDraft,
    };
  } catch (err) {
    console.error("[AnthropicClient] Error calling API:", err);
    return generateMockITSMResponse(input);
  }
}
