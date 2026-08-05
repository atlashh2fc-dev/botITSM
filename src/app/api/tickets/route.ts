import { NextResponse } from "next/server";
import type { TicketDraft } from "@/lib/itsm/types";
import { hasSupabaseServerEnv } from "@/lib/supabase/server";
import { createTicket, listTickets } from "@/services/tickets.repository";
import { withTenant } from "@/lib/tenant/context";

export async function GET(request: Request) {
  return withTenant(request, async () => {
  const tickets = await listTickets();
  const source = tickets.some((ticket) => ticket.provider === "zammad")
    ? "zammad"
    : tickets.length > 0 && hasSupabaseServerEnv()
      ? "supabase"
      : "memory";
  return NextResponse.json({ tickets, source });
  });
}

export async function POST(request: Request) {
  return withTenant(request, async () => {
  const body = (await request.json()) as { ticketDraft?: TicketDraft };

  if (!body.ticketDraft) {
    return NextResponse.json({ error: "ticketDraft requerido" }, { status: 400 });
  }

  const ticket = await createTicket(body.ticketDraft);
  return NextResponse.json({ ticket, source: hasSupabaseServerEnv() ? "supabase" : "memory" });
  });
}
