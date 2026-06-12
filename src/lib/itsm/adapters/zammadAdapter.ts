/**
 * zammadAdapter.ts — Adapter LIVE contra Zammad (ITSM Geimser).
 *
 * Crea el ticket real en itsm.geimser.cl y guarda una copia local en Supabase
 * (tabla tickets) con external_id / external_url para que el portal y el
 * dashboard reflejen lo mismo que el ITSM.
 */

import { createTicket } from "@/services/tickets.repository";
import { createZammadTicket, hasZammadConfig, zammadTicketUrl } from "@/lib/zammad/client";
import { intentLabel } from "@/lib/itsm/engine";
import type { ITSMAdapter, ITSMCreateTicketInput, ITSMCreateTicketResult } from "@/lib/itsm/adapters/types";
import { demoITSMAdapter } from "@/lib/itsm/adapters/demoAdapter";

export const zammadITSMAdapter: ITSMAdapter = {
  provider: "zammad",
  mode: "live",
  async createTicket(input: ITSMCreateTicketInput): Promise<ITSMCreateTicketResult> {
    if (!hasZammadConfig()) {
      // Sin credenciales configuradas: degradar a demo para no romper el flujo.
      return demoITSMAdapter.createTicket(input);
    }

    const draft = input.draft;
    const customerEmail = normalizeEmail(draft.requesterEmail) ?? "omnicanal@geimser.cl";

    const zammadTicket = await createZammadTicket({
      title: buildTitle(input),
      body: buildBody(input),
      customerEmail,
      customerName: draft.requesterName,
      priority: draft.priority,
    });

    const externalUrl = zammadTicketUrl(zammadTicket.id);

    // Copia local (Supabase) para el dashboard del bot, referenciando el ticket real.
    const localTicket = await createTicket({
      ...draft,
      id: `ZAM-${zammadTicket.number}`,
      provider: "zammad",
      externalId: zammadTicket.number,
      externalUrl,
      description: draft.description,
      nextAction: draft.nextAction || "Seguimiento en ITSM Geimser",
      assignedTeam: draft.assignedTeam || "Mesa de Servicio Geimser",
      estimatedSla: draft.estimatedSla || "Según prioridad SLA",
      executedSteps: draft.executedSteps ?? [],
    });

    return {
      provider: "zammad",
      mode: "live",
      ticket: { ...localTicket, id: `ZAM-${zammadTicket.number}` },
      externalId: zammadTicket.number,
      externalUrl,
    };
  },
};

function normalizeEmail(email?: string): string | undefined {
  const value = email?.trim().toLowerCase();
  if (!value || !value.includes("@")) return undefined;
  if (value.includes("pendiente") || value.includes("sin-datos")) return undefined;
  return value;
}

function buildTitle(input: ITSMCreateTicketInput): string {
  const draft = input.draft;
  const firstUserMessage = input.transcript.find((m) => m.role === "user")?.content ?? "";
  const base = draft.category && draft.category !== "Cierre autónomo" ? draft.category : firstUserMessage;
  return `[${intentLabel(draft.type)}] ${base}`.slice(0, 180) || "Caso reportado vía chatbot";
}

function buildBody(input: ITSMCreateTicketInput): string {
  const draft = input.draft;
  const transcript = input.transcript
    .filter((m) => m.role === "user" || m.role === "assistant")
    .slice(-14)
    .map((m) => `${m.role === "user" ? "Usuario" : "Atlas (bot)"}: ${m.content}`)
    .join("\n");

  const diagnostic = input.diagnostic
    ? [
        `Playbook: ${input.diagnostic.playbookId}`,
        `Etapa: ${input.diagnostic.stage}`,
        `Activo: ${input.diagnostic.asset}`,
        `Pasos completados: ${input.diagnostic.completedSteps.join("; ") || "-"}`,
      ].join("\n")
    : undefined;

  return [
    `Ticket generado automáticamente por el chatbot omnicanal (canal: ${input.source}).`,
    "",
    `Descripción: ${draft.description}`,
    `Clasificación: ${draft.type} · Prioridad: ${draft.priority} · Categoría: ${draft.category}`,
    draft.affectedSystem ? `Sistema afectado: ${draft.affectedSystem}` : undefined,
    draft.affectedAsset ? `Activo afectado: ${draft.affectedAsset}` : undefined,
    draft.businessArea ? `Área: ${draft.businessArea}` : undefined,
    draft.impact ? `Impacto: ${draft.impact}` : undefined,
    draft.executedSteps?.length ? `Descartes ejecutados: ${draft.executedSteps.join("; ")}` : undefined,
    draft.attachmentName ? `Evidencia adjunta: ${draft.attachmentName} (${draft.attachmentAnalysis ?? "sin análisis"})` : undefined,
    diagnostic ? `\n— Diagnóstico —\n${diagnostic}` : undefined,
    transcript ? `\n— Transcripción —\n${transcript}` : undefined,
    `\nSesión: ${input.sessionId}`,
  ]
    .filter((line): line is string => line !== undefined)
    .join("\n");
}
