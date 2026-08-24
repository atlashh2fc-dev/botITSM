import type { TenantId } from "@/lib/tenant/server";

const WINDOW_MS = 10 * 60 * 1000;
const ACCOUNT_FAILURE_LIMIT = 5;
const ADDRESS_FAILURE_LIMIT = 12;
const MAX_BUCKETS = 2_048;

type AttemptBucket = {
  failures: number;
  resetAt: number;
};

const globalRateLimit = globalThis as typeof globalThis & {
  __forumPhoneActivationAttempts?: Map<string, AttemptBucket>;
};

const attempts = globalRateLimit.__forumPhoneActivationAttempts
  ?? new Map<string, AttemptBucket>();
globalRateLimit.__forumPhoneActivationAttempts = attempts;

export type PhoneActivationRateLimit = {
  allowed: boolean;
  retryAfterSeconds: number;
};

function normalizedEmail(email: string) {
  return email.trim().toLowerCase().slice(0, 320);
}

function trustedClientAddress(request: Request) {
  // Vercel supplies these headers at its trusted edge. Do not use the generic
  // x-forwarded-for value, which a direct client can forge in local runtimes.
  return request.headers.get("x-vercel-forwarded-for")?.split(",", 1)[0]?.trim()
    || request.headers.get("x-real-ip")?.trim()
    || "";
}

function keysFor(request: Request, tenantId: TenantId, email: string) {
  const keys = [`account:${tenantId}:${normalizedEmail(email)}`];
  const address = trustedClientAddress(request);
  if (address) keys.push(`address:${tenantId}:${address.slice(0, 128)}`);
  return keys;
}

function limitFor(key: string) {
  return key.startsWith("account:") ? ACCOUNT_FAILURE_LIMIT : ADDRESS_FAILURE_LIMIT;
}

function activeBucket(key: string, now: number) {
  const bucket = attempts.get(key);
  if (!bucket || bucket.resetAt <= now) {
    if (bucket) attempts.delete(key);
    return null;
  }
  return bucket;
}

function prune(now: number) {
  for (const [key, bucket] of attempts) {
    if (bucket.resetAt <= now) attempts.delete(key);
  }
  while (attempts.size >= MAX_BUCKETS) {
    const oldest = attempts.keys().next().value as string | undefined;
    if (!oldest) break;
    attempts.delete(oldest);
  }
}

export function checkPhoneActivationRateLimit(
  request: Request,
  tenantId: TenantId,
  email: string,
  now = Date.now(),
): PhoneActivationRateLimit {
  let retryAfterSeconds = 0;
  for (const key of keysFor(request, tenantId, email)) {
    const bucket = activeBucket(key, now);
    if (bucket && bucket.failures >= limitFor(key)) {
      retryAfterSeconds = Math.max(retryAfterSeconds, Math.ceil((bucket.resetAt - now) / 1000));
    }
  }
  return { allowed: retryAfterSeconds === 0, retryAfterSeconds };
}

export function recordPhoneActivationFailure(
  request: Request,
  tenantId: TenantId,
  email: string,
  now = Date.now(),
): PhoneActivationRateLimit {
  prune(now);
  for (const key of keysFor(request, tenantId, email)) {
    const current = activeBucket(key, now);
    attempts.set(key, current
      ? { ...current, failures: current.failures + 1 }
      : { failures: 1, resetAt: now + WINDOW_MS });
  }
  return checkPhoneActivationRateLimit(request, tenantId, email, now);
}

export function clearPhoneActivationFailures(request: Request, tenantId: TenantId, email: string) {
  for (const key of keysFor(request, tenantId, email)) attempts.delete(key);
}

/** Test isolation only; no production caller should reset abuse history. */
export function resetPhoneActivationRateLimitForTests() {
  attempts.clear();
}

export function isSameOriginPhoneMutation(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}
