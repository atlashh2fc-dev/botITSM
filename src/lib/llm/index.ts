/**
 * llm/index.ts — Router de 3 niveles del motor IA
 *
 * Diseñado para "costo marginal decreciente" a escala de miles de usuarios:
 * el LLM se invoca solo cuando los niveles anteriores no son suficientes.
 *
 * ┌────────────────────────────────────────────────────────────────────┐
 * │  TIER 1 — Motor ITIL determinístico            ~60% del volumen   │
 * │  Saludos, resoluciones, hardware playbooks, follow-ups activos    │
 * │  0 costo LLM · < 10ms · 100% predecible                          │
 * ├────────────────────────────────────────────────────────────────────┤
 * │  TIER 2 — KB match con umbral de confianza     ~25% del volumen   │
 * │  Cuando el KB identifica el caso con score ≥ 6                   │
 * │  0 costo LLM · ~50ms · plantilla de descarte segura              │
 * ├────────────────────────────────────────────────────────────────────┤
 * │  TIER 3 — LLM (Anthropic → Mercury)           ~15% del volumen   │
 * │  Solo para casos ambiguos o sin template claro                   │
 * │  Historial real · KB inyectado · tool calling ITIL               │
 * └────────────────────────────────────────────────────────────────────┘
 *
 * Escalamiento es siempre determinístico (engine.ts) — nunca vía LLM.
 */

import type { ITSMResponse, ITSMResponseInput } from "@/lib/itsm/types";
import { isResolvedMessage } from "@/lib/itsm/engine";
import { resolveContextualContinuation } from "@/lib/itsm/continuation";
import { findKnowledgeMatchesWithScore } from "@/data/mock/knowledgeBase";
import { generateAnthropicITSMResponse, hasAnthropicConfig } from "@/lib/llm/claudeClient";
import { generateMercuryITSMResponse, hasMercuryConfig } from "@/lib/llm/mercuryClient";
import { generateMockITSMResponse } from "@/lib/llm/mockClient";

// ─── Umbral de confianza para Tier 2 ─────────────────────────────────────────
//
// Score mínimo del KB match para resolver con plantilla (sin LLM).
// Composición del score: tagScore*2 + symptomScore + intentScore(3) + preferredScore(8)
//
// Ejemplos con score ≥ 6 (Tier 2):
//   "excel no abre"        → kb-excel-wont-open    : score 8  (tags×2 + intent)
//   "vpn no conecta"       → kb-vpn-validation     : score 6  (tag + symptom + intent)
//   "cuenta bloqueada"     → kb-account-locked     : score 9  (tags + intent)
//   "barra de tareas"      → kb-windows-taskbar    : score 8  (tags + intent)
//
// Ejemplos con score < 6 (→ Tier 3 LLM):
//   "mi excel se volvió loco"  → score 2 (solo tag "excel", sin "no abre")
//   "no puedo trabajar"        → score 0 (sin match)
//   "tengo un problema raro"   → score 0 (sin match)
//
const KB_CONFIDENCE_THRESHOLD = 6;

// IDs de artículos KB que tienen playbooks específicos en serviceDeskLayer.
// Siempre van a Tier 1 — el playbook multi-turno es más fiable que el LLM para hardware.
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
]);

// ─── Router principal ─────────────────────────────────────────────────────────

