import { NextRequest, NextResponse } from "next/server";
import { currentTenant, withTenant } from "@/lib/tenant/context";
import { withApiAuth } from "@/lib/auth/apiAuth";
import { tenantAllowsAssetGroup, type Tenant } from "@/lib/tenant/server";

type CommuneAsset = { id: string | number; group?: string };
type CommuneAssignment = { asset?: CommuneAsset };
type CommunePayload = {
  assets?: CommuneAsset[];
  assignments?: CommuneAssignment[];
  [key: string]: unknown;
};

function configuration() {
  const tenant = currentTenant();
  if (tenant?.id !== "forum") return null;

  const baseUrl = tenant.zammadBaseUrl?.replace(/\/+$/, "");
  const token = tenant.zammadApiToken;
  return baseUrl && token && tenant.assetGroups.length > 0 ? { baseUrl, token, tenant } : null;
}

export function scopeInventoryPayloadForTenant(payload: CommunePayload, tenant: Tenant): CommunePayload {
  const assets = (payload.assets ?? []).filter(asset => tenantAllowsAssetGroup(tenant, asset.group));
  const allowedIds = new Set(assets.map(asset => String(asset.id)));
  const assignments = (payload.assignments ?? []).filter(assignment =>
    assignment.asset && allowedIds.has(String(assignment.asset.id)),
  );
  return { ...payload, assets, assignments };
}

async function loadScopedInventory(config: NonNullable<ReturnType<typeof configuration>>) {
  const response = await fetch(`${config.baseUrl}/api/inventory-map/communes`, {
    headers: headers(config.token),
    cache: "no-store",
  });
  const payload = await response.json().catch(() => ({ error: "Respuesta inválida del ITSM." })) as CommunePayload;
  return { response, payload: response.ok ? scopeInventoryPayloadForTenant(payload, config.tenant) : payload };
}

function headers(token: string) {
  return {
    Accept: "application/json",
    "Content-Type": "application/json",
    Authorization: `Token token=${token}`,
  };
}

export async function GET(request: NextRequest) {
  return withApiAuth(request, { roles: ["agent"] }, async () => withTenant(request, async () => {
    const config = configuration();
    if (!config) return NextResponse.json({ error: "El mapa territorial no está configurado para este tenant." }, { status: 503 });

    try {
      const { response, payload } = await loadScopedInventory(config);
      return NextResponse.json(payload, { status: response.status });
    } catch {
      return NextResponse.json({ error: "No fue posible consultar el mapa territorial." }, { status: 502 });
    }
  }));
}

export async function POST(request: NextRequest) {
  return withApiAuth(request, { roles: ["agent"] }, async () => withTenant(request, async () => {
    const config = configuration();
    if (!config) return NextResponse.json({ error: "El mapa territorial no está configurado para este tenant." }, { status: 503 });

    const body = await request.json().catch(() => ({})) as { asset_id?: string; commune?: string };
    if (!body.asset_id || !body.commune) return NextResponse.json({ error: "Equipo y comuna son obligatorios." }, { status: 400 });

    try {
      const inventory = await loadScopedInventory(config);
      if (!inventory.response.ok) return NextResponse.json(inventory.payload, { status: inventory.response.status });
      if (!inventory.payload.assets?.some(asset => String(asset.id) === String(body.asset_id))) {
        return NextResponse.json({ error: "Equipo no encontrado para este tenant." }, { status: 404 });
      }
      const response = await fetch(`${config.baseUrl}/api/inventory-map/communes`, {
        method: "POST",
        headers: headers(config.token),
        body: JSON.stringify({ asset_id: body.asset_id, commune: body.commune }),
        cache: "no-store",
      });
      const payload = await response.json().catch(() => ({ error: "Respuesta inválida del ITSM." }));
      return NextResponse.json(payload, { status: response.status });
    } catch {
      return NextResponse.json({ error: "No fue posible guardar la comuna del equipo." }, { status: 502 });
    }
  }));
}

export async function DELETE(request: NextRequest) {
  return withApiAuth(request, { roles: ["agent"] }, async () => withTenant(request, async () => {
    const config = configuration();
    if (!config) return NextResponse.json({ error: "El mapa territorial no está configurado para este tenant." }, { status: 503 });

    const body = await request.json().catch(() => ({})) as { asset_id?: string };
    if (!body.asset_id) return NextResponse.json({ error: "El equipo es obligatorio." }, { status: 400 });

    try {
      const inventory = await loadScopedInventory(config);
      if (!inventory.response.ok) return NextResponse.json(inventory.payload, { status: inventory.response.status });
      if (!inventory.payload.assets?.some(asset => String(asset.id) === String(body.asset_id))) {
        return NextResponse.json({ error: "Equipo no encontrado para este tenant." }, { status: 404 });
      }
      const response = await fetch(`${config.baseUrl}/api/inventory-map/communes/${encodeURIComponent(body.asset_id)}`, {
        method: "DELETE",
        headers: headers(config.token),
        cache: "no-store",
      });
      if (response.status === 204) return new NextResponse(null, { status: 204 });
      const payload = await response.json().catch(() => ({ error: "Respuesta inválida del ITSM." }));
      return NextResponse.json(payload, { status: response.status });
    } catch {
      return NextResponse.json({ error: "No fue posible quitar la comuna del equipo." }, { status: 502 });
    }
  }));
}
