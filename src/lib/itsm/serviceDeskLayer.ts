import type { ChatMessage, DiagnosticContext, DiagnosticFactValue, DiagnosticStage, SessionContext } from "@/lib/itsm/types";

export type ServiceDeskAsset =
  | "mouse"
  | "keyboard"
  | "external_monitor"
  | "notebook_display"
  | "printer"
  | "notebook";

type ServiceDeskQualifier = "wired" | "wireless" | "external" | "internal";
type ServiceDeskSymptom = "not_working" | "no_power" | "no_image" | "flicker" | "dim" | "visual_artifact";
type PlaybookStage = Extract<DiagnosticStage, "identify_asset" | "qualify_connection" | "run_first_check" | "isolate_component" | "prepare_escalation">;

type ServiceDeskTurnCore = {
  asset: ServiceDeskAsset;
  qualifier?: ServiceDeskQualifier;
  symptoms: ServiceDeskSymptom[];
  playbookId: string;
  knowledgeArticleId: string;
  stage: PlaybookStage;
  response: string;
  suggestedActions: string[];
};

export type ServiceDeskTurn = ServiceDeskTurnCore & {
  diagnostic: DiagnosticContext;
};

type ServiceDeskPlaybook = {
  id: string;
  assets: ServiceDeskAsset[];
  knowledgeArticleId: string;
  firstQuestion: (asset: ServiceDeskAsset) => string;
};

const playbooks: ServiceDeskPlaybook[] = [
  {
    id: "workplace-peripheral-usb",
    assets: ["mouse", "keyboard"],
    knowledgeArticleId: "kb-wired-peripheral",
    firstQuestion: (asset) => `Entendido: ${assetLabel(asset)} con falla.\n\nPrimero validemos conexión. ¿Es USB/cableado o inalámbrico?`,
  },
  {
    id: "workplace-display-external",
    assets: ["external_monitor"],
    knowledgeArticleId: "kb-external-display",
    firstQuestion: () => "Entendido: monitor externo con falla.\n\n¿El monitor enciende y el cable queda firme al equipo?",
  },
  {
    id: "workplace-display-integrated",
    assets: ["notebook_display"],
    knowledgeArticleId: "kb-notebook-display",
    firstQuestion: () =>
      "Entendido: pantalla integrada del notebook.\n\n¿La pantalla queda negra, parpadea, muestra líneas/manchas o solo se ve con poco brillo?",
  },
  {
    id: "workplace-printer",
    assets: ["printer"],
    knowledgeArticleId: "kb-printer-basic",
    firstQuestion: () => "Entendido: impresora con falla.\n\n¿Aparece conectada y muestra algún mensaje de error?",
  },
];

export function resolveServiceDeskTurn(message: string, context: SessionContext | ChatMessage[]): ServiceDeskTurn | undefined {
  const history = Array.isArray(context) ? context : context.messages;
  const previousDiagnostic = Array.isArray(context) ? undefined : context.diagnostic;
  const current = normalizeText(message);
  const userHistory = history.filter((item) => item.role === "user").map((item) => normalizeText(item.content));
  const assistantHistory = history.filter((item) => item.role === "assistant").map((item) => normalizeText(item.content));
  const allUserText = [...userHistory, current].join(" ");
  const asset = resolveAsset(current, allUserText) ?? resolveAssetFromDiagnostic(previousDiagnostic);

  if (!asset) {
    return undefined;
  }

  const qualifier = resolveQualifier(allUserText, asset);
  const symptoms = resolveSymptoms(allUserText);
  const playbook = resolvePlaybook(asset);

  if (!playbook) {
    return undefined;
  }

  let turn: ServiceDeskTurnCore;

  if (asset === "notebook_display") {
    turn = resolveNotebookDisplayTurn({ current, assistantHistory, playbook, symptoms });
  } else if (asset === "external_monitor") {
    turn = resolveExternalMonitorTurn({ current, allUserText, previousDiagnostic, assistantHistory, playbook, symptoms });
  } else if (asset === "mouse" || asset === "keyboard") {
    turn = resolvePeripheralTurn({ asset, qualifier, current, assistantHistory, playbook, symptoms });
  } else {
    turn = {
      asset,
      qualifier,
      symptoms,
      playbookId: playbook.id,
      knowledgeArticleId: playbook.knowledgeArticleId,
      stage: "identify_asset",
      response: playbook.firstQuestion(asset),
      suggestedActions: [`Playbook ${playbook.id}: identificar activo`],
    };
  }

  return attachDiagnostic(turn, previousDiagnostic, current, allUserText);
}

