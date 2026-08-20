import type { ChatMessage, SessionContext } from "@/lib/itsm/types";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { requireCurrentTenant } from "@/lib/tenant/context";
import type { Json } from "@/types/database";
import { requireCurrentITSMIdentity } from "@/lib/auth/apiAuth";

const inMemoryMessages = new Map<string, ChatMessage[]>();
const inMemoryContexts = new Map<string, SessionContext>();

type SessionOutcome = "active" | "resolved" | "escalated";

export async function persistChatTurn(
  context: SessionContext,
  messages: ChatMessage[],
  outcome: SessionOutcome = "active",
  channel = "portal-web",
) {
  const tenant = requireCurrentTenant();
  const identity = requireCurrentITSMIdentity();
  const supabase = getSupabaseServerClient();
  const isClosed = outcome === "resolved" || outcome === "escalated";
  const now = new Date().toISOString();

  if (supabase) {
    const { data: existingSession, error: ownershipError } = await supabase
      .from("chat_sessions")
      .select("user_email")
      .eq("tenant_id", tenant.id)
      .eq("id", context.sessionId)
      .maybeSingle();
    if (ownershipError) throw new Error(`No se pudo validar la sesión de chat: ${ownershipError.message}`);
    if (existingSession?.user_email && existingSession.user_email.toLowerCase() !== identity.email) {
      throw new Error("La sesión de chat no pertenece al usuario autenticado.");
    }

    const richSession = await supabase.from("chat_sessions").upsert({
      id: context.sessionId,
      tenant_id: tenant.id,
      channel,
      status: outcome,
      context: context as unknown as Json,
      active_article_id: context.activeArticleId ?? null,
      detected_intent: context.detectedIntent ?? null,
      priority: context.priority ?? null,
      user_email: identity.email,
      updated_at: now,
      ...(isClosed ? { closed_at: now } : {}),
    });

    if (richSession.error) {
      const basicSession = await supabase.from("chat_sessions").upsert({
        id: context.sessionId,
        tenant_id: tenant.id,
        channel,
        status: outcome,
        ...(isClosed ? { closed_at: now } : {}),
      });

      if (basicSession.error) {
        persistInMemory(tenant.id, identity.email, context, messages);
        return;
      }
    }

    const insertedMessages = await supabase.from("chat_messages").insert(
      [...messages.map((message) => ({
        id: message.id,
        tenant_id: tenant.id,
        session_id: context.sessionId,
        role: message.role,
        content: message.content,
        metadata: message.metadata ?? null,
        created_at: message.createdAt,
      })), buildContextSnapshotMessage(tenant.id, context)],
    );

    if (insertedMessages.error) {
      persistInMemory(tenant.id, identity.email, context, messages);
    }

    return;
  }

  persistInMemory(tenant.id, identity.email, context, messages);
}

export async function listSessionMessages(sessionId: string) {
  const tenant = requireCurrentTenant();
  const identity = requireCurrentITSMIdentity();
  const supabase = getSupabaseServerClient();

  if (supabase) {
    const { data: ownedSession } = await supabase
      .from("chat_sessions")
      .select("id")
      .eq("tenant_id", tenant.id)
      .eq("id", sessionId)
      .eq("user_email", identity.email)
      .maybeSingle();
    if (!ownedSession) return [];

    const { data } = await supabase
      .from("chat_messages")
      .select("id, role, content, metadata, created_at")
      .eq("tenant_id", tenant.id)
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true });

    return (
      data?.map((message) => ({
        id: message.id,
        role: message.role as ChatMessage["role"],
        content: message.content,
        createdAt: message.created_at,
        metadata: (message.metadata as ChatMessage["metadata"]) ?? undefined,
      })) ?? []
    );
  }

  return inMemoryMessages.get(memoryKey(tenant.id, identity.email, sessionId)) ?? [];
}

export async function getPersistedSessionContext(sessionId: string, authenticatedEmail: string) {
  const tenant = requireCurrentTenant();
  const supabase = getSupabaseServerClient();

  if (supabase) {
    const { data } = await supabase
      .from("chat_sessions")
      .select("context")
      .eq("tenant_id", tenant.id)
      .eq("id", sessionId)
      .eq("user_email", authenticatedEmail.trim().toLowerCase())
      .maybeSingle();

    if (isSessionContext(data?.context)) {
      return data.context;
    }
    if (!data) return undefined;

    const { data: snapshot } = await supabase
      .from("chat_messages")
      .select("metadata")
      .eq("tenant_id", tenant.id)
      .eq("session_id", sessionId)
      .eq("role", "system")
      .eq("content", "__SESSION_CONTEXT__")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const context = getContextFromSnapshot(snapshot?.metadata);
    if (context) {
      return context;
    }
  }

  return inMemoryContexts.get(memoryKey(tenant.id, authenticatedEmail, sessionId));
}

function persistInMemory(tenantId: string, email: string, context: SessionContext, messages: ChatMessage[]) {
  const key = memoryKey(tenantId, email, context.sessionId);
  const current = inMemoryMessages.get(key) ?? [];
  inMemoryMessages.set(key, [...current, ...messages]);
  inMemoryContexts.set(key, context);
}

function memoryKey(tenantId: string, email: string, sessionId: string) {
  return `${tenantId}:${email.trim().toLowerCase()}:${sessionId}`;
}

function buildContextSnapshotMessage(tenantId: string, context: SessionContext) {
  return {
    id: crypto.randomUUID(),
    tenant_id: tenantId,
    session_id: context.sessionId,
    role: "system",
    content: "__SESSION_CONTEXT__",
    metadata: { sessionContext: context } as unknown as Json,
    created_at: new Date().toISOString(),
  };
}

function getContextFromSnapshot(metadata: Json | undefined) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return undefined;
  }

  const snapshot = metadata as { sessionContext?: Json };
  return isSessionContext(snapshot.sessionContext) ? snapshot.sessionContext : undefined;
}

function isSessionContext(value: Json | undefined): value is SessionContext {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const candidate = value as Partial<SessionContext>;

  return (
    typeof candidate.sessionId === "string" &&
    Array.isArray(candidate.messages) &&
    Array.isArray(candidate.stepsExecuted)
  );
}
