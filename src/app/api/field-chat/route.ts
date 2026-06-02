/**
 * /api/field-chat — Copiloto Técnico en Terreno
 * Modo triage: respuestas cortas, pide evidencia, descarta rápido.
 */

import { NextResponse } from "next/server";
import { knowledgeBase } from "@/data/mock/knowledgeBase";

export const maxDuration = 30;

type FieldChatRequest = {
  message: string;
  imageBase64?: string;
  imageMime?: string;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
  zone?: string;
  techRole?: string;
};

// ─── KB relevante al mensaje (top 3, compacto) ────────────────────────────────

function getRelevantKB(userMessage: string): string {
  const words = userMessage.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
  if (!words.length) return "";

  const scored = knowledgeBase.map((a) => {
    const allText = [a.title, ...a.symptoms, ...(a.tags ?? [])].join(" ").toLowerCase();
    const score = words.filter((w) => allText.includes(w)).length;
    return { a, score };
  }).filter(({ score }) => score > 0).sort((x, y) => y.score - x.score).slice(0, 3);

  if (!scored.length) return "";

  return "\n## Procedimientos SONDA aplicables:\n" + scored.map(({ a }) =>
    `**${a.title}**: ${a.resolutionSteps.slice(0, 3).map((s, i) => `${i + 1}) ${s}`).join(" → ")}. Escalar si: ${a.escalationCriteria[0]}.`
  ).join("\n");
}

// ─── System prompt — modo triage ─────────────────────────────────────────────

function buildSystemPrompt(userMessage: string, hasImage: boolean): string {
  const kb = getRelevantKB(userMessage);

  return `Eres el Copiloto Técnico de SONDA. Ayudas a técnicos en terreno con fallas de TI.

REGLAS ESTRICTAS:
- Máximo 120 palabras por respuesta.
- NUNCA respondas genérico. Si no tienes suficiente info, haz UNA pregunta específica.
- Primero descarta lo obvio (reinicio, cable, energía) ANTES de dar diagnóstico completo.
- Si el técnico no ha dado evidencia concreta (código de error, qué intentó, modelo del equipo), PÍDELA.
- Formato: causa probable en 1 línea → 2-3 pasos de descarte → "🔴 Escalar si: [criterio]".
- Si hay foto adjunta, basate en lo visual antes de preguntar.${hasImage ? "\n- El técnico adjuntó una foto. Analízala y comenta lo que ves antes de preguntar." : ""}
${kb}`;
}

// ─── Claude con visión ────────────────────────────────────────────────────────

async function callClaude(
  userMessage: string,
  imageBase64: string | undefined,
  imageMime: string | undefined,
  history: Array<{ role: "user" | "assistant"; content: string }>,
  systemPrompt: string
): Promise<string> {
  const Anthropic = (await import("@anthropic-ai/sdk")).default;
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const currentContent: any[] = [];
  if (imageBase64) {
    currentContent.push({
      type: "image",
      source: { type: "base64", media_type: (imageMime ?? "image/jpeg") as "image/jpeg", data: imageBase64 },
    });
  }
  currentContent.push({ type: "text", text: userMessage || "Analiza la falla de la imagen." });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const messages: any[] = [
    ...history.slice(-10).map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: currentContent },
  ];

  const response = await client.messages.create({
    model: process.env.ANTHROPIC_MODEL ?? "claude-haiku-4-5-20251001",
    max_tokens: 350,
    system: systemPrompt,
    messages,
  });

  const text = response.content.find((b) => b.type === "text");
  return text?.type === "text" ? text.text.trim() : "No se pudo generar diagnóstico.";
}

// ─── Mercury ──────────────────────────────────────────────────────────────────

async function callMercury(
  userMessage: string,
  hasImage: boolean,
  history: Array<{ role: "user" | "assistant"; content: string }>,
  systemPrompt: string
): Promise<string> {
  const baseUrl = (process.env.MERCURY_BASE_URL ?? "").replace(/\/$/, "");
  const userContent = hasImage
    ? `[Foto adjunta de la falla]\n${userMessage || "Diagnostica."}`
    : userMessage;

  const messages = [
    { role: "system", content: systemPrompt },
    ...history.slice(-10),
    { role: "user", content: userContent },
  ];

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.MERCURY_API_KEY}` },
    body: JSON.stringify({ model: process.env.MERCURY_MODEL ?? "mercury-2", messages, max_tokens: 350, temperature: 0.2 }),
    signal: AbortSignal.timeout(20000),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Mercury ${response.status}: ${body.slice(0, 200)}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content?.trim() ?? "Sin respuesta.";
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as FieldChatRequest;
    const { message = "", imageBase64, imageMime, history = [], zone, techRole } = body;

    if (!message && !imageBase64) {
      return NextResponse.json({ error: "Mensaje o imagen requeridos" }, { status: 400 });
    }

    const contextPrefix = [zone && `[Zona: ${zone}]`, techRole && `[Rol: ${techRole}]`].filter(Boolean).join(" ");
    const enrichedMessage = contextPrefix ? `${contextPrefix}\n${message}` : message;
    const systemPrompt = buildSystemPrompt(message, Boolean(imageBase64));

    let assistantMessage: string;

    if (imageBase64 && process.env.ANTHROPIC_API_KEY) {
      assistantMessage = await callClaude(enrichedMessage, imageBase64, imageMime, history, systemPrompt);
    } else if (process.env.MERCURY_API_KEY && process.env.MERCURY_BASE_URL) {
      assistantMessage = await callMercury(enrichedMessage, Boolean(imageBase64), history, systemPrompt);
    } else {
      assistantMessage = "**Modo demo** — configura `ANTHROPIC_API_KEY` o `MERCURY_API_KEY`.\n\n🔴 **Escalar si:** no hay motor IA.";
    }

    return NextResponse.json({ assistantMessage });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[field-chat]", msg);
    return NextResponse.json({ error: `Error: ${msg.slice(0, 300)}` }, { status: 500 });
  }
}
