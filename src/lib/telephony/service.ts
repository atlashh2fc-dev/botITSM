import type { Database, Json } from "@/types/database";
import { createTicket } from "@/services/tickets.repository";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { requireCurrentTenant } from "@/lib/tenant/context";
import {
  createZammadPhoneArticle,
  createZammadPhoneTicket,
  findZammadPhoneTicketByCallId,
  hasZammadConfig,
  sendZammadCtiEvent,
  zammadTicketUrl,
} from "@/lib/zammad/client";
import type { TelephonyEvent } from "@/lib/telephony/types";
import type { TenantId } from "@/lib/tenant/server";

type CallRow = {
  tenant_id: string;
  call_id: string;
  direction: string;
  from_number: string;
  to_number: string;
  queue: string | null;
  agent_extension: string | null;
  status: string;
  cause: string | null;
  duration_seconds: number | null;
  zammad_ticket_id: number | null;
  zammad_ticket_number: string | null;
  local_ticket_id: string | null;
  started_at: string;
  answered_at: string | null;
  ended_at: string | null;
  last_payload: Json;
  created_at: string;
  updated_at: string;
};

export type TelephonyProcessResult = {
  duplicate: boolean;
  callId: string;
  status: string;
  ticketNumber?: string;
  ticketUrl?: string;
  warnings?: string[];
};

export async function processTelephonyEvent(input: TelephonyEvent): Promise<TelephonyProcessResult> {
  const tenant = requireCurrentTenant();
  assertTrustedInboundEvent(input, tenant.id);
  if (!hasZammadConfig()) throw new TelephonyConfigurationError("Zammad no está configurado para este tenant.");
  if (!tenant.telephonyFallbackEmail) {
    throw new TelephonyConfigurationError("Customer fallback telefónico no configurado para este tenant.");
  }

  const supabase = getSupabaseServerClient();
  if (!supabase) throw new TelephonyConfigurationError("Supabase server no está configurado.");

  let call = await findCall(input.callId);
  if (!call && input.event !== "newCall") {
    throw new TelephonyInputError("El primer evento de una llamada debe ser newCall validado.");
  }
  if (call) assertCallMatchesInboundEvidence(call, input);
  if (!call) call = await insertCall(input);

  const claimState = await claimEvent(input);
  if (claimState === "processed") return resultFromCall(call, true);
  if (claimState !== "claimed") {
    throw new TelephonyBusyError("El evento ya está siendo procesado; reintente.");
  }

  try {
    if (!call.zammad_ticket_id) call = await createCallTicket(call, input);

    const delivery = await findEventDelivery(input.eventId);
    if (!delivery?.cti_processed_at) {
      try {
        await sendZammadCtiEvent({
          event: input.event,
          from: input.from,
          to: input.to,
          direction: input.direction,
          callId: input.callId,
          answeringNumber: input.answeringNumber,
          queue: input.queue,
          cause: input.cause,
          user: input.agentName,
        });
        const { error } = await supabase.from("telephony_events").update({
          cti_processed_at: new Date().toISOString(),
          cti_error: null,
        }).eq("tenant_id", tenant.id).eq("event_id", input.eventId);
        if (error) throw new Error(`No se pudo confirmar CTI: ${error.message}`);
      } catch (error) {
        await supabase.from("telephony_events").update({
          cti_error: error instanceof Error ? error.message.slice(0, 500) : "Error CTI desconocido",
        }).eq("tenant_id", tenant.id).eq("event_id", input.eventId);
        throw error;
      }
    }

    call = await applyCallEvent(call, input);
    const { error } = await supabase.from("telephony_events").update({
      processed_at: new Date().toISOString(),
      processing_error: null,
    }).eq("tenant_id", tenant.id).eq("event_id", input.eventId);
    if (error) throw new Error(`No se pudo confirmar el evento: ${error.message}`);

    return resultFromCall(call, false);
  } catch (error) {
    await supabase.from("telephony_events").update({
      processing_error: error instanceof Error ? error.message.slice(0, 500) : "Error desconocido",
    }).eq("tenant_id", tenant.id).eq("event_id", input.eventId);
    throw error;
  }
}

