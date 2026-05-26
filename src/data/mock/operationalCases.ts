import type { ITSMIntent, ITSMPriority } from "@/lib/itsm/types";
import type { CaseStatus, OperationalCase, ResolutionType, UserSentiment } from "@/types/operational";

const names = [
  "Marcela Rivas",
  "Tomás Fuentes",
  "Paula Araya",
  "Ignacio Bravo",
  "Carolina Vega",
  "Sebastián Muñoz",
  "Valentina Lagos",
  "Rodrigo Salinas",
  "Fernanda Soto",
  "Cristóbal Pérez",
  "Daniela Morales",
  "Matías Herrera",
  "Javiera Núñez",
  "Andrés Godoy",
  "Camila Paredes",
  "Felipe Castro",
];

const departments = [
  "Operaciones",
  "Finanzas",
  "Recursos Humanos",
  "Comercial",
  "Riesgo",
  "Tecnología",
  "Logística",
  "Atención Clientes",
  "Legal",
  "Control Gestión",
];

const technicians = [
  "Mesa N1 - Identidad",
  "Mesa N1 - Software",
  "Mesa N2 - Redes",
  "Mesa N2 - Puesto de trabajo",
  "Equipo Aplicaciones Core",
  "Seguridad TI",
  "Soporte Terreno",
  "Gestión de Accesos",
];

const issueCatalog: Array<{
  intent: ITSMIntent;
  category: string;
  summary: string;
  article: string;
  baseSla: number;
  weight: number;
}> = [
  {
    intent: "ACCESS_REQUEST",
    category: "Acceso a correo",
    summary: "Validación de credenciales, MFA y restablecimiento guiado de acceso corporativo.",
    article: "Reset y validación de acceso a correo corporativo",
    baseSla: 240,
    weight: 18,
  },
  {
    intent: "NETWORK_ISSUE",
    category: "VPN",
    summary: "Diagnóstico de conectividad remota, cliente VPN y alcance de red afectado.",
    article: "Validación de conectividad VPN",
    baseSla: 480,
    weight: 20,
  },
  {
    intent: "ACCESS_REQUEST",
    category: "Permisos",
    summary: "Solicitud de acceso a recurso compartido con dueño funcional y vigencia.",
    article: "Solicitud de acceso a carpeta compartida",
    baseSla: 480,
    weight: 13,
  },
  {
    intent: "SOFTWARE_REQUEST",
    category: "Software",
    summary: "Revisión de catálogo autorizado, licencia disponible y ventana de instalación.",
    article: "Instalación de software autorizado",
    baseSla: 1440,
    weight: 11,
  },
  {
    intent: "HARDWARE_ISSUE",
    category: "Hardware",
    summary: "Diagnóstico de rendimiento, espacio en disco, reinicio y revisión de salud del equipo.",
    article: "Diagnóstico básico de notebook lento",
    baseSla: 480,
    weight: 9,
  },
  {
    intent: "INCIDENT",
    category: "Aplicaciones críticas",
    summary: "Confirmación de alcance, impacto operacional y activación de grupo resolutor.",
    article: "Incidente crítico de aplicación corporativa",
    baseSla: 60,
    weight: 7,
  },
  {
    intent: "ACCESS_REQUEST",
    category: "Onboarding",
    summary: "Preparación de accesos iniciales, perfil de cargo y equipamiento asignado.",
    article: "Alta de usuario y accesos base",
    baseSla: 1440,
    weight: 6,
  },
  {
    intent: "NETWORK_ISSUE",
    category: "Red corporativa",
    summary: "Validación de segmento, servicio DNS, conectividad local y alcance por sede.",
    article: "Diagnóstico de red corporativa",
    baseSla: 240,
    weight: 14,
  },
  {
    intent: "SECURITY_INCIDENT",
    category: "Seguridad",
    summary: "Detección de riesgo, preservación de evidencia y derivación a seguridad TI.",
    article: "Contención inicial de incidente de seguridad",
    baseSla: 30,
    weight: 5,
  },
  {
    intent: "ACCESS_REQUEST",
    category: "Password reset",
    summary: "Restablecimiento controlado de contraseña y validación de sesión corporativa.",
    article: "Reset y validación de acceso a correo corporativo",
    baseSla: 120,
    weight: 16,
  },
];

