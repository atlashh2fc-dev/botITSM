import { fallbackTickets } from "@/data/mock/fallbackTickets";
import type { Ticket, TicketDraft } from "@/lib/itsm/types";
import { getSupabaseServerClient } from "@/lib/supabase/server";

const inMemoryTickets: Ticket[] = [...fallbackTickets];

export async function listTickets(): Promise<Ticket[]> {
  const supabase = getSupabaseServerClient();

  if (supabase) {
    const { data, error } = await supabase.from("tickets").select("*").order("created_at", { ascending: false }).limit(25);

    if (!error && data) {
      return data.map((row) => ({
        ...((row.payload as unknown as TicketDraft) ?? {}),
        id: row.id,
        type: row.type as Ticket["type"],
        priority: row.priority as Ticket["priority"],
        category: row.category,
        description: row.description,
        status: row.status as Ticket["status"],
        createdAt: row.created_at,
        requesterName: ((row.payload as { requesterName?: string })?.requesterName ?? "Usuario pendiente") as string,
        requesterEmail: ((row.payload as { requesterEmail?: string })?.requesterEmail ?? "pendiente@example.com") as string,
        provider: row.provider ?? ((row.payload as { provider?: string })?.provider),
        externalId: row.external_id ?? ((row.payload as { externalId?: string })?.externalId),
        externalUrl: row.external_url ?? ((row.payload as { externalUrl?: string })?.externalUrl),
      }));
    }
  }

  return inMemoryTickets;
}

export async function createTicket(draft: TicketDraft): Promise<Ticket> {
  const ticket: Ticket = {
    ...draft,
    id: draft.id ?? createTicketId(),
    status: draft.priority === "P1" || draft.status === "escalated" ? "escalated" : "created",
    createdAt: new Date().toISOString(),
    requesterName: draft.requesterName ?? "Usuario pendiente",
    requesterEmail: draft.requesterEmail ?? "pendiente@example.com",
  };

  const supabase = getSupabaseServerClient();

  if (supabase) {
    const { error } = await supabase.from("tickets").insert({
      id: ticket.id,
      type: ticket.type,
      priority: ticket.priority,
      category: ticket.category,
      description: ticket.description,
      status: ticket.status,
      payload: ticket,
      provider: ticket.provider ?? null,
      external_id: ticket.externalId ?? null,
      external_url: ticket.externalUrl ?? null,
    });

    if (!error) return ticket;
  }

  inMemoryTickets.unshift(ticket);
  return ticket;
}

function createTicketId() {
  const now = new Date();
  const sequence = Math.floor(10000 + Math.random() * 90000);
  return `INC-${now.getFullYear()}-${sequence}`;
}
