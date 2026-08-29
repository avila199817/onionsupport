import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const SCHEMA = "onionsupport.production-availability.v1";
const DEFAULT_BASE_URL = "https://onionsupport.com";
const PAGE_PATHS = Object.freeze(["/", "/login"]);
const ALWAYS_CHECK = Object.freeze([
  { path: "/favicon.ico", kind: "image", source: "baseline" },
  { path: "/site.webmanifest", kind: "manifest", source: "baseline" },
]);
const SELECTED_HEADERS = Object.freeze([
  "date",
  "server",
  "age",
  "via",
  "retry-after",
  "x-azure-ref",
  "x-ms-request-id",
  "x-msedge-ref",
  "x-cache",
  "x-cache-info",
  "x-served-by",
]);
const TRANSIENT_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);
const MAX_DISCOVERED_RESOURCES = 120;
const USER_AGENT = "OnionSupport-Production-Availability/1.0";

function integerEnv(name, fallback, { min, max }) {
  const raw = String(process.env[name] ?? "").trim();
  if (!raw) return fallback;
  const value = Number.parseInt(raw, 10);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}.`);
  }
  return value;
}

function safeText(value, limit = 500) {
  return String(value ?? "")
    .replace(/[\r\n\t]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, limit);
}

function safeBaseUrl(raw) {
  const value = String(raw || DEFAULT_BASE_URL).trim();
  const url = new URL(value.includes("://") ? value : `https://${value}`);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error(`Unsafe PUBLIC_SITE_URL: ${url.href}`);
  }
  return url;
}

function parseAttributes(tag) {
  const attributes = new Map();
  const pattern = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/gu;
  for (const match of tag.matchAll(pattern)) {
    const name = String(match[1] || "").toLowerCase();
    if (!name || name === "link" || name === "script" || name === "img" || name === "source") {
      continue;
    }
    attributes.set(name, match[2] ?? match[3] ?? match[4] ?? "");
  }
  return attributes;
}

function kindForLink(attributes, url) {
  const rel = new Set(
    String(attributes.get("rel") || "")
      .toLowerCase()
      .split(/\s+/u)
      .filter(Boolean)
  );
  const as = String(attributes.get("as") || "").toLowerCase();

  if (rel.has("stylesheet")) return "stylesheet";
  if (rel.has("modulepreload")) return "script";
  if (rel.has("manifest")) return "manifest";
  if (rel.has("icon") || rel.has("apple-touch-icon")) return "image";
  if (rel.has("preload")) {
    if (as === "style") return "stylesheet";
    if (as === "script") return "script";
    if (as === "font") return "font";
    if (as === "image") return "image";
    return "resource";
  }

  const pathname = url.pathname.toLowerCase();
  if (pathname.endsWith(".css")) return "stylesheet";
  if (pathname.endsWith(".js") || pathname.endsWith(".mjs")) return "script";
  return null;
}

function resolveSameOrigin(raw, documentUrl, base) {
  const value = String(raw || "").trim();
  if (!value || value.startsWith("data:") || value.startsWith("blob:") || value.startsWith("javascript:")) {
    return null;
  }

  try {
    const url = new URL(value, documentUrl);
    if (url.origin !== base.origin || url.username || url.password) return null;
    url.hash = "";
    return url;
  } catch {
    return null;
  }
}

function srcsetCandidates(value) {
  return String(value || "")
    .split(",")
    .map((candidate) => candidate.trim().split(/\s+/u)[0])
    .filter(Boolean);
}

function discoverResources(html, documentUrl, base) {
  const resources = [];

  for (const match of html.matchAll(/<link\b[^>]*>/giu)) {
    const attributes = parseAttributes(match[0]);
    const url = resolveSameOrigin(attributes.get("href"), documentUrl, base);
    if (!url) continue;
    const kind = kindForLink(attributes, url);
    if (kind) resources.push({ url, kind, source: documentUrl.pathname });
  }

  for (const match of html.matchAll(/<script\b[^>]*>/giu)) {
    const attributes = parseAttributes(match[0]);
    const url = resolveSameOrigin(attributes.get("src"), documentUrl, base);
    if (url) resources.push({ url, kind: "script", source: documentUrl.pathname });
  }

  for (const match of html.matchAll(/<img\b[^>]*>/giu)) {
    const attributes = parseAttributes(match[0]);
    const url = resolveSameOrigin(attributes.get("src"), documentUrl, base);
    if (url) resources.push({ url, kind: "image", source: documentUrl.pathname });
  }

  for (const match of html.matchAll(/<source\b[^>]*>/giu)) {
    const attributes = parseAttributes(match[0]);
    for (const candidate of srcsetCandidates(attributes.get("srcset"))) {
      const url = resolveSameOrigin(candidate, documentUrl, base);
      if (url) resources.push({ url, kind: "image", source: documentUrl.pathname });
    }
  }

  return resources;
}

