/**
 * /api/field-chat — Copiloto Técnico en Terreno
 */

import { NextResponse } from "next/server";
import { knowledgeBase } from "@/data/mock/knowledgeBase";

// Aumentar body limit para imágenes (Next.js App Router)
export const maxDuration = 30;

type FieldChatRequest = {
  message: string;
  imageBase64?: string;
  imageMime?: string;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
  zone?: string;
  techRole?: string;
};

// ─── System prompt compacto (KB resumida, no completa) ────────────────────────
// Mandamos solo un resumen de tags + título para no exceder el contexto de Mercury

function buildFieldSystemPrompt(userMessage: string): string {
  // Buscar artículos relevantes por keywords del mensaje
  const words = userMessage.toLowerCase().split(/\s+/);
  const scored = knowledgeBase.map((a) => {
    const allText = [a.title, ...a.symptoms, ...(a.tags ?? [])].join(" ").toLowerCase();
    const score = words.filter((w) => w.length > 3 && allText.includes(w)).length;
    return { a, score };
  });

  // Top 4 artículos más relevantes (o los 4 primeros si no hay match)
  const topArticles = scored
    .sort((x, y) => y.score - x.score)
    .slice(0, 4)
    .map(({ a }) =>
      `### ${a.title}
Síntomas: ${a.symptoms.slice(0, 3).join(" | ")}
Pasos: ${a.resolutionSteps.map((s, i) => `${i + 1}. ${s}`).join(" | ")}
Escalar si: ${a.escalationCriteria.slice(0, 2).join(" | ")}`
    )
    .join("\n\n");

  return `Eres el Copiloto Técnico IA de SONDA. Ayudas a técnicos en terreno a diagnosticar y resolver fallas de TI.
Sé conciso, práctico y directo. Responde en máximo 250 palabras.
Usa **negrita** para puntos clave y listas numeradas para pasos.
Termina siempre con "🔴 Escalar si:" y los criterios aplicables.

## Procedimientos SONDA relevantes:
${topArticles || "Aplica criterio técnico general."}`;
}

// ─── Claude con visión ────────────────────────────────────────────────────────

async function callClaudeWithVision(
  userMessage: string,
  imageBase64: string,
  imageMime: string,
  history: Array<{ role: "user" | "assistant"; content: string }>,
  systemPrompt: string
): Promise<string> {
  const Anthropic = (await import("@anthropic-ai/sdk")).default;
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const currentContent: any[] = [
    {
      type: "image",
      source: {
        type: "base64",
        media_type: imageMime as "image/jpeg" | "image/png" | "image/webp" | "image/gif",
        data: imageBase64,
      },
    },
    { type: "text", text: userMessage || "Analiza esta imagen de la falla y entrega diagnóstico." },
  ];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const messages: any[] = [
    ...history.slice(-6).map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: currentContent },
  ];

  const response = await client.messages.create({
    model: process.env.ANTHROPIC_MODEL ?? "claude-haiku-4-5-20251001",
    max_tokens: 800,
    system: systemPrompt,
    messages,
  });

  const text = response.content.find((b) => b.type === "text");
  return text?.type === "text" ? text.text.trim() : "No se pudo generar diagnóstico.";
}

// ─── Mercury (sin visión) ─────────────────────────────────────────────────────

async function callMercury(
  userMessage: string,
  hasImage: boolean,
  history: Array<{ role: "user" | "assistant"; content: string }>,
  systemPrompt: string
): Promise<string> {
  const baseUrl = (process.env.MERCURY_BASE_URL ?? "").replace(/\/$/, "");

  const userContent = hasImage
    ? `[El técnico adjuntó una fotografía de la falla]\n\n${userMessage || "Diagnostica la falla de la imagen."}`
    : userMessage;

  const messages = [
    { role: "system", content: systemPrompt },
    ...history.slice(-6),
    { role: "user", content: userContent },
  ];

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.MERCURY_API_KEY}`,
    },
    body: JSON.stringify({
      model: process.env.MERCURY_MODEL ?? "mercury-2",
      messages,
      max_tokens: 600,
      temperature: 0.3,
    }),
    signal: AbortSignal.timeout(20000),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Mercury ${response.status}: ${body.slice(0, 200)}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content?.trim() ?? "Sin respuesta del modelo.";
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as FieldChatRequest;
    const { message = "", imageBase64, imageMime, history = [], zone, techRole } = body;

    if (!message && !imageBase64) {
      return NextResponse.json({ error: "Mensaje o imagen requeridos" }, { status: 400 });
    }

    const contextPrefix = [
      zone ? `[Zona: ${zone}]` : null,
      techRole ? `[Rol: ${techRole}]` : null,
    ].filter(Boolean).join(" ");

    const enrichedMessage = contextPrefix ? `${contextPrefix}\n${message}` : message;
    const systemPrompt = buildFieldSystemPrompt(message);

    let assistantMessage: string;

    if (imageBase64 && process.env.ANTHROPIC_API_KEY) {
      assistantMessage = await callClaudeWithVision(
        enrichedMessage,
        imageBase64,
        imageMime ?? "image/jpeg",
        history,
        systemPrompt
      );
    } else if (process.env.MERCURY_API_KEY && process.env.MERCURY_BASE_URL) {
      assistantMessage = await callMercury(
        enrichedMessage,
        Boolean(imageBase64),
        history,
        systemPrompt
      );
    } else {
      assistantMessage =
        "**Copiloto en modo demo** — configura `ANTHROPIC_API_KEY` o `MERCURY_API_KEY` para activar el diagnóstico IA.\n\n🔴 **Escalar si:** no hay motor IA disponible.";
    }

    return NextResponse.json({ assistantMessage });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[field-chat] Error:", msg);
    return NextResponse.json(
      { error: `Error del servidor: ${msg.slice(0, 300)}` },
      { status: 500 }
    );
  }
}
