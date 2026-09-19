import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const logoPath = fileURLToPath(
  new URL("../dist/src/media/img/favicon_support.png", import.meta.url)
);
const logo = readFileSync(logoPath);
const EXPECTED_SHA256 = "40192153e7c1f6a4e2a50cd028f37ba3e7a7be1c2c6e70cc7fa69af6c51bf88f";

assert.ok(
  logo.length >= 1024,
  "el PNG público de correo no puede estar vacío o truncado"
);
assert.deepEqual(
  Array.from(logo.subarray(0, 8)),
  [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  "favicon_support.png debe conservar una firma PNG válida"
);
assert.equal(
  createHash("sha256").update(logo).digest("hex"),
  EXPECTED_SHA256,
  "favicon_support.png debe conservar exactamente el PNG oficial de correo"
);

console.log(
  "Mail logo dist: PASS · /src/media/img/favicon_support.png se publica como PNG compatible"
);