async function claimEvent(input: TelephonyEvent): Promise<string> {
  const tenant = requireCurrentTenant();
  const supabase = getSupabaseServerClient()!;
  const { data, error } = await supabase.rpc("claim_telephony_event", {
    p_tenant_id: tenant.id,
    p_event_id: input.eventId,
    p_call_id: input.callId,
    p_event_type: input.event,
    p_occurred_at: input.occurredAt,
    p_payload: input as unknown as Json,
    p_lease_seconds: 120,
  });
  if (error) throw new Error(`No se pudo reservar el evento: ${error.message}`);
  return data;
}

async function findEventDelivery(eventId: string) {
  const tenant = requireCurrentTenant();
  const supabase = getSupabaseServerClient()!;
  const { data, error } = await supabase.from("telephony_events")
    .select("cti_processed_at")
    .eq("tenant_id", tenant.id).eq("event_id", eventId).maybeSingle();
  if (error) throw new Error(`No se pudo consultar la entrega CTI: ${error.message}`);
  return data;
}

async function findCall(callId: string): Promise<CallRow | null> {
  const tenant = requireCurrentTenant();
  const supabase = getSupabaseServerClient()!;
  const { data, error } = await supabase.from("telephony_calls").select("*")
    .eq("tenant_id", tenant.id).eq("call_id", callId).maybeSingle();
  if (error) throw new Error(`No se pudo consultar la llamada: ${error.message}`);
  return data as CallRow | null;
}

async function insertCall(input: TelephonyEvent): Promise<CallRow> {
  const tenant = requireCurrentTenant();
  const supabase = getSupabaseServerClient()!;
  const { data, error } = await supabase.from("telephony_calls").insert({
    tenant_id: tenant.id,
    call_id: input.callId,
    direction: input.direction,
    from_number: input.from,
    to_number: input.to,
    queue: input.queue ?? null,
    agent_extension: input.answeringNumber ?? null,
    status: input.event === "answer" ? "answered" : "ringing",
    started_at: input.occurredAt,
    answered_at: input.event === "answer" ? input.occurredAt : null,
    last_payload: input as unknown as Json,
  }).select("*").single();

  if (error?.code === "23505") {
    const existing = await findCall(input.callId);
    if (existing) return existing;
  }
  if (error || !data) throw new Error(`No se pudo iniciar la llamada: ${error?.message ?? "sin datos"}`);
  return data as CallRow;
}

async function createCallTicket(call: CallRow, input: TelephonyEvent): Promise<CallRow> {
  const tenant = requireCurrentTenant();
  const supabase = getSupabaseServerClient()!;
  const { data: claimState, error: claimError } = await supabase.rpc("claim_telephony_ticket", {
    p_tenant_id: tenant.id,
    p_call_id: call.call_id,
    p_lease_seconds: 120,
  });
  if (claimError) throw new Error(`No se pudo reservar la creación del ticket: ${claimError.message}`);
  if (claimState === "ready") return (await findCall(call.call_id)) ?? call;
  if (claimState !== "claimed") {
    throw new TelephonyBusyError("Otra entrega está creando el ticket; reintente.");
  }

  try {
    const zammadTicket = await findZammadPhoneTicketByCallId(input.callId)
      ?? await createZammadPhoneTicket({
        callId: input.callId,
        from: input.from,
        to: input.to,
        queue: input.queue,
        occurredAt: input.occurredAt,
      });
    const localTicketId = `ZAM-${tenant.id.toUpperCase()}-${zammadTicket.number}`;
    const externalUrl = zammadTicketUrl(zammadTicket.id);

    await createTicket({
      id: localTicketId,
      type: "INCIDENT",
      priority: "P3",
      category: "Telefonía · Llamada entrante",
      description: `Llamada de ${input.from} al número ${input.to}`,
      affectedSystem: "Telefonía / Asterisk",
      requesterName: `Contacto telefónico ${input.from}`,
      requesterEmail: tenant.telephonyFallbackEmail!,
      businessArea: input.queue || "Mesa de Servicio",
      impact: "Contacto entrante de soporte",
      urgency: "Normal",
      executedSteps: [
        `Call-ID Asterisk: ${input.callId}`,
        `Número origen: ${input.from}`,
        `Número destino: ${input.to}`,
      ],
      nextAction: "Atender y clasificar requerimiento telefónico",
      assignedTeam: tenant.zammadGroup,
      estimatedSla: "Según prioridad SLA",
      status: "created",
      provider: "zammad",
      externalId: zammadTicket.number,
      externalUrl,
    }, { requirePersistence: true, allowExisting: true });

    const { data, error } = await supabase.from("telephony_calls").update({
      zammad_ticket_id: zammadTicket.id,
      zammad_ticket_number: zammadTicket.number,
      local_ticket_id: localTicketId,
      ticket_processing_error: null,
      updated_at: new Date().toISOString(),
    }).eq("tenant_id", tenant.id).eq("call_id", call.call_id).select("*").single();
    if (error || !data) throw new Error(`No se pudo vincular el ticket: ${error?.message ?? "sin datos"}`);
    return data as CallRow;
  } catch (error) {
    await supabase.from("telephony_calls").update({
      ticket_processing_error: error instanceof Error ? error.message.slice(0, 500) : "Error desconocido",
      updated_at: new Date().toISOString(),
    }).eq("tenant_id", tenant.id).eq("call_id", call.call_id);
    throw error;
  }
}

