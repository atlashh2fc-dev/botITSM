import type { ChatMessage, DiagnosticContext, Ticket, TicketDraft } from "@/lib/itsm/types";

export type ITSMProvider = "demo" | "zammad" | "servicenow" | "jira-service-management" | "freshservice" | "glpi";

export type ITSMCreateTicketInput = {
  draft: TicketDraft;
  sessionId: string;
  transcript: ChatMessage[];
  diagnostic?: DiagnosticContext;
  source: "web-demo" | "portal-web" | "field-copilot" | "api" | "handoff";
};

export type ITSMCreateTicketResult = {
  provider: ITSMProvider;
  mode: "demo" | "live";
  ticket: Ticket;
  externalId: string;
  externalUrl?: string;
};

export type ITSMAdapter = {
  provider: ITSMProvider;
  mode: "demo" | "live";
  createTicket(input: ITSMCreateTicketInput): Promise<ITSMCreateTicketResult>;
};
