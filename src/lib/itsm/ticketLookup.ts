/**
 * ticketLookup.ts — Consulta de tickets vía chat (omnicanal).
 *
 * Detección determinística (Tier 1) de la intención "consultar mis tickets /
 * estado de un ticket" y resolución contra Zammad (ITSM Geimser).
 */

import type { SessionContext } from "@/lib/itsm/types";
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
  ["mouse", "mause", "moouse", "mouuse", "raton", "periferico", "puntero", "cursor", "click", "rueda"],
  ["teclado", "keyboard", "periferico"],
  ["monitor", "pantalla externa", "segunda pantalla", "display", "hdmi", "displayport", "vga"],
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

const TOPIC_CONFLICT_ALIASES: Record<string, string[]> = {
  mouse: ["teclado", "keyboard"],
  teclado: ["mouse", "mause", "moouse", "mouuse", "raton"],
  monitor: ["pantalla integrada", "pantalla del notebook"],
};

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

export function isTicketLookupCorrectionMessage(message: string, context: SessionContext): boolean {
  if (!context.lastTicketLookup || context.lastTicketLookup.found) return false;

  const text = normalizeText(message);
  if (!text) return false;

  const lastLookupAge = Date.now() - new Date(context.lastTicketLookup.createdAt).getTime();
  if (!Number.isFinite(lastLookupAge) || lastLookupAge > 10 * 60 * 1000) return false;

  const correction = /\b(pero|si|sí|existe|tengo|deberia|debería|hay|lo ingrese|lo ingresé|esta|está)\b/.test(text);
  const refersToPreviousLookup = /\b(uno|ese|esa|mismo|misma|ticket|caso|solicitud)\b/.test(text);
  const repeatsTopic = context.lastTicketLookup.topics.some((topic) => containsTerm(text, topic));

  return correction && (refersToPreviousLookup || repeatsTopic);
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
  topics: string[];
  matched: boolean;
  needsEmail?: boolean;
};

type ResolveTicketQueryOptions = {
  fallbackTopics?: string[];
  lenient?: boolean;
  lenientReason?: "correction" | "continuation";
};

export async function resolveTicketQuery(userMessage: string, email?: string, options: ResolveTicketQueryOptions = {}): Promise<TicketQueryResult> {
  if (!hasZammadConfig()) {
    return {
      handled: true,
      tickets: [],
      topics: [],
      matched: false,
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
        topics: [],
        matched: false,
        message: `No encontré el ticket #${ticketNumber} en el sistema. ¿Puedes confirmar el número? También puedo listar tus tickets si me confirmas tu correo corporativo.`,
      };
    }
    const detail = await getTicketDetail(ticket);
    return { handled: true, tickets: [ticket], topics: [], matched: true, message: formatTicketDetail(detail) };
  }

  const topics = extractTicketQueryTopics(userMessage, options.fallbackTopics);

  if (!email) {
    return {
      handled: true,
      tickets: [],
      topics,
      matched: false,
      needsEmail: true,
      message: "Puedo revisar tus tickets de inmediato. ¿Me confirmas tu correo corporativo para identificarte en el sistema?",
    };
  }

  const tickets = await searchTicketsByCustomer(email, topics.length ? 50 : 5);

  if (!tickets.length) {
    return {
      handled: true,
      tickets: [],
      topics,
      matched: false,
      message: `No encuentro tickets registrados a nombre de ${email}. Si reportaste un caso por otro canal, dame el número de ticket y lo reviso.`,
    };
  }

  if (topics.length) {
    const ranked = await rankTicketsByTopics(tickets, topics);
    const matches = ranked.filter((item) => item.score > 0);

    if (!matches.length) {
      const candidates = [...ranked]
        .sort((a, b) =>
          b.fallbackScore - a.fallbackScore ||
          new Date(b.detail.updatedAt).getTime() - new Date(a.detail.updatedAt).getTime()
        )
        .slice(0, options.lenient ? 5 : 3)
        .map((item) => item.detail);
      return {
        handled: true,
        tickets: candidates,
        topics,
        matched: false,
        message: [
          options.lenient && options.lenientReason === "correction"
            ? `Tienes razón, amplié la búsqueda sin exigir que el ticket diga exactamente ${formatTopics(topics)}.`
            : options.lenient
            ? `Retomo tu consulta anterior y amplio la búsqueda sin exigir que el ticket diga exactamente ${formatTopics(topics)}.`
            : `Veo tickets a tu nombre, pero ninguno indica claramente ${formatTopics(topics)}.`,
          "Para no inventar el estado, te muestro los candidatos recientes más probables. Dime el número y abro el detalle:",
          ...formatTicketLines(candidates),
        ].join("\n"),
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
        topics,
        matched: true,
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
      topics,
      matched: true,
      message: formatTickets(matchedTickets, `Encontré ${matchedTickets.length} tickets relacionados con ${formatTopics(topics)}:`),
    };
  }

  if (tickets.length === 1) {
    const detail = await getTicketDetail(tickets[0]);
    return { handled: true, tickets, topics, matched: true, message: formatTicketDetail(detail) };
  }

  return { handled: true, tickets, topics, matched: true, message: formatTickets(tickets) };
}