function resolvePeripheralTurn(params: {
  asset: ServiceDeskAsset;
  qualifier?: ServiceDeskQualifier;
  current: string;
  assistantHistory: string[];
  playbook: ServiceDeskPlaybook;
  symptoms: ServiceDeskSymptom[];
}): ServiceDeskTurnCore {
  const { asset, qualifier, current, assistantHistory, playbook, symptoms } = params;
  const askedConnection = assistantHistory.some((content) => content.includes("usb") && content.includes("inalambrico"));
  const askedPortTest = assistantHistory.some((content) => content.includes("otro puerto usb"));
  const askedReplacementTest = assistantHistory.some((content) => content.includes(`otro ${assetLabel(asset)}`));
  const askedWirelessEnergy = assistantHistory.some((content) => content.includes("bateria") && content.includes("emparejar"));

  if (mentionsDetected(current) && (askedPortTest || askedReplacementTest)) {
    return {
      asset,
      qualifier,
      symptoms,
      playbookId: playbook.id,
      knowledgeArticleId: playbook.knowledgeArticleId,
      stage: "prepare_escalation",
      response: [
        "Perfecto, con esa prueba el equipo sí detecta el periférico.",
        `Si el ${assetLabel(asset)} original sigue fallando después del descarte, corresponde reemplazarlo o revisar garantía. Para dejar el caso preparado con todos los descartes, ¿podrías darme tu nombre completo, correo y área?`,
      ].join("\n\n"),
      suggestedActions: [`Playbook ${playbook.id}: preparar cierre o reemplazo`],
    };
  }

  if (mentionsReplacementWorks(current) && askedReplacementTest) {
    return {
      asset,
      qualifier,
      symptoms,
      playbookId: playbook.id,
      knowledgeArticleId: playbook.knowledgeArticleId,
      stage: "prepare_escalation",
      response: [
        `Entonces el equipo y el puerto quedan operativos; el problema queda aislado al ${assetLabel(asset)} original.`,
        "Corresponde preparar reemplazo. ¿Me das tu nombre completo, correo y área para registrar el caso con el descarte completo?",
      ].join("\n\n"),
      suggestedActions: [`Playbook ${playbook.id}: preparar reemplazo con descarte completo`],
    };
  }

  if (mentionsNoDetection(current) && askedPortTest) {
    return {
      asset,
      qualifier,
      symptoms,
      playbookId: playbook.id,
      knowledgeArticleId: playbook.knowledgeArticleId,
      stage: "isolate_component",
      response: [
        "Con ese resultado, el descarte apunta al periférico o al puerto USB.",
        `Prueba otro ${assetLabel(asset)} en el mismo equipo. ¿Ese otro ${assetLabel(asset)} funciona?`,
      ].join("\n\n"),
      suggestedActions: [`Playbook ${playbook.id}: aislar periférico versus puerto`],
    };
  }

  if (qualifier === "wired" && askedConnection) {
    return {
      asset,
      qualifier,
      symptoms,
      playbookId: playbook.id,
      knowledgeArticleId: playbook.knowledgeArticleId,
      stage: "run_first_check",
      response: [
        `Perfecto, queda como ${assetLabel(asset)} cableado.`,
        "Siguiente descarte: conéctalo directo a otro puerto USB, sin hub ni adaptador. ¿Enciende o el equipo muestra algún aviso al conectarlo?",
      ].join("\n\n"),
      suggestedActions: [`Playbook ${playbook.id}: probar puerto USB directo`],
    };
  }

  if (qualifier === "wireless" && askedConnection) {
    if (askedWirelessEnergy && mentionsNoDetection(current)) {
      return {
        asset,
        qualifier,
        symptoms,
        playbookId: playbook.id,
        knowledgeArticleId: playbook.knowledgeArticleId,
        stage: "isolate_component",
        response: [
          "Si con batería/carga sigue igual, aislamos receptor o Bluetooth.",
          `Conecta el receptor USB directo al notebook, sin hub, o elimina y vuelve a emparejar el ${assetLabel(asset)} por Bluetooth. Si sigue igual, prueba otro ${assetLabel(asset)} en el mismo equipo. ¿Alguna de esas pruebas lo detecta?`,
        ].join("\n\n"),
        suggestedActions: [`Playbook ${playbook.id}: aislar receptor o Bluetooth`],
      };
    }

    return {
      asset,
      qualifier,
      symptoms,
      playbookId: playbook.id,
      knowledgeArticleId: playbook.knowledgeArticleId,
      stage: "run_first_check",
      response: [
        `Perfecto, queda como ${assetLabel(asset)} inalámbrico.`,
        "Primer descarte: cambia la batería o ponlo a cargar. Luego reconecta el receptor USB o vuelve a emparejar Bluetooth. ¿El equipo lo detecta después de eso?",
      ].join("\n\n"),
      suggestedActions: [`Playbook ${playbook.id}: validar energía y receptor inalámbrico`],
    };
  }

  return {
    asset,
    qualifier,
    symptoms,
    playbookId: playbook.id,
    knowledgeArticleId: playbook.knowledgeArticleId,
    stage: "qualify_connection",
    response: playbook.firstQuestion(asset),
    suggestedActions: [`Playbook ${playbook.id}: calificar tipo de conexión`],
  };
}

