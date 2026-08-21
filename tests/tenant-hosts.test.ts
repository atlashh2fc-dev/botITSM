import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  ClientTenantResolutionError,
  getClientTenant,
  resolveClientTenant,
} from "../src/lib/tenant/client";
import {
  normalizeTenantHost,
  resolveBuiltInTenantIdByHost,
} from "../src/lib/tenant/hosts";
import { getTenantByHost } from "../src/lib/tenant/server";

test("official and previously installed Forum desktop hosts remain Forum", () => {
  for (const host of [
    "iabot.demoitsm.cl",
    "iabot.mda.demoitsm.cl",
    "iabot.atlasitsm.geimser.cl",
  ]) {
    assert.equal(resolveBuiltInTenantIdByHost(host), "forum", host);
    assert.equal(resolveClientTenant(host)?.id, "forum", host);
    assert.equal(getTenantByHost(host)?.id, "forum", host);
  }
});

test("Geimser host remains isolated from Forum aliases", () => {
  assert.equal(resolveBuiltInTenantIdByHost("iabot.geimser.cl"), "geimser");
  assert.equal(resolveClientTenant("iabot.geimser.cl")?.id, "geimser");
  assert.equal(getTenantByHost("iabot.geimser.cl")?.id, "geimser");
});

test("unknown hosts never fall back to Geimser", () => {
  assert.equal(resolveBuiltInTenantIdByHost("unknown.example"), null);
  assert.equal(resolveClientTenant("unknown.example"), null);
  assert.equal(getTenantByHost("unknown.example"), null);
});

test("server tenant hint keeps Forum branding stable before hydration", () => {
  assert.equal(getClientTenant("forum").id, "forum");
});

test("browser resolution throws instead of branding an unknown host as Geimser", () => {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { location: { hostname: "unknown.example" } },
  });

  try {
    assert.throws(() => getClientTenant(), ClientTenantResolutionError);
  } finally {
    if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow);
    else delete (globalThis as { window?: unknown }).window;
  }
});

test("host normalization handles proxy lists, case, ports and trailing dots", () => {
  assert.equal(normalizeTenantHost(" IABOT.DEMOITSM.CL.:443, proxy.internal "), "iabot.demoitsm.cl");
  assert.equal(getTenantByHost(" IABOT.DEMOITSM.CL.:443, proxy.internal ")?.id, "forum");
});

test("configured hosts extend built-ins instead of disabling desktop aliases", () => {
  const previous = process.env.TENANT_FORUM_HOSTS;
  process.env.TENANT_FORUM_HOSTS = "staging-forum.example";

  try {
    assert.equal(getTenantByHost("staging-forum.example")?.id, "forum");
    assert.equal(getTenantByHost("iabot.mda.demoitsm.cl")?.id, "forum");
  } finally {
    if (previous === undefined) delete process.env.TENANT_FORUM_HOSTS;
    else process.env.TENANT_FORUM_HOSTS = previous;
  }
});

test("conflicting tenant configuration fails closed", () => {
  const previousGeimser = process.env.TENANT_GEIMSER_HOSTS;
  const previousForum = process.env.TENANT_FORUM_HOSTS;
  process.env.TENANT_GEIMSER_HOSTS = "shared.example";
  process.env.TENANT_FORUM_HOSTS = "shared.example";

  try {
    assert.equal(getTenantByHost("shared.example"), null);
  } finally {
    if (previousGeimser === undefined) delete process.env.TENANT_GEIMSER_HOSTS;
    else process.env.TENANT_GEIMSER_HOSTS = previousGeimser;
    if (previousForum === undefined) delete process.env.TENANT_FORUM_HOSTS;
    else process.env.TENANT_FORUM_HOSTS = previousForum;
  }
});

test("Electron trusts every built-in Forum bot origin", () => {
  const desktopMain = fs.readFileSync(path.join(process.cwd(), "desktop/main.cjs"), "utf8");
  for (const origin of [
    "https://iabot.demoitsm.cl",
    "https://iabot.mda.demoitsm.cl",
    "https://iabot.atlasitsm.geimser.cl",
  ]) {
    assert.match(desktopMain, new RegExp(origin.replaceAll(".", "\\.")));
  }
});
