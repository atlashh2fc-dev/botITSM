import type {
  ITSMIntent,
  ITSMPriority,
  KnowledgeArticle,
  SessionContext,
  TicketDraft,
} from "@/lib/itsm/types";

const FIELD_LABELS = {
  nombre: "nombre",
  correo: "correo",
  area: "área",
  activo: "activo/equipo afectado",
  impacto: "impacto",
  urgencia: "urgencia",
  sistema: "sistema afectado",
} as const;

export const REQUIRED_FIELDS = Object.values(FIELD_LABELS);

export function createSessionContext(): SessionContext {
  return {
    sessionId: `session-${crypto.randomUUID()}`,
    collectedFields: {},
    messages: [],
    stepsExecuted: [],
  };
}

export function detectIntent(message: string): ITSMIntent {
  const text = normalize(message);

  if (isGreetingOnly(text)) {
    return "SERVICE_REQUEST";
  }

  if (hasAny(text, ["seguridad", "phishing", "malware", "ransomware", "cuenta comprometida", "virus", "antivirus", "bitlocker", "correo sospechoso"])) {
    return "SECURITY_INCIDENT";
  }

  if (hasAny(text, ["extracto de base de datos", "extracto de bdd", "extracto bdd", "base de datos", "bdd", "extraccion de datos", "extracción de datos", "exportar datos", "dump de datos", "reporte de base de datos", "consulta sql", "envio de datos al cliente", "envío de datos al cliente"])) {
    return "DATABASE_REQUEST";
  }

  if (hasAny(text, ["mejora evolutiva", "evolutivo", "evolutiva", "ajuste al sistema", "ajuste al desarrollo", "ajuste en el sistema", "nueva funcionalidad", "cambio en el sistema", "modificar el desarrollo", "mejora al sistema", "mejora en el sistema", "requerimiento evolutivo", "ajuste funcional", "cambio funcional"])) {
    return "ENHANCEMENT_REQUEST";
  }

  if (hasAny(text, ["se cayó", "caida", "caída", "critica", "crítica", "indisponible", "producción"])) {
    return "INCIDENT";
  }

  if (hasAny(text, ["barra de abajo", "barra de tareas", "menu inicio", "menú inicio", "escritorio", "explorador de windows"])) {
    return "INCIDENT";
  }

  if (hasAny(text, ["excel", "office", "word", "powerpoint", "teams"]) && hasAny(text, ["problema", "falla", "error", "no abre", "no inicia", "se cierra", "queda pegado", "bloqueado"])) {
    return "INCIDENT";
  }

  if (hasAny(text, ["correo", "mail", "outlook"]) && hasAny(text, ["no salen", "no envia", "no envía", "no llegan", "no recibe", "bandeja de salida", "sincroniza", "sincronizacion", "sincronización"])) {
    return "INCIDENT";
  }

  if (hasAny(text, ["vpn", "red", "internet", "conectividad", "wifi", "wi-fi", "latencia", "ethernet", "lan"])) {
    return "NETWORK_ISSUE";
  }

  if (hasAny(text, ["correo", "mail", "outlook", "clave", "password", "mfa", "carpeta", "permiso", "acceso", "certificado", "firma", "perfil", "rol"])) {
    return "ACCESS_REQUEST";
  }

  if (hasAny(text, ["instalar", "software", "licencia", "aplicación", "aplicacion", "programa", "power point", "powerpoint", "power-point"])) {
    return "SOFTWARE_REQUEST";
  }

  if (hasAny(text, ["notebook", "equipo", "pc", "computador", "laptop", "no enciende", "no prende", "sin energia", "sin energía", "todo apagado", "nada enciende", "lento", "lentitud", "se pega", "pegado", "congelado", "colapsa", "no responde", "se queda pegado", "congelada", "congeladas", "pantalla", "batería", "bateria", "hardware", "mouse", "moouse", "mause", "mouuse", "raton", "ratón", "teclado", "monitor", "hdmi", "displayport", "vga", "pantalla externa", "segunda pantalla", "impresora", "implresora", "inpresora", "imprimir", "imprimit", "improimit", "inprimir", "printer", "periferico", "periférico", "camara", "cámara", "microfono", "micrófono", "cargador"])) {
    return "HARDWARE_ISSUE";
  }

  if (hasAny(text, ["humano", "ejecutivo", "analista", "mesa", "soporte"])) {
    return "HUMAN_ESCALATION";
  }

  return "INCIDENT";
}

