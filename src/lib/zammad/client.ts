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
import type { Tenant } from "@/lib/tenant/server";
import { currentTenant } from "@/lib/tenant/context";

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

export type ZammadExpandedTicket = ZammadTicket & {
  close_at: string | null;
  last_close_at: string | null;
  last_contact_at: string | null;
  escalation_at: string | null;
  article_count?: number;
  group?: string;
  state?: string;
  priority?: string;
  owner?: string;
  customer?: string;
  organization?: string | null;
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
  expanded?: ZammadExpandedTicket;
  articles: ZammadTicketArticle[];
};

export type ZammadUserDetail = ZammadUser & {
  organization_id: number | null;
  department?: string | null;
  phone?: string | null;
  mobile?: string | null;
};

export type ZammadOrganization = {
  id: number;
  name: string;
  active: boolean;
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

export function hasZammadConfig(tenant?: Tenant): boolean {
  const active = tenant ?? currentTenant();
  return Boolean(active?.zammadBaseUrl ?? process.env.ZAMMAD_BASE_URL) && Boolean(active?.zammadApiToken ?? process.env.ZAMMAD_API_TOKEN);
}

function baseUrl(tenant?: Tenant): string {
  const active = tenant ?? currentTenant();
  return (active?.zammadBaseUrl ?? process.env.ZAMMAD_BASE_URL ?? "").replace(/\/+$/, "");
}

export function zammadTicketUrl(ticketId: number, tenant?: Tenant): string {
  return baseUrl(tenant) + "/#ticket/zoom/" + ticketId;
}

async function zammadFetch<T>(tenant: Tenant | undefined, path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(baseUrl(tenant) + "/api/v1" + path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: "Token token=" + ((tenant ?? currentTenant())?.zammadApiToken ?? process.env.ZAMMAD_API_TOKEN),
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
export async function findUserByEmail(email: string, tenant?: Tenant): Promise<ZammadUser | null> {
  const safe = email.trim().toLowerCase().replace(/[^a-z0-9@._+-]/g, "");
  if (!safe) return null;

  const results = await zammadFetch<ZammadUser[]>(tenant,
    `/users/search?query=${encodeURIComponent(`email:${safe}`)}&limit=3`,
  );

  return results.find((user) => user.email?.toLowerCase() === safe) ?? null;
}

/** Devuelve el usuario Zammad para el email; lo crea como customer si no existe. */
export async function ensureCustomer(email: string, fullName?: string, tenant?: Tenant): Promise<ZammadUser> {
  const existing = await findUserByEmail(email, tenant);
  if (existing) return existing;

  const nameParts = (fullName ?? "").trim().split(/\s+/).filter(Boolean);
  const firstname = nameParts[0] ?? email.split("@")[0];
  const lastname = nameParts.slice(1).join(" ") || "-";

  return zammadFetch<ZammadUser>(tenant, "/users", {
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
  /** "resolved" → el bot ya solucionó el caso en línea; cualquier otro valor → escala a grupo resolutor. */
  status?: "draft" | "created" | "resolved" | "escalated";
  /** Grupo resolutor real de Zammad (debe existir ya creado ahí). Si no se informa, cae a ZAMMAD_GROUP/"Users". */
  group?: string;
};

/** Caso resuelto en línea por el bot → ticket cerrado (4). Cualquier otro caso (escalado a grupo resolutor) → abierto (2). */
export function mapStatusToZammadState(status?: string): number {
  return status === "resolved" ? 4 : 2;
}

export async function createZammadTicket(input: CreateZammadTicketInput, tenant?: Tenant): Promise<ZammadTicket> {
  const customer = await ensureCustomer(input.customerEmail, input.customerName, tenant);

  return zammadFetch<ZammadTicket>(tenant, "/tickets", {
    method: "POST",
    body: JSON.stringify({
      title: input.title.slice(0, 200),
      group: input.group?.trim() || (tenant ?? currentTenant())?.zammadGroup || process.env.ZAMMAD_GROUP?.trim() || "Users",
      customer_id: customer.id,
      priority_id: mapPriorityToZammad(input.priority),
      state_id: mapStatusToZammadState(input.status),
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
export async function searchTicketsByCustomer(email: string, limit = 5, tenant?: Tenant): Promise<ZammadTicketSummary[]> {
  const user = await findUserByEmail(email, tenant);
  const safeEmail = email.trim().toLowerCase().replace(/[^a-z0-9@._+-]/g, "");
  if (!safeEmail) return [];

  const searches: Promise<TicketSearchResponse>[] = [];

  if (user) {
    searches.push(searchTicketsByQuery(`customer_id:${user.id}`, limit, tenant));
  }

  searches.push(searchTicketsByQuery(safeEmail, limit, tenant));

  const results = await Promise.all(searches.map((search) => search.catch(() => [] as ZammadTicket[])));
  const unique = new Map<number, ZammadTicket>();

  results.flatMap(normalizeSearchResult).forEach((ticket) => {
    unique.set(ticket.id, ticket);
  });

  return [...unique.values()]
    .sort((a, b) => new Date(b.updated_at ?? b.created_at).getTime() - new Date(a.updated_at ?? a.created_at).getTime())
    .slice(0, limit)
    .map((ticket) => toSummary(ticket, tenant));
}

function searchTicketsByQuery(query: string, limit: number, tenant?: Tenant) {
  return zammadFetch<TicketSearchResponse>(tenant,
    `/tickets/search?query=${encodeURIComponent(query)}&limit=${limit}&sort_by=created_at&order_by=desc`,
  );
}

/** Busca un ticket por número visible (ej. 87008). */
export async function findTicketByNumber(number: string, tenant?: Tenant): Promise<ZammadTicketSummary | null> {
  const safe = number.replace(/[^0-9]/g, "");
  if (!safe) return null;

  const result = await zammadFetch<TicketSearchResponse>(tenant,
    `/tickets/search?query=${encodeURIComponent(`number:${safe}`)}&limit=1`,
  );

  const ticket = normalizeSearchResult(result)[0];
  return ticket ? toSummary(ticket, tenant) : null;
}

/** Artículos/comentarios del ticket, incluyendo notas internas para entender la última gestión operativa. */
export async function getTicketArticles(ticketId: number, tenant?: Tenant): Promise<ZammadTicketArticle[]> {
  return zammadFetch<ZammadTicketArticle[]>(tenant, "/ticket_articles/by_ticket/" + ticketId);
}

export async function addTicketNote(ticketId: number, body: string, tenant?: Tenant): Promise<ZammadTicketArticle> {
  return zammadFetch<ZammadTicketArticle>(tenant, "/ticket_articles", {
    method: "POST",
    body: JSON.stringify({
      ticket_id: ticketId,
      type: "note",
      internal: false,
      sender: "Customer",
      body,
      content_type: "text/plain",
    }),
  });
}

export async function getTicketDetail(ticket: ZammadTicketSummary, tenant?: Tenant): Promise<ZammadTicketDetail> {
  const [expanded, articles] = await Promise.all([
    getZammadTicket(ticket.id, tenant).catch(() => undefined),
    getTicketArticles(ticket.id, tenant).catch(() => []),
  ]);
  return { ...ticket, expanded, articles };
}

export async function getZammadTicket(ticketId: number, tenant?: Tenant): Promise<ZammadExpandedTicket> {
  return zammadFetch<ZammadExpandedTicket>(tenant, "/tickets/" + ticketId + "?expand=true");
}

export async function listZammadTickets(limit = 500, tenant?: Tenant): Promise<ZammadExpandedTicket[]> {
  const perPage = Math.min(Math.max(limit, 1), 100);
  const pages = Math.ceil(limit / perPage);
  const tickets: ZammadExpandedTicket[] = [];

  for (let page = 1; page <= pages; page += 1) {
    const batch = await zammadFetch<ZammadExpandedTicket[]>(tenant,
      `/tickets?per_page=${perPage}&page=${page}&expand=true`,
    );
    tickets.push(...batch);
    if (batch.length < perPage || tickets.length >= limit) break;
  }

  return tickets
    .slice(0, limit)
    .sort((a, b) => new Date(b.updated_at ?? b.created_at).getTime() - new Date(a.updated_at ?? a.created_at).getTime());
}

export async function getZammadUserDetail(userId: number, tenant?: Tenant): Promise<ZammadUserDetail | null> {
  if (!userId) return null;
  return zammadFetch<ZammadUserDetail>(tenant, "/users/" + userId).catch(() => null);
}

export async function listZammadOrganizations(tenant?: Tenant): Promise<ZammadOrganization[]> {
  return zammadFetch<ZammadOrganization[]>(tenant, "/organizations").catch(() => []);
}

function toSummary(ticket: ZammadTicket, tenant?: Tenant): ZammadTicketSummary {
  return {
    id: ticket.id,
    number: ticket.number,
    title: ticket.title,
    state: STATE_LABELS[ticket.state_id] ?? `estado ${ticket.state_id}`,
    priority: PRIORITY_LABELS[ticket.priority_id] ?? "normal",
    createdAt: ticket.created_at,
    updatedAt: ticket.updated_at,
    url: zammadTicketUrl(ticket.id, tenant),
  };
}