const weightedIssueCatalog = issueCatalog.flatMap((item) => Array.from({ length: item.weight }, () => item));
const dayOffsets = [0, 0, 0, 1, 1, 2, 2, 2, 3, 4, 4, 5, 6, 7, 8, 10, 12, 14];
const demandHours = [8, 8, 9, 9, 9, 10, 10, 10, 10, 11, 11, 12, 12, 13, 14, 14, 15, 16, 17, 18, 19];

export const operationalCases: OperationalCase[] = Array.from({ length: 128 }, (_, index) => {
  const catalog = weightedIssueCatalog[(index * 7 + Math.floor(index / 6)) % weightedIssueCatalog.length];
  const priority = resolvePriority(index, catalog.intent);
  const escalated = priority === "P1" || index % 5 === 0 || catalog.intent === "SECURITY_INCIDENT";
  const status = resolveStatus(index, escalated);
  const created = new Date(
    Date.UTC(2026, 4, 25 - dayOffsets[(index * 5 + catalog.category.length) % dayOffsets.length], demandHours[(index * 3 + catalog.weight) % demandHours.length], (index * 7) % 60),
  );
  const duration = resolveDuration(priority, escalated, index);
  const resolved = status === "Resuelto" ? new Date(created.getTime() + duration * 60_000) : null;

  return {
    id: `${priority === "P1" ? "INC" : catalog.intent.includes("REQUEST") ? "REQ" : "CAS"}-2026-${String(index + 124).padStart(5, "0")}`,
    user_name: names[index % names.length],
    department: departments[(index * 3) % departments.length],
    issue_type: catalog.intent,
    category: catalog.category,
    priority,
    status,
    created_at: created.toISOString(),
    resolved_at: resolved?.toISOString() ?? null,
    resolution_type: resolveResolutionType(status, escalated, index),
    escalated,
    assigned_technician: technicians[(index * 2 + (escalated ? 3 : 0)) % technicians.length],
    sentiment: resolveSentiment(priority, status, index),
    conversation_summary: catalog.summary,
    sla_minutes: resolveSla(priority, catalog.baseSla),
    duration_minutes: duration,
    knowledge_article: catalog.article,
  };
});

function resolvePriority(index: number, intent: ITSMIntent): ITSMPriority {
  if (intent === "SECURITY_INCIDENT" || (intent === "INCIDENT" && index % 3 === 0)) return "P1";
  if (intent === "INCIDENT" || index % 7 === 0) return "P2";
  if (["NETWORK_ISSUE", "HARDWARE_ISSUE", "ACCESS_REQUEST"].includes(intent)) return "P3";
  return "P4";
}

function resolveStatus(index: number, escalated: boolean): CaseStatus {
  if (escalated && index % 4 !== 0) return "Escalado";
  if (index % 9 === 0) return "En seguimiento";
  if (index % 11 === 0) return "En diagnóstico";
  if (index % 17 === 0) return "Nuevo";
  return "Resuelto";
}

function resolveResolutionType(status: CaseStatus, escalated: boolean, index: number): ResolutionType {
  if (status === "Nuevo" || status === "En diagnóstico") return "Pendiente";
  if (escalated) return "Escalada";
  return index % 4 === 0 ? "Asistida" : "Autónoma";
}

function resolveSentiment(priority: ITSMPriority, status: CaseStatus, index: number): UserSentiment {
  if (priority === "P1" || status === "Nuevo") return "Crítico";
  if (status === "Escalado" || index % 6 === 0) return "Tenso";
  if (index % 4 === 0) return "Neutral";
  return "Positivo";
}

function resolveSla(priority: ITSMPriority, baseSla: number) {
  const prioritySla: Record<ITSMPriority, number> = {
    P1: 30,
    P2: Math.min(baseSla, 120),
    P3: Math.min(baseSla, 480),
    P4: Math.max(baseSla, 1440),
  };

  return prioritySla[priority];
}

function resolveDuration(priority: ITSMPriority, escalated: boolean, index: number) {
  const base: Record<ITSMPriority, number> = {
    P1: 24,
    P2: 85,
    P3: 210,
    P4: 620,
  };

  return base[priority] + (escalated ? 55 : 0) + ((index * 13) % 70);
}
