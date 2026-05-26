import { getSupabaseServerClient } from "@/lib/supabase/server";

export type UserAsset = {
  id: string;
  user_email: string;
  asset_name: string;
  asset_type: "mouse" | "notebook" | "keyboard" | "monitor" | string;
  asset_tag: string;
  status: "active" | "warning" | "error";
  details: Record<string, unknown>;
};

const MOCK_ASSETS: UserAsset[] = [
  {
    id: "asset-1",
    user_email: "lilian.leon@sonda.cl",
    asset_name: "Mouse HP Cableado de Escritorio",
    asset_type: "mouse",
    asset_tag: "ACT-MOU-HP-LILIAN",
    status: "active",
    details: { connection: "wired", model: "HP 150 Wired Mouse", port: "USB-A" }
  },
  {
    id: "asset-2",
    user_email: "lilian.leon@sonda.cl",
    asset_name: "HP EliteBook 840 G8",
    asset_type: "notebook",
    asset_tag: "ACT-LAP-HP-LILIAN",
    status: "active",
    details: { os: "Windows 11 Enterprise", ram: "16GB", vpn_client: "Cisco AnyConnect v4.10" }
  },
  {
    id: "asset-3",
    user_email: "francisco.martinez@sonda.cl",
    asset_name: "Mouse Inalámbrico Logitech MX Master",
    asset_type: "mouse",
    asset_tag: "ACT-MOU-LOG-FRAN",
    status: "warning",
    details: { connection: "wireless", model: "MX Master 3S", battery: "15%", connection_type: "Bluetooth" }
  },
  {
    id: "asset-4",
    user_email: "francisco.martinez@sonda.cl",
    asset_name: "Lenovo ThinkPad T14",
    asset_type: "notebook",
    asset_tag: "ACT-LAP-LEN-FRAN",
    status: "active",
    details: { os: "Windows 11 Pro", ram: "32GB", vpn_client: "Cisco AnyConnect v4.2" }
  }
];

export async function getUserAssets(email: string): Promise<UserAsset[]> {
  const supabase = getSupabaseServerClient();

  if (supabase) {
    try {
      const { data, error } = await supabase
        .from("user_assets")
        .select("*")
        .eq("user_email", email);

      if (!error && data && data.length > 0) {
        return data as UserAsset[];
      }
    } catch (err) {
      console.warn("[AssetsRepository] Error al consultar user_assets en Supabase, usando mock local de respaldo:", err);
    }
  }

  // Fallback seguro a los datos de la POC en memoria
  return MOCK_ASSETS.filter((asset) => asset.user_email.toLowerCase() === email.toLowerCase());
}
