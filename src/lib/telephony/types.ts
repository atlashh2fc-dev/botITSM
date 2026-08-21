export const TELEPHONY_EVENT_TYPES = ["newCall", "answer", "hangup"] as const;
export type TelephonyEventType = (typeof TELEPHONY_EVENT_TYPES)[number];

export const TELEPHONY_HANGUP_CAUSES = [
  "normalClearing",
  "busy",
  "cancel",
  "noAnswer",
  "congestion",
  "notFound",
  "forwarded",
] as const;

export type TelephonyHangupCause = (typeof TELEPHONY_HANGUP_CAUSES)[number];

export type TelephonyEvent = {
  version: 2;
  source: "asterisk-ami";
  eventId: string;
  callId: string;
  linkedId: string;
  event: TelephonyEventType;
  direction: "in" | "out";
  from: string;
  to: string;
  context: string;
  channel: string;
  trunk: string;
  occurredAt: string;
  answeringNumber?: string;
  agentName?: string;
  queue: string;
  cause?: TelephonyHangupCause;
  durationSeconds?: number;
};

export class TelephonyPayloadError extends Error {}

export function parseTelephonyEvent(value: unknown): TelephonyEvent {
  if (!value || typeof value !== "object") throw new TelephonyPayloadError("Payload JSON requerido.");
  const input = value as Record<string, unknown>;

  if (input.version !== 2) throw new TelephonyPayloadError("Versión de evento no soportada; se requiere evidencia v2.");
  const source = requiredString(input.source, "source");
  if (source !== "asterisk-ami") throw new TelephonyPayloadError("Origen telefónico no soportado.");
  const event = requiredString(input.event, "event");
  if (!TELEPHONY_EVENT_TYPES.includes(event as TelephonyEventType)) {
    throw new TelephonyPayloadError("Evento telefónico no soportado.");
  }
  const direction = requiredString(input.direction, "direction");
  if (direction !== "in" && direction !== "out") throw new TelephonyPayloadError("Dirección inválida.");

  const occurredAt = requiredString(input.occurredAt, "occurredAt");
  if (Number.isNaN(Date.parse(occurredAt))) throw new TelephonyPayloadError("occurredAt debe ser una fecha ISO válida.");

  const cause = optionalString(input.cause);
  if (cause && !TELEPHONY_HANGUP_CAUSES.includes(cause as TelephonyHangupCause)) {
    throw new TelephonyPayloadError("Causa de término no soportada.");
  }
  if (event === "hangup" && !cause) throw new TelephonyPayloadError("cause es requerido para hangup.");

  const durationSeconds = input.durationSeconds;
  if (durationSeconds !== undefined
      && (typeof durationSeconds !== "number" || !Number.isFinite(durationSeconds) || durationSeconds < 0)) {
    throw new TelephonyPayloadError("durationSeconds debe ser un número positivo.");
  }

  return {
    version: 2,
    source: "asterisk-ami",
    eventId: bounded(requiredString(input.eventId, "eventId"), 160, "eventId"),
    callId: bounded(requiredString(input.callId, "callId"), 160, "callId"),
    linkedId: bounded(requiredString(input.linkedId, "linkedId"), 160, "linkedId"),
    event: event as TelephonyEventType,
    direction,
    from: bounded(requiredString(input.from, "from"), 80, "from"),
    to: bounded(requiredString(input.to, "to"), 80, "to"),
    context: bounded(requiredString(input.context, "context"), 160, "context"),
    channel: bounded(requiredString(input.channel, "channel"), 240, "channel"),
    trunk: bounded(requiredString(input.trunk, "trunk"), 160, "trunk"),
    occurredAt: new Date(occurredAt).toISOString(),
    answeringNumber: boundedOptional(optionalString(input.answeringNumber), 120, "answeringNumber"),
    agentName: boundedOptional(optionalString(input.agentName), 160, "agentName"),
    queue: bounded(requiredString(input.queue, "queue"), 120, "queue"),
    cause: cause as TelephonyHangupCause | undefined,
    durationSeconds: durationSeconds === undefined ? undefined : Math.floor(durationSeconds),
  };
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw new TelephonyPayloadError(`${field} es requerido.`);
  return value.trim();
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function bounded(value: string, max: number, field: string): string {
  if (value.length > max) throw new TelephonyPayloadError(`${field} excede ${max} caracteres.`);
  return value;
}

function boundedOptional(value: string | undefined, max: number, field: string): string | undefined {
  return value === undefined ? undefined : bounded(value, max, field);
}
