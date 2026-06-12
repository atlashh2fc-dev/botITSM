import { fallbackTickets } from "@/data/mock/fallbackTickets";
import type { Ticket, TicketDraft } from "@/lib/itsm/types";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import {
  getZammadUserDetail,
  hasZammadConfig,
  listZammadOrganizations,
  listZammadTickets,
  zammadTicketUrl,
  type ZammadExpandedTicket,
  type ZammadOrganization,
  type ZammadUserDetail,
} from "@/lib/zammad/client";

const inMemoryTickets: Ticket[] = [...fallbackTickets];

export async function listTickets(): Promise<Ticket[]> {
  if (hasZammadConfig()) {
    const zammadTickets = await listTicketsFromZammad().catch(() => null);
    if (zammadTickets) return zammadTickets;
  }

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

async function listTicketsFromZammad(): Promise<Ticket[]> {
  const rawTickets = await listZammadTickets(500);
  const organizations = await listZammadOrganizations();
  const organizationById = new Map(organizations.map((org) => [org.id, org]));
  const userIds = Array.from(new Set(rawTickets.map((ticket) => ticket.customer_id).filter(Boolean)));
  const users = await Promise.all(userIds.map((id) => getZammadUserDetail(id)));
  const userById = new Map<number, ZammadUserDetail>();

  for (const user of users) {
    if (user) userById.set(user.id, user);
  }

  return rawTickets.map((ticket) => zammadTicketToTicket(ticket, userById.get(ticket.customer_id), organizationById));
}

function zammadTicketToTicket(
  ticket: ZammadExpandedTicket,
  customer: ZammadUserDetail | undefined,
  organizationById: Map<number, ZammadOrganization>,
): Ticket {
  const priority = mapZammadPriority(ticket.priority ?? String(ticket.priority_id));
  const state = normalizeZammadState(ticket.state);
  const requesterName = formatRequesterName(customer, ticket.customer);
  const division = customer?.department?.trim()
    || (customer?.organization_id ? organizationById.get(customer.organization_id)?.name : undefined)
    || ticket.organization
    || inferDivisionFromTitle(ticket.title)
    || "Sin división informada";
  const assignedTeam = [ticket.group, ticket.owner && ticket.owner !== "-" ? ticket.owner : undefined].filter(Boolean).join(" · ")
    || "Grupo no asignado";

  return {
    id: `ZAM-${ticket.number}`,
    type: inferIntent(ticket.title, ticket.group),
    priority,
    category: inferCategory(ticket.title, ticket.group),
    description: ticket.title,
    affectedSystem: ticket.group ?? "ITSM Geimser",
    requesterName,
    requesterEmail: customer?.email || emailFromCustomerLabel(ticket.customer) || "sin-correo@geimser.local",
    businessArea: division,
    executedSteps: ticket.article_count ? [`${ticket.article_count} artículos registrados en Zammad`] : [],
    nextAction: state === "resolved" ? "Caso cerrado en ITSM" : "Seguimiento según cola y estado en Zammad",
    assignedTeam,
    estimatedSla: estimateSla(priority),
    status: state,
    createdAt: ticket.created_at,
    provider: "zammad",
    externalId: ticket.number,
    externalUrl: zammadTicketUrl(ticket.id),
  };
}

function normalizeZammadState(state?: string): Ticket["status"] {
  const value = (state ?? "").toLowerCase();
  if (value.includes("closed") || value.includes("close") || value.includes("cerrado") || value.includes("merged")) return "resolved";
  if (value.includes("pending") || value.includes("pendiente")) return "created";
  if (value.includes("open") || value.includes("new")) return "created";
  return "created";
}

function mapZammadPriority(priority: string): Ticket["priority"] {
  const value = priority.toLowerCase();
  if (value.includes("high") || value.includes("alta") || value.startsWith("3")) return "P1";
  if (value.includes("normal") || value.startsWith("2")) return "P3";
  return "P4";
}

function inferIntent(title: string, group?: string): Ticket["type"] {
  const text = `${title} ${group ?? ""}`.toLowerCase();
  if (text.includes("acceso") || text.includes("identity") || text.includes("identidad")) return "ACCESS_REQUEST";
  if (text.includes("software") || text.includes("licencia")) return "SOFTWARE_REQUEST";
  if (text.includes("red") || text.includes("vpn") || text.includes("conectividad")) return "NETWORK_ISSUE";
  if (text.includes("hardware") || text.includes("equipo") || text.includes("notebook")) return "HARDWARE_ISSUE";
  if (text.includes("seguridad") || text.includes("security")) return "SECURITY_INCIDENT";
  if (text.includes("solicitud") || text.includes("requerimiento") || text.includes("catálogo") || text.includes("catalogo")) return "SERVICE_REQUEST";
  return "INCIDENT";
}

function inferCategory(title: string, group?: string): string {
  const bracket = title.match(/^\[([^\]]+)\]/)?.[1]?.trim();
  if (bracket) return bracket;
  if (group) return group;
  return "Gestión ITSM";
}

function inferDivisionFromTitle(title: string): string | undefined {
  const match = title.match(/\b(?:área|area|división|division):\s*([^|·\n]+)/i);
  return match?.[1]?.trim();
}

function formatRequesterName(customer?: ZammadUserDetail, fallback?: string): string {
  const name = [customer?.firstname, customer?.lastname].filter((part) => part && part !== "-").join(" ").trim();
  if (name) return name;
  if (customer?.email) return customer.email;
  return fallback || "Solicitante ITSM";
}

function emailFromCustomerLabel(value?: string): string | undefined {
  return value?.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0];
}

function estimateSla(priority: Ticket["priority"]): string {
  if (priority === "P1") return "4 horas hábiles";
  if (priority === "P2") return "8 horas hábiles";
  if (priority === "P3") return "24 horas hábiles";
  return "72 horas hábiles";
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