export function detectTurnIntent(message: string, context?: SessionContext): ITSMIntent {
  const detectedIntent = detectIntent(message);
  const text = normalize(message);

  // Si no hay contexto anterior, usar el detectado directamente
  if (!context?.detectedIntent) {
    return detectedIntent;
  }

  // Si es un saludo puro o mensaje vacío, no cambiar el anterior
  if (isGreetingOnly(text)) {
    return context.detectedIntent;
  }

  // Si el mensaje es una declaración de problema explícita, usar el detectado de inmediato
  const isProblem = hasAny(text, [
    "no funciona", "no sirve", "falla", "error", "problema", "problrma", "malo", 
    "no responde", "no abre", "no conecta", "no enciende", "no prende", "sin energia", "sin energía", "todo apagado", "nada enciende", "se cayo", "caida", "se pega", 
    "pegado", "congelado", "lento", "lentitud", "moouse", "mouse", "mause", "mouuse",
    "teclado", "raton", "ratón",
    "impresora", "implresora", "inpresora", "imprimir", "imprimit", "improimit", "inprimir", "printer", "imprime"
  ]) || detectedIntent === "HARDWARE_ISSUE";

  if (isProblem) {
    return detectedIntent;
  }

  // Si el usuario está aportando datos de contacto/requeridos (nombre, correo, área),
  // conservar el intent activo para no perder el flujo de recopilación.
  if ((context.activeArticleId || context.diagnostic) && isRequesterDataMessage(text)) {
    return context.detectedIntent;
  }

  // Si es un incidente de infraestructura explícito, usar el detectado
  const explicitIncident = hasAny(text, [
    "se cayo", "caida", "indisponible", "produccion", "detenido", "sistema", 
    "aplicacion", "servicio", "barra", "windows", "inicio", "escritorio"
  ]);

  if (explicitIncident) {
    return detectedIntent;
  }

  // Si la última interacción fue solo un saludo, liberar el intent de inmediato
  const userMessages = context.messages.filter(m => m.role === "user");
  const isFirstRealMessage = userMessages.length <= 1 || (userMessages.length === 2 && isGreetingOnly(userMessages[0].content));
  if (isFirstRealMessage) {
    return detectedIntent;
  }

  return context.detectedIntent;
}

export function determinePriority(message: string, intent: ITSMIntent, context?: SessionContext): ITSMPriority {
  const text = normalize(`${message} ${context?.collectedFields.impacto ?? ""} ${context?.collectedFields.urgencia ?? ""}`);

  if (
    intent === "SECURITY_INCIDENT" ||
    hasAny(text, ["crítica", "critica", "masivo", "todos", "producción", "produccion", "detenido", "sin operación"])
  ) {
    return "P1";
  }

  if (hasAny(text, ["alto", "urgente", "varios usuarios", "gerencia", "cliente", "facturación", "facturacion"])) {
    return "P2";
  }

  if (["NETWORK_ISSUE", "HARDWARE_ISSUE", "ACCESS_REQUEST", "INCIDENT"].includes(intent)) {
    return "P3";
  }

  return "P4";
}

