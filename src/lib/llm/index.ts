import type { ITSMResponse, ITSMResponseInput } from "@/lib/itsm/types";
import { resolveContextualContinuation } from "@/lib/itsm/continuation";
import { generateMercuryITSMResponse, hasMercuryConfig } from "@/lib/llm/mercuryClient";
import { generateMockITSMResponse } from "@/lib/llm/mockClient";

export async function generateITSMResponse(input: ITSMResponseInput): Promise<ITSMResponse> {
  if (isGreetingOnly(input.userMessage)) {
    return generateMockITSMResponse(input);
  }

  if (isHardwareTroubleshooting(input)) {
    return generateMockITSMResponse(input);
  }

  if (isReadyDiagnosticFollowUp(input)) {
    return generateMockITSMResponse(input);
  }

  const contextualResponse = resolveContextualContinuation(input);
  if (contextualResponse) {
    return contextualResponse;
  }

  if (hasMercuryConfig()) {
    return generateMercuryITSMResponse(input);
  }

  return generateMockITSMResponse(input);
}

function isReadyDiagnosticFollowUp(input: ITSMResponseInput) {
  return input.sessionContext.diagnostic?.stage === "prepare_escalation";
}

function isGreetingOnly(message: string) {
  const text = message.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return /^(hola|buenas|buenos dias|buenas tardes|buenas noches|hello|hi)[.!¡! ]*$/.test(text);
}

function isHardwareTroubleshooting(input: ITSMResponseInput) {
  return (
    input.detectedIntent === "HARDWARE_ISSUE" ||
    [
      "kb-wired-peripheral",
      "kb-external-display",
      "kb-notebook-display",
      "kb-printer-not-printing",
      "kb-printer-paper-toner",
      "kb-scanner-issue",
      "kb-laptop-no-power",
      "kb-battery-charger",
      "kb-camera-microphone-system",
    ].includes(input.sessionContext.activeArticleId ?? "")
  );
}
