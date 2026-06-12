/**
 * zammad/client.ts — Cliente REST para Zammad (ITSM Geimser)
 *
 * Usa un token personal con permisos ticket.agent + admin.user:
 *  - ticket.agent : crear/buscar tickets en nombre de clientes
 *  - admin.user   : buscar/crear usuarios customer (reconocimiento omnicanal)
 *
 * Env:
 *  ZAMMAD_BASE_URL  ej. https://itsm.geimser.cl
 *  ZAMMAD_API_TOKEN token personal
 *  ZAMMAD_GROUP     grupo destino de tickets (default: Users)
 */

export type ZammadUser = {
  id: number;
  email: string;
  firstname: string;
  lastname: string;
  login: string;
};

export type ZammadTicket = {
  id: number;
  number: string;
  title: string;
  group_id: number;
  state_id: number;
  priority_id: number;
  customer_id: number;
  created_at: string;
  updated_at: string;
};

export type ZammadTicketSummary = {
  id: number;
  number: string;
  title: string;
  state: string;
  priority: string;
  createdAt: string;
  updatedAt: string;
  url: string;
};

export type ZammadTicketArticle = {
  id: number;
  ticket_id: number;
  subject?: string;
  body: string;
  internal: boolean;
  sender?: string;
  type?: string;
  created_at: string;
  updated_at: string;
};

export type ZammadTicketDetail = ZammadTicketSummary & {
  articles: ZammadTicketArticle[];
};

const STATE_LABELS: Record<number, string> = {
  1: "nuevo",
  2: "abierto",
  3: "pendiente",
  4: "cerrado",
  5: "fusionado",
  6: "pendiente de cierre",
};

const PRIORITY_LABELS: Record<number, string> = {
  1: "baja",
  2: "normal",
  3: "alta",
};

/** P1/P2 → 3 high · P3 → 2 normal · P4 → 1 low */
export function mapPriorityToZammad(priority: string): number {
  if (priority === "P1" || priority === "P2") return 3;
  if (priority === "P4") return 1;
  return 2;
}

export function hasZammadConfig(): boolean {
  return Boolean(process.env.ZAMMAD_BASE_URL && process.env.ZAMMAD_API_TOKEN);
}

function baseUrl(): string {
  return (process.env.ZAMMAD_BASE_URL ?? "").replace(/\/+$/, "");
}

export function zammadTicketUrl(ticketId: number): string {
  return `${baseUrl()}/#ticket/zoom/${ticketId}`;
}

async function zammadFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${baseUrl()}/api/v1${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Token token=${process.env.ZAMMAD_API_TOKEN}`,
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Zammad ${init?.method ?? "GET"} ${path} → ${response.status}: ${body.slice(0, 300)}`);
  }

  return (await response.json()) as T;
}

/** Busca un usuario por email exacto. */
export async function findUserByEmail(email: string): Promise<ZammadUser | null> {
  const safe = email.trim().toLowerCase().replace(/[^a-z0-9@._+-]/g, "");
  if (!safe) return null;

  const results = await zammadFetch<ZammadUser[]>(
    `/users/search?query=${encodeURIComponent(`email:${safe}`)}&limit=3`,
  );

  return results.find((user) => user.email?.toLowerCase() === safe) ?? null;
}

/** Devuelve el usuario Zammad para el email; lo crea como customer si no existe. */
export async function ensureCustomer(email: string, fullName?: string): Promise<ZammadUser> {
  const existing = await findUserByEmail(email);
  if (existing) return existing;

  const nameParts = (fullName ?? "").trim().split(/\s+/).filter(Boolean);
  const firstname = nameParts[0] ?? email.split("@")[0];
  const lastname = nameParts.slice(1).join(" ") || "-";

  return zammadFetch<ZammadUser>("/users", {
    method: "POST",
    body: JSON.stringify({ email: email.trim().toLowerCase(), firstname, lastname, roles: ["Customer"] }),
  });
}

export type CreateZammadTicketInput = {
  title: string;
  body: string;
  customerEmail: string;
  customerName?: string;
  priority: string; // P1..P4
};

export async function createZammadTicket(input: CreateZammadTicketInput): Promise<ZammadTicket> {
  const customer = await ensureCustomer(input.customerEmail, input.customerName);

  return zammadFetch<ZammadTicket>("/tickets", {
    method: "POST",
    body: JSON.stringify({
      title: input.title.slice(0, 200),
      group: process.env.ZAMMAD_GROUP?.trim() || "Users",
      customer_id: customer.id,
      priority_id: mapPriorityToZammad(input.priority),
      article: {
        subject: input.title.slice(0, 200),
        body: input.body,
        type: "web",
        content_type: "text/plain",
        internal: false,
        sender: "Customer",
      },
    }),
  });
}

type TicketSearchResponse = ZammadTicket[] | { tickets?: number[]; assets?: { Ticket?: Record<string, ZammadTicket> } };

/** Zammad puede responder un array plano o {tickets:[ids], assets:{Ticket}} según versión/parámetros. */
function normalizeSearchResult(result: TicketSearchResponse): ZammadTicket[] {
  if (Array.isArray(result)) return result;

  const byId = result.assets?.Ticket ?? {};
  return (result.tickets ?? [])
    .map((id) => byId[String(id)])
    .filter((ticket): ticket is ZammadTicket => Boolean(ticket));
}

/** Tickets del cliente (por email), más recientes primero. */
export async function searchTicketsByCustomer(email: string, limit = 5): Promise<ZammadTicketSummary[]> {
  const user = await findUserByEmail(email);
  if (!user) return [];

  const result = await zammadFetch<TicketSearchResponse>(
    `/tickets/search?query=${encodeURIComponent(`customer_id:${user.id}`)}&limit=${limit}&sort_by=created_at&order_by=desc`,
  );

  return normalizeSearchResult(result).map(toSummary);
}

/** Busca un ticket por número visible (ej. 87008). */
export async function findTicketByNumber(number: string): Promise<ZammadTicketSummary | null> {
  const safe = number.replace(/[^0-9]/g, "");
  if (!safe) return null;

  const result = await zammadFetch<TicketSearchResponse>(
    `/tickets/search?query=${encodeURIComponent(`number:${safe}`)}&limit=1`,
  );

  const ticket = normalizeSearchResult(result)[0];
  return ticket ? toSummary(ticket) : null;
}

/** Artículos/comentarios del ticket, incluyendo notas internas para entender la última gestión operativa. */
export async function getTicketArticles(ticketId: number): Promise<ZammadTicketArticle[]> {
  return zammadFetch<ZammadTicketArticle[]>(`/ticket_articles/by_ticket/${ticketId}`);
}

export async function getTicketDetail(ticket: ZammadTicketSummary): Promise<ZammadTicketDetail> {
  const articles = await getTicketArticles(ticket.id).catch(() => []);
  return { ...ticket, articles };
}

function toSummary(ticket: ZammadTicket): ZammadTicketSummary {
  return {
    id: ticket.id,
    number: ticket.number,
    title: ticket.title,
    state: STATE_LABELS[ticket.state_id] ?? `estado ${ticket.state_id}`,
    priority: PRIORITY_LABELS[ticket.priority_id] ?? "normal",
    createdAt: ticket.created_at,
    updatedAt: ticket.updated_at,
    url: zammadTicketUrl(ticket.id),
  };
}