async function applyCallEvent(call: CallRow, input: TelephonyEvent): Promise<CallRow> {
  const tenant = requireCurrentTenant();
  const supabase = getSupabaseServerClient()!;
  if ((input.event === "answer" || input.event === "hangup") && call.ended_at) return call;
  const patch: Database["public"]["Tables"]["telephony_calls"]["Update"] = {
    last_payload: input as unknown as Json,
    updated_at: new Date().toISOString(),
  };

  if (input.queue) patch.queue = input.queue;
  if (input.answeringNumber) patch.agent_extension = input.answeringNumber;
  if (input.event === "answer") {
    patch.status = "answered";
    patch.answered_at = input.occurredAt;
  }
  if (input.event === "hangup") {
    patch.status = finalStatus(call, input);
    patch.cause = input.cause ?? "normalClearing";
    patch.duration_seconds = input.durationSeconds ?? null;
    patch.ended_at = input.occurredAt;

    await createZammadPhoneArticle({
      ticketId: call.zammad_ticket_id!,
      eventId: input.eventId,
      subject: `Resultado de llamada: ${hangupLabel(input.cause)}`,
      body: [
        `Call-ID: ${input.callId}`,
        `Resultado: ${hangupLabel(input.cause)}`,
        `Atendida por: ${input.agentName || input.answeringNumber || "No atendida"}`,
        `Duración: ${formatDuration(input.durationSeconds)}`,
        `Finalizada: ${input.occurredAt}`,
      ].join("\n"),
    });
  }

  let query = supabase.from("telephony_calls").update(patch)
    .eq("tenant_id", tenant.id).eq("call_id", input.callId);
  if (input.event === "answer" || input.event === "hangup") query = query.is("ended_at", null);
  const { data, error } = await query.select("*").maybeSingle();
  if (error) throw new Error(`No se pudo actualizar la llamada: ${error.message}`);
  if (!data) {
    const latest = await findCall(input.callId);
    if (latest) return latest;
    throw new Error("La llamada desapareció durante la actualización.");
  }
  return data as CallRow;
}

function finalStatus(call: CallRow, input: TelephonyEvent): string {
  if (input.cause === "normalClearing" && (call.answered_at || input.answeringNumber)) return "completed";
  if (input.cause === "congestion" || input.cause === "notFound") return "failed";
  return "missed";
}

function hangupLabel(cause?: string): string {
  const labels: Record<string, string> = {
    normalClearing: "finalizada normalmente",
    busy: "ocupado",
    cancel: "cancelada antes de contestar",
    noAnswer: "sin respuesta",
    congestion: "congestión de red",
    notFound: "destino no disponible",
    forwarded: "transferida",
  };
  return labels[cause ?? ""] ?? "finalizada";
}

function formatDuration(seconds?: number): string {
  if (seconds === undefined) return "No informada";
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return `${minutes}m ${remaining}s`;
}

/**
 * Validate all signed PBX evidence before writing call state or creating a
 * Zammad ticket. A DID alone is not proof of inbound direction because the
 * same public number can also be presented by outbound campaigns.
 */
