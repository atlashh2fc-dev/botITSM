import { NextRequest, NextResponse } from "next/server";
import { getUserAssets } from "@/services/assets.repository";

export async function GET(request: NextRequest) {
  const email = request.nextUrl.searchParams.get("email")?.trim().toLowerCase();

  if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
    return NextResponse.json({ error: "Se requiere un correo válido." }, { status: 400 });
  }

  try {
    const assets = await getUserAssets(email);
    return NextResponse.json({ assets });
  } catch {
    return NextResponse.json({ error: "No fue posible consultar el inventario." }, { status: 500 });
  }
}
