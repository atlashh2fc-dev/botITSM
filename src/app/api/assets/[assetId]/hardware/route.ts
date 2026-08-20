import { NextRequest, NextResponse } from "next/server";
import { currentTenant, withTenant } from "@/lib/tenant/context";
import { withApiAuth } from "@/lib/auth/apiAuth";

export async function POST(request: NextRequest, context: { params: Promise<{ assetId: string }> }) {
  return withApiAuth(request, { roles: ["agent"] }, async () => withTenant(request, async () => {
    const tenant = currentTenant();
    const { assetId } = await context.params;
    const baseUrl = tenant?.zammadBaseUrl?.replace(/\/+$/, "");
    const token = tenant?.zammadApiToken;

    if (!baseUrl || !token || !assetId) {
      return NextResponse.json({ error: "El inventario ITSM no está configurado para este tenant." }, { status: 503 });
    }

    try {
      const response = await fetch(`${baseUrl}/geimser/remote/assets/${encodeURIComponent(assetId)}/hardware`, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          Authorization: `Token token=${token}`,
        },
        body: "{}",
        cache: "no-store",
      });
      const payload = await response.json().catch(() => ({ error: "Respuesta inválida del ITSM." }));
      return NextResponse.json(payload, { status: response.status });
    } catch {
      return NextResponse.json({ error: "No fue posible consultar el agente del equipo." }, { status: 502 });
    }
  }));
}