function resolveNotebookDisplayTurn(params: {
  current: string;
  assistantHistory: string[];
  playbook: ServiceDeskPlaybook;
  symptoms: ServiceDeskSymptom[];
}): ServiceDeskTurnCore {
  const { assistantHistory, playbook, symptoms } = params;
  const askedSymptom = assistantHistory.some((content) => content.includes("pantalla integrada") && content.includes("queda negra"));

  if (askedSymptom) {
    return {
      asset: "notebook_display",
      qualifier: "internal",
      symptoms,
      playbookId: playbook.id,
      knowledgeArticleId: playbook.knowledgeArticleId,
      stage: "run_first_check",
      response: [
        "Bien, sigo con pantalla integrada del notebook.",
        "Sube el brillo, conecta el cargador y reinicia el equipo. ¿Se ve imagen durante el arranque?",
      ].join("\n\n"),
      suggestedActions: [`Playbook ${playbook.id}: validar brillo, energía y arranque`],
    };
  }

  return {
    asset: "notebook_display",
    qualifier: "internal",
    symptoms,
    playbookId: playbook.id,
    knowledgeArticleId: playbook.knowledgeArticleId,
    stage: "identify_asset",
    response: playbook.firstQuestion("notebook_display"),
    suggestedActions: [`Playbook ${playbook.id}: confirmar síntoma de pantalla integrada`],
  };
}

