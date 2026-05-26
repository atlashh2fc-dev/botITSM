import type { DiagnosticContext, TicketDraft } from "@/lib/itsm/types";

type SoftwareEntitlement = {
  product: string;
  catalogAuthorized: boolean;
  licenseRequired: boolean;
  licenseAvailable: boolean;
  approvalRequired: boolean;
  approvalStatus: "approved" | "not_required" | "missing";
  compatible: boolean;
  delivery: "self_service" | "remote_install" | "manual_review";
  notes: string[];
};

const softwareCatalog: SoftwareEntitlement[] = [
  {
    product: "Microsoft PowerPoint",
    catalogAuthorized: true,
    licenseRequired: true,
    licenseAvailable: true,
    approvalRequired: false,
    approvalStatus: "not_required",
    compatible: true,
    delivery: "self_service",
    notes: ["Incluido en Microsoft 365 corporativo", "Instalación disponible desde portal corporativo"],
  },
  {
    product: "Microsoft Office",
    catalogAuthorized: true,
    licenseRequired: true,
    licenseAvailable: true,
    approvalRequired: false,
    approvalStatus: "not_required",
    compatible: true,
    delivery: "self_service",
    notes: ["Incluye Word, Excel, PowerPoint y Outlook"],
  },
];

export function resolveSoftwareEntitlement(message: string, draft?: TicketDraft) {
  const product = inferSoftwareProduct(`${message} ${draft?.affectedSystem ?? ""} ${draft?.description ?? ""}`);
  if (!product) return undefined;

  return softwareCatalog.find((item) => item.product === product) ?? {
    product,
    catalogAuthorized: false,
    licenseRequired: true,
    licenseAvailable: false,
    approvalRequired: true,
    approvalStatus: "missing" as const,
    compatible: false,
    delivery: "manual_review" as const,
    notes: ["Software no encontrado en catálogo demo"],
  };
}

export function buildSoftwareDiagnostic(entitlement: SoftwareEntitlement): DiagnosticContext {
  const escalationReady = entitlement.catalogAuthorized && entitlement.licenseAvailable && entitlement.compatible;

  return {
    playbookId: "software-catalog-entitlement",
    knowledgeArticleId: "kb-authorized-software",
    asset: entitlement.product,
    stage: escalationReady ? "prepare_escalation" : "validate_entitlement",
    facts: {
      software: entitlement.product,
      catalogAuthorized: entitlement.catalogAuthorized,
      licenseRequired: entitlement.licenseRequired,
      licenseAvailable: entitlement.licenseAvailable,
      approvalRequired: entitlement.approvalRequired,
      approvalStatus: entitlement.approvalStatus,
      compatible: entitlement.compatible,
      delivery: entitlement.delivery,
      escalationReady,
    },
    completedSteps: [
      "Consulta de catálogo corporativo",
      "Validación de licencia disponible",
      "Validación de aprobación y compatibilidad",
    ],
    updatedAt: new Date().toISOString(),
  };
}

export function buildSoftwareEntitlementMessage(entitlement: SoftwareEntitlement, missingFields: string[]) {
  if (!entitlement.catalogAuthorized) {
    return [
      `Revisé el catálogo corporativo y ${entitlement.product} no aparece como software autorizado para instalación directa.`,
      "Puedo preparar una revisión de excepción con justificación de negocio. Confírmame nombre, correo y área para dejar el caso listo.",
    ].join("\n\n");
  }

  if (!entitlement.licenseAvailable) {
    return [
      `Revisé ${entitlement.product}: está en catálogo, pero no hay licencia disponible para asignación inmediata.`,
      "Corresponde registrar solicitud de licencia o compra. Confírmame nombre, correo y área para dejar el caso preparado.",
    ].join("\n\n");
  }

  if (!entitlement.compatible) {
    return [
      `Revisé ${entitlement.product}: está autorizado, pero falta validar compatibilidad del equipo.`,
      "Confírmame el equipo o activo donde debe instalarse para completar el registro.",
    ].join("\n\n");
  }

  const nextLine = missingFields.length
    ? `Solo me falta: ${missingFields.join(", ")}.`
    : "Con esto puedo registrar la solicitud para instalación/asignación.";

  return [
    `Revisé ${entitlement.product}: está autorizado, hay licencia disponible y no requiere aprobación adicional en este caso.`,
    nextLine,
  ].join("\n\n");
}

export function buildSoftwareTicketMessage(entitlement: SoftwareEntitlement) {
  return [
    `Perfecto. Ya validé catálogo, licencia y compatibilidad para ${entitlement.product}.`,
    "Voy a registrar la solicitud con ese contexto para que soporte continúe con la instalación/asignación sin pedirte esos descartes otra vez.",
  ].join("\n\n");
}

function inferSoftwareProduct(text: string) {
  const normalized = normalize(text);
  if (hasAny(normalized, ["power point", "powerpoint", "power-point"])) return "Microsoft PowerPoint";
  if (hasAny(normalized, ["office", "microsoft 365", "m365"])) return "Microsoft Office";
  return undefined;
}

function hasAny(value: string, terms: string[]) {
  return terms.some((term) => value.includes(normalize(term)));
}

function normalize(value: string) {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}
