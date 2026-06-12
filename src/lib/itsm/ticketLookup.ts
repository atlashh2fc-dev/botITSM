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

const QUERY_NOISE_TERMS = new Set([
  ...TICKET_ENTITY_TERMS,
  ...LOOKUP_ACTION_TERMS,
  ...HISTORY_TERMS,
  "hola",
  "buenas",
  "tengo",
  "tenia",
  "ingresado",
  "ingresada",
  "registrado",
  "registrada",
  "generado",
  "generada",
  "levantado",
  "levantada",
  "indica",
  "indicas",
  "indicar",
  "dime",
  "decir",
  "saber",
  "quiero",
  "necesito",
  "puedes",
  "podrias",
  "favor",
  "gracias",
  "para",
  "porque",
  "sobre",
  "acerca",
  "este",
  "esta",
  "esto",
  "ese",
  "esa",
  "aquel",
  "aquella",
  "algo",
  "algun",
  "alguno",
  "alguna",
  "unos",
  "unas",
  "del",
  "por",
  "con",
  "sin",
  "que",
  "cual",
  "cuando",
  "donde",
  "como",
  "mis",
  "los",
  "las",
  "una",
  "uno",
  "muy",
  "mas",
]);

const TOPIC_ALIASES: string[][] = [
  ["mouse", "mause", "moouse", "mouuse", "raton"],
  ["teclado", "keyboard"],
  ["monitor", "pantalla externa", "segunda pantalla", "display"],
  ["notebook", "laptop", "computador", "equipo", "pc"],
  ["impresora", "printer", "impresion", "imprimir"],
  ["correo", "email", "outlook", "buzon"],
  ["contrasena", "password", "clave", "credenciales"],
  ["vpn", "acceso remoto"],
  ["wifi", "wi fi", "inalambrico", "internet", "red"],
  ["teams", "team"],
  ["office", "microsoft 365", "m365"],
  ["camara", "webcam"],
  ["microfono", "audio", "sonido"],
  ["cargador", "fuente", "adaptador de corriente"],
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

  const topics = extractTicketQueryTopics(userMessage);
  const tickets = await searchTicketsByCustomer(email, topics.length ? 20 : 5);

  if (!tickets.length) {
    return {
      handled: true,
      tickets: [],
      message: `No encuentro tickets registrados a nombre de ${email}. Si reportaste un caso por otro canal, dame el número de ticket y lo reviso.`,
    };
  }

  if (topics.length) {
    const ranked = await rankTicketsByTopics(tickets, topics);
    const matches = ranked.filter((item) => item.score > 0);

    if (!matches.length) {
      return {
        handled: true,
        tickets: [],
        message: `No encontré un ticket relacionado con ${formatTopics(topics)} entre tus casos recientes. Si me das el número de ticket lo reviso directamente; también puedo mostrarte todos tus tickets si lo prefieres.`,
      };
    }

    const bestScore = matches[0].score;
    const bestMatches = matches.filter((item) => item.score === bestScore);
    const asksForSingleTicket = /\b(mi|un|el)\s+(ticket|caso|solicitud|requerimiento|incidente)\b/.test(normalizeText(userMessage));

    if (bestMatches.length === 1 || asksForSingleTicket) {
      const bestMatch = bestMatches[0];
      return {
        handled: true,
        tickets: [bestMatch.detail],
        message: formatTicketDetail(
          bestMatch.detail,
          bestMatches.length === 1
            ? `Encontré el ticket relacionado con ${formatTopics(topics)}:`
            : `Encontré tu ticket más reciente relacionado con ${formatTopics(topics)}:`,
        ),
      };
    }

    const matchedTickets = matches.slice(0, 5).map((item) => item.detail);
    return {
      handled: true,
      tickets: matchedTickets,
      message: formatTickets(matchedTickets, `Encontré ${matchedTickets.length} tickets relacionados con ${formatTopics(topics)}:`),
    };
  }

  if (tickets.length === 1) {
    const detail = await getTicketDetail(tickets[0]);
    return { handled: true, tickets, message: formatTicketDetail(detail) };
  }

  return { handled: true, tickets, message: formatTickets(tickets) };
}

