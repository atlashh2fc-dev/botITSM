import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";

import { POST as ingestTelephonyEvent } from "../src/app/api/telephony/events/route";
import { verifyTelephonyWebhook } from "../src/lib/telephony/auth";
import {
  assertCallMatchesInboundEvidence,
  assertTrustedInboundEvent,
  processTelephonyEvent,
  TelephonyConfigurationError,
  TelephonyInputError,
} from "../src/lib/telephony/service";
import {
  parseTelephonyEvent,
  TelephonyPayloadError,
  type TelephonyEvent,
} from "../src/lib/telephony/types";
import { withTenant } from "../src/lib/tenant/context";
import { createZammadPhoneArticle } from "../src/lib/zammad/client";
import type { Tenant } from "../src/lib/tenant/server";

const forumTenant: Tenant = {
  id: "forum",
  name: "Forum",
  host: "iabot.demoitsm.cl",
  zammadBaseUrl: "https://mda.demoitsm.cl",
  zammadApiToken: "test-token",
  zammadGroup: "TI Forum",
  zammadGroups: ["TI Forum"],
  assetGroups: ["Forum"],
};

function event(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    version: 2,
    source: "asterisk-ami",
    eventId: "1712345678.10:newCall",
    callId: "1712345678.10",
    linkedId: "1712345678.10",
    event: "newCall",
    direction: "in",
    from: "+56911112222",
    to: "+56965906926",
    context: "itsm-demo-inbound",
    channel: "PJSIP/siptel-inbound-itsm-000001ab",
    trunk: "PJSIP/siptel-inbound-itsm",
    queue: "itsm_demo",
    occurredAt: "2026-08-21T12:00:00.000Z",
    ...overrides,
  };
}

function configureForumInboundAllowlists() {
  process.env.TELEPHONY_FORUM_ALLOWED_DIDS = "56965906926";
  process.env.TELEPHONY_FORUM_ALLOWED_CONTEXTS = "itsm-demo-inbound";
  process.env.TELEPHONY_FORUM_ALLOWED_TRUNKS = "PJSIP/siptel-inbound-itsm";
  process.env.TELEPHONY_FORUM_ALLOWED_QUEUES = "itsm_demo";
}

test("telephony v2 requires signed root-leg origin evidence", () => {
  const parsed = parseTelephonyEvent(event());
  assert.equal(parsed.version, 2);
  assert.equal(parsed.source, "asterisk-ami");
  assert.equal(parsed.callId, parsed.linkedId);
  assert.equal(parsed.context, "itsm-demo-inbound");
  assert.equal(parsed.trunk, "PJSIP/siptel-inbound-itsm");

  for (const invalid of [
    event({ version: 1 }),
    event({ source: "campaign-crm" }),
    event({ context: undefined }),
    event({ channel: undefined }),
    event({ trunk: undefined }),
    event({ linkedId: undefined }),
    event({ queue: undefined }),
  ]) {
    assert.throws(() => parseTelephonyEvent(invalid), TelephonyPayloadError);
  }
});

test("tenant-scoped inbound allowlists accept only the inspected route", () => {
  configureForumInboundAllowlists();
  const valid = parseTelephonyEvent(event());
  assert.doesNotThrow(() => assertTrustedInboundEvent(valid, "forum"));

  for (const invalid of [
    parseTelephonyEvent(event({ direction: "out" })),
    parseTelephonyEvent(event({ linkedId: "another-leg" })),
    parseTelephonyEvent(event({ to: "+56987654321" })),
    parseTelephonyEvent(event({ context: "from-campaign" })),
    parseTelephonyEvent(event({ trunk: "PJSIP/campaign-provider" })),
    parseTelephonyEvent(event({ channel: "PJSIP/campaign-provider-000001ab" })),
    parseTelephonyEvent(event({ queue: "sales_campaign" })),
  ]) {
    assert.throws(() => assertTrustedInboundEvent(invalid, "forum"), TelephonyInputError);
  }
});

