import { NextResponse } from "next/server";
import { withTenant } from "@/lib/tenant/context";
import { getContactCenterReport } from "@/services/contact-center.repository";

export async function GET(request: Request) {
  return withTenant(request, async () => {
    try {
      return NextResponse.json({ report: await getContactCenterReport() });
    } catch (error) {
      console.error("[contact-center] No fue posible generar el reporte:", error);
      return NextResponse.json({ error: "No fue posible generar el reporte de Contact Center." }, { status: 500 });
    }
  });
}
