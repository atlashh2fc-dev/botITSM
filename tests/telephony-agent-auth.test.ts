import assert from "node:assert/strict";
import test from "node:test";
import {
  checkPhoneActivationRateLimit,
  clearPhoneActivationFailures,
  isSameOriginPhoneMutation,
  recordPhoneActivationFailure,
  resetPhoneActivationRateLimitForTests,
} from "@/lib/telephony/activationRateLimit";
import {
  DEFAULT_PHONE_SESSION_TTL_SECONDS,
  parsePhoneSessionTtl,
} from "@/lib/telephony/agentSessionPolicy";

const AGENT_EMAIL = "phone.agent@forum.cl";

function activationRequest(origin: string | undefined, address = "203.0.113.10") {
  const headers: Record<string, string> = { "x-vercel-forwarded-for": address };
  if (origin !== undefined) headers.Origin = origin;
  return new Request("https://iabot.demoitsm.cl/api/telephony/agent/session", {
    method: "POST",
    headers,
  });
}

test.beforeEach(() => resetPhoneActivationRateLimitForTests());

test("phone session mutations require an exact same-origin request", () => {
  assert.equal(isSameOriginPhoneMutation(activationRequest(undefined)), false);
  assert.equal(isSameOriginPhoneMutation(activationRequest("https://evil.example")), false);
  assert.equal(isSameOriginPhoneMutation(activationRequest("https://iabot.demoitsm.cl.evil.example")), false);
  assert.equal(isSameOriginPhoneMutation(activationRequest("not a URL")), false);
  assert.equal(isSameOriginPhoneMutation(activationRequest("https://iabot.demoitsm.cl")), true);
});

test("phone activation blocks the fifth invalid code and keeps the lock for a valid retry", () => {
  const request = activationRequest("https://iabot.demoitsm.cl");
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    assert.equal(recordPhoneActivationFailure(request, "forum", AGENT_EMAIL, 1_000).allowed, true);
  }
  const blocked = recordPhoneActivationFailure(request, "forum", AGENT_EMAIL, 1_000);
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.retryAfterSeconds, 600);
  assert.equal(checkPhoneActivationRateLimit(request, "forum", AGENT_EMAIL, 1_001).allowed, false);
});

test("successful phone activation clears only the matching agent and address buckets", () => {
  const request = activationRequest("https://iabot.demoitsm.cl");
  for (let attempt = 0; attempt < 5; attempt += 1) {
    recordPhoneActivationFailure(request, "forum", AGENT_EMAIL, 1_000);
  }
  clearPhoneActivationFailures(request, "forum", AGENT_EMAIL);
  assert.equal(checkPhoneActivationRateLimit(request, "forum", AGENT_EMAIL, 1_001).allowed, true);
});

test("phone session TTL defaults to eight hours and fails closed outside 5m-12h", () => {
  assert.equal(parsePhoneSessionTtl(), DEFAULT_PHONE_SESSION_TTL_SECONDS);
  assert.equal(parsePhoneSessionTtl("600"), 600);
  assert.throws(() => parsePhoneSessionTtl("299"), RangeError);
  assert.throws(() => parsePhoneSessionTtl("43201"), RangeError);
  assert.throws(() => parsePhoneSessionTtl("600.5"), RangeError);
  assert.throws(() => parsePhoneSessionTtl("invalid"), RangeError);
});
