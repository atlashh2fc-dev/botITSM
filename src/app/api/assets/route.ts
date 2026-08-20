import { NextRequest, NextResponse } from "next/server";
import { getAllITSMAssets, getUserAssets } from "@/services/assets.repository";
import { withTenant } from "@/lib/tenant/context";
import { withApiAuth } from "@/lib/auth/apiAuth";

export async function GET(request: NextRequest) {
  return withApiAuth(request, { roles: ["agent"] }, async () => withTenant(request, async () => {
  const email = request.nextUrl.searchParams.get("email")?.trim().toLowerCase();

  try {
    const assets = email && /^\S+@\S+\.\S+$/.test(email)
      ? await getUserAssets(email)
      : await getAllITSMAssets();

    return NextResponse.json({ assets, source: email ? "user" : "itsm" });
  } catch {
    return NextResponse.json({ error: "No fue posible consultar el inventario." }, { status: 500 });
  }
  }));
}