function formatTickets(tickets: ZammadTicketSummary[], customHeader?: string): string {
  const header = customHeader ?? (tickets.length === 1 ? "Encontré este ticket a tu nombre:" : `Tienes ${tickets.length} tickets registrados:`);

  const lines = tickets.map((ticket) => {
    const date = ticket.createdAt.slice(0, 10);
    return `• #${ticket.number} — ${ticket.title} · estado: ${ticket.state} · prioridad: ${ticket.priority} · creado: ${date}`;
  });

  return [header, ...lines, "¿Quieres que revise el detalle de alguno o necesitas reportar algo nuevo?"].join("\n");
}

function formatTicketDetail(ticket: ZammadTicketDetail, customHeader?: string): string {
  const base = [
    customHeader ?? "Encontré este ticket a tu nombre:",
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

export function extractTicketQueryTopics(message: string): string[] {
  const text = normalizeText(message);
  const matchedAliases = TOPIC_ALIASES.filter((aliases) => aliases.some((alias) => containsTerm(text, alias)));
  const aliasTokens = new Set(matchedAliases.flatMap((aliases) => aliases.flatMap((alias) => normalizeText(alias).split(" "))));

  const genericTokens = text
    .split(" ")
    .filter((token) => token.length >= 3)
    .filter((token) => !QUERY_NOISE_TERMS.has(token))
    .filter((token) => !/^\d+$/.test(token))
    .filter((token) => !aliasTokens.has(token));

  return [...new Set([...matchedAliases.map((aliases) => aliases[0]), ...genericTokens])].slice(0, 5);
}

async function rankTicketsByTopics(tickets: ZammadTicketSummary[], topics: string[]) {
  const details = await Promise.all(tickets.map((ticket) => getTicketDetail(ticket)));

  return details
    .map((detail) => ({
      detail,
      score: scoreTicketDetail(detail, topics),
    }))
    .sort((a, b) => b.score - a.score || new Date(b.detail.updatedAt).getTime() - new Date(a.detail.updatedAt).getTime());
}

function scoreTicketDetail(ticket: ZammadTicketDetail, topics: string[]): number {
  const title = normalizeText(ticket.title);
  const articleText = normalizeText(
    ticket.articles
      .map((article) => `${article.subject ?? ""} ${stripRelevanceNoise(cleanArticleBody(article.body))}`)
      .join(" "),
  );

  return topics.reduce((score, topic) => {
    const aliases = TOPIC_ALIASES.find((group) => group[0] === topic) ?? [topic];
    const titleMatch = aliases.some((alias) => containsTerm(title, alias));
    const articleMatch = aliases.some((alias) => containsTerm(articleText, alias));
    return score + (titleMatch ? 4 : 0) + (articleMatch ? 2 : 0);
  }, 0);
}

function stripRelevanceNoise(body: string): string {
  return body
    .replace(/\|\s*referencia kb:[^\n]*/gi, "")
    .replace(/^referencia kb:[^\n]*$/gim, "")
    .replace(/^descartes ejecutados:[^\n]*$/gim, "")
    .replace(/^playbook:[^\n]*$/gim, "")
    .replace(/^pasos completados:[^\n]*$/gim, "");
}

function containsTerm(text: string, term: string): boolean {
  return new RegExp(`\\b${escapeRegExp(normalizeText(term)).replace(/\\ /g, "\\s+")}\\b`, "i").test(text);
}

function formatTopics(topics: string[]): string {
  if (topics.length === 1) return `“${topics[0]}”`;
  return topics.map((topic) => `“${topic}”`).join(", ");
}

function extractOperationalNotes(articles: ZammadTicketArticle[]) {
  const ordered = [...articles].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  const bodies = ordered
    .map((article) => cleanArticleBody(article.body))
    .filter((body) => body && isUsefulOperationalNote(body));
  const combined = bodies.join("\n");

  return {
    schedule: extractSchedule(combined),
    latestUpdate: bodies[0]?.slice(0, 260),
    needsPhone: /\b(telefono|teléfono|fono|celular|numero de telefono|número de teléfono)\b/i.test(combined),
  };
}

function isUsefulOperationalNote(body: string): boolean {
  const text = normalizeText(body);
  if (!text) return false;

  return ![
    "unable to send email",
    "unable to get sent email",
    "delivery status notification",
    "mail delivery failed",
    "undelivered mail returned",
    "your request ticket",
    "has been received and will be reviewed",
    "this is an automatically generated",
  ].some((noise) => text.includes(normalizeText(noise)));
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
