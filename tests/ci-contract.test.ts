import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workflow = readFileSync(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");

test("main and pull requests run the complete bot release gate", () => {
  assert.match(workflow, /push:\s*\n\s*branches: \[main\]/);
  assert.match(workflow, /pull_request:\s*\n\s*branches: \[main\]/);
  for (const command of ["npm ci", "npm test", "npm run typecheck", "npm run lint", "npm run build"]) {
    assert.ok(workflow.includes(command), `missing ${command}`);
  }
});

test("Next tenant boundary uses the supported proxy convention", () => {
  const proxy = readFileSync(new URL("../src/proxy.ts", import.meta.url), "utf8");
  assert.match(proxy, /export function proxy\(request: NextRequest\)/);
  assert.ok(proxy.includes("getTenantByHost"));
  assert.ok(proxy.includes('matcher: ["/api/:path*"]'));
});
