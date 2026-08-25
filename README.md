# Portal de soporte inteligente ITSM

Producto enterprise en Next.js para presentar a GEIMSER una experiencia dual de soporte TI asistido por IA:

- Portal corporativo para usuarios finales.
- Consola administrativa para operaciones, gobierno y analítica ITSM.

La aplicación corre localmente sin depender de servicios externos. Cuando existen variables de Supabase, las API internas persisten conversaciones y tickets en la base configurada; si faltan, usan repositorios locales.

## Correr localmente

```bash
npm install
npm run dev
```

Abrir `http://localhost:3000`.

Rutas principales:

- `/`: portal de soporte inteligente para usuario final.
- `/admin`: consola operacional con acceso mock `admin` / `demo`.
- `/api/chat`: flujo conversacional ITSM con adapter LLM.
- `/api/tickets`: creación y listado de tickets.
- `/api/knowledge`: base de conocimiento local.
- `/api/kpis`: dataset analítico de operaciones.

## Arquitectura

```text
src/app
  /(portal)
  /(admin)
  /api

src/components
  /portal
  /chat
  /admin
  /shared

src/data/mock
src/services
src/types
src/lib/itsm
src/lib/llm
src/lib/supabase
```

## Variables de entorno

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=

SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=

MERCURY_API_KEY=
MERCURY_BASE_URL=
MERCURY_MODEL=
```

Los secretos de servidor no deben exponerse en componentes cliente ni commitearse.

## Supabase

El esquema sugerido está en `supabase/schema.sql`.

Incluye:

- `chat_sessions`
- `chat_messages`
- `tickets`
- `ticket_events`
- `knowledge_articles`
- `sla_rules`

Las tablas públicas usan RLS y la aplicación escribe desde rutas API usando credenciales de servidor cuando están disponibles.

## Mercury/Inception

La interfaz estable es:

```ts
generateITSMResponse(input)
```

El adapter vive en `src/lib/llm`. Si no hay configuración Mercury, se usa un cliente local con la misma forma de respuesta.

## Dataset operacional

`src/data/mock/operationalCases.ts` genera 128 casos coherentes para alimentar la consola administrativa:

- accesos
- VPN
- correo
- software
- hardware
- red
- aplicaciones críticas
- permisos
- onboarding
- password reset

Cada caso incluye usuario, área, prioridad, estado, técnico, sentimiento, duración, SLA, resolución y resumen conversacional.
