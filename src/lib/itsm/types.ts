export type ITSMIntent =
  | "INCIDENT"
  | "SERVICE_REQUEST"
  | "ACCESS_REQUEST"
  | "SOFTWARE_REQUEST"
  | "HARDWARE_ISSUE"
  | "NETWORK_ISSUE"
  | "SECURITY_INCIDENT"
  | "HUMAN_ESCALATION"
  | "DATABASE_REQUEST"
  | "ENHANCEMENT_REQUEST";

export type ITSMPriority = "P1" | "P2" | "P3" | "P4";

export type TicketStatus = "draft" | "created" | "resolved" | "escalated";

export type OperationalStatus =
  | "Detectando intención"
  | "Clasificando según ITIL"
  | "Consultando base de conocimiento"
  | "Ejecutando guía de descarte"
  | "Preparando ticket"
  | "Cerrando caso";

export type DiagnosticStage =
  | "identify_asset"
  | "qualify_connection"
  | "run_first_check"
  | "isolate_component"
  | "validate_entitlement"
  | "prepare_escalation"
  | "ticket_created"
  | "resolved";

export type DiagnosticFactValue = boolean | string | string[];

export type MemoryProfileValue =
  | string
  | number
  | boolean
  | null
  | MemoryProfileValue[]
  | { [key: string]: MemoryProfileValue | undefined };

export type DiagnosticContext = {
  playbookId: string;
  knowledgeArticleId: string;
  asset: string;
  qualifier?: string;
  stage: DiagnosticStage;
  facts: Record<string, DiagnosticFactValue>;
  completedSteps: string[];
  updatedAt: string;
};

export type KnowledgeArticle = {
  id: string;
  title: string;
  category: string;
  intent: ITSMIntent;
  symptoms: string[];
  resolutionSteps: string[];
  escalationCriteria: string[];
  tags: string[];
  sourceUrls?: string[];
};

export type TicketDraft = {
  id?: string;
  type: ITSMIntent;
  priority: ITSMPriority;
  category: string;
  description: string;
  affectedSystem?: string;
  affectedAsset?: string;
  requesterName?: string;
  requesterEmail?: string;
  businessArea?: string;
  impact?: string;
  urgency?: string;
  executedSteps: string[];
  nextAction: string;
  assignedTeam: string;
  estimatedSla: string;
  status: TicketStatus;
  attachmentUrl?: string;
  attachmentName?: string;
  attachmentAnalysis?: string;
  provider?: string;
  externalId?: string;
  externalUrl?: string;
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: string;
  attachmentUrl?: string;
  attachmentName?: string;
  attachmentAnalysis?: string;
  suggestedReplies?: {
    label: string;
    message: string;
  }[];
  metadata?: {
    intent?: ITSMIntent;
    priority?: ITSMPriority;
    ticketId?: string;
    status?: OperationalStatus;
  };
};

export type SessionContext = {
  sessionId: string;
  collectedFields: Partial<{
    nombre: string;
    correo: string;
    area: string;
    activo: string;
    impacto: string;
    urgencia: string;
    sistema: string;
  }>;
  messages: ChatMessage[];
  detectedIntent?: ITSMIntent;
  priority?: ITSMPriority;
  activeArticleId?: string;
  diagnostic?: DiagnosticContext;
  ticketDraft?: TicketDraft;
  stepsExecuted: string[];
  awaitingResolutionConfirmation?: boolean;
  awaitingCloseConfirmation?: boolean;
  lastTicketLookup?: {
    topics: string[];
    found: boolean;
    needsEmail?: boolean;
    email?: string;
    ticketNumbers?: string[];
    selectedTicketNumber?: string;
    requestedFields?: string[];
    createdAt: string;
  };
  ticketFollowUp?: {
    status: "awaiting_user_data" | "updated";
    ticketNumber: string;
    ticketId?: number;
    requestedFields: string[];
    createdAt: string;
    updatedAt?: string;
  };
  /** Memoria relacional del usuario reconocido (perfil, tono, historial). */
  userMemory?: {
    email: string;
    name: string | null;
    area: string | null;
    zammadUserId: number | null;
    preferredTone: string | null;
    profile: Record<string, MemoryProfileValue>;
    episodicSummary: string | null;
    interactionCount: number;
    lastSeenAt: string | null;
  };
};

export type ITSMResponseInput = {
  userMessage: string;
  sessionContext: SessionContext;
  detectedIntent?: ITSMIntent;
  knowledgeMatches: KnowledgeArticle[];
  ticketDraft?: TicketDraft;
};

export type ITSMResponse = {
  assistantMessage: string;
  classification: ITSMIntent;
  priority: ITSMPriority;
  requiredFields: string[];
  suggestedActions: string[];
  operationalStatuses: OperationalStatus[];
  shouldCreateTicket: boolean;
  shouldEscalate: boolean;
  diagnostic?: DiagnosticContext;
  ticketDraft: TicketDraft;
};

export type Ticket = TicketDraft & {
  id: string;
  createdAt: string;
  requesterName: string;
  requesterEmail: string;
};

export type KPI = {
  label: string;
  value: string;
  delta: string;
  tone: "blue" | "cyan" | "green" | "amber";
};
