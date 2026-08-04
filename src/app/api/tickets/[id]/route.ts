import { NextResponse } from "next/server";
import { getTicketFullDetail } from "@/services/tickets.repository";
import { withTenant } from "@/lib/tenant/context";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  return withTenant(request, async () => {
  const { id } = await context.params;
  const ticket = await getTicketFullDetail(decodeURIComponent(id));

  if (!ticket) {
    return NextResponse.json({ error: "Ticket no encontrado" }, { status: 404 });
  }

  return NextResponse.json({ ticket });
  });
}
