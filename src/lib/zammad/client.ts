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
  if (active) return Boolean(active.zammadBaseUrl && active.zammadApiToken);
  return Boolean(process.env.ZAMMAD_BASE_URL && process.env.ZAMMAD_API_TOKEN);
}

function baseUrl(tenant?: Tenant): string {
  const active = tenant ?? currentTenant();
  return (active ? active.zammadBaseUrl ?? "" : process.env.ZAMMAD_BASE_URL ?? "").replace(/\/+$/, "");
}

export function zammadTicketUrl(ticketId: number, tenant?: Tenant): string {
  return baseUrl(tenant) + "/#ticket/zoom/" + ticketId;
}

async function zammadFetch<T>(tenant: Tenant | undefined, path: string, init?: RequestInit): Promise<T> {
  const active = tenant ?? currentTenant();
  const response = await fetch(baseUrl(tenant) + "/api/v1" + path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: "Token token=" + (active ? active.zammadApiToken ?? "" : process.env.ZAMMAD_API_TOKEN ?? ""),
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

/** Busca un customer por teléfono o móvil usando comparación normalizada. */
export async function findUserByPhone(phone: string, tenant?: Tenant): Promise<ZammadUserDetail | null> {
  const normalized = normalizePhone(phone);
  if (!normalized) return null;

  const results = await zammadFetch<ZammadUserDetail[]>(tenant,
    `/users/search?query=${encodeURIComponent(phone.trim())}&limit=20`,
  );

  return results.find((user) =>
    normalizePhone(user.phone ?? "") === normalized || normalizePhone(user.mobile ?? "") === normalized,
  ) ?? null;
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
  /** Etiquetas técnicas para automatización y trazabilidad dentro de Zammad. */
  tags?: string[];
};

/** Caso resuelto en línea por el bot → ticket cerrado (4). Cualquier otro caso (escalado a grupo resolutor) → abierto (2). */
export function mapStatusToZammadState(status?: string): number {
  return status === "resolved" ? 4 : 2;
}

export async function createZammadTicket(input: CreateZammadTicketInput, tenant?: Tenant): Promise<ZammadTicket> {
  const customer = await ensureCustomer(input.customerEmail, input.customerName, tenant);

  // Zammad 7 does not accept `tags` in the ticket creation payload. Create
  // first, then attach every tag through its dedicated endpoint. This keeps
  // the ticket creation atomic from the bot's perspective while preserving
  // the tags used by Forum's routing triggers.
  const ticket = await zammadFetch<ZammadTicket>(tenant, "/tickets", {
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

  const tags = [...new Set((input.tags ?? []).map((tag) => tag.trim()).filter(Boolean))];
  for (const tag of tags) {
    await zammadFetch<true>(tenant, "/tags/add", {
      method: "POST",
      body: JSON.stringify({ item: tag, object: "Ticket", o_id: ticket.id }),
    });
  }

  return ticket;
}

export type CreateZammadPhoneTicketInput = {
  callId: string;
  from: string;
  to: string;
  queue?: string;
  occurredAt: string;
};

/** Crea el ticket que representa una llamada entrante, asociado por teléfono si es posible. */
export async function createZammadPhoneTicket(
  input: CreateZammadPhoneTicketInput,
  tenant?: Tenant,
): Promise<ZammadTicket> {
  const active = tenant ?? currentTenant();
  const phoneCustomer = await findUserByPhone(input.from, tenant);
  const fallbackEmail = active?.telephonyFallbackEmail
    ?? (active?.id === "geimser" ? "omnicanal@geimser.cl" : undefined);
  if (!phoneCustomer && !fallbackEmail) {
    throw new Error(`Customer fallback telefónico no configurado para ${active?.name ?? "el tenant"}.`);
  }
  const customer = phoneCustomer
    ?? await ensureCustomer(fallbackEmail!, "Contacto telefónico", tenant);
  const marker = zammadCallMarker(input.callId);
  if (!marker) throw new Error("Call-ID inválido para crear ticket telefónico.");
  const title = `${marker} Llamada entrante · ${input.from} → ${input.to}`.slice(0, 200);

  return zammadFetch<ZammadTicket>(tenant, "/tickets", {
    method: "POST",
    body: JSON.stringify({
      title,
      group: active?.zammadGroup || process.env.ZAMMAD_GROUP?.trim() || "Users",
      customer_id: customer.id,
      priority_id: 2,
      state_id: 2,
      article: {
        subject: "Llamada entrante recibida",
        body: [
          "LLAMADA REGISTRADA DESDE ASTERISK",
          `Call-ID: ${input.callId}`,
          `Desde: ${input.from}`,
          `Hacia: ${input.to}`,
          `Cola: ${input.queue || "No informada"}`,
          `Inicio: ${input.occurredAt}`,
        ].join("\n"),
        type: "phone",
        content_type: "text/plain",
        internal: false,
        sender: "Customer",
      },
    }),
  });
}

export type ZammadPhoneArticleInput = {
  ticketId: number;
  eventId: string;
  subject: string;
  body: string;
  durationSeconds?: number;
};

/** Agrega el resultado final de la llamada como nota telefónica del ticket. */
export async function createZammadPhoneArticle(
  input: ZammadPhoneArticleInput,
  tenant?: Tenant,
): Promise<ZammadTicketArticle> {
  const existing = await getTicketArticles(input.ticketId, tenant);
  const marker = `Event-ID: ${input.eventId}`;
  const duplicate = existing.find((article) => article.body.includes(marker));
  if (duplicate) return duplicate;

  return zammadFetch<ZammadTicketArticle>(tenant, "/ticket_articles", {
    method: "POST",
    body: JSON.stringify({
      ticket_id: input.ticketId,
      subject: input.subject,
      body: `${input.body}\n${marker}`,
      content_type: "text/plain",
      type: "phone",
      internal: false,
      sender: "Agent",
      ...(input.durationSeconds !== undefined
        ? { time_unit: Math.max(1, Math.ceil(input.durationSeconds / 60)).toString() }
        : {}),
    }),
  });
}

/** Recupera un ticket ya creado si un reintento ocurrió antes de persistir su vínculo local. */
export async function findZammadPhoneTicketByCallId(callId: string, tenant?: Tenant): Promise<ZammadTicket | null> {
  const safe = callId.replace(/[^a-zA-Z0-9._:-]/g, "");
  if (!safe) return null;
  const marker = zammadCallMarker(safe);
  const result = await searchTicketsByQuery(safe, 10, tenant);
  return normalizeSearchResult(result).find((ticket) => ticket.title.includes(marker)) ?? null;
}

function zammadCallMarker(callId: string): string {
  const safe = callId.replace(/[^a-zA-Z0-9._:-]/g, "");
  return safe ? `[Call-ID:${safe}]` : "";
}

export type ZammadCtiEvent = {
  event: "newCall" | "answer" | "hangup";
  from: string;
  to: string;
  direction: "in" | "out";
  callId: string;
  answeringNumber?: string;
  queue?: string;
  cause?: string;
  user?: string | string[];
};

/** Envía señalización a la CTI genérica. Su URL ya contiene el token secreto. */
export async function sendZammadCtiEvent(event: ZammadCtiEvent, tenant?: Tenant): Promise<void> {
  const active = tenant ?? currentTenant();
  if (!active?.zammadCtiUrl) return;

  const response = await fetch(active.zammadCtiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(event),
    cache: "no-store",
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Zammad CTI → ${response.status}: ${body.slice(0, 200)}`);
  }
}

function normalizePhone(value: string): string {
  const digits = value.replace(/\D/g, "");
  return digits.length >= 7 ? digits.slice(-12) : "";
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
  if (!user) return [];

  // Never use a broad email search here. In Zammad that can also match the
  // creator, owner or an article participant and leak tickets from another
  // customer. customer_id is the authoritative tenant/user boundary.
  const results = await Promise.all([
    searchTicketsByQuery(`customer_id:${user.id}`, limit, tenant).catch(() => [] as ZammadTicket[]),
  ]);
  const unique = new Map<number, ZammadTicket>();

  results.flatMap(normalizeSearchResult).forEach((ticket) => {
    unique.set(ticket.id, ticket);
  });

  return [...unique.values()]
    .sort((a, b) => new Date(b.updated_at ?? b.created_at).getTime() - new Date(a.updated_at ?? a.created_at).getTime())
    .slice(0, limit)
    .map((ticket) => toSummary(ticket, tenant));
}

/** Todos los tickets creados hoy por el cliente, usando el día calendario de Chile. */
export async function searchTodayTicketsByCustomer(email: string, tenant?: Tenant): Promise<ZammadTicketSummary[]> {
  const user = await findUserByEmail(email, tenant);
  if (!user) return [];

  const today = dateKeyInChile(new Date());
  const unique = new Map<number, ZammadTicket>();
  const pageSize = 100;

  // Zammad impone límites por respuesta. Recorremos páginas ordenadas por
  // creación y dejamos de consultar apenas entramos a un día anterior.
  for (let page = 1; page <= 50; page += 1) {
    const result = await searchTicketsByQuery(`customer_id:${user.id}`, pageSize, tenant, page)
      .catch(() => [] as ZammadTicket[]);
    const pageTickets = normalizeSearchResult(result);

    pageTickets.forEach((ticket) => {
      if (ticket.customer_id === user.id && dateKeyInChile(ticket.created_at) === today) {
        unique.set(ticket.id, ticket);
      }
    });

    if (pageTickets.length < pageSize) break;
    if (pageTickets.some((ticket) => dateKeyInChile(ticket.created_at) < today)) break;
  }

  return [...unique.values()]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .map((ticket) => toSummary(ticket, tenant));
}

function searchTicketsByQuery(query: string, limit: number, tenant?: Tenant, page = 1) {
  return zammadFetch<TicketSearchResponse>(tenant,
    `/tickets/search?query=${encodeURIComponent(query)}&limit=${limit}&per_page=${limit}&page=${page}&sort_by=created_at&order_by=desc`,
  );
}

function dateKeyInChile(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return "";

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Santiago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
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

/** Busca un ticket visible y confirma que pertenezca al cliente autenticado. */
export async function findTicketByNumberForCustomer(number: string, email: string, tenant?: Tenant): Promise<ZammadTicketSummary | null> {
  const [ticket, user] = await Promise.all([
    findTicketByNumber(number, tenant),
    findUserByEmail(email, tenant),
  ]);
  if (!ticket || !user) return null;

  const expanded = await getZammadTicket(ticket.id, tenant).catch(() => null);
  return expanded?.customer_id === user.id ? ticket : null;
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
