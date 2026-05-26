/**
 * llm/index.ts — Router principal del motor IA
 *
 * Prioridad de motores:
 *   1. Anthropic (Claude) — motor primario, tool calling, historial real
 *   2. Mercury-2 (InceptionLabs) — motor secundario, historial real
 *   3. Mock (motor de reglas) — solo cuando no hay LLM configurado
 *
 * IMPORTANTE: cuando hay LLM configurado, NO se bypasea para greetings,
 * hardware ni follow-ups. El LLM maneja TODO — eso es lo que permite
 * comprensión real del lenguaje natural y contexto conversacional.
 */

import type { ITSMResponse, ITSMResponseInput } from "@/lib/itsm/types";
import { generateAnthropicITSMResponse, hasAnthropicConfig } from "@/lib/llm/claudeClient";
import { generateMercuryITSMResponse, hasMercuryConfig } from "@/lib/llm/mercuryClient";
import { generateMockITSMResponse } from "@/lib/llm/mockClient";

export async function generateITSMResponse(
  input: ITSMResponseInput
): Promise<ITSMResponse> {
  // ── Motor 1: Anthropic (Claude) ─────────────────────────────────────────
  // Máxima capacidad: tool calling, comprensión NLU, historial conversacional real.
  if (hasAnthropicConfig()) {
    return generateAnthropicITSMResponse(input);
  }

  // ── Motor 2: Mercury-2 ──────────────────────────────────────────────────
  // Motor secundario: historial conversacional real + KB inyectado.
  // Clasificación estructurada generada por el engine.ts post-respuesta.
  if (hasMercuryConfig()) {
    return generateMercuryITSMResponse(input);
  }

  // ── Motor 3: Mock (sin LLM) ─────────────────────────────────────────────
  // Solo cuando no hay LLM configurado. Usa reglas deterministicas + playbooks.
  // Mantiene los optimizadores específicos para hardware y follow-ups
  // porque en modo mock son necesarios (no hay NLU que los maneje).
  if (isGreetingOnly(input.userMessage)) {
    return generateMockITSMResponse(input);
  }

  if (isHardwareTroubleshooting(input)) {
    return generateMockITSMResponse(input);
  }

  if (isReadyDiagnosticFollowUp(input)) {
    return generateMockITSMResponse(input);
  }

  const { resolveContextualContinuation } = await import("@/lib/itsm/continuation");
  const contextualResponse = resolveContextualContinuation(input);
  if (contextualResponse) {
    return contextualResponse;
  }

  return generateMockITSMResponse(input);
}

// ─── Helpers solo para modo Mock ──────────────────────────────────────────────

function isReadyDiagnosticFollowUp(input: ITSMResponseInput) {
  return input.sessionContext.diagnostic?.stage === "prepare_escalation";
}

function isGreetingOnly(message: string) {
  const text = normalize(message);
  return /^(hola|buenas|buenos dias|buenas tardes|buenas noches|hello|hi)[.!¡! ]*$/.test(
    text
  );
}

function isHardwareTroubleshooting(input: ITSMResponseInput) {
  return (
    input.detectedIntent === "HARDWARE_ISSUE" ||
    [
      "kb-wired-peripheral",
      "kb-external-display",
      "kb-notebook-display",
      "kb-printer-not-printing",
      "kb-printer-paper-toner",
      "kb-scanner-issue",
      "kb-laptop-no-power",
      "kb-battery-charger",
      "kb-camera-microphone-system",
    ].includes(input.sessionContext.activeArticleId ?? "")
  );
}

function normalize(message: string) {
  return message
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}
