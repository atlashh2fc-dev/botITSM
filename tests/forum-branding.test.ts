import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(relativePath: string) {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

test("Forum portal derives visible desktop branding from the resolved tenant", () => {
  const portal = source("src/components/portal/SupportPortal.tsx");

  assert.match(portal, /const supportBrand = tenantId === "forum" \? "Forum" : "SONDA"/);
  assert.match(portal, /Mesa de Ayuda \{supportBrand\}/);
  assert.match(portal, /\{supportBrand\}-MacBook/);
  assert.doesNotMatch(portal, /Mesa de Ayuda SONDA/);
  assert.doesNotMatch(portal, /SONDA-MacBook/);
});

test("Forum operational views keep branding tenant-aware", () => {
  const admin = source("src/components/admin/AdminDashboard.tsx");
  const field = source("src/components/field/TecnicoCopilot.tsx");

  assert.match(admin, /tenantName=\{tenant\.id === "forum" \? "Forum" : "SONDA"\}/);
  assert.match(admin, /\$\{tenantName\} Centro de Operaciones/);
  assert.doesNotMatch(admin, /SONDA Centro de Operaciones/);

  assert.match(field, /const brandName = getClientTenant\(tenantId\)\.id === "forum" \? "Forum" : "SONDA"/);
  assert.match(field, /Copiloto T[eé]cnico \$\{brandName\}/);
  assert.match(field, /Base de Conocimiento \{brandName\} activa/);
});
