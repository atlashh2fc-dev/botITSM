import { getSupabaseServerClient } from "@/lib/supabase/server";
import { currentTenant } from "@/lib/tenant/context";
import { tenantAllowsAssetGroup, type Tenant } from "@/lib/tenant/server";

export type UserAsset = {
  id: string;
  user_email: string;
  asset_name: string;
  asset_type: "mouse" | "notebook" | "keyboard" | "monitor" | string;
  asset_tag: string;
  status: "active" | "warning" | "error";
  details: Record<string, unknown>;
  hardware?: Record<string, unknown>;
};

type ITSMInventoryAsset = {
  id: number | string;
  node_id?: string;
  name?: string;
  hostname?: string;
  group?: string;
  os?: string;
  ip?: string;
  status?: string;
  raw_status?: string;
  occupant?: string;
  session_url?: string;
  brand?: string;
  model?: string;
  last_seen_at?: string;
  updated_at?: string;
  hardware?: Record<string, unknown>;
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
  const tenant = currentTenant();
  if (tenant) {
    const assets = await getZammadInventoryAssets(tenant);
    return assets
      .filter(asset => assetBelongsToTenant(asset, tenant))
      .filter((asset) => asset.user_email.toLowerCase() === email.toLowerCase());
  }

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

export async function getAllITSMAssets(): Promise<UserAsset[]> {
  const tenant = currentTenant();
  const zammadAssets = await getZammadInventoryAssets(tenant);
  if (tenant) return zammadAssets.filter(asset => assetBelongsToTenant(asset, tenant));
  if (zammadAssets.length > 0) return zammadAssets;

  const supabase = getSupabaseServerClient();
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from("user_assets")
        .select("*")
        .order("asset_name", { ascending: true });

      if (!error && data && data.length > 0) {
        return data as UserAsset[];
      }
    } catch (err) {
      console.warn("[AssetsRepository] Error al consultar user_assets en Supabase:", err);
    }
  }

  return [];
}

function assetBelongsToTenant(asset: UserAsset, tenant: Tenant) {
  const group = typeof asset.details.grupo === "string" ? asset.details.grupo : undefined;
  return tenantAllowsAssetGroup(tenant, group);
}

async function getZammadInventoryAssets(tenant?: Tenant): Promise<UserAsset[]> {
  const baseUrl = (tenant ? tenant.zammadBaseUrl : process.env.ZAMMAD_BASE_URL)?.replace(/\/+$/, "");
  if (!baseUrl) return [];

  const cmdbAssets = await getCmdbInventoryAssets(baseUrl, tenant);
  if (cmdbAssets.length > 0) return cmdbAssets;

  const zammadToken = tenant ? tenant.zammadApiToken : process.env.ZAMMAD_API_TOKEN;
  if (!zammadToken) return [];

  try {
    const response = await fetch(`${baseUrl}/api/inventory-map/options`, {
      headers: {
        Accept: "application/json",
        Authorization: `Token token=${zammadToken}`,
      },
      cache: "no-store",
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      console.warn(`[AssetsRepository] ITSM inventory respondió ${response.status}: ${body.slice(0, 180)}`);
      return [];
    }

    const payload = (await response.json()) as { assets?: ITSMInventoryAsset[] };
    return (payload.assets ?? []).map(normalizeITSMAsset);
  } catch (err) {
    console.warn("[AssetsRepository] Error al consultar inventario ITSM:", err);
    return [];
  }
}

async function getCmdbInventoryAssets(baseUrl: string, tenant?: Tenant): Promise<UserAsset[]> {
  const cmdbToken = tenant ? tenant.cmdbToken : process.env.GEIMSER_CMDB_TOKEN;
  if (!cmdbToken) return [];

  try {
    const response = await fetch(`${baseUrl}/geimser/cmdb/assets`, {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${cmdbToken}`,
      },
      cache: "no-store",
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      console.warn(`[AssetsRepository] CMDB inventory respondio ${response.status}: ${body.slice(0, 180)}`);
      return [];
    }

    const payload = (await response.json()) as { assets?: ITSMInventoryAsset[] };
    return (payload.assets ?? []).map(normalizeITSMAsset);
  } catch (err) {
    console.warn("[AssetsRepository] Error al consultar inventario CMDB:", err);
    return [];
  }
}

function normalizeITSMAsset(asset: ITSMInventoryAsset): UserAsset {
  const hostname = asset.name || asset.hostname || asset.node_id || `Equipo ${asset.id}`;
  const rawStatus = (asset.raw_status || asset.status || "").toLowerCase();
  const online = rawStatus === "online" || rawStatus === "activo";

  return {
    id: String(asset.id),
    user_email: asset.occupant ? `${asset.occupant}@equipo.local` : "",
    asset_name: hostname,
    asset_type: "pc",
    asset_tag: asset.hostname || asset.node_id || String(asset.id),
    status: online ? "active" : "warning",
    details: {
      grupo: asset.group || "Sin grupo",
      usuario: asset.occupant || "Sin usuario informado",
      ip: asset.ip || "Sin IP",
      sistema: asset.os || "Sin sistema informado",
      fabricante: asset.brand || "Sin fabricante",
      modelo: asset.model || "Sin modelo",
      ultimo_contacto: asset.last_seen_at || "Sin contacto",
      actualizado: asset.updated_at || "Sin dato",
      remoto: asset.session_url || "",
    },
    hardware: asset.hardware,
  };
}
