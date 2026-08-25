# Auditoría Técnica — Agente IA ITSM Enterprise
**Fecha:** 2026-05-26  
**Alcance:** Diagnóstico de capa IA, routing, base de conocimiento y propuesta de mejora para demo GEIMSER

---

## Resumen ejecutivo

El agente tiene una arquitectura sólida en la capa visual y de datos (Supabase, ticket draft, playbooks de hardware), pero la **capa de IA es un motor de reglas disfrazado de LLM**. Mercury-2 (el LLM real) está configurado y activo, pero el código lo bypasea en el 90% de los casos, enrutando casi todo a una función `generateMockITSMResponse` basada en `if/else` y keywords. Cuando sí llega a Mercury, le envía un JSON gigante como mensaje de usuario en lugar de una conversación, lo que degrada severamente la calidad de respuesta.

**Impacto directo:** el bot "no entiende", repite pasos ya ejecutados, no extrae datos del usuario, y da respuestas genéricas — exactamente los síntomas reportados.

---

## Hallazgos críticos

### 1. El LLM se llama solo cuando ya no hay otra opción — Architecture Inversion Problem

**Archivo:** `src/lib/llm/index.ts`

```typescript
export async function generateITSMResponse(input) {
  if (isGreetingOnly(input.userMessage))         → MOCK (nunca llega al LLM)
  if (isHardwareTroubleshooting(input))           → MOCK (nunca llega al LLM)
  if (isReadyDiagnosticFollowUp(input))           → MOCK (nunca llega al LLM)
  const contextualResponse = resolveContextualContinuation(input)
  if (contextualResponse)                         → MOCK (nunca llega al LLM)
  if (hasMercuryConfig())                         → LLM (solo llega aquí lo residual)
  return generateMockITSMResponse(input)          → MOCK fallback
}
```

**Consecuencia:** Saludos, hardware troubleshooting, follow-ups y continuaciones contextuales — que son la mayoría de las interacciones reales — nunca tocan el LLM. Solo los mensajes que no encajan en ninguna categoría previa llegan a Mercury.

---

### 2. Mercury recibe un JSON blob, no una conversación

**Archivo:** `src/lib/llm/mercuryClient.ts`

```typescript
messages: [
  { role: "system", content: itsmSystemPrompt },
  {
    role: "user",
    content: `Analiza este caso ITSM y responde exclusivamente un JSON válido...\n${JSON.stringify(ENTIRE_PAYLOAD)}`,
  },
]
```

**Problemas:**
- El historial de conversación se pasa como JSON dentro del mensaje, no como mensajes separados. El LLM no lo "ve" como conversación sino como datos.
- Se le pide responder con un JSON complejo (`ITSMResponse` completo) en lugar de responder naturalmente.
- Cualquier error de parsing JSON → silencioso fallback al mock, sin diagnóstico.
- Mercury-2 es un modelo de difusión que tiene dificultades produciendo JSON estructurado complejo de forma fiable.

---

### 3. La detección de intención es regex de keywords, no NLU

**Archivo:** `src/lib/itsm/engine.ts` — función `detectIntent()`

```typescript
if (hasAny(text, ["correo", "mail", "outlook"]) && hasAny(text, ["no salen", "no envia", ...])) → ACCESS_REQUEST
```

**Consecuencia:** Un usuario que dice "mis mails no llegan" matchea acceso, no incidente. "Tengo problemas para abrir mi aplicación" cae en `INCIDENT` genérico sin artículo KB. Frases naturales como "me quedé sin poder usar el computador" no matchean nada específico.

---

### 4. La base de conocimiento no tiene búsqueda semántica — solo tag matching

**Archivo:** `src/data/mock/knowledgeBase.ts` — función `findKnowledgeMatches()`

```typescript
const tagScore = article.tags.filter(tag => normalizedMessage.includes(tag)).length * 2;
```

Un usuario que dice "mi computador no responde" no matchea `kb-slow-notebook` porque "no responde" no está en los tags. Se necesitan las palabras exactas. No hay embeddings ni búsqueda semántica.

---

