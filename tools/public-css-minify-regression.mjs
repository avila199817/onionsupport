import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  PUBLIC_COMPATIBILITY_CSS,
  PUBLIC_CSS_POLICY,
  publicCompatibilityCssBytes,
  publicCssMinifyEnabled,
} from "./public-css-minify.mjs";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const policy = (minify) => JSON.stringify({ schema: "onionsupport.public-css-build-policy.v1", minify });

export function runPublicCssMinifyRegression() {
  const root = mkdtempSync(resolve(tmpdir(), "onion-public-css-policy-"));
  const path = resolve(root, PUBLIC_CSS_POLICY);
  mkdirSync(resolve(root, "src"));
  const source = Buffer.from(`/* source remains readable */
@layer tokens, auth;
@import url("./base.css") layer(tokens);
@layer auth {
  .hero { background-image: url("../media/portrait.webp"); --caption: "space preserved"; color: red; }
  .logo { background-image: url("/src/media/logo.webp"), url("data:image/svg+xml,<svg/>"); }
  .glass { -webkit-backdrop-filter: blur(18px) saturate(1.12); backdrop-filter: blur(18px) saturate(1.12); }
  @media (prefers-reduced-motion: reduce) { .hero { transition: none; } }
}
`);
  const cssPath = "src/css/views/public/index.css";
  try {
    assert.equal(publicCssMinifyEnabled(root), false);
    assert.equal(publicCompatibilityCssBytes(cssPath, source, publicCssMinifyEnabled(root)), source,
      "absence keeps compatibility bytes unchanged");
    writeFileSync(path, policy(false));
    assert.equal(publicCssMinifyEnabled(root), false);
    assert.equal(publicCompatibilityCssBytes(cssPath, source, publicCssMinifyEnabled(root)), source,
      "false is a byte-preserving rollback");
    writeFileSync(path, policy(true));
    assert.equal(publicCssMinifyEnabled(root), true);
    const compact = publicCompatibilityCssBytes(cssPath, source, true);
    assert.ok(compact.length < source.length);
    assert.ok(compact.equals(publicCompatibilityCssBytes(cssPath, source, true)), "deterministic output");
    assert.match(compact.toString(), /--caption:"space preserved"/, "quoted custom properties preserve whitespace");
    assert.match(compact.toString(), /prefers-reduced-motion:reduce/, "reduced-motion condition remains");
    assert.match(compact.toString(), /[;{]backdrop-filter:/, "standard backdrop-filter survives minification");
    assert.match(compact.toString(), /[;{]-webkit-backdrop-filter:/, "Safari backdrop-filter compatibility survives minification");
    assert.doesNotMatch(compact.toString(), /sourceMappingURL|__CSS_DEPENDENCY_/, "no maps or rewritten dependency placeholders");
    for (const name of ["src/css/app.css", "src/css/private.css", "src/css/views/home/index.css", "src/analytics/google-tag.js", "src/css/views/public/index.css?other", "../src/css/views/public/index.css"]) {
      assert.equal(publicCompatibilityCssBytes(name, source, true), source, `only the exact public allowlist transforms: ${name}`);
    }
    assert.throws(() => publicCompatibilityCssBytes(cssPath, Buffer.from(".hero[ { color: red; }"), true),
      "invalid CSS must fail instead of silently discarding declarations");

    for (const value of ["{", "null", "[]", "{}", policy("true"),
      '{"schema":"other","minify":true}',
      '{"schema":"onionsupport.public-css-build-policy.v1","minify":true,"files":["private.css"]}',
      "globalThis.__onionCssPolicyExecuted = true"]) {
      writeFileSync(path, value);
      assert.throws(() => publicCssMinifyEnabled(root), `invalid candidate policy: ${value}`);
    }
    assert.equal(globalThis.__onionCssPolicyExecuted, undefined);
    writeFileSync(path, " ".repeat(1025));
    assert.throws(() => publicCssMinifyEnabled(root), /regular JSON/);
    rmSync(path);
    mkdirSync(path);
    assert.throws(() => publicCssMinifyEnabled(root), /regular JSON/);
    rmSync(path, { recursive: true });
    const target = resolve(root, "policy.json");
    writeFileSync(target, policy(true));
    symlinkSync(target, path);
    assert.throws(() => publicCssMinifyEnabled(root), /regular JSON/);
    rmSync(target);
    assert.throws(() => publicCssMinifyEnabled(root), /regular JSON/, "dangling policy symlinks fail closed");
    rmSync(resolve(root, "src"), { recursive: true });
    mkdirSync(resolve(root, "other"));
    symlinkSync(resolve(root, "other"), resolve(root, "src"));
    assert.throws(() => publicCssMinifyEnabled(root), /real source tree/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }

  // Parse both representations, ignoring formatting/source locations, to check
  // exact asset URLs, cascade layer order and backdrop-filter declarations on
  // the real allowlisted sources. Standard declarations must follow manual
  // prefixed fallbacks: the pinned minifier otherwise keeps only the prefix.
  const { transform } = createRequire(import.meta.resolve("vite/package.json"))("lightningcss");
  function paintBoundaries(code) {
    const result = { layers: [], urls: [], backdropFilters: [] };
    transform({ filename: cssPath, code, visitor: {
      Rule(rule) {
        if (rule.type === "layer-statement") result.layers.push([rule.type, rule.value.names]);
        if (rule.type === "layer-block") result.layers.push([rule.type, rule.value.name]);
        if (rule.type === "import") {
          result.layers.push([rule.type, rule.value.layer]);
          result.urls.push(rule.value.url);
        }
      },
      Url(url) { result.urls.push(url.url); },
      Declaration(declaration) {
        if (declaration.property === "backdrop-filter" && declaration.vendorPrefix.length === 0) {
          result.backdropFilters.push(declaration.value);
        }
      },
    } });
    return result;
  }
  for (const [name, original] of [
    [cssPath, source],
    ...PUBLIC_COMPATIBILITY_CSS.map((name) => [name, readFileSync(resolve(ROOT, name))]),
  ]) {
    const emitted = publicCompatibilityCssBytes(name, original, true);
    assert.ok(emitted.length < original.length, `${name}: production minifier removes source overhead`);
    assert.deepEqual(paintBoundaries(emitted), paintBoundaries(original), `${name}: asset references, cascade order and backdrop filters are unchanged`);
    assert.equal(publicCompatibilityCssBytes(name, original, false), original, `${name}: inactive tooling is byte-exact`);
  }
  console.log("Public CSS minify regression: PASS · inactive/rollback bytes · strict policy/symlinks · finite allowlist · deterministic transform · URLs/layers/reduced motion/backdrop filters");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) runPublicCssMinifyRegression();
