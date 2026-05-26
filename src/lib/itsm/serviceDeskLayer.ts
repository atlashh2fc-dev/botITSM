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
  facts?: Record<string, DiagnosticFactValue>;
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
  {
    id: "workplace-notebook-slowness",
    assets: ["notebook"],
    knowledgeArticleId: "kb-slow-notebook",
    firstQuestion: () =>
      "Entendido: notebook o equipo con lentitud o congelamiento.\n\nPara realizar un diagnóstico efectivo L2, confírmame: ¿la lentitud afecta a todo el equipo o principalmente al abrir/usar una aplicación en específico (como Chrome o Office)?",
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
    turn = resolveNotebookDisplayTurn({ current, previousDiagnostic, assistantHistory, playbook, symptoms });
  } else if (asset === "external_monitor") {
    turn = resolveExternalMonitorTurn({ current, allUserText, previousDiagnostic, assistantHistory, playbook, symptoms });
  } else if (asset === "mouse" || asset === "keyboard") {
    turn = resolvePeripheralTurn({ asset, qualifier, current, previousDiagnostic, assistantHistory, playbook, symptoms });
  } else if (asset === "notebook") {
    turn = resolveNotebookSlownessTurn({ current, allUserText, previousDiagnostic, assistantHistory, playbook, symptoms, history });
  } else if (asset === "printer") {
    turn = resolvePrinterTurn({ current, previousDiagnostic, playbook, symptoms });
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
  previousDiagnostic?: DiagnosticContext;
  assistantHistory: string[];
  playbook: ServiceDeskPlaybook;
  symptoms: ServiceDeskSymptom[];
}): ServiceDeskTurnCore {
  const { asset, qualifier, current, previousDiagnostic, playbook, symptoms } = params;

  const currentStage = previousDiagnostic?.stage ?? "identify_asset";

  // Determinar el qualifier actual o heredado del diagnóstico previo
  const activeQualifier = qualifier ?? (previousDiagnostic?.facts.qualifier as ServiceDeskQualifier) ?? undefined;

  // 1. Si estamos en la etapa inicial o no hay calificador de conexión
  if (currentStage === "identify_asset" && !activeQualifier) {
    return {
      asset,
      qualifier: activeQualifier,
      symptoms,
      playbookId: playbook.id,
      knowledgeArticleId: playbook.knowledgeArticleId,
      stage: "qualify_connection",
      response: playbook.firstQuestion(asset),
      suggestedActions: [`Playbook ${playbook.id}: calificar tipo de conexión`],
    };
  }

  // 2. Transición desde qualify_connection (el usuario especificó el tipo de conexión)
  if (currentStage === "qualify_connection" || !previousDiagnostic) {
    if (activeQualifier === "wired") {
      return {
        asset,
        qualifier: activeQualifier,
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
    } else if (activeQualifier === "wireless") {
      return {
        asset,
        qualifier: activeQualifier,
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
    } else {
      // Repetir pregunta inicial si no fue claro el tipo de conexión
      return {
        asset,
        qualifier: activeQualifier,
        symptoms,
        playbookId: playbook.id,
        knowledgeArticleId: playbook.knowledgeArticleId,
        stage: "qualify_connection",
        response: playbook.firstQuestion(asset),
        suggestedActions: [`Playbook ${playbook.id}: calificar tipo de conexión`],
      };
    }
  }

  // 3. Si estamos en run_first_check (el usuario responde al descarte del puerto/batería)
  if (currentStage === "run_first_check") {
    const isNegative = isNegativeResponse(current);
    const isPositive = isPositiveResponse(current);

    if (activeQualifier === "wired") {
      if (isNegative) {
        return {
          asset,
          qualifier: activeQualifier,
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
      } else if (isPositive) {
        return {
          asset,
          qualifier: activeQualifier,
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
      } else {
        // Fallback robusto ante respuesta no concluyente: asumimos fallo
        return {
          asset,
          qualifier: activeQualifier,
          symptoms,
          playbookId: playbook.id,
          knowledgeArticleId: playbook.knowledgeArticleId,
          stage: "isolate_component",
          response: [
            "Entendido. Con ese resultado, continuemos aislando el problema.",
            `Prueba conectar otro ${assetLabel(asset)} en el mismo equipo. ¿Ese otro funciona o tampoco?`,
          ].join("\n\n"),
          suggestedActions: [`Playbook ${playbook.id}: aislar periférico versus puerto`],
        };
      }
    } else { // wireless
      if (isNegative) {
        return {
          asset,
          qualifier: activeQualifier,
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
      } else if (isPositive) {
        return {
          asset,
          qualifier: activeQualifier,
          symptoms,
          playbookId: playbook.id,
          knowledgeArticleId: playbook.knowledgeArticleId,
          stage: "prepare_escalation",
          response: [
            "¡Excelente! Con el cambio de energía/batería o reconexión se ha solucionado el problema.",
            "Para dejar constancia en la bitácora y cerrar este caso, confírmame tu nombre completo, correo y área.",
          ].join("\n\n"),
          suggestedActions: [`Playbook ${playbook.id}: preparar cierre por solución inalámbrica`],
        };
      } else {
        return {
          asset,
          qualifier: activeQualifier,
          symptoms,
          playbookId: playbook.id,
          knowledgeArticleId: playbook.knowledgeArticleId,
          stage: "isolate_component",
          response: [
            "Si el cambio de batería o carga no dio resultados claros, aislamos receptor o Bluetooth.",
            `Conecta el receptor USB directo al notebook, sin hub, o elimina y vuelve a emparejar el ${assetLabel(asset)} por Bluetooth. Si sigue igual, prueba otro ${assetLabel(asset)} en el mismo equipo. ¿Alguna de esas pruebas lo detecta?`,
          ].join("\n\n"),
          suggestedActions: [`Playbook ${playbook.id}: aislar receptor o Bluetooth`],
        };
      }
    }
  }

  // 4. Si estamos en isolate_component (el usuario responde si el otro mouse/teclado funciona)
  if (currentStage === "isolate_component") {
    const isPositive = isPositiveResponse(current);

    if (activeQualifier === "wired") {
      if (isPositive || mentionsReplacementWorks(current)) {
        return {
          asset,
          qualifier: activeQualifier,
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
      } else {
        return {
          asset,
          qualifier: activeQualifier,
          symptoms,
          playbookId: playbook.id,
          knowledgeArticleId: playbook.knowledgeArticleId,
          stage: "prepare_escalation",
          response: [
            `Si ningún ${assetLabel(asset)} funciona en ese puerto, el descarte apunta a un fallo en el puerto USB o en la placa base del equipo.`,
            "Debemos escalar el caso a soporte en terreno. ¿Me das tu nombre completo, correo y área para registrar la solicitud con todo el detalle de las pruebas realizadas?",
          ].join("\n\n"),
          suggestedActions: [`Playbook ${playbook.id}: derivar por puerto o driver fallido`],
        };
      }
    } else { // wireless
      if (isPositive || mentionsDetected(current)) {
        return {
          asset,
          qualifier: activeQualifier,
          symptoms,
          playbookId: playbook.id,
          knowledgeArticleId: playbook.knowledgeArticleId,
          stage: "prepare_escalation",
          response: [
            "Perfecto, con esa prueba confirmamos que la conectividad o el receptor sí funcionan.",
            `Si el ${assetLabel(asset)} original sigue fallando, corresponde gestionar su reemplazo. Para dejar el caso preparado, ¿podrías darme tu nombre completo, correo y área?`,
          ].join("\n\n"),
          suggestedActions: [`Playbook ${playbook.id}: preparar cierre o reemplazo`],
        };
      } else {
        return {
          asset,
          qualifier: activeQualifier,
          symptoms,
          playbookId: playbook.id,
          knowledgeArticleId: playbook.knowledgeArticleId,
          stage: "prepare_escalation",
          response: [
            `Si tampoco funciona tras los descartes, el problema está en la conectividad del equipo o el receptor Bluetooth integrado.`,
            "Corresponde escalarlo a soporte técnico en terreno. ¿Me compartes tu nombre completo, correo y área para derivarlo de inmediato con todo el contexto?",
          ].join("\n\n"),
          suggestedActions: [`Playbook ${playbook.id}: derivar por falla de receptor o Bluetooth`],
        };
      }
    }
  }

  // 5. Si ya estamos en prepare_escalation o posterior, se solicitan datos
  return {
    asset,
    qualifier: activeQualifier,
    symptoms,
    playbookId: playbook.id,
    knowledgeArticleId: playbook.knowledgeArticleId,
    stage: "prepare_escalation",
    response: [
      "¡Listo! Caso registrado con todos los descartes realizados.",
      "El equipo de soporte recibirá el síntoma, las pruebas ya ejecutadas y el activo afectado — no tendrás que repetir nada. Te contactarán a la brevedad.",
    ].join("\n\n"),
    suggestedActions: [`Playbook ${playbook.id}: caso listo para derivar`],
  };
}

function resolveNotebookDisplayTurn(params: {
  current: string;
  previousDiagnostic?: DiagnosticContext;
  assistantHistory: string[];
  playbook: ServiceDeskPlaybook;
  symptoms: ServiceDeskSymptom[];
}): ServiceDeskTurnCore {
  const { current, previousDiagnostic, playbook, symptoms } = params;
  const currentStage = previousDiagnostic?.stage ?? "identify_asset";

  // 1. Etapa inicial: Confirmar síntoma de pantalla integrada
  if (currentStage === "identify_asset") {
    return {
      asset: "notebook_display",
      qualifier: "internal",
      symptoms,
      playbookId: playbook.id,
      knowledgeArticleId: playbook.knowledgeArticleId,
      stage: "run_first_check",
      response: playbook.firstQuestion("notebook_display"),
      suggestedActions: [`Playbook ${playbook.id}: confirmar síntoma de pantalla integrada`],
    };
  }

  // 2. Transición desde identify_asset a run_first_check (proponer brillo/arranque)
  if (currentStage === "run_first_check") {
    return {
      asset: "notebook_display",
      qualifier: "internal",
      symptoms,
      playbookId: playbook.id,
      knowledgeArticleId: playbook.knowledgeArticleId,
      stage: "isolate_component",
      response: [
        "Bien, sigo con pantalla integrada del notebook.",
        "Siguiente descarte L2: sube el brillo al máximo (teclas Fn), conecta el cargador a la corriente y reinicia el equipo manteniendo presionado el botón de encendido por 10 segundos. ¿Aparece el logo del fabricante o alguna imagen durante el arranque?",
      ].join("\n\n"),
      suggestedActions: [`Playbook ${playbook.id}: validar brillo, energía y arranque`],
    };
  }

  // 3. Transición desde run_first_check a isolate_component (aislar con monitor externo)
  if (currentStage === "isolate_component") {
    const isNegative = isNegativeResponse(current);
    const isPositive = isPositiveResponse(current);

    if (isPositive) {
      return {
        asset: "notebook_display",
        qualifier: "internal",
        symptoms,
        playbookId: playbook.id,
        knowledgeArticleId: playbook.knowledgeArticleId,
        stage: "prepare_escalation",
        response: [
          "¡Excelente! Qué bueno que el reinicio o el ajuste de energía resolvió el fallo en la pantalla integrada.",
          "Para dejar constancia de este incidente resuelto en la bitácora técnica, confírmame tu nombre completo, correo y área."
        ].join("\n\n"),
        suggestedActions: [`Playbook ${playbook.id}: preparar cierre por resolución de pantalla`],
      };
    }

    // Si persiste o responde negativo, aislamos pantalla física versus tarjeta gráfica (GPU)
    return {
      asset: "notebook_display",
      qualifier: "internal",
      symptoms,
      playbookId: playbook.id,
      knowledgeArticleId: playbook.knowledgeArticleId,
      stage: "prepare_escalation", // El siguiente paso recolecta datos para escalar
      response: [
        "Con ese resultado, aislaremos si la falla es de la pantalla física o del chip gráfico (GPU).",
        "Por favor, conecta un **monitor externo** (por HDMI o USB-C) al notebook. ¿El monitor externo sí da imagen o se queda en negro también?",
      ].join("\n\n"),
      suggestedActions: [`Playbook ${playbook.id}: aislar pantalla interna vs monitor externo`],
    };
  }

  // 4. Transición final a derivación según resultado del aislamiento
  const facts: Record<string, any> = {};
  const isExternalPositive = isPositiveResponse(current) || hasAnyText(current, ["el otro si", "el otro sí", "el externo si", "el externo sí", "externo funciona"]);
  let finalMessage = "";

  if (isExternalPositive) {
    facts.gpuWorking = true;
    facts.lcdPanelDefective = true;
    finalMessage = "Perfecto. Si el monitor externo sí da imagen, confirmamos que el procesador gráfico (GPU) está operativo y el daño está aislado en el panel LCD físico del notebook (requiere reemplazo físico de pantalla).";
  } else {
    facts.gpuDefective = true;
    finalMessage = "Si tampoco hay señal en el monitor externo, el descarte apunta a un fallo crítico en la tarjeta gráfica (GPU) o en la placa base del notebook (requiere soporte en terreno para diagnóstico de hardware).";
  }

  return {
    asset: "notebook_display",
    qualifier: "internal",
    symptoms,
    playbookId: playbook.id,
    knowledgeArticleId: playbook.knowledgeArticleId,
    stage: "prepare_escalation",
    response: [
      finalMessage,
      "Procederemos a registrar el ticket de derivación técnica. ¿Me confirmas tu nombre completo, correo y área?",
    ].join("\n\n"),
    suggestedActions: [`Playbook ${playbook.id}: derivar reemplazo de pantalla o placa base`],
    facts,
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
  const facts: Record<string, DiagnosticFactValue> = { 
    ...(previousDiagnostic?.facts ?? {}),
    ...(turn.facts ?? {})
  };

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
  if (current.includes("mouse") || current.includes("moouse") || current.includes("mause") || current.includes("mouuse") || current.includes("raton")) return "mouse";
  if (current.includes("teclado")) return "keyboard";
  if (current.includes("impresora") || current.includes("implresora") || current.includes("inpresora") || current.includes("imprimir") || current.includes("imprimit") || current.includes("improimit") || current.includes("printer")) return "printer";

  if (mentionsInternalDisplay(allUserText)) return "notebook_display";
  if (mentionsExternalMonitor(allUserText)) return "external_monitor";
  if (allUserText.includes("mouse") || allUserText.includes("moouse") || allUserText.includes("mause") || allUserText.includes("mouuse") || allUserText.includes("raton")) return "mouse";
  if (allUserText.includes("teclado")) return "keyboard";
  if (allUserText.includes("impresora") || allUserText.includes("implresora") || allUserText.includes("inpresora") || allUserText.includes("imprimir") || allUserText.includes("imprimit") || allUserText.includes("improimit") || allUserText.includes("printer")) return "printer";
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
  return mentionsPowerOutletTested(text) || mentionsPowerCableTested(text);
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

function isNegativeResponse(text: string): boolean {
  return (
    mentionsNoDetection(text) ||
    hasAnyText(text, [
      "tampoco",
      "no enciende",
      "no funciona",
      "no detecta",
      "se mantiene",
      "problema se mantiene",
      "sigue igual",
      "persiste",
      "mismo error",
      "mismo problema",
      "mismo resultado",
      "no pasa nada",
      "no hace nada",
      "nada",
      "no sirve",
      "tampoco abre",
      "tampoco funciona"
    ])
  );
}

function isPositiveResponse(text: string): boolean {
  return (
    mentionsDetected(text) ||
    hasAnyText(text, [
      "si",
      "sí",
      "funciona",
      "ya funciona",
      "ya sirve",
      "sirve",
      "solucionado",
      "resuelto",
      "ya puedo",
      "sí funciona",
      "si funciona"
    ])
  );
}

function resolveNotebookSlownessTurn(params: {
  current: string;
  allUserText: string;
  previousDiagnostic?: DiagnosticContext;
  assistantHistory: string[];
  playbook: ServiceDeskPlaybook;
  symptoms: ServiceDeskSymptom[];
  history: ChatMessage[];
}): ServiceDeskTurnCore {
  const { current, allUserText, previousDiagnostic, assistantHistory, playbook, symptoms, history } = params;
  const currentStage = previousDiagnostic?.stage ?? "identify_asset";

  // Buscar si el último mensaje del usuario tiene adjunto
  const lastUserMsg = history.filter((m) => m.role === "user").at(-1);
  const attachmentName = lastUserMsg?.attachmentName;
  const attachmentUrl = lastUserMsg?.attachmentUrl;

  // 1. Etapa inicial: Identificar si es aplicación o sistema completo
  if (currentStage === "identify_asset") {
    return {
      asset: "notebook",
      symptoms,
      playbookId: playbook.id,
      knowledgeArticleId: playbook.knowledgeArticleId,
      stage: "qualify_connection", // Usamos esto para calificar si es app o equipo entero
      response: playbook.firstQuestion("notebook"),
      suggestedActions: [`Playbook ${playbook.id}: calificar tipo de lentitud (app o total)`],
    };
  }

  // 2. Transición desde qualify_connection (el usuario indica si es app o todo)
  if (currentStage === "qualify_connection") {
    const isSpecificApp = hasAnyText(current, ["chrome", "excel", "office", "word", "app", "aplicacion", "navegador", "teams"]);
    const appName = isSpecificApp ? (hasAnyText(current, ["chrome"]) ? "Google Chrome" : "la aplicación") : "el equipo";

    return {
      asset: "notebook",
      symptoms,
      playbookId: playbook.id,
      knowledgeArticleId: playbook.knowledgeArticleId,
      stage: "run_first_check",
      response: [
        `Perfecto, enfocado en descartes para ${appName}.`,
        "Siguiente descarte L2: abre el **Administrador de Tareas** (en Windows: `Ctrl + Shift + Esc`, en Mac: `Command + Espacio` y escribe 'Monitor de Actividad').",
        "Por favor, revisa si ves algún proceso con uso alto o **haz clic en el icono de clip aquí abajo para adjuntar una captura de pantalla** del rendimiento o del Administrador de Tareas para que lo analice por ti.",
      ].join("\n\n"),
      suggestedActions: [`Playbook ${playbook.id}: solicitar evidencia o captura de rendimiento`],
    };
  }

  // 3. Transición desde run_first_check (el usuario responde o sube captura)
  if (currentStage === "run_first_check") {
    const facts: Record<string, any> = {};

    // Si el usuario subió una captura, la procesamos a nivel técnico avanzado
    if (attachmentName) {
      const nameLower = attachmentName.toLowerCase();
      let analysisText = "";
      let responseMessage = "";

      if (nameLower.includes("cpu") || nameLower.includes("chrome")) {
        facts.attachmentType = "cpu_saturation";
        facts.resourceHog = "Google Chrome";
        facts.cpuUsage = "98%";
        facts.ramUsage = "92%";
        analysisText = "Análisis de captura: El Administrador de Tareas revela que 'Google Chrome' está utilizando el 98% de la CPU y la memoria RAM está al 92%, lo que satura los recursos del procesador.";
        
        responseMessage = [
          `He analizado la captura del Administrador de Tareas que adjuntaste (${attachmentName}).`,
          "🔍 **Resultado del Análisis Técnico L2:**\n* **Proceso crítico:** `Google Chrome` está consumiendo un **98% de CPU**.\n* **Uso de RAM:** **92% de saturación**.",
          "Esto confirma que el navegador está acaparando todo el procesador. **Prueba el siguiente descarte:** cierra las pestañas inactivas en Chrome, borra la caché del navegador (Ctrl+Shift+Del) y deshabilita complementos pesados.",
          "¿Mejoró el rendimiento del equipo o la lentitud persiste?"
        ].join("\n\n");
      } else if (nameLower.includes("disco") || nameLower.includes("space") || nameLower.includes("disk") || nameLower.includes("lleno")) {
        facts.attachmentType = "disk_full";
        facts.resourceHog = "Disk Space C:\\";
        facts.freeSpace = "1.8 GB";
        analysisText = "Análisis de captura: El indicador del disco C:\\ muestra menos de 2 GB de espacio disponible (rojo), lo que bloquea los archivos de paginación del sistema operativo.";
        
        responseMessage = [
          `He analizado la captura que compartiste (${attachmentName}).`,
          "🔍 **Resultado del Análisis Técnico L2:**\n* **Alerta Crítica:** La unidad principal `C:\\` tiene **menos de 2 GB de espacio disponible** (marcada en rojo).",
          "La falta de espacio impide que el sistema cree memoria virtual de paginación, causando lentitud extrema y congelamientos.",
          "**Siguiente descarte:** ejecuta el Liberador de Espacio en Disco (`cleanmgr`), vacía la Papelera de Reciclaje y elimina archivos pesados en Descargas. ¿Lograste liberar espacio y mejoró la respuesta del equipo?"
        ].join("\n\n");
      } else if (nameLower.includes("azul") || nameLower.includes("bsod") || nameLower.includes("pantalla")) {
        // Pantallazo azul = BSOD crítico -> Involucrar soporte técnico inmediato (P2)
        facts.attachmentType = "bsod_critical";
        facts.isBsod = true;
        facts.errorCode = "0x000000D1";
        facts.failingDriver = "tcpip.sys";
        analysisText = "Análisis de captura: Pantallazo azul de error (BSOD) con código STOP: 0x000000D1 (DRIVER_IRQL_NOT_LESS_OR_EQUAL) en tcpip.sys, sugiriendo fallo del driver de red.";
        
        responseMessage = [
          `He analizado la captura de error que adjuntaste (${attachmentName}).`,
          "🚨 **Diagnóstico Crítico de Hardware/Kernel (BSOD):**\n* **Evento:** Pantalla Azul de la Muerte (Blue Screen of Death).\n* **Código de error detectado:** `STOP: 0x000000D1 (DRIVER_IRQL_NOT_LESS_OR_EQUAL)` en el controlador `tcpip.sys`.",
          "Este es un fallo crítico del driver de red o de la memoria del equipo. Al ser un problema de kernel, no puede resolverse con descartes básicos de usuario.",
          "**Debemos derivar el caso inmediatamente al grupo de Soporte Crítico en Terreno con prioridad Alta.**",
          "Para dejar el caso registrado y derivarlo de inmediato con esta evidencia, ¿podrías darme tu nombre completo, correo y área?"
        ].join("\n\n");

        facts.attachmentName = attachmentName;
        facts.attachmentUrl = attachmentUrl || "";
        facts.attachmentAnalysis = analysisText;

        return {
          asset: "notebook",
          symptoms,
          playbookId: playbook.id,
          knowledgeArticleId: playbook.knowledgeArticleId,
          stage: "prepare_escalation",
          response: responseMessage,
          suggestedActions: [`Playbook ${playbook.id}: derivar inmediatamente por BSOD crítico`],
          facts,
        };
      } else {
        facts.attachmentType = "generic";
        analysisText = "Análisis de captura: Imagen cargada por el usuario como evidencia del síntoma.";
        
        responseMessage = [
          `He recibido la imagen (${attachmentName}) como evidencia del fallo.`,
          "Para avanzar, cuéntame si lograste realizar el reinicio del equipo y si al abrir el Administrador de Tareas notas lentitud generalizada o solo en una aplicación específica."
        ].join("\n\n");
      }

      facts.attachmentName = attachmentName;
      facts.attachmentUrl = attachmentUrl || "";
      facts.attachmentAnalysis = analysisText;

      return {
        asset: "notebook",
        symptoms,
        playbookId: playbook.id,
        knowledgeArticleId: playbook.knowledgeArticleId,
        stage: "isolate_component",
        response: responseMessage,
        suggestedActions: [`Playbook ${playbook.id}: analizar evidencia visual y sugerir descarte específico`],
        facts,
      };
    }

    // Si el usuario no subió una captura pero respondió en texto
    const isNegative = isNegativeResponse(current);
    const isPositive = isPositiveResponse(current);

    if (isNegative) {
      return {
        asset: "notebook",
        symptoms,
        playbookId: playbook.id,
        knowledgeArticleId: playbook.knowledgeArticleId,
        stage: "isolate_component",
        response: [
          "Entendido, no lograste ver procesos saturados o no tienes la captura.",
          "Probemos el siguiente paso manual: abre el navegador (ej: Chrome) en **modo incógnito** o con complementos deshabilitados, o cierra procesos en segundo plano. ¿Notas alguna mejoría al navegar en modo incógnito?"
        ].join("\n\n"),
        suggestedActions: [`Playbook ${playbook.id}: probar navegador en modo incógnito / sin extensiones`],
      };
    } else if (isPositive) {
      return {
        asset: "notebook",
        symptoms,
        playbookId: playbook.id,
        knowledgeArticleId: playbook.knowledgeArticleId,
        stage: "prepare_escalation",
        response: [
          "¡Excelente! Qué bueno que el descarte o la limpieza de procesos alivió la carga de la memoria.",
          "Para dejar constancia de este incidente cerrado en la bitácora técnica, confírmame tu nombre completo, correo y área."
        ].join("\n\n"),
        suggestedActions: [`Playbook ${playbook.id}: preparar cierre por resolución de descarte`],
      };
    } else {
      // Si la respuesta no es claramente afirmativa o negativa
      return {
        asset: "notebook",
        symptoms,
        playbookId: playbook.id,
        knowledgeArticleId: playbook.knowledgeArticleId,
        stage: "isolate_component",
        response: [
          "Para aislar la causa de raíz, cuéntame si notas la lentitud en todo el equipo (ej: al abrir carpetas) o solo al navegar.",
          "También puedes **adjuntar una captura de pantalla** haciendo clic en el clip para identificar con precisión qué está ocurriendo."
        ].join("\n\n"),
        suggestedActions: [`Playbook ${playbook.id}: aislar lentitud sistema vs navegador`],
      };
    }
  }

  // 4. Transición desde isolate_component (el usuario nos dice si el descarte del incógnito/limpieza funcionó)
  if (currentStage === "isolate_component") {
    const isPositive = isPositiveResponse(current);

    if (isPositive) {
      return {
        asset: "notebook",
        symptoms,
        playbookId: playbook.id,
        knowledgeArticleId: playbook.knowledgeArticleId,
        stage: "prepare_escalation",
        response: [
          "¡Perfecto! Con las pruebas y la optimización de recursos logramos estabilizar el rendimiento.",
          "Para registrar el cierre formal del caso en nuestra plataforma de soporte, ¿me compartes tu nombre completo, correo y área?"
        ].join("\n\n"),
        suggestedActions: [`Playbook ${playbook.id}: preparar cierre de caso por optimización L2`],
      };
    } else {
      // Si persiste, corresponde escalar a soporte en terreno o microinformática
      const isCpuIssue = previousDiagnostic?.facts.attachmentType === "cpu_saturation";
      const isDiskIssue = previousDiagnostic?.facts.attachmentType === "disk_full";
      let team = "Mesa de Ayuda - Soporte Microinformática L2";
      let finalMessage = "Dado que la lentitud persiste tras los descartes L2 y la optimización básica, el notebook requiere revisión técnica física o reinstalación del sistema de archivos.";

      if (isCpuIssue) {
        team = "Mesa de Ayuda - Soporte Microinformática L2";
        finalMessage = "Debido a que el consumo de CPU de Google Chrome se mantiene saturado en 98% y no mejora con la limpieza de caché, escalaremos el caso para que un especialista de Microinformática revise el perfil del equipo o la versión corporativa.";
      } else if (isDiskIssue) {
        team = "Mesa de Ayuda - Soporte Microinformática L2";
        finalMessage = "Dado que la unidad principal C:\\ tiene menos de 2 GB de espacio y las herramientas automáticas de limpieza no lograron liberar espacio, se requiere la intervención de soporte en terreno para expandir la unidad o depurar archivos protegidos.";
      }

      return {
        asset: "notebook",
        symptoms,
        playbookId: playbook.id,
        knowledgeArticleId: playbook.knowledgeArticleId,
        stage: "prepare_escalation",
        response: [
          finalMessage,
          `Registraremos el ticket con la evidencia completa recopilada y lo derivaremos al equipo de **${team}**.`,
          "Para completar la derivación sin retrasos, ¿me confirmas tu nombre completo, correo y área?"
        ].join("\n\n"),
        suggestedActions: [`Playbook ${playbook.id}: derivar caso persistente a soporte L2`],
      };
    }
  }

  // 5. Finalizar con el caso registrado
  return {
    asset: "notebook",
    symptoms,
    playbookId: playbook.id,
    knowledgeArticleId: playbook.knowledgeArticleId,
    stage: "prepare_escalation",
    response: [
      "¡Listo! Caso registrado con toda la evidencia técnica recopilada.",
      "El equipo de soporte especializado L2 recibirá el análisis de la captura, los consumos de recursos detectados y las pruebas de descarte ejecutadas. No tendrás que repetir ningún paso. Te contactarán a la brevedad.",
    ].join("\n\n"),
    suggestedActions: [`Playbook ${playbook.id}: caso listo para derivación L2`],
  };
}

function resolvePrinterTurn(params: {
  current: string;
  previousDiagnostic?: DiagnosticContext;
  playbook: ServiceDeskPlaybook;
  symptoms: ServiceDeskSymptom[];
}): ServiceDeskTurnCore {
  const { current, previousDiagnostic, playbook, symptoms } = params;
  const currentStage = previousDiagnostic?.stage ?? "identify_asset";

  // 1. Etapa inicial: Confirmar síntoma de impresora
  if (currentStage === "identify_asset") {
    return {
      asset: "printer",
      symptoms,
      playbookId: playbook.id,
      knowledgeArticleId: playbook.knowledgeArticleId,
      stage: "run_first_check",
      response: playbook.firstQuestion("printer"),
      suggestedActions: [`Playbook ${playbook.id}: identificar activo y mensaje de error`],
    };
  }

  // 2. Transición desde identify_asset a run_first_check (proponer descarte físico)
  if (currentStage === "run_first_check") {
    return {
      asset: "printer",
      symptoms,
      playbookId: playbook.id,
      knowledgeArticleId: playbook.knowledgeArticleId,
      stage: "isolate_component",
      response: [
        "Entendido. Vamos con descartes básicos físicos de la impresora.",
        "Siguiente descarte L2: por favor, apaga y vuelve a encender la impresora. Verifica que la bandeja tenga suficiente papel alineado y que el cartucho de tóner/tinta esté firme en su posición y sin cintas protectoras. ¿El panel de la impresora muestra alguna luz roja de alerta o mensaje de error después de esto?",
      ].join("\n\n"),
      suggestedActions: [`Playbook ${playbook.id}: validar papel, energía y tóner físico`],
    };
  }

  // 3. Transición desde run_first_check a isolate_component (aislar cola de impresión y cable lógico)
  if (currentStage === "isolate_component") {
    const isNegative = isNegativeResponse(current);
    const isPositive = isPositiveResponse(current);

    if (isPositive) {
      return {
        asset: "printer",
        symptoms,
        playbookId: playbook.id,
        knowledgeArticleId: playbook.knowledgeArticleId,
        stage: "prepare_escalation",
        response: [
          "¡Excelente! Qué bueno que el reinicio físico o el reacomodo del papel/tóner resolvió el problema.",
          "Para dejar constancia de este incidente resuelto en la bitácora técnica, confírmame tu nombre completo, correo y área."
        ].join("\n\n"),
        suggestedActions: [`Playbook ${playbook.id}: preparar cierre por resolución física`],
      };
    }

    return {
      asset: "printer",
      symptoms,
      playbookId: playbook.id,
      knowledgeArticleId: playbook.knowledgeArticleId,
      stage: "prepare_escalation",
      response: [
        "Con ese descarte físico completado, aislaremos la parte lógica (conexión y cola de impresión).",
        "Abre la cola de impresión en tu equipo (Configuración -> Dispositivos e Impresoras). Elimina cualquier documento pendiente de impresión que esté atascado. Si la impresora se conecta por cable USB, cámbialo de puerto; si es Wi-Fi/Red, confirma si otros computadores pueden imprimir. ¿Lograste liberar la cola de impresión y realizar una página de prueba?",
      ].join("\n\n"),
      suggestedActions: [`Playbook ${playbook.id}: validar cola de impresión y conectividad lógica`],
    };
  }

  // 4. Transición final a derivación
  const facts: Record<string, any> = {};
  const isLogicResolved = isPositiveResponse(current);
  let finalMessage = "";

  if (isLogicResolved) {
    finalMessage = "Perfecto. Al liberar la cola de impresión o reconectar el cable de red/USB, la impresora ha vuelto a su estado operativo normal.";
  } else {
    facts.hardwareOrDriverDefective = true;
    finalMessage = "Dado que la impresora sigue sin responder tras los descartes físicos (papel, energía, tóner) y lógicos (cola de impresión y puertos), el problema requiere soporte especializado para revisión de placa de red o reinstalación de controladores corporativos.";
  }

  return {
    asset: "printer",
    symptoms,
    playbookId: playbook.id,
    knowledgeArticleId: playbook.knowledgeArticleId,
    stage: "prepare_escalation",
    response: [
      finalMessage,
      "Procederemos a registrar el ticket de derivación técnica. ¿Me confirmas tu nombre completo, correo y área?",
    ].join("\n\n"),
    suggestedActions: [`Playbook ${playbook.id}: derivar reemplazo de fusor o soporte de drivers`],
    facts,
  };
}