function formatTickets(tickets: ZammadTicketSummary[], customHeader?: string): string {
  const header = customHeader ?? (tickets.length === 1 ? "Encontré este ticket a tu nombre:" : `Tienes ${tickets.length} tickets registrados:`);

  return [header, ...formatTicketLines(tickets), "¿Quieres que revise el detalle de alguno o necesitas reportar algo nuevo?"].join("\n");
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

export function extractTicketQueryTopics(message: string, fallbackTopics: string[] = []): string[] {
  const text = normalizeText(message);
  const matchedAliases = TOPIC_ALIASES.filter((aliases) => aliases.some((alias) => containsTerm(text, alias)));
  const aliasTokens = new Set(matchedAliases.flatMap((aliases) => aliases.flatMap((alias) => normalizeText(alias).split(" "))));

  const genericTokens = text
    .split(" ")
    .filter((token) => token.length >= 3)
    .filter((token) => !QUERY_NOISE_TERMS.has(token))
    .filter((token) => !/^\d+$/.test(token))
    .filter((token) => !aliasTokens.has(token));

  return [...new Set([...matchedAliases.map((aliases) => aliases[0]), ...genericTokens, ...fallbackTopics])].slice(0, 5);
}

async function rankTicketsByTopics(tickets: ZammadTicketSummary[], topics: string[]) {
  const details = await Promise.all(tickets.map((ticket) => getTicketDetail(ticket)));

  return details
    .map((detail) => ({
      detail,
      score: scoreTicketDetail(detail, topics),
      fallbackScore: scoreFallbackCandidate(detail),
    }))
    .sort((a, b) =>
      b.score - a.score ||
      b.fallbackScore - a.fallbackScore ||
      new Date(b.detail.updatedAt).getTime() - new Date(a.detail.updatedAt).getTime()
    );
}

function scoreTicketDetail(ticket: ZammadTicketDetail, topics: string[]): number {
  const title = normalizeText(ticket.title);
  const relevanceText = ticket.articles
    .map((article) => `${article.subject ?? ""}\n${stripRelevanceNoise(cleanArticleBody(article.body, { preserveLines: true }))}`)
    .join(" ");
  const articleText = normalizeText(
    relevanceText,
  );
  const assetText = normalizeText(extractAssetText(relevanceText));

  return topics.reduce((score, topic) => {
    const aliases = TOPIC_ALIASES.find((group) => group[0] === topic) ?? [topic];
    const titleMatch = aliases.some((alias) => containsTerm(title, alias));
    const articleMatch = aliases.some((alias) => containsTerm(articleText, alias));
    const assetMatch = aliases.some((alias) => containsTerm(assetText, alias));
    const conflicts = TOPIC_CONFLICT_ALIASES[topic] ?? [];
    const assetConflict = conflicts.some((alias) => containsTerm(assetText, alias));
    const genericPeripheralOnly = topic === "mouse" && !assetMatch && !titleMatch && containsTerm(articleText, "periferico");

    if (assetConflict) return score - 4;
    return score + (assetMatch ? 8 : 0) + (titleMatch ? 4 : 0) + (articleMatch && !genericPeripheralOnly ? 2 : 0);
  }, 0);
}

function formatTicketLines(tickets: ZammadTicketSummary[]): string[] {
  return tickets.map((ticket) => {
    const date = ticket.createdAt.slice(0, 10);
    return `• #${ticket.number} — ${ticket.title} · estado: ${ticket.state} · prioridad: ${ticket.priority} · creado: ${date}`;
  });
}

function scoreFallbackCandidate(ticket: ZammadTicketDetail): number {
  const title = normalizeText(ticket.title);
  const state = normalizeText(ticket.state);
  const priority = normalizeText(ticket.priority);

  return (
    (state.includes("abierto") || state.includes("nuevo") || state.includes("pendiente") ? 4 : 0) +
    (priority.includes("alta") ? 2 : priority.includes("normal") ? 1 : 0) +
    (title.includes("hardware") || title.includes("puesto de trabajo") ? 3 : 0) -
    (title.includes("prueba") || title.includes("test") ? 6 : 0)
  );
}

function extractAssetText(body: string): string {
  return body
    .split(/\n+/)
    .filter((line) => /^(activo afectado|activo|sistema afectado):/i.test(line.trim()))
    .join(" ");
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

function cleanArticleBody(value: string, options: { preserveLines?: boolean } = {}): string {
  const cleaned = value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");

  return options.preserveLines
    ? cleaned
      .split(/\n+/)
      .map((line) => line.replace(/[ \t]+/g, " ").trim())
      .filter(Boolean)
      .join("\n")
    : cleaned
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
