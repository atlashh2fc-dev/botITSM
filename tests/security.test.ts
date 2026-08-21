import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import {
  createITSMSessionToken,
  ITSMAuthenticationError,
  verifyITSMAssertion,
  verifyITSMSessionToken,
} from "@/lib/auth/assertion";
import { ITSM_SESSION_COOKIE, withApiAuth } from "@/lib/auth/apiAuth";
import { findTicketByNumberForCustomer } from "@/lib/zammad/client";
import type { Tenant } from "@/lib/tenant/server";
import { GET as getAssets } from "@/app/api/assets/route";
import { POST as collectHardware } from "@/app/api/assets/[assetId]/hardware/route";
import { POST as postChat } from "@/app/api/chat/route";
import { GET as getContactCenter } from "@/app/api/contact-center/route";
import { POST as postFieldChat } from "@/app/api/field-chat/route";
import { GET as getKpis } from "@/app/api/kpis/route";
import { GET as getCommunes, POST as postCommune, DELETE as deleteCommune, scopeInventoryPayloadForTenant } from "@/app/api/inventory/communes/route";
import { GET as getTicketDetail } from "@/app/api/tickets/[id]/route";
import { GET as getTickets, POST as postTicket } from "@/app/api/tickets/route";
import { GET as getITSMSession, POST as exchangeITSMSession } from "@/app/api/auth/itsm/session/route";

const FORUM_SECRET = "forum-test-secret-that-is-at-least-32-characters";
const GEIMSER_SECRET = "geimser-test-secret-that-is-at-least-32-characters";
process.env.ITSM_BOT_FORUM_SESSION_SECRET = FORUM_SECRET;
process.env.ITSM_BOT_GEIMSER_SESSION_SECRET = GEIMSER_SECRET;

function assertion(overrides: Record<string, unknown> = {}, secret = FORUM_SECRET) {
  const now = 2_000_000_000;
  const payload = {
    v: 1,
    tenant: "forum",
    sub: "42",
    email: "user@forum.cl",
    name: "Forum User",
    roles: ["customer"],
    iat: now,
    exp: now + 120,
    jti: "0123456789abcdef0123456789abcdef",
    ...overrides,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", secret).update(encoded, "ascii").digest("base64url");
  return `${encoded}.${signature}`;
}

test("assertion is tenant-bound, time-bound and tamper-evident", () => {
  const identity = verifyITSMAssertion(assertion(), "forum", 2_000_000_000);
  assert.equal(identity.email, "user@forum.cl");
  assert.throws(() => verifyITSMAssertion(assertion(), "geimser", 2_000_000_000), ITSMAuthenticationError);
  assert.throws(() => verifyITSMAssertion(assertion({ exp: 1_999_999_000 }), "forum", 2_000_000_000), ITSMAuthenticationError);

  const [encoded, signature] = assertion().split(".");
  const tampered = `${encoded.slice(0, -1)}A.${signature}`;
  assert.throws(() => verifyITSMAssertion(tampered, "forum", 2_000_000_000), ITSMAuthenticationError);
});

test("bot session cannot be replayed on the other tenant", () => {
  const identity = verifyITSMAssertion(assertion(), "forum", 2_000_000_000);
  const session = createITSMSessionToken(identity, 2_000_000_000);
  assert.equal(verifyITSMSessionToken(session.token, "forum", 2_000_000_100).subject, "42");
  assert.throws(() => verifyITSMSessionToken(session.token, "geimser", 2_000_000_100), ITSMAuthenticationError);
});

test("authenticated demo smoke exchanges assertion, persists HttpOnly cookie and reaches agent API", async () => {
  const now = Math.floor(Date.now() / 1000);
  const exchange = await exchangeITSMSession(new Request("https://iabot.demoitsm.cl/api/auth/itsm/session", {
    method: "POST",
    headers: {
      Host: "iabot.demoitsm.cl",
      Origin: "https://iabot.demoitsm.cl",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ assertion: assertion({ roles: ["agent"], iat: now, exp: now + 120 }) }),
  }));
  assert.equal(exchange.status, 200);
  const setCookie = exchange.headers.get("set-cookie") ?? "";
  assert.match(setCookie, /atlas_itsm_session=/);
  assert.match(setCookie, /HttpOnly/i);
  assert.match(setCookie, /SameSite=None/i);
  assert.match(setCookie, /Secure/i);
  const cookie = setCookie.split(";", 1)[0];

  const session = await getITSMSession(new Request("https://iabot.demoitsm.cl/api/auth/itsm/session", {
    headers: { Host: "iabot.demoitsm.cl", Cookie: cookie },
  }));
  assert.equal(session.status, 200);
  assert.equal((await session.json()).user.email, "user@forum.cl");

  const operational = await getKpis(new Request("https://iabot.demoitsm.cl/api/kpis", {
    headers: { Host: "iabot.demoitsm.cl", Cookie: cookie },
  }));
  assert.equal(operational.status, 200);
  assert.match(operational.headers.get("cache-control") ?? "", /private, no-store/);
});

