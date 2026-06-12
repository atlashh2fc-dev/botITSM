/**
 * ticketLookup.ts — Consulta de tickets vía chat (omnicanal).
 *
 * Detección determinística (Tier 1) de la intención "consultar mis tickets /
 * estado de un ticket" y resolución contra Zammad (ITSM Geimser).
 */

import { findTicketByNumber, getTicketDetail, hasZammadConfig, searchTicketsByCustomer, type ZammadTicketArticle, type ZammadTicketDetail, type ZammadTicketSummary } from "@/lib/zammad/client";

const TICKET_ENTITY_TERMS = [
  "ticket",
  "tickets",
  "caso",
  "casos",
  "solicitud",
  "solicitudes",
  "requerimiento",
  "requerimientos",
  "incidente",
  "incidentes",
  "reclamo",
  "reclamos",
];

const LOOKUP_ACTION_TERMS = [
  "estado",
  "estatus",
  "status",
  "avance",
  "seguimiento",
  "consultar",
  "consulta",
  "revisar",
  "revisa",
  "buscar",
  "busca",
  "ver",
  "verificar",
  "verifica",
  "como va",
  "como van",
  "en que va",
  "en que van",
  "que paso",
  "que ha pasado",
  "en que quedo",
  "en que quedaron",
  "pendiente",
  "pendientes",
  "abierto",
  "abiertos",
  "cerrado",
  "cerrados",
  "resuelto",
  "resueltos",
];

const HISTORY_TERMS = [
  "anterior",
  "anteriores",
  "pasado",
  "pasados",
  "historial",
  "historico",
  "ultimos",
  "ultimo",
  "reciente",
  "recientes",
  "ayer",
  "lo mio",
  "lo anterior",
  "lo pasado",
  "lo de ayer",
  "lo del",
  "lo de",
];

const CREATE_CASE_TERMS = [
  "abreme ticket",
  "abreme un ticket",
  "abre ticket",
  "abre un ticket",
  "abre caso",
  "abre un caso",
  "crear caso",
  "crear un caso",
  "crear ticket",
  "crear un ticket",
  "abrir caso",
  "abrir un caso",
  "abrir ticket",
  "abrir un ticket",
  "levantar caso",
  "levantar un caso",
  "levantar ticket",
  "levantar un ticket",
  "registrar caso",
  "registrar un caso",
  "registrar ticket",
  "registrar un ticket",
  "reportar problema",
  "reportar falla",
  "nuevo caso",
  "nuevo ticket",
  "quiero un ticket",
  "necesito un ticket",
];

export function isTicketQueryMessage(message: string): boolean {
  const text = normalizeText(message);
  if (!text) return false;

  if (extractTicketNumber(text)) return true;

  const mentionsTicketEntity = hasAnyTerm(text, TICKET_ENTITY_TERMS);
  const mentionsLookupAction = hasAnyTerm(text, LOOKUP_ACTION_TERMS);
  const mentionsHistory = hasAnyTerm(text, HISTORY_TERMS);
  const wantsNewCase = hasAnyTerm(text, CREATE_CASE_TERMS);

  if (wantsNewCase && !mentionsHistory) return false;
  if (mentionsTicketEntity && (mentionsLookupAction || mentionsHistory)) return true;
  if (mentionsTicketEntity && isTicketCreationMessage(text)) return false;
  if (mentionsTicketEntity && /\b(mis|mi|los|el|un|unos)\s+(ticket|tickets|caso|casos|solicitud|solicitudes|requerimiento|requerimientos)\b/.test(text)) return true;

  return mentionsLookupAction && mentionsHistory;
}

export function isTicketCreationMessage(message: string): boolean {
  const text = normalizeText(message);
  if (!text) return false;

  if (hasAnyTerm(text, CREATE_CASE_TERMS)) return true;

  return (
    hasAnyTerm(text, TICKET_ENTITY_TERMS) &&
    /\b(abre|abrir|crear|crea|levantar|levanta|registrar|registra|generar|genera|necesito|quiero)\b/.test(text)
  );
}

export function extractTicketNumber(message: string): string | null {
  const match = normalizeText(message).match(/(?:ticket|caso|numero|#|zam-)\s*#?\s*(\d{4,})/i);
  return match?.[1] ?? null;
}

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[¿?¡!,.;:()[\]{}"'`´]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasAnyTerm(text: string, terms: string[]): boolean {
  return terms.some((term) => new RegExp(`\\b${escapeRegExp(normalizeText(term))}\\b`, "i").test(text));
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
    const detail = await getTicketDetail(ticket);
    return { handled: true, tickets: [ticket], message: formatTicketDetail(detail) };
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

  if (tickets.length === 1) {
    const detail = await getTicketDetail(tickets[0]);
    return { handled: true, tickets, message: formatTicketDetail(detail) };
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

function formatTicketDetail(ticket: ZammadTicketDetail): string {
  const base = [
    `Encontré este ticket a tu nombre:`,
    `• #${ticket.number} — ${ticket.title}`,
    `• Estado: ${ticket.state}`,
    `• Prioridad: ${ticket.priority}`,
    `• Creado: ${ticket.createdAt.slice(0, 10)}`,
  ];

  const operationalNotes = extractOperationalNotes(ticket.articles);
  if (operationalNotes.schedule) {
    base.push(`• Última gestión: ${operationalNotes.schedule}`);
  } else if (operationalNotes.latestUpdate) {
    base.push(`• Última actualización: ${operationalNotes.latestUpdate}`);
  }

  if (operationalNotes.needsPhone) {
    base.push("Necesito que me confirmes tu número de teléfono para actualizar el ticket.");
  } else {
    base.push("¿Quieres que revise otro ticket o necesitas agregar algo a este caso?");
  }

  return base.join("\n");
}

function extractOperationalNotes(articles: ZammadTicketArticle[]) {
  const ordered = [...articles].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  const bodies = ordered.map((article) => cleanArticleBody(article.body)).filter(Boolean);
  const combined = bodies.join("\n");

  return {
    schedule: extractSchedule(combined),
    latestUpdate: bodies[0]?.slice(0, 260),
    needsPhone: /\b(telefono|teléfono|fono|celular|numero de telefono|número de teléfono)\b/i.test(combined),
  };
}

function extractSchedule(text: string): string | undefined {
  const sentences = text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);

  const scheduleSentence = sentences.find((sentence) =>
    /\b(programa|programado|agenda|agendado|coordina|coordinado|cambio|visita)\b/i.test(sentence) &&
    /(\b\d{1,2}[./-]\d{1,2}\b|\b\d{1,2}:\d{2}\b|\b(lunes|martes|miercoles|miércoles|jueves|viernes|sabado|sábado|domingo)\b)/i.test(sentence),
  );

  return scheduleSentence ? cleanOperationalSentence(scheduleSentence) : undefined;
}

function cleanArticleBody(value: string): string {
  return value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanOperationalSentence(value: string): string {
  return value
    .replace(/\bsi el usuario pregunta por el ticket\b.*$/i, "")
    .replace(/[,\s]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