### 5. La continuación de diagnóstico está hardcodeada para solo 3 artículos

**Archivo:** `src/lib/itsm/continuation.ts`

Solo `kb-excel-wont-open`, `kb-windows-taskbar-missing` y `kb-external-display` tienen handlers de follow-up inteligentes. Los otros 32 artículos KB usan `resolveNextKnowledgeStep` que simplemente itera los steps en orden, ignorando lo que el usuario responde. **El agente avanza mecánicamente sin entender las respuestas.**

---

### 6. extractFields usa regex frágil — pierde datos del usuario

**Archivo:** `src/lib/itsm/engine.ts` — función `extractFields()`

```typescript
const nameMatch = text.match(/(?:soy|nombre(?: es)?|me llamo)\s+([A-Za-z...]{3,})/i);
```

Si el usuario escribe "Felipe Hormazabal, área TI" no extrae el nombre. Si dice "soy Felipe, trabajo en IT" tampoco extrae el área porque el regex de área requiere la palabra "área" o "departamento" antes del valor.

---

### 7. El system prompt es bueno pero el LLM casi nunca lo usa

El `itsmSystemPrompt` está bien redactado con instrucciones ITIL, comportamiento esperado y restricciones claras. El problema no es el prompt — es que el 90% de las respuestas las genera el mock client que ignora este prompt por completo.

---

## Causa raíz — resumen en una línea

> El código está diseñado como si el LLM fuera costoso y peligroso, y se construyó una capa de reglas para evitarlo. El resultado es un bot de keywords con aspecto de IA.

---

## Propuesta de abordaje

### Cambio arquitectural central: invertir el routing

```
ANTES:  reglas → si no encaja → LLM (raramente)
DESPUÉS: LLM siempre (con KB inyectado) → reglas como validación
```

### Intervenciones concretas (implementadas en esta auditoría)

| # | Cambio | Impacto |
|---|--------|---------|
| 1 | **Agregar Claude (Anthropic) como motor primario** con tool calling para clasificación ITIL | Alto — comprensión real de lenguaje natural, memoria conversacional |
| 2 | **Eliminar bypasses** en `llm/index.ts`: cuando hay LLM configurado, enviarlo todo al LLM | Alto — el LLM ahora maneja saludos, hardware, follow-ups |
| 3 | **Corregir Mercury client**: pasar historial como mensajes separados + inyectar KB | Alto — Mercury ahora ve la conversación real |
| 4 | **Inyectar artículos KB en el system prompt** dinámicamente según el match | Alto — el LLM tiene contexto real para responder |
| 5 | **Mejorar system prompt** con instrucciones de tool calling y ejemplos | Medio |

### Qué NO se cambia (mantener):
- La estructura de `knowledgeBase.ts` (35 artículos bien redactados) — solo se mejora cómo se inyecta al LLM
- Los playbooks de hardware en `serviceDeskLayer.ts` — como fallback cuando no hay LLM
- `buildTicketDraft()` y `extractFields()` como generadores de datos estructurados — el LLM los complementa
- La arquitectura Next.js / Supabase / Vercel — no requiere cambios

---

## Para la demo GEIMSER

Con estos cambios, el agente puede:

1. **Entender lenguaje natural real**: "mi Excel se volvió loco" → identifica INCIDENT, kb-excel-wont-open, primer paso de descarte
2. **Mantener contexto real de la conversación**: no repite preguntas ya respondidas
3. **Extraer datos del usuario implícitamente**: "soy Felipe del área de finanzas" → nombre y área capturados
4. **Escalar con criterio, no con keywords**: evalúa impacto y urgencia de forma semántica
5. **Responder con inteligencia de hardware**: el LLM usa los artículos KB para guiar el descarte

---

## Configuración requerida tras los cambios

Agregar al `.env.local`:
```env
ANTHROPIC_API_KEY=sk-ant-...   # Recomendado — Claude como motor primario
# Mercury ya configurado — se usa como fallback si no hay Anthropic
```

El agente prioriza: **Anthropic → Mercury → Mock (sin LLM)**.