test("missing tenant routing allowlists fail closed", () => {
  configureForumInboundAllowlists();
  const previous = process.env.TELEPHONY_FORUM_ALLOWED_CONTEXTS;
  delete process.env.TELEPHONY_FORUM_ALLOWED_CONTEXTS;
  try {
    assert.throws(
      () => assertTrustedInboundEvent(parseTelephonyEvent(event()), "forum"),
      TelephonyConfigurationError,
    );
  } finally {
    process.env.TELEPHONY_FORUM_ALLOWED_CONTEXTS = previous;
  }
});

test("later events cannot change the call identity or root-leg evidence", () => {
  const initial = parseTelephonyEvent(event());
  const call = {
    call_id: initial.callId,
    direction: initial.direction,
    from_number: initial.from,
    to_number: initial.to,
    queue: initial.queue,
    last_payload: initial,
  };
  const answer = parseTelephonyEvent(event({
    eventId: "1712345678.10:answer",
    event: "answer",
    answeringNumber: "6020",
  }));
  assert.doesNotThrow(() => assertCallMatchesInboundEvidence(call, answer));
  assert.throws(
    () => assertCallMatchesInboundEvidence(call, { ...answer, trunk: "PJSIP/campaign-provider" }),
    TelephonyInputError,
  );
  assert.throws(
    () => assertCallMatchesInboundEvidence(call, { ...answer, from: "+56999999999" }),
    TelephonyInputError,
  );
});

