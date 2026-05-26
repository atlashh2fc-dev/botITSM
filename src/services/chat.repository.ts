import type { ChatMessage, SessionContext } from "@/lib/itsm/types";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { Json } from "@/types/database";

const inMemoryMessages = new Map<string, ChatMessage[]>();
const inMemoryContexts = new Map<string, SessionContext>();

export async function persistChatTurn(context: SessionContext, messages: ChatMessage[]) {
  const supabase = getSupabaseServerClient();

  if (supabase) {
    const richSession = await supabase.from("chat_sessions").upsert({
      id: context.sessionId,
      channel: "portal-web",
      status: context.awaitingResolutionConfirmation ? "active" : "open",
      context: context as unknown as Json,
      active_article_id: context.activeArticleId ?? null,
      detected_intent: context.detectedIntent ?? null,
      priority: context.priority ?? null,
      updated_at: new Date().toISOString(),
    });

    if (richSession.error) {
      const basicSession = await supabase.from("chat_sessions").upsert({
        id: context.sessionId,
        channel: "portal-web",
        status: context.awaitingResolutionConfirmation ? "active" : "open",
      });

      if (basicSession.error) {
        persistInMemory(context, messages);
        return;
      }
    }

    const insertedMessages = await supabase.from("chat_messages").insert(
      messages.map((message) => ({
        id: message.id,
        session_id: context.sessionId,
        role: message.role,
        content: message.content,
        metadata: message.metadata ?? null,
        created_at: message.createdAt,
      })),
    );

    if (insertedMessages.error) {
      persistInMemory(context, messages);
    }

    return;
  }

  persistInMemory(context, messages);
}

export async function listSessionMessages(sessionId: string) {
  const supabase = getSupabaseServerClient();

  if (supabase) {
    const { data } = await supabase
      .from("chat_messages")
      .select("id, role, content, metadata, created_at")
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

  return inMemoryMessages.get(sessionId) ?? [];
}

export async function getPersistedSessionContext(sessionId: string) {
  const supabase = getSupabaseServerClient();

  if (supabase) {
    const { data } = await supabase
      .from("chat_sessions")
      .select("context")
      .eq("id", sessionId)
      .maybeSingle();

    return isSessionContext(data?.context) ? data.context : undefined;
  }

  return inMemoryContexts.get(sessionId);
}

function persistInMemory(context: SessionContext, messages: ChatMessage[]) {
  const current = inMemoryMessages.get(context.sessionId) ?? [];
  inMemoryMessages.set(context.sessionId, [...current, ...messages]);
  inMemoryContexts.set(context.sessionId, context);
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
