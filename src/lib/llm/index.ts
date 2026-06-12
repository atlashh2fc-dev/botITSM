/**
 * llm/index.ts — Router de 3 niveles del motor IA
 *
 * Diseñado como router operacional por costo y confianza:
 * 1) playbooks simples de conversación,
 * 2) RAG/KB L1-L2 cuando tiene contexto suficiente para avanzar,
 * 3) IA solo cuando el RAG no satisface el turno.
 *
 * ┌────────────────────────────────────────────────────────────────────┐
 * │  TIER 1 — Playbooks simples                                      │
 * │  Saludos, cierre/resolución y controles conversacionales          │
 * ├────────────────────────────────────────────────────────────────────┤
 * │  TIER 2 — RAG/KB mesa de ayuda L1-L2                              │
 * │  Artículos, troubleshooting y playbooks con confianza suficiente  │
 * ├────────────────────────────────────────────────────────────────────┤
 * │  TIER 3 — IA                                                      │
 * │  Solo si RAG no matchea, no avanza o repetiría el turno           │
 * └────────────────────────────────────────────────────────────────────┘
 *
 * El KB/RAG no es un chatbot ciego: si no puede avanzar, deriva al motor IA.
 */

import type { ITSMResponse, ITSMResponseInput } from "@/lib/itsm/types";
import { isResolvedMessage } from "@/lib/itsm/engine";
import { resolveContextualContinuation } from "@/lib/itsm/continuation";
import { resolveRagTurn } from "@/lib/itsm/ragEngine";
import { generateAnthropicITSMResponse, hasAnthropicConfig } from "@/lib/llm/claudeClient";
import { generateMercuryITSMResponse, hasMercuryConfig } from "@/lib/llm/mercuryClient";
import { generateMockITSMResponse } from "@/lib/llm/mockClient";

// ─── Router principal ─────────────────────────────────────────────────────────

export async function generateITSMResponse(
  input: ITSMResponseInput,
): Promise<ITSMResponse> {
  // ══════════════════════════════════════════════════════════════════════
  // TIER 1 — Playbooks simples
  // ══════════════════════════════════════════════════════════════════════

  if (isGreetingOnly(input.userMessage)) {
    return generateMockITSMResponse(input);
  }

  // En identidad, respuestas como "listo" o "hecho" suelen significar
  // "ya hice el reset", no que el acceso quedó recuperado.
  if (isAccountAccessContinuation(input)) {
    const accountContinuation = resolveContextualContinuation(input);
    if (accountContinuation) {
      return accountContinuation;
    }
  }

  if (isResolvedMessage(input.userMessage)) {
    return generateMockITSMResponse(input);
  }

  // ══════════════════════════════════════════════════════════════════════
  // TIER 2 — RAG/KB L1-L2
  // ══════════════════════════════════════════════════════════════════════

  const ragDecision = await resolveRagTurn(input);
  if (ragDecision.satisfied && ragDecision.response) {
    return ragDecision.response;
  }

  // ══════════════════════════════════════════════════════════════════════
  // TIER 3 — IA
  // ══════════════════════════════════════════════════════════════════════

  if (hasAnthropicConfig()) {
    return generateAnthropicITSMResponse(input);
  }

  if (hasMercuryConfig()) {
    return generateMercuryITSMResponse(input);
  }

  // Sin IA configurada, usar la mejor respuesta RAG aunque sea imperfecta.
  return ragDecision.response ?? generateMockITSMResponse(input);
}

// ─── Helpers de clasificación por tier ───────────────────────────────────────

function isAccountAccessContinuation(input: ITSMResponseInput): boolean {
  return input.sessionContext.activeArticleId === "kb-account-locked";
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