export function extractFields(message: string, context: SessionContext): SessionContext["collectedFields"] {
  const text = message.trim();
  const collected = { ...context.collectedFields };
  const email = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0];

  if (email) {
    collected.correo = email;
  }

  const nameMatch = text.match(/(?:soy|nombre(?: es)?|me llamo)\s+([A-Za-zÁÉÍÓÚÑáéíóúñ ]{3,})/i);
  if (nameMatch?.[1]) {
    collected.nombre = cleanValue(nameMatch[1]);
  }

  const areaMatch = text.match(/(?:área|area|departamento)\s*(?:es|:)?\s*([A-Za-zÁÉÍÓÚÑáéíóúñ ]{3,})/i);
  if (areaMatch?.[1]) {
    collected.area = cleanValue(areaMatch[1]);
  }

  // Formato libre: "Nombre Apellido, email@dominio.com, Área"
  // Se activa cuando hay email pero faltan nombre o área.
  // Cubre respuestas directas del usuario al pedido de datos del agente.
  if (email && (!collected.nombre || !collected.area)) {
    const segments = text
      .split(/[,\n;]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    const emailIdx = segments.findIndex((s) => /\S+@\S+\.\S+/.test(s));
    if (emailIdx !== -1 && segments.length >= 2) {
      const others = segments.filter((_, i) => i !== emailIdx);
      // El segmento que parece nombre: ≥2 palabras con mayúsculas, sin dígitos
      const looksLikeName = (s: string) => /^[A-Za-zÁÉÍÓÚÑáéíóúñ ]{4,}$/.test(s);
      const nameCandidate = others.find(looksLikeName);
      const areaCandidate = others.find((s) => s !== nameCandidate && looksLikeName(s));
      if (!collected.nombre && nameCandidate) {
        collected.nombre = cleanValue(nameCandidate);
      }
      if (!collected.area && areaCandidate) {
        collected.area = cleanValue(areaCandidate);
      }
      // Si solo hay un segmento adicional y ya tenemos nombre, es el área y viceversa
      if (others.length === 1) {
        if (!collected.nombre && looksLikeName(others[0])) collected.nombre = cleanValue(others[0]);
        else if (!collected.area && looksLikeName(others[0])) collected.area = cleanValue(others[0]);
      }
    }
  }

  const assetMatch = text.match(/(?:equipo|notebook|activo)\s*(?:es|:)\s*([A-Za-zÁÉÍÓÚÑáéíóúñ0-9._ -]{3,})/i);
  if (assetMatch?.[1]) {
    collected.activo = cleanValue(assetMatch[1]);
  }

  const normalizedText = normalize(text);
  if (mentionsInternalDisplay(normalizedText)) {
    collected.activo = "Pantalla integrada del notebook";
  } else if (!collected.activo && hasAny(normalizedText, ["mouse", "moouse", "mause", "mouuse", "raton", "teclado", "monitor", "pantalla", "impresora", "implresora", "inpresora", "imprimir", "imprimit", "improimit", "inprimir", "printer", "equipo", "notebook", "laptop"])) {
    const userEmail = collected.correo || "";
    if (userEmail.toLowerCase() === "lilian.leon@sonda.cl") {
      if (hasAny(normalizedText, ["mouse", "moouse", "mause", "mouuse", "raton"])) {
        collected.activo = "Mouse HP Cableado de Escritorio";
      } else if (hasAny(normalizedText, ["notebook", "laptop", "equipo"])) {
        collected.activo = "HP EliteBook 840 G8";
      } else {
        collected.activo = inferAssetFromText(normalizedText);
      }
    } else if (userEmail.toLowerCase() === "francisco.martinez@sonda.cl") {
      if (hasAny(normalizedText, ["mouse", "moouse", "mause", "mouuse", "raton"])) {
        collected.activo = "Mouse Inalámbrico Logitech MX Master";
      } else if (hasAny(normalizedText, ["notebook", "laptop", "equipo"])) {
        collected.activo = "Lenovo ThinkPad T14";
      } else {
        collected.activo = inferAssetFromText(normalizedText);
      }
    } else {
      collected.activo = inferAssetFromText(normalizedText);
    }
  }

  const systemMatch = text.match(/(?:sistema|aplicación|aplicacion|servicio)\s*(?:es|:)\s*([A-Za-zÁÉÍÓÚÑáéíóúñ0-9._ -]{3,})/i);
  if (systemMatch?.[1]) {
    collected.sistema = cleanValue(systemMatch[1]);
  }

  if (!collected.sistema) {
    collected.sistema = inferProductivitySystem(normalizedText);
  }

  if (!collected.sistema && hasAny(normalizedText, ["power point", "powerpoint", "power-point"])) {
    collected.sistema = "Microsoft PowerPoint";
  }

  if (hasAny(normalize(text), ["alto", "varios", "todos", "crítico", "critico", "detenido"])) {
    collected.impacto = collected.impacto ?? "Impacto alto reportado";
  }

  if (hasAny(normalize(text), ["urgente", "ahora", "inmediato", "critico", "crítico"])) {
    collected.urgencia = collected.urgencia ?? "Urgencia alta";
  }

  return collected;
}