function expectedMime(kind, contentType) {
  if (!contentType) return false;
  if (kind === "document") return contentType === "text/html";
  if (kind === "stylesheet") return contentType === "text/css";
  if (kind === "script") {
    return contentType === "application/javascript" || contentType === "text/javascript";
  }
  if (kind === "manifest") {
    return contentType === "application/manifest+json" || contentType === "application/json";
  }
  if (kind === "image") return contentType.startsWith("image/");
  if (kind === "font") {
    return contentType.startsWith("font/") || contentType === "application/font-woff";
  }
  return true;
}

function selectedHeaders(headers) {
  const values = {};
  for (const name of SELECTED_HEADERS) {
    const value = safeText(headers.get(name), 240);
    if (value) values[name] = value;
  }
  return values;
}

function targetPath(url) {
  return `${url.pathname}${url.search}`;
}

function probeUrl(target, round, requestIndex) {
  const url = new URL(target.href);
  url.searchParams.set(
    "onion_availability_probe",
    `${Date.now()}-${process.pid}-${round}-${requestIndex}`
  );
  return url;
}

async function fetchTarget({ target, kind, source, round, requestIndex, timeoutMs, captureBody = false }) {
  const requested = probeUrl(target, round, requestIndex);
  const startedAt = Date.now();

  try {
    const response = await fetch(requested, {
      redirect: "manual",
      headers: {
        "Accept-Encoding": "identity",
        "Cache-Control": "no-cache",
        "Pragma": "no-cache",
        "User-Agent": USER_AGENT,
      },
      signal: AbortSignal.timeout(timeoutMs),
    });

    const bytes = Buffer.from(await response.arrayBuffer());
    const contentType = String(response.headers.get("content-type") || "")
      .split(";", 1)[0]
      .trim()
      .toLowerCase();
    const statusOk = response.status >= 200 && response.status < 300;
    const mimeOk = expectedMime(kind, contentType);
    const ok = statusOk && mimeOk;

    return {
      path: targetPath(target),
      kind,
      source,
      ok,
      status: response.status,
      transient: TRANSIENT_STATUS.has(response.status),
      contentType,
      bytes: bytes.byteLength,
      durationMs: Date.now() - startedAt,
      headers: selectedHeaders(response.headers),
      error: ok
        ? ""
        : !statusOk
          ? `HTTP ${response.status}`
          : `Unexpected Content-Type ${contentType || "<missing>"}`,
      bodyText: captureBody && statusOk ? bytes.toString("utf8") : "",
    };
  } catch (error) {
    return {
      path: targetPath(target),
      kind,
      source,
      ok: false,
      status: null,
      transient: true,
      contentType: "",
      bytes: 0,
      durationMs: Date.now() - startedAt,
      headers: {},
      error: safeText(error?.message || error || "Network error"),
      bodyText: "",
    };
  }
}

async function mapLimit(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;

  async function run() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index], index);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length || 1) }, () => run()));
  return results;
}

function syntheticFailure(path, source, message) {
  return {
    path,
    kind: "contract",
    source,
    ok: false,
    status: null,
    transient: false,
    contentType: "",
    bytes: 0,
    durationMs: 0,
    headers: {},
    error: message,
  };
}

async function runRound({ base, round, timeoutMs, concurrency }) {
  let requestIndex = 0;
  const documents = await Promise.all(
    PAGE_PATHS.map((path) => fetchTarget({
      target: new URL(path, base),
      kind: "document",
      source: "page",
      round,
      requestIndex: requestIndex++,
      timeoutMs,
      captureBody: true,
    }))
  );

  const descriptorMap = new Map();
  const contractFailures = [];

  function addDescriptor({ url, kind, source }) {
    const key = `${url.pathname}${url.search}`;
    if (!descriptorMap.has(key)) descriptorMap.set(key, { target: url, kind, source });
  }

  for (const item of ALWAYS_CHECK) {
    addDescriptor({
      url: new URL(item.path, base),
      kind: item.kind,
      source: item.source,
    });
  }

  for (const documentResult of documents) {
    if (!documentResult.ok || !documentResult.bodyText) continue;
    const documentUrl = new URL(documentResult.path, base);
    const discovered = discoverResources(documentResult.bodyText, documentUrl, base);
    const kinds = new Set(discovered.map((entry) => entry.kind));

    if (!kinds.has("stylesheet")) {
      contractFailures.push(
        syntheticFailure(documentResult.path, documentResult.path, "No local stylesheet discovered in document")
      );
    }
    if (!kinds.has("script")) {
      contractFailures.push(
        syntheticFailure(documentResult.path, documentResult.path, "No local script or modulepreload discovered in document")
      );
    }

    for (const resource of discovered) addDescriptor(resource);
  }

  const descriptors = [...descriptorMap.values()];
  if (descriptors.length > MAX_DISCOVERED_RESOURCES) {
    contractFailures.push(
      syntheticFailure(
        "/",
        "discovery",
        `Discovered ${descriptors.length} resources; limit is ${MAX_DISCOVERED_RESOURCES}`
      )
    );
  }

  const resourceResults = await mapLimit(
    descriptors.slice(0, MAX_DISCOVERED_RESOURCES),
    concurrency,
    (descriptor) => fetchTarget({
      ...descriptor,
      round,
      requestIndex: requestIndex++,
      timeoutMs,
    })
  );

  const checks = [
    ...documents.map(({ bodyText: _bodyText, ...result }) => result),
    ...contractFailures,
    ...resourceResults,
  ];
  const failures = checks.filter((result) => !result.ok);

  return {
    round,
    checkedAt: new Date().toISOString(),
    ok: failures.length === 0,
    checks: checks.length,
    documents: documents.length,
    resources: resourceResults.length,
    failures,
  };
}