function resolveExternalMonitorTurn(params: {
  current: string;
  allUserText: string;
  previousDiagnostic?: DiagnosticContext;
  assistantHistory: string[];
  playbook: ServiceDeskPlaybook;
  symptoms: ServiceDeskSymptom[];
}): ServiceDeskTurnCore {
  const { current, allUserText, previousDiagnostic, assistantHistory, playbook, symptoms } = params;

  if (mentionsInternalDisplay(current)) {
    return resolveNotebookDisplayTurn({
      current,
      assistantHistory: [],
      playbook: playbooks.find((item) => item.id === "workplace-display-integrated")!,
      symptoms,
    });
  }

  const askedPowerAndCable = assistantHistory.some((content) => content.includes("monitor enciende") && content.includes("cable queda firme"));
  const askedPowerLight = assistantHistory.some((content) => content.includes("enciende alguna luz") || content.includes("queda totalmente apagado"));
  const askedAnyPowerCheck = askedPowerAndCable || askedPowerLight;
  const confirmedNoPower = mentionsMonitorNoPower(allUserText) || hasFact(previousDiagnostic, "monitorPowerAbsent");
  const triedPowerBasics =
    mentionsPowerBasicsTested(allUserText) ||
    hasFact(previousDiagnostic, "powerBasicsTested") ||
    hasFact(previousDiagnostic, "powerOutletTested") ||
    hasFact(previousDiagnostic, "powerCableTested");
  const alreadyReadyToEscalate = previousDiagnostic?.stage === "prepare_escalation" || hasFact(previousDiagnostic, "escalationReady");

  if (hasAnyText(current, ["hdmi", "displayport", "dp", "vga", "cable de video"])) {
    return {
      asset: "external_monitor",
      qualifier: "external",
      symptoms,
      playbookId: playbook.id,
      knowledgeArticleId: playbook.knowledgeArticleId,
      stage: "run_first_check",
      response: [
        "HDMI confirma el cable de video, pero no alimenta el monitor.",
        "Ahora revisa energía: cable de poder firme en el monitor y en el enchufe. Si puedes, prueba otro enchufe. ¿Se enciende alguna luz del monitor?",
      ].join("\n\n"),
      suggestedActions: [`Playbook ${playbook.id}: separar energía de video`],
    };
  }

  if (alreadyReadyToEscalate || (askedAnyPowerCheck && confirmedNoPower && (askedPowerLight || triedPowerBasics || mentionsRepeatedInstruction(current)))) {
    return {
      asset: "external_monitor",
      qualifier: "external",
      symptoms,
      playbookId: playbook.id,
      knowledgeArticleId: playbook.knowledgeArticleId,
      stage: "prepare_escalation",
      response: [
        "Entendido. Con eso ya queda descartado lo básico: monitor sin luz, sin encender, y energía/cable revisados.",
        "Con esos descartes queda claro que el monitor necesita revisión técnica o reemplazo. ¿Me das tu nombre completo, correo y área para registrar el caso con todo el contexto?",
      ].join("\n\n"),
      suggestedActions: [`Playbook ${playbook.id}: derivar monitor sin energía tras descarte básico`],
    };
  }

  if (askedPowerAndCable && mentionsMonitorNoPower(current)) {
    return {
      asset: "external_monitor",
      qualifier: "external",
      symptoms,
      playbookId: playbook.id,
      knowledgeArticleId: playbook.knowledgeArticleId,
      stage: "run_first_check",
      response: [
        "Eso apunta primero a energía del monitor, no al cable de video.",
        "Revisa que el cable de poder esté firme en el monitor y en el enchufe. Si puedes, prueba otro enchufe o cable de poder. ¿Se enciende alguna luz en el monitor?",
      ].join("\n\n"),
      suggestedActions: [`Playbook ${playbook.id}: validar energía del monitor`],
    };
  }

  if (askedPowerLight && hasAnyText(current, ["enciende", "luz", "sin señal", "no signal", "entrada", "input"])) {
    return {
      asset: "external_monitor",
      qualifier: "external",
      symptoms,
      playbookId: playbook.id,
      knowledgeArticleId: playbook.knowledgeArticleId,
      stage: "isolate_component",
      response: [
        "Si el monitor enciende, el siguiente descarte es entrada de video.",
        "Selecciona la entrada correcta en el monitor, por ejemplo HDMI, y vuelve a conectar el cable al notebook. ¿Aparece imagen?",
      ].join("\n\n"),
      suggestedActions: [`Playbook ${playbook.id}: validar entrada de video`],
    };
  }

  return {
    asset: "external_monitor",
    qualifier: "external",
    symptoms,
    playbookId: playbook.id,
    knowledgeArticleId: playbook.knowledgeArticleId,
    stage: "run_first_check",
    response: playbook.firstQuestion("external_monitor"),
    suggestedActions: [`Playbook ${playbook.id}: validar energía y cable de monitor externo`],
  };
}

