import { getSupabaseServerClient } from "@/lib/supabase/server";
import { currentTenant } from "@/lib/tenant/context";

export type DemoUser = {
  id: string;
  name: string;
  email: string;
  area: string;
};

const MOCK_USERS: DemoUser[] = [
  {
    id: "user-lilian",
    name: "Lilian Leon",
    email: "lilian.leon@geimser.cl",
    area: "Operaciones"
  },
  {
    id: "user-francisco",
    name: "Francisco Martinez",
    email: "francisco.martinez@geimser.cl",
    area: "Soporte TI"
  }
];

export async function getUserProfile(email: string): Promise<DemoUser | undefined> {
  const tenant = currentTenant();
  if (!tenant) return undefined;
  const supabase = getSupabaseServerClient();

  if (supabase) {
    try {
      const { data, error } = await supabase
        .from("demo_users")
        .select("*")
        .eq("tenant_id", tenant.id)
        .eq("email", email)
        .maybeSingle();

      if (!error && data) {
        return data as DemoUser;
      }
    } catch (err) {
      console.warn("[UsersRepository] Error al consultar demo_users en Supabase, usando mock local de respaldo:", err);
    }
  }

  // Los datos mock pertenecen solo a la POC histórica de Geimser.
  return tenant.id === "geimser"
    ? MOCK_USERS.find((user) => user.email.toLowerCase() === email.toLowerCase())
    : undefined;
}

export async function getAllDemoUsers(): Promise<DemoUser[]> {
  const tenant = currentTenant();
  if (!tenant) return [];
  const supabase = getSupabaseServerClient();

  if (supabase) {
    try {
      const { data, error } = await supabase
        .from("demo_users")
        .select("*")
        .eq("tenant_id", tenant.id);

      if (!error && data && data.length > 0) {
        return data as DemoUser[];
      }
    } catch (err) {
      console.warn("[UsersRepository] Error al listar demo_users en Supabase, usando mock local de respaldo:", err);
    }
  }

  return tenant.id === "geimser" ? MOCK_USERS : [];
}
