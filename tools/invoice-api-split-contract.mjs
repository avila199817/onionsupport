import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import { INVOICE_SPLIT_POLICY, invoiceApiSplitEnabled, invoiceApiSplitOutput } from "./invoice-api-split.mjs";

function fixture(run) {
  const root = mkdtempSync(resolve(tmpdir(), "onion-invoice-split-policy-"));
  mkdirSync(resolve(root, "src"));
  try { return run(root, resolve(root, INVOICE_SPLIT_POLICY)); }
  finally { rmSync(root, { recursive: true, force: true }); }
}
const policy = (enabled) => JSON.stringify({ schema: "onionsupport.build-policy.v1", invoiceApiSplit: enabled });

test("absent policy preserves the previous output configuration", () => fixture((root) => {
  assert.equal(invoiceApiSplitEnabled(root), false);
  assert.deepEqual(invoiceApiSplitOutput(root), {});
}));

test("explicit false is a data-only rollback without altered chunk options", () => fixture((root, file) => {
  writeFileSync(file, policy(false));
  assert.deepEqual(invoiceApiSplitOutput(root), {});
}));

test("enabled policy groups only the five invoice API files, without dependencies", () => fixture((root, file) => {
  writeFileSync(file, policy(true));
  const output = invoiceApiSplitOutput(root);
  assert.deepEqual(Object.keys(output), ["codeSplitting"]);
  assert.equal(output.codeSplitting.groups.length, 1);
  const group = output.codeSplitting.groups[0];
  assert.equal(group.name, "invoice-api");
  assert.equal(group.priority, 100);
  assert.equal(group.includeDependenciesRecursively, false);
  for (const name of ["facturas.api.js", "facturas.api.canonical.js", "facturas.api.alias-core.js", "facturas.api.boundary.js", "facturas.api.base.js"]) {
    assert.ok(group.test.test(`/checkout/src/views/facturas/${name}`), name);
  }
  for (const name of ["\0rolldown/runtime.js", "/checkout/src/core/http.js", "/checkout/src/core/auth.js", "/checkout/src/views/facturas/index.js", "/checkout/src/views/facturas/facturas.api.json", "/checkout/src/views/facturas/facturas.apis.js"]) {
    assert.equal(group.test.test(name), false, name);
  }
}));

test("malformed or unknown candidate data fails closed, never executes code", () => fixture((root, file) => {
  for (const value of ["{", "null", "[]", "{}", policy("true"), '{"schema":"other","invoiceApiSplit":true}', '{"schema":"onionsupport.build-policy.v1","invoiceApiSplit":true,"extra":1}', "globalThis.__onionPolicyExecuted = true"]) {
    writeFileSync(file, value);
    assert.throws(() => invoiceApiSplitOutput(root));
  }
  assert.equal(globalThis.__onionPolicyExecuted, undefined);
}));

test("oversized or directory policy is rejected", () => fixture((root, file) => {
  writeFileSync(file, " ".repeat(1025));
  assert.throws(() => invoiceApiSplitOutput(root), /regular JSON/);
  rmSync(file);
  mkdirSync(file);
  assert.throws(() => invoiceApiSplitOutput(root), /regular JSON/);
}));

test("policy symlinks, including dangling links, are rejected", () => fixture((root, file) => {
  const target = resolve(root, "policy.json");
  writeFileSync(target, policy(true));
  symlinkSync(target, file);
  assert.throws(() => invoiceApiSplitOutput(root), /regular JSON/);
  rmSync(target);
  assert.throws(() => invoiceApiSplitOutput(root), /regular JSON/);
}));

test("a symlinked source directory is not a policy input", () => fixture((root, file) => {
  rmSync(resolve(root, "src"), { recursive: true });
  mkdirSync(resolve(root, "other"));
  writeFileSync(resolve(root, "other/build-policy.json"), policy(true));
  symlinkSync(resolve(root, "other"), resolve(root, "src"));
  assert.throws(() => invoiceApiSplitOutput(root), /real source tree/);
  rmSync(resolve(root, "other/build-policy.json"));
  assert.throws(() => invoiceApiSplitOutput(root), /real source tree/);
  rmSync(resolve(root, "other"), { recursive: true });
  assert.throws(() => invoiceApiSplitOutput(root), /real source tree/);
}));