export function assertTrustedInboundEvent(input: TelephonyEvent, tenantId: TenantId): void {
  if (input.source !== "asterisk-ami") throw new TelephonyInputError("Origen telefónico no confiable.");
  if (input.direction !== "in") throw new TelephonyInputError("Sólo se aceptan llamadas entrantes.");
  if (input.callId !== input.linkedId) {
    throw new TelephonyInputError("La llamada no corresponde al leg raíz entrante.");
  }
  if (stableAsteriskTrunk(input.channel) !== normalizeRoutingValue(input.trunk)) {
    throw new TelephonyInputError("La troncal no corresponde al canal del leg raíz.");
  }

  const allowedDids = tenantAllowedValues(tenantId, "DIDS", normalizePhone, "DID");
  if (!allowedDids.includes(normalizePhone(input.to))) throw new TelephonyInputError("DID no autorizado.");
  if (allowedDids.includes(normalizePhone(input.from))) {
    throw new TelephonyInputError("Caller coincide con un DID propio; probable originación saliente.");
  }
  assertTenantAllowedValue(tenantId, "CONTEXTS", input.context, normalizeRoutingValue, "contexto");
  assertTenantAllowedValue(tenantId, "TRUNKS", input.trunk, normalizeRoutingValue, "troncal");
  assertTenantAllowedValue(tenantId, "QUEUES", input.queue, normalizeRoutingValue, "cola");
}

export function assertCallMatchesInboundEvidence(call: Pick<CallRow,
  "call_id" | "direction" | "from_number" | "to_number" | "queue" | "last_payload"
>, input: TelephonyEvent): void {
  if (call.call_id !== input.callId
      || call.direction !== input.direction
      || normalizePhone(call.from_number) !== normalizePhone(input.from)
      || normalizePhone(call.to_number) !== normalizePhone(input.to)
      || normalizeRoutingValue(call.queue ?? "") !== normalizeRoutingValue(input.queue)) {
    throw new TelephonyInputError("El evento no coincide con la llamada entrante registrada.");
  }

  const original = jsonObject(call.last_payload);
  if (original.version !== 2
      || original.source !== input.source
      || original.linkedId !== input.linkedId
      || original.context !== input.context
      || original.channel !== input.channel
      || original.trunk !== input.trunk) {
    throw new TelephonyInputError("La evidencia de origen cambió durante la llamada.");
  }
}

function assertTenantAllowedValue(
  tenantId: TenantId,
  suffix: "DIDS" | "CONTEXTS" | "TRUNKS" | "QUEUES",
  supplied: string,
  normalize: (value: string) => string,
  label: string,
): void {
  const allowed = tenantAllowedValues(tenantId, suffix, normalize, label);
  const normalized = normalize(supplied);
  if (!normalized || !allowed.includes(normalized)) throw new TelephonyInputError(`${label} no autorizado.`);
}

function tenantAllowedValues(
  tenantId: TenantId,
  suffix: "DIDS" | "CONTEXTS" | "TRUNKS" | "QUEUES",
  normalize: (value: string) => string,
  label: string,
): string[] {
  const variable = `TELEPHONY_${tenantId.toUpperCase()}_ALLOWED_${suffix}`;
  const configured = process.env[variable];
  if (!configured) throw new TelephonyConfigurationError(`Allowlist de ${label} no configurada para este tenant.`);

  const allowed = configured.split(",").map(normalize).filter(Boolean);
  if (!allowed.length) throw new TelephonyConfigurationError(`Allowlist de ${label} vacía para este tenant.`);
  return allowed;
}

function normalizePhone(value: string): string {
  return value.replace(/\D/g, "").replace(/^00/, "");
}

function normalizeRoutingValue(value: string): string {
  return value.trim().toLowerCase();
}

function stableAsteriskTrunk(channel: string): string {
  return normalizeRoutingValue(channel).replace(/-[0-9a-f]+(?:;\d+)?$/, "");
}

function jsonObject(value: Json): Record<string, Json | undefined> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, Json | undefined>
    : {};
}

function resultFromCall(call: CallRow, duplicate: boolean): TelephonyProcessResult {
  return {
    duplicate,
    callId: call.call_id,
    status: call.status,
    ticketNumber: call.zammad_ticket_number ?? undefined,
    ticketUrl: call.zammad_ticket_id ? zammadTicketUrl(call.zammad_ticket_id) : undefined,
  };
}

export class TelephonyInputError extends Error {}
export class TelephonyConfigurationError extends Error {}
export class TelephonyBusyError extends Error {}
