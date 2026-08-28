import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const path = "src/views/public/login/template.js";
const source = await readFile(path, "utf8");

const logoWrap = source.match(
  /<div\s+class="login-card-logo-wrap"(?<attributes>[^>]*)>/
);

assert.ok(
  logoWrap,
  `${path} must retain the login-card-logo-wrap visual anchor`
);
assert.doesNotMatch(
  logoWrap.groups?.attributes || "",
  /\baria-(?:label|labelledby)\s*=/i,
  "decorative generic logo wrapper must not use a prohibited accessible name"
);
assert.match(
  source,
  /function renderLogo\([\s\S]*?<span class="\$\{escapeAttr\(shellClass\)\}" aria-hidden="true">[\s\S]*?alt=""/,
  "the card logo must remain decorative after removing its prohibited ARIA label"
);
assert.match(
  source,
  /class="login-card-panel login-card-panel--portal"[\s\S]*?aria-labelledby="login-panel-title"/,
  "the login panel must retain its accessible name after the decorative label is removed"
);
assert.match(
  source,
  /class="login-card-title"[\s\S]*?id="login-panel-title"/,
  "the login panel heading must retain the aria-labelledby target"
);

console.log(
  "Login accessibility contract: PASS · decorative logo wrapper has no prohibited ARIA name"
);
