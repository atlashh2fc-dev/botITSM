import { NextResponse, type NextRequest } from "next/server";
import { getTenantByHost } from "@/lib/tenant/server";

export function proxy(request: NextRequest) {
  if (!getTenantByHost(request.headers.get("x-forwarded-host") ?? request.headers.get("host"))) {
    return NextResponse.json({ error: "Dominio de tenant no reconocido." }, { status: 404 });
  }
  return NextResponse.next();
}

export const config = { matcher: ["/api/:path*"] };
