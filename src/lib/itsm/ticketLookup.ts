/**
 * ticketLookup.ts — Consulta de tickets vía chat (omnicanal).
 *
 * Detección determinística (Tier 1) de la intención "consultar mis tickets /
 * estado de un ticket" y resolución contra Zammad (ITSM Geimser).
 */

import { findTicketByNumber, hasZammadConfig, searchTicketsByCustomer, type ZammadTicketSummary } from "@/lib/zammad/client";

const QUERY_PATTERNS = [
  /\b(mis|los)\s+tickets?\b/i,
  /\b(estado|estatus|status|avance|c[oó]mo va|que pas[oó]|en qu[eé] va)\b.*\bticket\b/i,
  /\b(estado|estatus|status|avance|c[oó]mo va|que pas[oó]|en qu[eé] va)\b.*\b(mi|mis|el|los)?\s*(caso|solicitud|requerimiento)s?\b/i,
  /\bticket\b.*\b(estado|estatus|status|avance|abierto|pendiente|cerrado)\b/i,
  /\b(mi|mis|el|los)?\s*(caso|solicitud|requerimiento)s?\b.*\b(estado|estatus|status|avance|c[oó]mo va|que pas[oó]|en qu[eé] va|abierto|pendiente|cerrado)\b/i,
  /\bconsultar?\b.*\b(ticket|caso|solicitud)\b/i,
  /\bseguimiento\b.*\b(ticket|caso)\b/i,
  /\btengo\s+(alg[uú]n|alg[uú]nos|un)?\s*(ticket|caso)s?\s+(abierto|pendiente|activo)/i,
];

export function isTicketQueryMessage(message: string): boolean {
  const normalized = message.normalize("NFD").replace(/[̀-ͯ]/g, "");
  return QUERY_PATTERNS.some((pattern) => pattern.test(message) || pattern.test(normalized));
}

export function extractTicketNumber(message: string): string | null {
  const match = message.match(/(?:ticket|caso|n[uú]mero|#|zam-)\s*#?\s*(\d{4,})/i);
  return match?.[1] ?? null;
}

export type TicketQueryResult = {
  handled: boolean;
  message: string;
  tickets: ZammadTicketSummary[];
  needsEmail?: boolean;
};

export async function resolveTicketQuery(userMessage: string, email?: string): Promise<TicketQueryResult> {
  if (!hasZammadConfig()) {
    return {
      handled: true,
      tickets: [],
      message: "La consulta de tickets aún no está conectada al ITSM. Un agente puede ayudarte con el estado de tu caso.",
    };
  }

  const ticketNumber = extractTicketNumber(userMessage);

  if (ticketNumber) {
    const ticket = await findTicketByNumber(ticketNumber);
    if (!ticket) {
      return {
        handled: true,
        tickets: [],
        message: `No encontré el ticket #${ticketNumber} en el sistema. ¿Puedes confirmar el número? También puedo listar tus tickets si me confirmas tu correo corporativo.`,
      };
    }
    return { handled: true, tickets: [ticket], message: formatTickets([ticket]) };
  }

  if (!email) {
    return {
      handled: true,
      tickets: [],
      needsEmail: true,
      message: "Puedo revisar tus tickets de inmediato. ¿Me confirmas tu correo corporativo para identificarte en el sistema?",
    };
  }

  const tickets = await searchTicketsByCustomer(email, 5);

  if (!tickets.length) {
    return {
      handled: true,
      tickets: [],
      message: `No encuentro tickets registrados a nombre de ${email}. Si reportaste un caso por otro canal, dame el número de ticket y lo reviso.`,
    };
  }

  return { handled: true, tickets, message: formatTickets(tickets) };
}

function formatTickets(tickets: ZammadTicketSummary[]): string {
  const header = tickets.length === 1 ? "Encontré este ticket a tu nombre:" : `Tienes ${tickets.length} tickets registrados:`;

  const lines = tickets.map((ticket) => {
    const date = ticket.createdAt.slice(0, 10);
    return `• #${ticket.number} — ${ticket.title} · estado: ${ticket.state} · prioridad: ${ticket.priority} · creado: ${date}`;
  });

  return [header, ...lines, "¿Quieres que revise el detalle de alguno o necesitas reportar algo nuevo?"].join("\n");
}