function countFailureStatuses(rounds) {
  const counts = {};
  for (const round of rounds) {
    for (const failure of round.failures) {
      const key = failure.status === null ? "network-or-contract" : String(failure.status);
      counts[key] = (counts[key] || 0) + 1;
    }
  }
  return counts;
}

function markdownSummary(report) {
  const lines = [
    "### Production availability",
    "",
    `- Status: **${report.status}**`,
    `- Successful rounds: **${report.successRounds}/${report.roundCount}**`,
    `- Required successful rounds: **${report.minimumSuccessRounds}**`,
    `- Persistent HTTP 503: **${report.persistent503 ? "yes" : "no"}**`,
    `- Checked: \`${report.checkedAt}\``,
  ];

  const failures = report.rounds.flatMap((round) =>
    round.failures.map((failure) => ({ ...failure, round: round.round }))
  );

  if (failures.length) {
    lines.push("", "| Round | Path | Status | Error | Azure ref |", "|---:|---|---:|---|---|");
    for (const failure of failures.slice(0, 20)) {
      lines.push(
        `| ${failure.round} | \`${failure.path}\` | ${failure.status ?? "—"} | ${safeText(failure.error, 120)} | ${safeText(failure.headers?.["x-azure-ref"] || failure.headers?.["x-msedge-ref"] || "", 80) || "—"} |`
      );
    }
  }

  return `${lines.join("\n")}\n`;
}

const base = safeBaseUrl(process.env.PUBLIC_SITE_URL || DEFAULT_BASE_URL);
const roundCount = integerEnv("PROBE_ROUNDS", 3, { min: 1, max: 6 });
const minimumSuccessRounds = integerEnv("PROBE_MIN_SUCCESS_ROUNDS", 2, {
  min: 1,
  max: roundCount,
});
const delayMs = integerEnv("PROBE_DELAY_MS", 15_000, { min: 0, max: 120_000 });
const timeoutMs = integerEnv("PROBE_TIMEOUT_MS", 30_000, { min: 1_000, max: 120_000 });
const concurrency = integerEnv("PROBE_CONCURRENCY", 8, { min: 1, max: 20 });
const outputPath = resolve(
  String(process.env.PROBE_OUTPUT || "production-availability-report.json").trim()
);
const releaseSha = safeText(process.env.PROBE_EXPECTED_SHA || process.env.GITHUB_SHA || "", 64);

const rounds = [];
for (let round = 1; round <= roundCount; round += 1) {
  const result = await runRound({ base, round, timeoutMs, concurrency });
  rounds.push(result);
  console.log(
    `Availability round ${round}/${roundCount}: ${result.ok ? "PASS" : "FAIL"} · ` +
    `${result.checks} checks · ${result.failures.length} failures`
  );
  if (round < roundCount && delayMs > 0) await delay(delayMs);
}

const successRounds = rounds.filter((round) => round.ok).length;
const status = successRounds >= minimumSuccessRounds
  ? "healthy"
  : successRounds === 0
    ? "unavailable"
    : "degraded";
const persistent503 = rounds.every((round) =>
  round.failures.some((failure) => failure.status === 503)
);

const report = {
  schema: SCHEMA,
  checkedAt: new Date().toISOString(),
  baseUrl: base.origin,
  releaseSha,
  status,
  roundCount,
  successRounds,
  minimumSuccessRounds,
  persistent503,
  failureStatusCounts: countFailureStatuses(rounds),
  rounds,
};

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

const summary = markdownSummary(report);
console.log(summary);
if (process.env.GITHUB_STEP_SUMMARY) {
  await appendFile(process.env.GITHUB_STEP_SUMMARY, summary, "utf8");
}

process.exitCode = status === "healthy" ? 0 : 1;
