import { NextResponse } from "next/server";
import { requireCurrentITSMIdentity, withApiAuth } from "@/lib/auth/apiAuth";
import { intranetBridgeRequest } from "@/lib/intranet/bridge";
import { requireTenant } from "@/lib/tenant/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ path: string[] }> };

async function proxy(request: Request, context: RouteContext) {
  // Forum no utiliza mensajería interna: la comunicación operativa se
  // mantiene en los tickets. Bloqueamos también la ruta para que el panel no
  // pueda abrirse mediante una petición manual aunque no exista el botón.
  if (requireTenant(request).id === "forum") {
    return NextResponse.json({ error: "El chat interno no está disponible en Forum." }, { status: 404 });
  }

  return withApiAuth(request, { roles: ["agent"] }, async () => {
    const identity = requireCurrentITSMIdentity();
    const { path } = await context.params;
    const target = `chat/${path.join("/")}${new URL(request.url).search}`;
    const body = request.method === "GET" ? undefined : await request.text();
    const response = await intranetBridgeRequest(identity, target, {
      method: request.method,
      headers: body ? { "Content-Type": request.headers.get("content-type") ?? "application/json" } : undefined,
      body,
    });
    return new NextResponse(await response.arrayBuffer(), {
      status: response.status,
      headers: {
        "Content-Type": response.headers.get("content-type") ?? "application/json; charset=utf-8",
        "Cache-Control": "private, no-store, max-age=0",
      },
    });
  });
}

export async function GET(request: Request, context: RouteContext) { return proxy(request, context); }
export async function POST(request: Request, context: RouteContext) { return proxy(request, context); }