export function getMissingFields(context: SessionContext, priority: ITSMPriority) {
  const minimum = priority === "P1" ? ["nombre", "correo", "area", "impacto", "sistema"] : ["nombre", "correo", "area"];
  return minimum
    .filter((field) => !context.collectedFields[field as keyof SessionContext["collectedFields"]])
    .map((field) => FIELD_LABELS[field as keyof typeof FIELD_LABELS]);
}

export function buildTicketDraft(params: {
  message: string;
  intent: ITSMIntent;
  priority: ITSMPriority;
  article?: KnowledgeArticle;
  context: SessionContext;
}): TicketDraft {
  const { message, intent, priority, article, context } = params;
  const category = article?.category ?? categoryByIntent(intent);
  const baseAssignedTeam = teamByIntent(intent, priority);

  // Extraer información de adjuntos del diagnóstico o del historial de mensajes
  const diagnosticFacts = context.diagnostic?.facts;
  const lastUserMsg = context.messages.filter((m) => m.role === "user").at(-1);
  const attachmentName = (diagnosticFacts?.attachmentName as string) ?? lastUserMsg?.attachmentName;
  const attachmentUrl = (diagnosticFacts?.attachmentUrl as string) ?? lastUserMsg?.attachmentUrl;
  const attachmentAnalysis = (diagnosticFacts?.attachmentAnalysis as string) ?? lastUserMsg?.attachmentAnalysis;

  // Ajustar gravedad y equipo resolutor de forma automática ante eventos críticos (ej. BSOD / Pantallazo Azul)
  const isBsod = diagnosticFacts?.isBsod === true;
  const adjustedPriority = isBsod && priority !== "P1" ? ("P2" as const) : priority;
  const assignedTeam = isBsod ? "Soporte Técnico en Terreno L3" : baseAssignedTeam;
  const nextAction = isBsod 
    ? "Intervención presencial de Soporte en Terreno por Pantalla Azul (BSOD)" 
    : nextActionByPriority(adjustedPriority, intent);

  return {
    type: intent,
    priority: adjustedPriority,
    category,
    description: summarizeDescription(message, article),
    affectedSystem: context.collectedFields.sistema ?? inferAffectedSystem(intent, article),
    affectedAsset: context.collectedFields.activo ?? "Pendiente por confirmar",
    requesterName: context.collectedFields.nombre ?? "Usuario pendiente",
    requesterEmail: context.collectedFields.correo ?? "pendiente@example.com",
    businessArea: context.collectedFields.area ?? "Área pendiente",
    impact: context.collectedFields.impacto ?? impactByPriority(adjustedPriority),
    urgency: context.collectedFields.urgencia ?? urgencyByPriority(adjustedPriority),
    executedSteps: article?.resolutionSteps.slice(0, 4) ?? context.stepsExecuted,
    nextAction,
    assignedTeam,
    estimatedSla: slaByPriority(adjustedPriority),
    status: adjustedPriority === "P1" || intent === "SECURITY_INCIDENT" || isBsod ? "escalated" : "draft",
    attachmentUrl,
    attachmentName,
    attachmentAnalysis,
  };
}

export function shouldCreateTicketFromMessage(message: string, priority: ITSMPriority, intent: ITSMIntent) {
  const text = normalize(message);
  return (
    priority === "P1" ||
    intent === "SECURITY_INCIDENT" ||
    hasAny(text, [
      "no se resolvió",
      "no se resolvio",
      "persiste",
      "crear ticket",
      "escalar",
      "escala",
      "escalen",
      "derivar",
      "sigue igual",
      "varios usuarios",
    ])
  );
}

export function isResolvedMessage(message: string) {
  const text = normalize(message);
  return hasAny(text, [
    "resuelto", 
    "funcionó", 
    "funciono", 
    "solucionado", 
    "ya puedo", 
    "cerrar caso",
    "ahora si",
    "ahora sí",
    "ya si",
    "ya sí",
    "muchas gracias",
    "gracias",
    "listo",
    "quedo listo",
    "quedó listo",
    "se arreglo",
    "se arregló",
    "impecable",
    "excelente",
    "perfecto",
    "ya me funciona"
  ]);
}

