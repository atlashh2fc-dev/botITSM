# Integración omnicanal: botITSM ⇄ ITSM Geimser (Zammad)

Fecha: 2026-06-12

## Qué se agregó

| Pieza | Archivo | Función |
|---|---|---|
| Cliente Zammad | `src/lib/zammad/client.ts` | REST API: buscar/crear customers, crear tickets, buscar por cliente o número |
| Adapter live | `src/lib/itsm/adapters/zammadAdapter.ts` | Crea el ticket REAL en itsm.geimser.cl con transcript completo + copia local en Supabase (`ZAM-<número>`) |
| Gateway | `src/lib/itsm/itsmGateway.ts` | Provider `zammad` registrado; si Zammad falla degrada a demo (no se pierde la conversación) |
| Consulta de tickets | `src/lib/itsm/ticketLookup.ts` | "¿cómo van mis tickets?", "estado del ticket 87008" → consulta Zammad y responde en el chat |
| Memoria relacional | `src/services/memory.repository.ts` + tabla `bot_user_memory` | Perfil, área, tono y resumen episódico por usuario |
| Chat route | `src/app/api/chat/route.ts` | Reconocimiento por correo, intercepción de consulta de tickets, actualización de memoria al crear/cerrar tickets |
| Memoria → LLM | `src/lib/llm/claudeClient.ts` + `src/lib/llm/mercuryClient.ts` | Inyecta la memoria relacional en el system prompt (saluda por nombre, no re-pregunta datos) — funciona con Anthropic o Mercury/Inception |
| Migración | `supabase/migrations/20260612120000_zammad_omnichannel_memory.sql` | Ya aplicada en supabase-crimson-village |

## Capas de memoria (anatomía del cerebro)

1. **Memoria de Trabajo** — `SessionContext`: contexto inmediato del turno (ya existía).
2. **Memoria Episódica** — `chat_sessions` + `chat_messages` en Supabase: historial completo, ahora con `user_email`.
3. **Memoria Relacional** — `bot_user_memory`: perfil del usuario (nombre, área, tono preferido, resumen de los últimos 12 episodios, contador de interacciones). Se inyecta al system prompt cuando el bot reconoce el correo.

## Flujo omnicanal

1. Usuario escribe al chatbot web → si menciona su correo (o el front lo pasa en `userEmail`), el bot lo reconoce y carga su memoria.
2. Reporta un problema → motor ITIL (Tier 1/2/3) → al formalizar, el ticket se crea **en Zammad** a nombre del customer (lo crea si no existe) con la transcripción completa.
3. El mismo ticket queda reflejado en Supabase (`tickets`, id `ZAM-<número>`) para el dashboard del bot.
4. "¿Cómo van mis tickets?" → el bot consulta Zammad en vivo y responde con número, estado, prioridad y fecha.

## Variables de entorno (Vercel → Settings → Environment Variables)

```
NEXT_PUBLIC_SUPABASE_URL=https://tlnfkxufoczqxvhwahhc.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key, ver .env.local>
SUPABASE_URL=https://tlnfkxufoczqxvhwahhc.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<dashboard Supabase → Settings → API>
# LLM: si ya tienes MERCURY_API_KEY configurada en Vercel, no necesitas nada más.
# ANTHROPIC_API_KEY es opcional (si se define, tiene prioridad sobre Mercury).
ITSM_PROVIDER=zammad
ZAMMAD_BASE_URL=https://itsm.geimser.cl
ZAMMAD_API_TOKEN=<token "BotITSM-Omnicanal", ver .env.local>
ZAMMAD_GROUP=Users
```

El token Zammad se llama **BotITSM-Omnicanal** (permisos `ticket.agent` + `admin.user`); se puede revocar/regenerar en itsm.geimser.cl → Perfil → Token de acceso.

## Prueba realizada

- Customer `hugo.prueba@geimser.cl` (id 56) creado vía API.
- Ticket **#87008** creado por el flujo del bot y visible en itsm.geimser.cl (estado nuevo, prioridad 2 normal).
- Búsqueda por cliente y por número verificadas.
- Tabla `bot_user_memory` operativa en supabase-crimson-village.

## Pendiente / siguientes pasos

- Pegar `SUPABASE_SERVICE_ROLE_KEY` en `.env.local` (local) y Vercel. LLM: ya cubierto por tu MERCURY_API_KEY existente.
- `npm run dev` y probar: "hola, soy Hugo (hugo.prueba@geimser.cl), no me abre Excel" → escalar → ver ticket en el ITSM; luego "¿cómo van mis tickets?".
- Opcional: pasar `userEmail` desde el frontend (`ChatRequest.userEmail`) si el portal ya conoce al usuario logueado.
