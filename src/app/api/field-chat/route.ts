/**
 * /api/field-chat — Copiloto Técnico en Terreno
 *
 * Extiende el motor IA con:
 *  - Visión: análisis de fotos de fallas con Claude (si ANTHROPIC_API_KEY disponible)
 *  - RAG: knowledge base completa inyectada en sistema para cada turno
 *  - Contexto de terreno: zona, equipo, tipo de falla
 *  - Respuesta directa tipo copiloto: causa probable + checklist + escalamiento
 */

import { NextResponse } from "next/server";
import { knowledgeBase } from "@/data/mock/knowledgeBase";

type FieldChatRequest = {
  message: string;
  imageBase64?: string;       // Foto de la falla en base64 (sin prefijo data:...)
  imageMime?: string;         // "image/jpeg" | "image/png" | "image/webp"
  history?: Array<{ role: "user" | "assistant"; content: string }>;
  zone?: string;
  techRole?: string;
};

// ─── System prompt para copiloto técnico ─────────────────────────────────────

function buildFieldSystemPrompt(): string {
  const kbSections = knowledgeBase.map(
    (a) => `### ${a.title}
Categoría: ${a.category}
Síntomas: ${a.symptoms.join(" | ")}
Procedimiento:
${a.resolutionSteps.map((s, i) => `  ${i + 1}. ${s}`).join("\n")}
Escalar si: ${a.escalationCriteria.join(" | ")}
Tags: ${a.tags?.join(", ") ?? "—"}`
  );

  return `Eres el Copiloto Técnico IA de SONDA para técnicos en terreno.

Tu función es ayudar a técnicos que están físicamente en sitio a diagnosticar y resolver fallas de TI.
Eres conciso, práctico y orientado a la acción. Usas lenguaje técnico directo.

Cuando el técnico te envía una foto o describe una falla:
1. Identifica la causa más probable.
2. Entrega un checklist de pasos de resolución ordenados por probabilidad.
3. Indica cuándo escalar y a qué equipo.
4. Si hay un procedimiento oficial en la base de conocimiento SONDA, úsalo como referencia principal.

Formato de respuesta:
- Usa markdown: **negrita** para puntos clave, listas numeradas para pasos.
- Sé breve: máximo 300 palabras por respuesta.
- Termina siempre con "🔴 Escalar si:" seguido de los criterios de escalamiento aplicables.

---
## Base de Conocimiento SONDA (RAG)

${kbSections.join("\n\n---\n\n")}
`;
}

// ─── Llamada a Claude con visión ──────────────────────────────────────────────

async function callClaudeWithVision(
  userMessage: string,
  imageBase64: string | undefined,
  imageMime: string | undefined,
  history: Array<{ role: "user" | "assistant"; content: string }>,
  systemPrompt: string
): Promise<string> {
  const Anthropic = (await import("@anthropic-ai/sdk")).default;
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  // Construir el contenido del mensaje actual
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const currentContent: any[] = [];

  if (imageBase64 && imageMime) {
    currentContent.push({
      type: "image",
      source: {
        type: "base64",
        media_type: imageMime as "image/jpeg" | "image/png" | "image/webp" | "image/gif",
        data: imageBase64,
      },
    });
  }

  currentContent.push({ type: "text", text: userMessage || "Analiza esta imagen de la falla." });

  // Historial previo
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const messages: any[] = [
    ...history.slice(-10).map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: currentContent },
  ];

  const response = await client.messages.create({
    model: process.env.ANTHROPIC_MODEL ?? "claude-haiku-4-5-20251001",
    max_tokens: 1024,
    system: systemPrompt,
    messages,
  });

  const text = response.content.find((b) => b.type === "text");
  return text?.type === "text" ? text.text.trim() : "No se pudo generar diagnóstico.";
}

// ─── Llamada a Mercury (OpenAI-compatible, sin visión) ─────────────────────────

async function callMercury(
  userMessage: string,
  imageBase64: string | undefined,
  history: Array<{ role: "user" | "assistant"; content: string }>,
  systemPrompt: string
): Promise<string> {
  const baseUrl = (process.env.MERCURY_BASE_URL ?? "").replace(/\/$/, "");

  const messages = [
    { role: "system", content: systemPrompt },
    ...history.slice(-10),
    {
      role: "user",
      content: imageBase64
        ? `[El técnico adjuntó una foto de la falla — describir como imagen no disponible para análisis visual]\n\n${userMessage || "Analiza la falla adjunta."}`
        : userMessage,
    },
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
      max_tokens: 700,
      temperature: 0.3,
    }),
  });

  if (!response.ok) throw new Error(`Mercury error ${response.status}`);
  const data = await response.json();
  return data.choices?.[0]?.message?.content?.trim() ?? "Sin respuesta del modelo.";
}

// ─── Handler principal ────────────────────────────────────────────────────────

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as FieldChatRequest;
    const { message, imageBase64, imageMime, history = [], zone, techRole } = body;

    if (!message && !imageBase64) {
      return NextResponse.json({ error: "Mensaje o imagen requeridos" }, { status: 400 });
    }

    const systemPrompt = buildFieldSystemPrompt();

    // Enriquecer el mensaje con contexto de terreno
    const contextPrefix = [
      zone ? `[Zona: ${zone}]` : null,
      techRole ? `[Rol: ${techRole}]` : null,
    ].filter(Boolean).join(" ");

    const enrichedMessage = contextPrefix
      ? `${contextPrefix}\n${message || ""}`
      : message || "";

    let assistantMessage: string;

    if (imageBase64 && process.env.ANTHROPIC_API_KEY) {
      // Claude con visión real
      assistantMessage = await callClaudeWithVision(
        enrichedMessage, imageBase64, imageMime, history, systemPrompt
      );
    } else if (process.env.MERCURY_API_KEY && process.env.MERCURY_BASE_URL) {
      // Mercury sin visión
      assistantMessage = await callMercury(
        enrichedMessage, imageBase64, history, systemPrompt
      );
    } else {
      // Fallback demo
      assistantMessage = `**Diagnóstico demo (sin LLM configurado)**\n\nPara análisis de fallas en tiempo real, configura \`ANTHROPIC_API_KEY\` o \`MERCURY_API_KEY\` en las variables de entorno.\n\n🔴 **Escalar si:** no hay conexión al motor IA.`;
    }

    return NextResponse.json({ assistantMessage });
  } catch (err) {
    console.error("[field-chat] Error:", err);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
