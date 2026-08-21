import { NextResponse } from "next/server";
import { verifyTelephonyWebhook } from "@/lib/telephony/auth";
import {
  processTelephonyEvent,
  TelephonyBusyError,
  TelephonyConfigurationError,
  TelephonyInputError,
} from "@/lib/telephony/service";
import { parseTelephonyEvent, TelephonyPayloadError } from "@/lib/telephony/types";
import { requireTenant, TenantResolutionError } from "@/lib/tenant/server";
import { withTenant } from "@/lib/tenant/context";

export const runtime = "nodejs";
const MAX_BODY_BYTES = 64 * 1024;

export async function POST(request: Request) {
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Payload demasiado grande." }, { status: 413 });
  }

  let tenant: ReturnType<typeof requireTenant>;
  try {
    tenant = requireTenant(request);
  } catch (error) {
    if (error instanceof TenantResolutionError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    throw error;
  }

  // Emergency-safe boundary: inbound telephony ingestion is disabled unless
  // the tenant is explicitly enabled. This prevents a noisy or looping PBX
  // bridge from creating tickets and notification storms by default.
  const ingestEnabled = process.env[`TELEPHONY_${tenant.id.toUpperCase()}_INGEST_ENABLED`]
    ?.trim()
    .toLowerCase() === "true";
  if (!ingestEnabled) {
    return NextResponse.json(
      { error: "Ingesta telefónica temporalmente deshabilitada." },
      { status: 503, headers: { "Retry-After": "300" } },
    );
  }

  const rawBody = await request.text();
  if (Buffer.byteLength(rawBody, "utf8") > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Payload demasiado grande." }, { status: 413 });
  }
  const auth = verifyTelephonyWebhook(request, rawBody, tenant.id);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });

  try {
    const input = parseTelephonyEvent(JSON.parse(rawBody) as unknown);
    const result = await withTenant(request, () => processTelephonyEvent(input));
    return NextResponse.json(result, { status: result.duplicate ? 200 : 201 });
  } catch (error) {
    if (error instanceof SyntaxError || error instanceof TelephonyPayloadError || error instanceof TelephonyInputError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof TenantResolutionError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof TelephonyConfigurationError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    if (error instanceof TelephonyBusyError) {
      return NextResponse.json(
        { error: error.message },
        { status: 503, headers: { "Retry-After": "2" } },
      );
    }
    console.error("[Telephony] Error procesando evento:", error);
    return NextResponse.json({ error: "No se pudo registrar la llamada." }, { status: 502 });
  }
}
