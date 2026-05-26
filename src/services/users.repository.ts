import { getSupabaseServerClient } from "@/lib/supabase/server";

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
    email: "lilian.leon@sonda.cl",
    area: "Operaciones"
  },
  {
    id: "user-francisco",
    name: "Francisco Martinez",
    email: "francisco.martinez@sonda.cl",
    area: "Soporte TI"
  }
];

export async function getUserProfile(email: string): Promise<DemoUser | undefined> {
  const supabase = getSupabaseServerClient();

  if (supabase) {
    try {
      const { data, error } = await supabase
        .from("demo_users")
        .select("*")
        .eq("email", email)
        .maybeSingle();

      if (!error && data) {
        return data as DemoUser;
      }
    } catch (err) {
      console.warn("[UsersRepository] Error al consultar demo_users en Supabase, usando mock local de respaldo:", err);
    }
  }

  // Fallback seguro a los datos de la POC en memoria
  return MOCK_USERS.find((user) => user.email.toLowerCase() === email.toLowerCase());
}

export async function getAllDemoUsers(): Promise<DemoUser[]> {
  const supabase = getSupabaseServerClient();

  if (supabase) {
    try {
      const { data, error } = await supabase
        .from("demo_users")
        .select("*");

      if (!error && data && data.length > 0) {
        return data as DemoUser[];
      }
    } catch (err) {
      console.warn("[UsersRepository] Error al listar demo_users en Supabase, usando mock local de respaldo:", err);
    }
  }

  return MOCK_USERS;
}