export function intentLabel(intent: ITSMIntent) {
  const labels: Record<ITSMIntent, string> = {
    INCIDENT: "Incidente",
    SERVICE_REQUEST: "Requerimiento de servicio",
    ACCESS_REQUEST: "Solicitud de acceso",
    SOFTWARE_REQUEST: "Solicitud de software",
    HARDWARE_ISSUE: "Incidente de hardware",
    NETWORK_ISSUE: "Incidente de red",
    SECURITY_INCIDENT: "Incidente de seguridad",
    HUMAN_ESCALATION: "Escalamiento humano",
    DATABASE_REQUEST: "Solicitud de BDD",
    ENHANCEMENT_REQUEST: "Mejora evolutiva",
  };

  return labels[intent];
}

export function priorityLabel(priority: ITSMPriority) {
  const labels: Record<ITSMPriority, string> = {
    P1: "P1 crítica",
    P2: "P2 alta",
    P3: "P3 media",
    P4: "P4 baja",
  };

  return labels[priority];
}

function normalize(value: string) {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function hasAny(value: string, terms: string[]) {
  return terms.some((term) => value.includes(normalize(term)));
}

function isGreetingOnly(value: string) {
  return /^(hola|buenas|buenos dias|buenas tardes|buenas noches|hello|hi)[.!¡! ]*$/.test(value);
}

function isRequesterDataMessage(value: string) {
  return (
    hasAny(value, ["@", "correo", "mail", "nombre", "soy", "me llamo", "area", "área", "departamento"]) &&
    !hasAny(value, ["no puedo", "no abre", "no funciona", "falla", "error", "problema", "acceso", "clave", "password", "mfa"])
  );
}

function cleanValue(value: string) {
  return value.replace(/[.,;].*$/, "").trim();
}

function inferAssetFromText(text: string) {
  if (text.includes("mouse") || text.includes("moouse") || text.includes("mause") || text.includes("mouuse") || text.includes("raton") || text.includes("ratón")) return "Mouse";
  if (text.includes("teclado")) return "Teclado";
  if (text.includes("monitor") || text.includes("pantalla")) return "Monitor";
  if (text.includes("impresora") || text.includes("implresora") || text.includes("inpresora") || text.includes("printer")) return "Impresora";
  return "Periférico";
}

function inferProductivitySystem(text: string) {
  if (text.includes("excel")) return "Microsoft Excel";
  if (text.includes("word")) return "Microsoft Word";
  if (text.includes("powerpoint")) return "Microsoft PowerPoint";
  if (text.includes("teams")) return "Microsoft Teams";
  if (text.includes("office")) return "Microsoft Office";
  return undefined;
}

function mentionsInternalDisplay(text: string) {
  return (
    text.includes("pantalla de mi note") ||
    text.includes("pantalla del note") ||
    text.includes("pantalla de mi notebook") ||
    text.includes("pantalla del notebook") ||
    text.includes("pantalla integrada") ||
    text.includes("pantalla de laptop") ||
    ((text.includes("pantalla") || text.includes("display")) && hasAny(text, ["note", "notebook", "laptop"]))
  );
}

function categoryByIntent(intent: ITSMIntent) {
  const categories: Record<ITSMIntent, string> = {
    INCIDENT: "Gestión de incidentes",
    SERVICE_REQUEST: "Catálogo de servicios",
    ACCESS_REQUEST: "Accesos e identidad",
    SOFTWARE_REQUEST: "Software corporativo",
    HARDWARE_ISSUE: "Puesto de trabajo",
    NETWORK_ISSUE: "Redes y conectividad",
    SECURITY_INCIDENT: "Seguridad de la información",
    HUMAN_ESCALATION: "Mesa de ayuda",
    DATABASE_REQUEST: "Solicitud de BDD",
    ENHANCEMENT_REQUEST: "Mejora evolutiva / Desarrollo",
  };

  return categories[intent];
}

function teamByIntent(intent: ITSMIntent, priority: ITSMPriority) {
  if (priority === "P1") return "War Room ITSM - Resolver group crítico";
  const teams: Record<ITSMIntent, string> = {
    INCIDENT: "Mesa N2 - Aplicaciones",
    SERVICE_REQUEST: "Mesa N1 - Catálogo",
    ACCESS_REQUEST: "Mesa N1 - Identidad y accesos",
    SOFTWARE_REQUEST: "Mesa N1 - Software",
    HARDWARE_ISSUE: "Mesa N2 - Soporte en terreno",
    NETWORK_ISSUE: "Mesa N2 - Redes",
    SECURITY_INCIDENT: "CSIRT / Seguridad TI",
    HUMAN_ESCALATION: "Mesa N1 - Coordinación",
    DATABASE_REQUEST: "Equipo de Datos - BDD",
    ENHANCEMENT_REQUEST: "Equipo de Desarrollo - Evolutivos",
  };

  return teams[intent];
}

/**
 * Grupo resolutor real de Zammad al que debe caer el ticket según la
 * casuística. Modelo de contact center: 4 grupos resolutores.
 * - HUMAN_ESCALATION y SERVICE_REQUEST se pliegan en Mesa de Ayuda SW
 *   (triage genérico) salvo que el negocio decida separarlos más adelante.
 */
export function resolverGroupByIntent(intent: ITSMIntent): string {
  const groups: Record<ITSMIntent, string> = {
    INCIDENT: "Mesa de Ayuda SW",
    SERVICE_REQUEST: "Mesa de Ayuda SW",
    ACCESS_REQUEST: "Mesa de Ayuda SW",
    SOFTWARE_REQUEST: "Mesa de Ayuda SW",
    SECURITY_INCIDENT: "Mesa de Ayuda SW",
    HUMAN_ESCALATION: "Mesa de Ayuda SW",
    HARDWARE_ISSUE: "Mesa de Ayuda HW",
    NETWORK_ISSUE: "Mesa de Ayuda HW",
    DATABASE_REQUEST: "Datos y BDD",
    ENHANCEMENT_REQUEST: "Desarrollo y Evolutivos",
  };

  return groups[intent];
}

function slaByPriority(priority: ITSMPriority) {
  const slas: Record<ITSMPriority, string> = {
    P1: "30 minutos respuesta inicial",
    P2: "2 horas hábiles",
    P3: "8 horas hábiles",
    P4: "24 horas hábiles",
  };

  return slas[priority];
}

function impactByPriority(priority: ITSMPriority) {
  const impacts: Record<ITSMPriority, string> = {
    P1: "Proceso crítico detenido o impacto masivo",
    P2: "Impacto alto en operación relevante",
    P3: "Impacto individual o acotado",
    P4: "Impacto bajo o planificable",
  };

  return impacts[priority];
}

function urgencyByPriority(priority: ITSMPriority) {
  const urgencies: Record<ITSMPriority, string> = {
    P1: "Crítica",
    P2: "Alta",
    P3: "Media",
    P4: "Baja",
  };

  return urgencies[priority];
}

function nextActionByPriority(priority: ITSMPriority, intent: ITSMIntent) {
  if (priority === "P1") return "Escalamiento inmediato con contexto operativo y seguimiento ejecutivo.";
  if (intent === "SECURITY_INCIDENT") return "Derivar a seguridad TI y preservar evidencia sin acciones destructivas.";
  return "Completar validación con usuario y asignar al grupo resolutor si la guía no resuelve.";
}

function inferAffectedSystem(intent: ITSMIntent, article?: KnowledgeArticle) {
  if (article?.category) return article.category;
  const systems: Partial<Record<ITSMIntent, string>> = {
    ACCESS_REQUEST: "Identidad corporativa",
    SOFTWARE_REQUEST: "Catálogo de software",
    HARDWARE_ISSUE: "Puesto de trabajo",
    NETWORK_ISSUE: "Conectividad corporativa",
    SECURITY_INCIDENT: "Seguridad TI",
    INCIDENT: "Servicio corporativo",
  };

  return systems[intent] ?? "Servicio por confirmar";
}

function summarizeDescription(message: string, article?: KnowledgeArticle) {
  const base = message.length > 180 ? `${message.slice(0, 177)}...` : message;
  if (!article) return base;

  const source = article.sourceUrls?.[0] ? ` | Fuente: ${article.sourceUrls[0]}` : "";
  return `${base} | Referencia KB: ${article.title}${source}`;
}