function attachDiagnostic(
  turn: ServiceDeskTurnCore,
  previousDiagnostic: DiagnosticContext | undefined,
  current: string,
  allUserText: string,
): ServiceDeskTurn {
  const facts: Record<string, DiagnosticFactValue> = { ...(previousDiagnostic?.facts ?? {}) };

  facts.assetIdentified = true;
  facts.asset = turn.asset;
  facts.symptoms = turn.symptoms;

  if (turn.qualifier) {
    facts.qualifier = turn.qualifier;
  }

  if (turn.asset === "external_monitor") {
    facts.externalMonitorConfirmed = true;
    if (mentionsMonitorNoPower(allUserText)) facts.monitorPowerAbsent = true;
    if (mentionsVideoCable(allUserText)) facts.videoCableMentioned = true;
    if (mentionsCableFirm(allUserText)) facts.cableFirm = true;
    if (mentionsPowerOutletTested(allUserText)) facts.powerOutletTested = true;
    if (mentionsPowerCableTested(allUserText)) facts.powerCableTested = true;
    if (mentionsPowerBasicsTested(allUserText)) facts.powerBasicsTested = true;
  }

  if (turn.stage === "prepare_escalation") {
    facts.escalationReady = true;
  }

  const completedSteps = Array.from(new Set([...(previousDiagnostic?.completedSteps ?? []), ...turn.suggestedActions]));

  return {
    ...turn,
    diagnostic: {
      playbookId: turn.playbookId,
      knowledgeArticleId: turn.knowledgeArticleId,
      asset: turn.asset,
      qualifier: turn.qualifier,
      stage: turn.stage,
      facts,
      completedSteps,
      updatedAt: new Date().toISOString(),
    },
  };
}

function resolveAssetFromDiagnostic(diagnostic: DiagnosticContext | undefined): ServiceDeskAsset | undefined {
  return isServiceDeskAsset(diagnostic?.asset) ? diagnostic.asset : undefined;
}

function isServiceDeskAsset(value: string | undefined): value is ServiceDeskAsset {
  return (
    value === "mouse" ||
    value === "keyboard" ||
    value === "external_monitor" ||
    value === "notebook_display" ||
    value === "printer" ||
    value === "notebook"
  );
}

function resolveAsset(current: string, allUserText: string): ServiceDeskAsset | undefined {
  if (mentionsInternalDisplay(current)) return "notebook_display";
  if (mentionsExternalMonitor(current)) return "external_monitor";
  if (current.includes("mouse") || current.includes("raton")) return "mouse";
  if (current.includes("teclado")) return "keyboard";
  if (current.includes("impresora")) return "printer";

  if (mentionsInternalDisplay(allUserText)) return "notebook_display";
  if (mentionsExternalMonitor(allUserText)) return "external_monitor";
  if (allUserText.includes("mouse") || allUserText.includes("raton")) return "mouse";
  if (allUserText.includes("teclado")) return "keyboard";
  if (allUserText.includes("impresora")) return "printer";
  if (current.includes("notebook") || current.includes("note") || current.includes("laptop")) return "notebook";
  return undefined;
}

function resolveQualifier(text: string, asset: ServiceDeskAsset): ServiceDeskQualifier | undefined {
  if (asset === "notebook_display") return "internal";
  if (asset === "external_monitor") return "external";
  if (hasAnyText(text, ["cable", "cableado", "usb", "se ocupa con cable", "con cable"])) return "wired";
  if (hasAnyText(text, ["inalambrico", "bluetooth", "wireless", "receptor", "pila", "bateria"])) return "wireless";
  return undefined;
}

