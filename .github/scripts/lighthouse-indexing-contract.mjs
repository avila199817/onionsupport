import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

function isLoginUrl(value) {
  try {
    const url = new URL(value);
    return url.origin === "https://onionsupport.com" &&
      /^\/login\/?$/u.test(url.pathname);
  } catch {
    return false;
  }
}

function hasNoindexFollow(value = "") {
  const directives = value.toLowerCase().split(",").map((part) => part.trim());
  return directives.length === 2 &&
    directives.includes("noindex") && directives.includes("follow");
}

// LHCI supports minScore, but cannot assert an exact zero score. Validate the
// intentional exclusion directly, including its HTTP and HTML evidence, for
// every login sample instead of accepting an indexable page with minScore: 0.
export function validateLoginIndexingReport(lhr) {
  if (!isLoginUrl(lhr.requestedUrl) && !isLoginUrl(lhr.finalUrl)) return false;

  assert.ok(isLoginUrl(lhr.requestedUrl) && isLoginUrl(lhr.finalUrl),
    "/login debe conservar su URL durante la auditoría");
  assert.ok(!lhr.runtimeError, "/login: Lighthouse no debe tener errores de ejecución");

  const audit = lhr.audits?.["is-crawlable"];
  assert.equal(audit?.score, 0, "/login debe estar excluido de indexación (is-crawlable=0)");
  const sources = (audit.details?.items || []).map((item) => item.source);

  const isNoindexMeta = (source) => {
    if (source?.type !== "node") return false;
    const snippet = source.snippet || "";
    const name = snippet.match(/\bname=["']([^"']+)["']/iu)?.[1];
    const content = snippet.match(/\bcontent=["']([^"']+)["']/iu)?.[1];
    return name?.toLowerCase() === "robots" && hasNoindexFollow(content);
  };

  const isNoindexHeader = (source) => {
    if (typeof source !== "string") return false;
    const value = source.match(/^x-robots-tag:\s*(.*)$/iu)?.[1];
    return hasNoindexFollow(value);
  };

  assert.ok(sources.some(isNoindexMeta),
    "/login: falta evidencia HTML de robots noindex, follow");
  assert.ok(sources.some(isNoindexHeader),
    "/login: falta evidencia HTTP de X-Robots-Tag: noindex, follow");
  assert.ok(sources.every((source) => isNoindexMeta(source) || isNoindexHeader(source)),
    "/login: no se permiten bloqueos robots.txt ni directivas contradictorias");
  return true;
}

function jsonFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) return jsonFiles(absolute);
    return entry.isFile() && entry.name.endsWith(".json") ? [absolute] : [];
  });
}

export function validateLoginIndexingResults(resultsRoot, expectedSamples = 5) {
  assert.ok(Number.isInteger(expectedSamples) && expectedSamples >= 1 && expectedSamples <= 20,
    "LIGHTHOUSE_EXPECTED_SAMPLES debe estar entre 1 y 20");
  const samples = new Set();

  for (const file of jsonFiles(resultsRoot)) {
    const lhr = JSON.parse(fs.readFileSync(file, "utf8"));
    if (!validateLoginIndexingReport(lhr)) continue;
    assert.ok(lhr.fetchTime && lhr.lighthouseVersion,
      "/login: falta identidad de la muestra Lighthouse");
    // Validate every copy before deduplicating artifact/manifest copies.
    samples.add([lhr.fetchTime, lhr.requestedUrl, lhr.finalUrl, lhr.lighthouseVersion].join("|"));
  }

  assert.equal(samples.size, expectedSamples,
    "/login: número inesperado de muestras únicas con noindex verificado");
  return samples.size;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const resultsRoot = path.resolve(process.argv[2] || ".lighthouseci");
  const expectedSamples = Number(process.env.LIGHTHOUSE_EXPECTED_SAMPLES || "5");
  const samples = validateLoginIndexingResults(resultsRoot, expectedSamples);
  console.log(`Lighthouse indexing contract OK · /login · ${samples} unique samples · HTML + HTTP noindex, follow`);
}
