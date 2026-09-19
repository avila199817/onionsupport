import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const logoPath = fileURLToPath(
  new URL("../dist/src/media/img/favicon_support.png", import.meta.url)
);
const logo = readFileSync(logoPath);

assert.ok(
  logo.length >= 1024,
  "el PNG público de correo no puede estar vacío o truncado"
);
assert.deepEqual(
  Array.from(logo.subarray(0, 8)),
  [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  "favicon_support.png debe conservar una firma PNG válida"
);

console.log(
  "Mail logo dist: PASS · /src/media/img/favicon_support.png se publica como PNG compatible"
);
