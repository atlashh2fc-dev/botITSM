/**
 * memory.repository.ts — Capas de memoria del bot (anatomía del cerebro):
 *
 *  1. Memoria de Trabajo   → SessionContext (contexto inmediato del turno, en RAM/request)
 *  2. Memoria Episódica    → chat_sessions + chat_messages (historial e interacciones)
 *  3. Memoria Relacional   → bot_user_memory (perfil, área, tono, resumen por usuario)
 *
 * Este módulo implementa la capa relacional + el resumen episódico por usuario.
 */

import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { MemoryProfileValue } from "@/lib/itsm/types";

export type UserMemory = {
  email: string;
  name: string | null;
  area: string | null;
  zammadUserId: number | null;
  preferredTone: string | null;
  profile: Record<string, MemoryProfileValue>;
  episodicSummary: string | null;
  interactionCount: number;
  lastSeenAt: string | null;
};

const inMemoryStore = new Map<string, UserMemory>();

function normalize(email: string) {
  return email.trim().toLowerCase();
}

export async function getUserMemory(email: string): Promise<UserMemory | null> {
  const key = normalize(email);
  if (!key.includes("@")) return null;

  const supabase = getSupabaseServerClient();

  if (supabase) {
    const { data, error } = await supabase
      .from("bot_user_memory")
      .select("*")
      .eq("email", key)
      .maybeSingle();

    if (!error && data) {
      return {
        email: data.email,
        name: data.name,
        area: data.area,
        zammadUserId: data.zammad_user_id,
        preferredTone: data.preferred_tone,
        profile: (data.profile as Record<string, MemoryProfileValue>) ?? {},
        episodicSummary: data.episodic_summary,
        interactionCount: data.interaction_count ?? 0,
        lastSeenAt: data.last_seen_at,
      };
    }
  }

  return inMemoryStore.get(key) ?? null;
}

export type UserMemoryPatch = Partial<{
  name: string;
  area: string;
  zammadUserId: number;
  preferredTone: string;
  profile: Record<string, MemoryProfileValue>;
  episodicEvent: string; // se agrega al resumen episódico con fecha
}>;

/** Crea/actualiza la memoria relacional del usuario y registra la interacción. */
export async function upsertUserMemory(email: string, patch: UserMemoryPatch): Promise<UserMemory | null> {
  const key = normalize(email);
  if (!key.includes("@")) return null;

  const current = (await getUserMemory(key)) ?? {
    email: key,
    name: null,
    area: null,
    zammadUserId: null,
    preferredTone: null,
    profile: {},
    episodicSummary: null,
    interactionCount: 0,
    lastSeenAt: null,
  };

  const now = new Date().toISOString();
  const episodicSummary = patch.episodicEvent
    ? appendEpisode(current.episodicSummary, patch.episodicEvent)
    : current.episodicSummary;

  const next: UserMemory = {
    ...current,
    name: patch.name ?? current.name,
    area: patch.area ?? current.area,
    zammadUserId: patch.zammadUserId ?? current.zammadUserId,
    preferredTone: patch.preferredTone ?? current.preferredTone,
    profile: { ...current.profile, ...(patch.profile ?? {}) },
    episodicSummary,
    interactionCount: current.interactionCount + 1,
    lastSeenAt: now,
  };

  const supabase = getSupabaseServerClient();

  if (supabase) {
    const { error } = await supabase.from("bot_user_memory").upsert({
      email: key,
      name: next.name,
      area: next.area,
      zammad_user_id: next.zammadUserId,
      preferred_tone: next.preferredTone,
      profile: next.profile as never,
      episodic_summary: next.episodicSummary,
      interaction_count: next.interactionCount,
      last_seen_at: now,
      updated_at: now,
    });

    if (!error) return next;
  }

  inMemoryStore.set(key, next);
  return next;
}

/** Mantiene un resumen episódico acotado (últimos 12 eventos). */
function appendEpisode(summary: string | null, event: string): string {
  const date = new Date().toISOString().slice(0, 10);
  const lines = (summary ?? "").split("\n").filter(Boolean);
  lines.push(`[${date}] ${event}`);
  return lines.slice(-12).join("\n");
}

/** Sección de memoria para inyectar en el system prompt del LLM. */
export function buildMemoryPromptSection(memory: UserMemory | null): string {
  if (!memory) return "";

  const parts = [
    `Usuario reconocido: ${memory.name ?? memory.email} <${memory.email}>`,
    memory.area ? `Área: ${memory.area}` : undefined,
    memory.preferredTone ? `Tono preferido: ${memory.preferredTone}` : undefined,
    `Interacciones previas: ${memory.interactionCount}`,
    memory.episodicSummary ? `Historial reciente:\n${memory.episodicSummary}` : undefined,
  ].filter(Boolean);

  return (
    "\n\n---\n## Memoria relacional del usuario (no repitas preguntas ya respondidas aquí)\n" +
    parts.join("\n") +
    "\nSi el usuario ya es conocido, salúdalo por su nombre y no vuelvas a pedir nombre/correo/área salvo que él los corrija."
  );
}
