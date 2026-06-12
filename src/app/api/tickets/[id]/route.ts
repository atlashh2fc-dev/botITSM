import { NextResponse } from "next/server";
import { getTicketFullDetail } from "@/services/tickets.repository";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const ticket = await getTicketFullDetail(decodeURIComponent(id));

  if (!ticket) {
    return NextResponse.json({ error: "Ticket no encontrado" }, { status: 404 });
  }

  return NextResponse.json({ ticket });
}
