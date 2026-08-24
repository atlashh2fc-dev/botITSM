export const DEFAULT_PHONE_SESSION_TTL_SECONDS = 8 * 60 * 60;
export const MIN_PHONE_SESSION_TTL_SECONDS = 5 * 60;
export const MAX_PHONE_SESSION_TTL_SECONDS = 12 * 60 * 60;

export function parsePhoneSessionTtl(configured?: string) {
  if (!configured?.trim()) return DEFAULT_PHONE_SESSION_TTL_SECONDS;

  const ttl = Number(configured.trim());
  if (
    !Number.isSafeInteger(ttl)
    || ttl < MIN_PHONE_SESSION_TTL_SECONDS
    || ttl > MAX_PHONE_SESSION_TTL_SECONDS
  ) {
    throw new RangeError("Phone session TTL is outside the supported range.");
  }
  return ttl;
}
