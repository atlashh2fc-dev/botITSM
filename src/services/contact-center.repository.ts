import { currentTenant } from "@/lib/tenant/context";
import { getTicketArticles, listZammadTickets, type ZammadExpandedTicket, type ZammadTicketArticle } from "@/lib/zammad/client";

export type ContactChannel = "bot" | "email" | "phone" | "portal" | "unclassified";

export type ContactCenterRow = {
  id: number;
  number: string;
  subject: string;
  channel: ContactChannel;
  channelEvidence: string;
  createdAt: string;
  firstResponseMinutes: number | null;
  state: string;
  priority: string;
  escalated: boolean;
};

export type ContactCenterReport = {
  generatedAt: string;
  sampleSize: number;
  channels: Record<ContactChannel, number>;
  inbound: number;
  firstResponseMeasured: number;
  firstResponseAverageMinutes: number | null;
  awaitingFirstResponse: number;
  escalated: number;
  resolved: number;
  rows: ContactCenterRow[];
  unavailable: string[];
};

const EMPTY_CHANNELS: Record<ContactChannel, number> = { bot: 0, email: 0, phone: 0, portal: 0, unclassified: 0 };

/**
 * Contact-center reporting is deliberately evidence based. The ticket's first
 * external article is the source of truth for the inbound channel. Queue-only
 * values (abandonment, talk time, service level by call) are not fabricated.
 */
export async function getContactCenterReport(): Promise<ContactCenterReport> {
  const tenant = currentTenant();
  if (!tenant?.zammadBaseUrl || !tenant.zammadApiToken) {
    return emptyReport();
  }

  const tickets = await listZammadTickets(200, tenant);
  const rows = await mapWithConcurrency(tickets, 6, async ticket => {
    const articles = await getTicketArticles(ticket.id, tenant).catch(() => []);
    return buildRow(ticket, articles);
  });
  const channels = rows.reduce<Record<ContactChannel, number>>((accumulator, row) => {
    accumulator[row.channel] += 1;
    return accumulator;
  }, { ...EMPTY_CHANNELS });
  const measured = rows.filter(row => row.firstResponseMinutes !== null).map(row => row.firstResponseMinutes as number);

  return {
    generatedAt: new Date().toISOString(),
    sampleSize: rows.length,
    channels,
    inbound: rows.length,
    firstResponseMeasured: measured.length,
    firstResponseAverageMinutes: measured.length ? Math.round(measured.reduce((sum, value) => sum + value, 0) / measured.length) : null,
    awaitingFirstResponse: rows.filter(row => row.firstResponseMinutes === null && !isResolved(row.state)).length,
    escalated: rows.filter(row => row.escalated).length,
    resolved: rows.filter(row => isResolved(row.state)).length,
    rows: rows.sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
    unavailable: ["Abandonos, tiempo de conversación y nivel de servicio de llamadas requieren una plataforma de telefonía integrada (Genesys/Five9)."],
  };
}

function buildRow(ticket: ZammadExpandedTicket, articles: ZammadTicketArticle[]): ContactCenterRow {
  const externalArticles = articles
    .filter(article => !article.internal)
    .sort((left, right) => left.created_at.localeCompare(right.created_at));
  const firstInbound = externalArticles.find(article => isCustomerArticle(article)) ?? externalArticles[0];
  const firstAgentReply = firstInbound
    ? externalArticles.find(article => new Date(article.created_at).getTime() >= new Date(firstInbound.created_at).getTime() && isAgentArticle(article))
    : undefined;
  const responseMinutes = firstInbound && firstAgentReply
    ? Math.max(0, Math.round((new Date(firstAgentReply.created_at).getTime() - new Date(firstInbound.created_at).getTime()) / 60000))
    : null;
  const classification = classifyChannel(firstInbound);

  return {
    id: ticket.id,
    number: ticket.number,
    subject: ticket.title,
    channel: classification.channel,
    channelEvidence: classification.evidence,
    createdAt: ticket.created_at,
    firstResponseMinutes: responseMinutes,
    state: ticket.state ?? String(ticket.state_id),
    priority: ticket.priority ?? String(ticket.priority_id),
    escalated: Boolean(ticket.escalation_at),
  };
}

function classifyChannel(article?: ZammadTicketArticle): { channel: ContactChannel; evidence: string } {
  if (!article) return { channel: "unclassified", evidence: "No existe artículo externo inicial" };
  const body = article.body.toLowerCase();
  const type = (article.type ?? "").toLowerCase();
  if (body.includes("ticket generado por bot itsm") || body.includes("\ncanal: portal-web") || body.includes("\ncanal: field-copilot")) return { channel: "bot", evidence: "Marcador del Bot ITSM en el artículo inicial" };
  if (type === "email") return { channel: "email", evidence: "Tipo de artículo: email" };
  if (type === "phone") return { channel: "phone", evidence: "Tipo de artículo: phone" };
  if (type === "web") return { channel: "portal", evidence: "Tipo de artículo: web" };
  return { channel: "unclassified", evidence: `Tipo de artículo no clasificable: ${type || "sin dato"}` };
}

function isCustomerArticle(article: ZammadTicketArticle) {
  return /customer|cliente|user|usuario/i.test(article.sender ?? "");
}

function isAgentArticle(article: ZammadTicketArticle) {
  return /agent|agente/i.test(article.sender ?? "");
}

function isResolved(state: string) {
  return /closed|close|cerrado|resuelto|merged|fusionado/i.test(state);
}

async function mapWithConcurrency<T, R>(items: T[], concurrency: number, map: (item: T) => Promise<R>): Promise<R[]> {
  const output: R[] = [];
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      output[index] = await map(items[index]);
    }
  });
  await Promise.all(workers);
  return output;
}

function emptyReport(): ContactCenterReport {
  return {
    generatedAt: new Date().toISOString(), sampleSize: 0, channels: { ...EMPTY_CHANNELS }, inbound: 0,
    firstResponseMeasured: 0, firstResponseAverageMinutes: null, awaitingFirstResponse: 0, escalated: 0, resolved: 0, rows: [],
    unavailable: ["Zammad no está configurado para este tenant."],
  };
}