test("invalid direction is rejected before any persistence or Zammad call", async () => {
  configureForumInboundAllowlists();
  const outbound = parseTelephonyEvent(event({ direction: "out" })) as TelephonyEvent;
  const originalFetch = globalThis.fetch;
  let networkCalls = 0;
  globalThis.fetch = async () => {
    networkCalls += 1;
    throw new Error("network must not be reached");
  };

  try {
    await assert.rejects(
      withTenant(
        new Request("https://iabot.demoitsm.cl/api/telephony/events", {
          headers: { Host: "iabot.demoitsm.cl" },
        }),
        () => processTelephonyEvent(outbound),
      ),
      TelephonyInputError,
    );
    assert.equal(networkCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("outbound campaign presenting the shared Forum DID as caller is rejected before side effects", async () => {
  configureForumInboundAllowlists();
  // Regression for the incident: the campaign used Forum's public DID as its
  // outbound caller ID and the old bridge labelled the leg as inbound.
  const masqueradingCampaign = parseTelephonyEvent(event({
    direction: "in",
    from: "+56 9 6590 6926",
    to: "56965906926",
  }));
  const originalFetch = globalThis.fetch;
  let networkCalls = 0;
  globalThis.fetch = async () => {
    networkCalls += 1;
    throw new Error("network must not be reached");
  };

  try {
    await assert.rejects(
      withTenant(
        new Request("https://iabot.demoitsm.cl/api/telephony/events", {
          headers: { Host: "iabot.demoitsm.cl" },
        }),
        () => processTelephonyEvent(masqueradingCampaign),
      ),
      (error: unknown) => error instanceof TelephonyInputError && /originación saliente/.test(error.message),
    );
    assert.equal(networkCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("webhook HMAC binds tenant and complete v2 evidence", () => {
  const secret = "forum-webhook-secret-for-contract-tests";
  process.env.TELEPHONY_FORUM_WEBHOOK_SECRET = secret;
  const raw = JSON.stringify(event());
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = createHmac("sha256", secret)
    .update(`${timestamp}.forum.${raw}`)
    .digest("hex");
  const request = new Request("https://iabot.demoitsm.cl/api/telephony/events", {
    method: "POST",
    headers: {
      "x-atlas-timestamp": timestamp,
      "x-atlas-tenant": "forum",
      "x-atlas-signature": `sha256=${signature}`,
    },
    body: raw,
  });

  assert.deepEqual(verifyTelephonyWebhook(request, raw, "forum"), { ok: true });
  assert.equal(verifyTelephonyWebhook(request, raw.replace("itsm-demo-inbound", "from-campaign"), "forum").ok, false);
  assert.equal(verifyTelephonyWebhook(request, raw, "geimser").ok, false);
});

test("kill switch remains disabled by default and rejects before ingestion", async () => {
  const previous = process.env.TELEPHONY_FORUM_INGEST_ENABLED;
  process.env.TELEPHONY_FORUM_INGEST_ENABLED = "false";
  try {
    const response = await ingestTelephonyEvent(new Request(
      "https://iabot.demoitsm.cl/api/telephony/events",
      { method: "POST", headers: { Host: "iabot.demoitsm.cl" }, body: JSON.stringify(event()) },
    ));
    assert.equal(response.status, 503);
    assert.equal(response.headers.get("retry-after"), "300");
  } finally {
    if (previous === undefined) delete process.env.TELEPHONY_FORUM_INGEST_ENABLED;
    else process.env.TELEPHONY_FORUM_INGEST_ENABLED = previous;
  }
});

test("even when enabled, the signed endpoint rejects outbound evidence before side effects", async () => {
  const secret = "forum-webhook-secret-for-enabled-route-test";
  const previousEnabled = process.env.TELEPHONY_FORUM_INGEST_ENABLED;
  const previousSecret = process.env.TELEPHONY_FORUM_WEBHOOK_SECRET;
  process.env.TELEPHONY_FORUM_INGEST_ENABLED = "true";
  process.env.TELEPHONY_FORUM_WEBHOOK_SECRET = secret;
  configureForumInboundAllowlists();

  const raw = JSON.stringify(event({ direction: "out" }));
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = createHmac("sha256", secret).update(`${timestamp}.forum.${raw}`).digest("hex");
  try {
    const response = await ingestTelephonyEvent(new Request(
      "https://iabot.demoitsm.cl/api/telephony/events",
      {
        method: "POST",
        headers: {
          Host: "iabot.demoitsm.cl",
          "x-atlas-timestamp": timestamp,
          "x-atlas-tenant": "forum",
          "x-atlas-signature": `sha256=${signature}`,
        },
        body: raw,
      },
    ));
    assert.equal(response.status, 400);
    assert.match(String((await response.json()).error), /entrantes/);
  } finally {
    if (previousEnabled === undefined) delete process.env.TELEPHONY_FORUM_INGEST_ENABLED;
    else process.env.TELEPHONY_FORUM_INGEST_ENABLED = previousEnabled;
    if (previousSecret === undefined) delete process.env.TELEPHONY_FORUM_WEBHOOK_SECRET;
    else process.env.TELEPHONY_FORUM_WEBHOOK_SECRET = previousSecret;
  }
});

test("Zammad hangup article does not request Time Accounting permission", async () => {
  const originalFetch = globalThis.fetch;
  let articlePayload: Record<string, unknown> | undefined;
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.includes("/ticket_articles/by_ticket/99")) return Response.json([]);
    if (url.endsWith("/ticket_articles") && init?.method === "POST") {
      articlePayload = JSON.parse(String(init.body)) as Record<string, unknown>;
      return Response.json({
        id: 7,
        ticket_id: 99,
        body: articlePayload.body,
        internal: false,
        created_at: "2026-08-21T12:05:00Z",
        updated_at: "2026-08-21T12:05:00Z",
      });
    }
    return new Response("not found", { status: 404 });
  };

  try {
    await createZammadPhoneArticle({
      ticketId: 99,
      eventId: "1712345678.10:hangup",
      subject: "Resultado de llamada",
      body: "Duración: 2m 5s",
    }, forumTenant);
    assert.equal(articlePayload?.time_unit, undefined);
    assert.match(String(articlePayload?.body), /Duración: 2m 5s/);
    assert.match(String(articlePayload?.body), /Event-ID: 1712345678.10:hangup/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