export async function generateITSMResponse(
  input: ITSMResponseInput,
): Promise<ITSMResponse> {

  // ══════════════════════════════════════════════════════════════════════
  // TIER 1 — Determinístico
  // Casos donde las reglas son más fiables, predecibles y eficientes que
  // un LLM. Cubre la mayoría del volumen real de una mesa de ayuda L1.
  // ══════════════════════════════════════════════════════════════════════

  // 1a. Saludo puro → respuesta de bienvenida
  if (isGreetingOnly(input.userMessage)) {
    return generateMockITSMResponse(input);
  }

  // 1b. Confirmación de resolución → cierre del caso
  if (isResolvedMessage(input.userMessage)) {
    return generateMockITSMResponse(input);
  }

  // 1c. Hardware troubleshooting
  // serviceDeskLayer tiene playbooks multi-turno diseñados para hardware:
  // diagnóstico guiado, aislamiento de componente, escalamiento con contexto.
  // Son más deterministas y fiables que el LLM para estos flujos físicos.
  if (isHardwareTroubleshooting(input)) {
    return generateMockITSMResponse(input);
  }

  // 1d. Diagnóstico llegó al stage prepare_escalation → finalizar con contexto
  if (isReadyDiagnosticFollowUp(input)) {
    return generateMockITSMResponse(input);
  }

  // 1e. Follow-up de artículo KB activo (Excel, Taskbar, Monitor externo…)
  // continuation.ts maneja la continuidad del diagnóstico sin LLM cuando
  // hay un artículo activo y el usuario está respondiendo dentro del flujo.
  const contextualResponse = resolveContextualContinuation(input);
  if (contextualResponse) {
    return contextualResponse;
  }

  // ══════════════════════════════════════════════════════════════════════
  // TIER 2 — KB match con confianza alta
  // Cuando el motor de búsqueda identifica con claridad el artículo KB
  // aplicable, entregamos la respuesta de plantilla directamente.
  // No hay LLU call: el KB + el motor de reglas son suficientes.
  // ══════════════════════════════════════════════════════════════════════

  if (hasHighConfidenceKBMatch(input)) {
    return generateMockITSMResponse(input);
  }

  // ══════════════════════════════════════════════════════════════════════
  // TIER 3 — LLM (solo cuando los niveles anteriores no resuelven)
  // Casos ambiguos, lenguaje natural que no matchea keywords, incidentes
  // complejos o multi-sistema. Representa ~15% del volumen real.
  //
  // "Costo marginal decreciente": el 85% del volumen no llega aquí.
  // ══════════════════════════════════════════════════════════════════════

  if (hasAnthropicConfig()) {
    return generateAnthropicITSMResponse(input);
  }

  if (hasMercuryConfig()) {
    return generateMercuryITSMResponse(input);
  }

  // ── Fallback: sin LLM configurado ────────────────────────────────────
  return generateMockITSMResponse(input);
}

// ─── Helpers de clasificación por tier ───────────────────────────────────────

/**
 * Tier 2: retorna true si el KB match tiene score suficiente para
 * responder con plantilla sin necesidad de LLM.
 */
function hasHighConfidenceKBMatch(input: ITSMResponseInput): boolean {
  if (!input.knowledgeMatches.length) return false;

  const scoredMatches = findKnowledgeMatchesWithScore(
    input.userMessage,
    input.detectedIntent,
  );

  if (!scoredMatches.length) return false;

  const topScore = scoredMatches[0].score;
  return topScore >= KB_CONFIDENCE_THRESHOLD;
}

/** Tier 1: diagnóstico de hardware en curso (playbook activo o intención detectada). */
function isHardwareTroubleshooting(input: ITSMResponseInput): boolean {
  return (
    input.detectedIntent === "HARDWARE_ISSUE" ||
    HARDWARE_PLAYBOOK_ARTICLE_IDS.has(input.sessionContext.activeArticleId ?? "")
  );
}

/** Tier 1: el diagnóstico llegó al estado final antes de escalar. */
function isReadyDiagnosticFollowUp(input: ITSMResponseInput): boolean {
  return input.sessionContext.diagnostic?.stage === "prepare_escalation";
}

/** Tier 1: saludo sin contenido operacional. */
function isGreetingOnly(message: string): boolean {
  const text = normalize(message);
  return /^(hola|buenas|buenos dias|buenas tardes|buenas noches|hello|hi)[.!¡! ]*$/.test(text);
}

function normalize(message: string): string {
  return message
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}
