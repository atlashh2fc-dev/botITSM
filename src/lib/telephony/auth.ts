import { createHmac, timingSafeEqual } from "node:crypto";
import type { TenantId } from "@/lib/tenant/server";

const MAX_CLOCK_SKEW_SECONDS = 300;

export type WebhookAuthResult = { ok: true } | { ok: false; error: string };

export function verifyTelephonyWebhook(
  request: Request,
  rawBody: string,
  tenantId: TenantId,
): WebhookAuthResult {
  const secret = process.env[`TELEPHONY_${tenantId.toUpperCase()}_WEBHOOK_SECRET`];
  if (!secret) return { ok: false, error: "Integración telefónica no configurada." };

  const timestamp = request.headers.get("x-atlas-timestamp")?.trim();
  const suppliedTenant = request.headers.get("x-atlas-tenant")?.trim().toLowerCase();
  const supplied = request.headers.get("x-atlas-signature")?.trim().replace(/^sha256=/i, "");
  if (!timestamp || !supplied || suppliedTenant !== tenantId) {
    return { ok: false, error: "Firma telefónica requerida." };
  }

  const unixSeconds = Number(timestamp);
  if (!Number.isFinite(unixSeconds)) return { ok: false, error: "Timestamp inválido." };
  if (Math.abs(Date.now() / 1000 - unixSeconds) > MAX_CLOCK_SKEW_SECONDS) {
    return { ok: false, error: "Evento expirado." };
  }

  const expected = createHmac("sha256", secret)
    .update(`${timestamp}.${tenantId}.${rawBody}`)
    .digest();
  let actual: Buffer;
  try {
    actual = Buffer.from(supplied, "hex");
  } catch {
    return { ok: false, error: "Firma inválida." };
  }

  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    return { ok: false, error: "Firma inválida." };
  }
  return { ok: true };
}