test("anonymous operational APIs reject before executing their handlers", async () => {
  const get = new Request("https://iabot.demoitsm.cl/api/test", { headers: { Host: "iabot.demoitsm.cl" } });
  const post = new Request("https://iabot.demoitsm.cl/api/test", {
    method: "POST",
    headers: { Host: "iabot.demoitsm.cl", Origin: "https://iabot.demoitsm.cl", "Content-Type": "application/json" },
    body: "{}",
  });
  const calls: Array<Promise<Response>> = [
    getAssets(get as never),
    getContactCenter(get),
    getKpis(get),
    getCommunes(get as never),
    getTickets(get),
    getTicketDetail(get, { params: Promise.resolve({ id: "ZAM-FORUM-1" }) }),
    collectHardware(post as never, { params: Promise.resolve({ assetId: "1" }) }),
    postChat(post),
    postFieldChat(post),
    postCommune(post as never),
    deleteCommune(new Request(post.url, { method: "DELETE", headers: post.headers, body: "{}" }) as never),
    postTicket(post),
  ];
  const responses = await Promise.all(calls);
  assert.deepEqual(responses.map(response => response.status), new Array(responses.length).fill(401));
});

test("customer session cannot access agent APIs and cross-origin mutation is rejected", async () => {
  const identity = verifyITSMAssertion(assertion(), "forum", 2_000_000_000);
  const session = createITSMSessionToken(identity, Math.floor(Date.now() / 1000));
  const cookie = `${ITSM_SESSION_COOKIE}=${session.token}`;

  const customerOnAgentApi = await withApiAuth(
    new Request("https://iabot.demoitsm.cl/api/kpis", { headers: { Host: "iabot.demoitsm.cl", Cookie: cookie } }),
    { roles: ["agent"] },
    () => Response.json({ leaked: true }),
  );
  assert.equal(customerOnAgentApi.status, 403);

  const crossOrigin = await withApiAuth(
    new Request("https://iabot.demoitsm.cl/api/chat", {
      method: "POST",
      headers: { Host: "iabot.demoitsm.cl", Cookie: cookie, Origin: "https://evil.example", "Content-Type": "application/json" },
      body: "{}",
    }),
    { roles: ["customer"] },
    () => Response.json({ mutated: true }),
  );
  assert.equal(crossOrigin.status, 403);
});

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

test("commune inventory removes foreign-tenant assets and assignments", () => {
  const scoped = scopeInventoryPayloadForTenant({
    communes: ["Santiago"],
    assets: [
      { id: 1, group: "Forum" },
      { id: 2, group: "Geimser" },
    ],
    assignments: [
      { asset: { id: 1, group: "Forum" } },
      { asset: { id: 2, group: "Geimser" } },
    ],
  }, forumTenant);
  assert.deepEqual(scoped.assets?.map(asset => asset.id), [1]);
  assert.deepEqual(scoped.assignments?.map(assignment => assignment.asset?.id), [1]);
});

test("ticket lookup requires both authenticated customer ownership and tenant group", async () => {
  const originalFetch = globalThis.fetch;
  let customerId = 42;
  let group = "TI Forum";
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.includes("/users/search")) {
      return Response.json([{ id: 42, email: "user@forum.cl", firstname: "Forum", lastname: "User", login: "user@forum.cl" }]);
    }
    if (url.includes("/tickets/search")) {
      return Response.json([{ id: 99, number: "87008", title: "Test", group_id: 1, state_id: 2, priority_id: 2, customer_id: customerId, created_at: "2026-08-20T00:00:00Z", updated_at: "2026-08-20T00:00:00Z" }]);
    }
    if (url.includes("/tickets/99")) {
      return Response.json({ id: 99, number: "87008", title: "Test", group_id: 1, group, state_id: 2, priority_id: 2, customer_id: customerId, created_at: "2026-08-20T00:00:00Z", updated_at: "2026-08-20T00:00:00Z" });
    }
    return new Response("not found", { status: 404 });
  };

  try {
    assert.ok(await findTicketByNumberForCustomer("87008", "user@forum.cl", forumTenant));
    customerId = 777;
    assert.equal(await findTicketByNumberForCustomer("87008", "user@forum.cl", forumTenant), null);
    customerId = 42;
    group = "Geimser Support";
    assert.equal(await findTicketByNumberForCustomer("87008", "user@forum.cl", forumTenant), null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