function resolveSymptoms(text: string): ServiceDeskSymptom[] {
  const symptoms = new Set<ServiceDeskSymptom>();
  if (hasAnyText(text, ["no funciona", "falla", "problema"])) symptoms.add("not_working");
  if (hasAnyText(text, ["no enciende", "no prende", "sin energia"])) symptoms.add("no_power");
  if (hasAnyText(text, ["negra", "sin imagen", "no da imagen"])) symptoms.add("no_image");
  if (hasAnyText(text, ["parpadea", "intermitente"])) symptoms.add("flicker");
  if (hasAnyText(text, ["brillo", "oscura", "poco brillo"])) symptoms.add("dim");
  if (hasAnyText(text, ["lineas", "linea", "manchas", "mancha"])) symptoms.add("visual_artifact");
  return Array.from(symptoms);
}

function resolvePlaybook(asset: ServiceDeskAsset) {
  return playbooks.find((playbook) => playbook.assets.includes(asset));
}

function assetLabel(asset: ServiceDeskAsset) {
  const labels: Record<ServiceDeskAsset, string> = {
    mouse: "mouse",
    keyboard: "teclado",
    external_monitor: "monitor",
    notebook_display: "pantalla integrada del notebook",
    printer: "impresora",
    notebook: "notebook",
  };

  return labels[asset];
}

function mentionsNoDetection(text: string) {
  return hasAnyText(text, ["no enciende", "no enciuende", "no prende", "no detecta", "no aparece", "nada", "sigue igual", "no funciona", "no fuicna"]);
}

function mentionsReplacementWorks(text: string) {
  return hasAnyText(text, ["otro mouse funciona", "otro si funciona", "otro sí funciona", "con otro funciona", "el otro funciona"]);
}

function mentionsDetected(text: string) {
  return hasAnyText(text, ["si lo detecta", "sí lo detecta", "lo detecta", "funciona", "aparece", "conecto", "conectó"]);
}

function mentionsMonitorNoPower(text: string) {
  return hasAnyText(text, [
    "apagado",
    "queda apagado",
    "totalmente apagado",
    "no enciende",
    "no enciuende",
    "no prende",
    "no prende luz",
    "sin luz",
    "luz ni nada",
    "sin energia",
    "sin energía",
  ]);
}

function mentionsPowerBasicsTested(text: string) {
  return mentionsPowerOutletTested(text) || mentionsPowerCableTested(text) || mentionsCableFirm(text);
}

function mentionsPowerOutletTested(text: string) {
  return hasAnyText(text, ["otro enchufe", "cambie el enchufe", "cambié el enchufe", "probe otro enchufe", "probé otro enchufe"]);
}

function mentionsPowerCableTested(text: string) {
  return hasAnyText(text, ["otro cable", "oitro cakbe", "probe otro cable", "probé otro cable", "cable de poder", "cable poder"]);
}

function mentionsVideoCable(text: string) {
  return hasAnyText(text, ["hdmi", "displayport", "dp", "vga", "cable de video"]);
}

function mentionsCableFirm(text: string) {
  return hasAnyText(text, ["esta firme", "está firme", "cable firme", "enchufe firme"]);
}

function mentionsRepeatedInstruction(text: string) {
  return hasAnyText(text, [
    "3 vez",
    "tercera vez",
    "otra vez",
    "ya te dije",
    "te dije",
    "te digo",
    "no repitas",
    "no enciende!!!",
  ]);
}

function mentionsInternalDisplay(text: string) {
  return (
    hasAnyText(text, ["pantalla de mi note", "pantalla del note", "pantalla de mi notebook", "pantalla del notebook", "pantalla integrada", "pantalla de laptop"]) ||
    ((text.includes("pantalla") || text.includes("display")) && hasAnyText(text, ["note", "notebook", "laptop"]))
  );
}

function mentionsExternalMonitor(text: string) {
  return hasAnyText(text, [
    "monitor",
    "monitor complementario",
    "pantalla externa",
    "pantalla complementaria",
    "segunda pantalla",
    "hdmi",
    "displayport",
    "cable de video",
    "vga",
  ]);
}

function hasAnyText(value: string, terms: string[]) {
  return terms.some((term) => value.includes(normalizeText(term)));
}

function hasFact(diagnostic: DiagnosticContext | undefined, key: string) {
  return diagnostic?.facts[key] === true;
}

function normalizeText(message: string) {
  return message.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}
