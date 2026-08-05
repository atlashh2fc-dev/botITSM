import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

let serverClient: SupabaseClient<Database> | null = null;

export function hasSupabaseServerEnv() {
  return Boolean(getSupabaseUrl() && getSupabaseServerKey());
}

export function getSupabaseServerClient() {
  if (!hasSupabaseServerEnv()) return null;

  if (!serverClient) {
    serverClient = createClient<Database>(getSupabaseUrl()!, getSupabaseServerKey()!, {
      auth: {
        persistSession: false,
      },
    });
  }

  return serverClient;
}

function getSupabaseUrl() {
  return process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
}

function getSupabaseServerKey() {
  return (
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_SECRET_KEY
  );
}
