import fs from "node:fs";
import path from "node:path";

const [resultsPathArg = "", profileArg = "", releaseShaArg = ""] =
  process.argv.slice(2);

const resultsRoot = path.resolve(resultsPathArg || ".lighthouseci");
const profile = String(profileArg || "unknown").trim() || "unknown";
const releaseSha = String(releaseShaArg || "").trim();

function walk(directory) {
  const files = [];

  for (const entry of fs.readdirSync(directory, {
    withFileTypes: true,
  })) {
    const absolute = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...walk(absolute));
      continue;
    }

    if (entry.isFile() && entry.name.endsWith(".json")) {
      files.push(absolute);
    }
  }

  return files;
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function median(values = []) {
  const sorted = values
    .map(number)
    .filter((value) => value !== null)
    .sort((left, right) => left - right);

  if (!sorted.length) return null;

  const middle = Math.floor(sorted.length / 2);

  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function maximum(values = []) {
  const clean = values
    .map(number)
    .filter((value) => value !== null);

  return clean.length ? Math.max(...clean) : null;
}

function minimum(values = []) {
  const clean = values
    .map(number)
    .filter((value) => value !== null);

  return clean.length ? Math.min(...clean) : null;
}

function categoryScore(lhr, name) {
  const score = number(lhr?.categories?.[name]?.score);
  return score === null ? null : score * 100;
}

function auditValue(lhr, name) {
  return number(lhr?.audits?.[name]?.numericValue);
}

function formatScore(value) {
  return value === null ? "—" : String(Math.round(value));
}

function formatMs(value) {
  return value === null
    ? "—"
    : `${Math.round(value).toLocaleString("en-US")} ms`;
}

function formatCls(value) {
  return value === null ? "—" : value.toFixed(3);
}

if (!fs.existsSync(resultsRoot)) {
  throw new Error(
    `Lighthouse results path does not exist: ${resultsRoot}`
  );
}

const reports = [];

for (const file of walk(resultsRoot)) {
  let parsed;

  try {
    parsed = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    continue;
  }

  if (
    !parsed ||
    typeof parsed !== "object" ||
    !parsed.categories?.performance ||
    !parsed.audits
  ) {
    continue;
  }

  reports.push({
    file: path.relative(resultsRoot, file),
    url:
      parsed.finalDisplayedUrl ||
      parsed.finalUrl ||
      parsed.requestedUrl ||
      "unknown",
    performance: categoryScore(parsed, "performance"),
    accessibility: categoryScore(parsed, "accessibility"),
    bestPractices: categoryScore(parsed, "best-practices"),
    seo: categoryScore(parsed, "seo"),
    fcp: auditValue(parsed, "first-contentful-paint"),
    lcp: auditValue(parsed, "largest-contentful-paint"),
    cls: auditValue(parsed, "cumulative-layout-shift"),
    tbt: auditValue(parsed, "total-blocking-time"),
  });
}

if (!reports.length) {
  throw new Error(
    `No Lighthouse result JSON was found under ${resultsRoot}`
  );
}

const grouped = new Map();

for (const report of reports) {
  let key = report.url;

  try {
    const url = new URL(report.url);
    key = `${url.origin}${url.pathname}`;
  } catch {
    // Keep the raw value for malformed/non-standard URLs.
  }

  const bucket = grouped.get(key) || [];
  bucket.push(report);
  grouped.set(key, bucket);
}

const rows = [];

for (const [url, samples] of [...grouped.entries()].sort()) {
  rows.push({
    url,
    samples: samples.length,
    performanceMedian: median(
      samples.map((sample) => sample.performance)
    ),
    performanceWorst: minimum(
      samples.map((sample) => sample.performance)
    ),
    accessibilityMedian: median(
      samples.map((sample) => sample.accessibility)
    ),
    bestPracticesMedian: median(
      samples.map((sample) => sample.bestPractices)
    ),
    seoMedian: median(
      samples.map((sample) => sample.seo)
    ),
    fcpMedian: median(samples.map((sample) => sample.fcp)),
    fcpWorst: maximum(samples.map((sample) => sample.fcp)),
    lcpMedian: median(samples.map((sample) => sample.lcp)),
    lcpWorst: maximum(samples.map((sample) => sample.lcp)),
    clsMedian: median(samples.map((sample) => sample.cls)),
    clsWorst: maximum(samples.map((sample) => sample.cls)),
    tbtMedian: median(samples.map((sample) => sample.tbt)),
    tbtWorst: maximum(samples.map((sample) => sample.tbt)),
  });
}

const summary = {
  schema: "onionsupport.lighthouse-summary.v1",
  generatedAt: new Date().toISOString(),
  profile,
  releaseSha,
  reports: reports.length,
  urls: rows,
};

const summaryPath = path.join(
  resultsRoot,
  `onion-summary-${profile}.json`
);

fs.writeFileSync(
  summaryPath,
  `${JSON.stringify(summary, null, 2)}\n`,
  "utf8"
);

const markdown = [
  `## Lighthouse · ${profile}`,
  "",
  releaseSha
    ? `Release auditado: \`${releaseSha}\``
    : "Release auditado: no disponible",
  "",
  "| URL | n | Perf mediana | Perf peor | A11y | BP | SEO | LCP mediana / peor | CLS mediana / peor | TBT mediana / peor |",
  "|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|",
  ...rows.map((row) => (
    `| ${row.url} | ${row.samples} | ` +
    `${formatScore(row.performanceMedian)} | ` +
    `${formatScore(row.performanceWorst)} | ` +
    `${formatScore(row.accessibilityMedian)} | ` +
    `${formatScore(row.bestPracticesMedian)} | ` +
    `${formatScore(row.seoMedian)} | ` +
    `${formatMs(row.lcpMedian)} / ${formatMs(row.lcpWorst)} | ` +
    `${formatCls(row.clsMedian)} / ${formatCls(row.clsWorst)} | ` +
    `${formatMs(row.tbtMedian)} / ${formatMs(row.tbtWorst)} |`
  )),
  "",
  `Resumen JSON: \`${path.relative(process.cwd(), summaryPath)}\``,
  "",
].join("\n");

if (process.env.GITHUB_STEP_SUMMARY) {
  fs.appendFileSync(
    process.env.GITHUB_STEP_SUMMARY,
    `${markdown}\n`,
    "utf8"
  );
}

console.log(markdown);
