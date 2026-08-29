import { appendFile, readFile } from "node:fs/promises";
import { resolve } from "node:path";

const REPORT_SCHEMA = "onionsupport.production-availability.v1";
const INCIDENT_MARKER = "<!-- onionsupport-production-availability-v1 -->";
const FIRST_DETECTED_PATTERN = /<!-- first-detected: ([^>]+) -->/u;
const INCIDENT_TITLE = "[PRODUCTION-AVAILABILITY] Recursos estáticos no disponibles";

function safeText(value, limit = 500) {
  return String(value ?? "")
    .replace(/[\r\n\t]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, limit);
}

function markdownCell(value, limit = 160) {
  return safeText(value, limit)
    .replaceAll("|", "\\|")
    .replaceAll("`", "'");
}

function requireRepository(value) {
  const raw = String(value || "").trim();
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(raw)) {
    throw new Error(`Invalid GITHUB_REPOSITORY: ${raw || "<missing>"}`);
  }
  return raw;
}

function runUrl(repository) {
  const server = String(process.env.GITHUB_SERVER_URL || "https://github.com").replace(/\/+$/u, "");
  const runId = safeText(process.env.GITHUB_RUN_ID || "", 32);
  return runId ? `${server}/${repository}/actions/runs/${runId}` : `${server}/${repository}/actions`;
}

async function githubApi(repository, token, path, { method = "GET", body } = {}) {
  const response = await fetch(`https://api.github.com/repos/${repository}${path}`, {
    method,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "OnionSupport-Production-Availability-Incident/1.0",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30_000),
  });

  const text = await response.text();
  let payload = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }

  if (!response.ok) {
    const detail = typeof payload === "string"
      ? safeText(payload, 300)
      : safeText(payload?.message || JSON.stringify(payload || {}), 300);
    throw new Error(`GitHub API ${method} ${path} failed: HTTP ${response.status} ${detail}`);
  }

  return payload;
}

function latestFailures(report) {
  const rounds = Array.isArray(report.rounds) ? report.rounds : [];
  const failingRounds = rounds.filter((round) => Array.isArray(round.failures) && round.failures.length);
  const selected = failingRounds.at(-1)?.failures || [];
  const unique = new Map();

  for (const failure of selected) {
    const key = `${failure.path}|${failure.status}|${failure.error}`;
    if (!unique.has(key)) unique.set(key, failure);
  }

  return [...unique.values()].slice(0, 30);
}

function firstDetectedFrom(issue, fallback) {
  const match = String(issue?.body || "").match(FIRST_DETECTED_PATTERN);
  return safeText(match?.[1] || fallback, 64);
}

function buildIssueBody({ report, issue, run }) {
  const firstDetected = firstDetectedFrom(issue, report.checkedAt);
  const failures = latestFailures(report);
  const lines = [
    INCIDENT_MARKER,
    `<!-- first-detected: ${firstDetected} -->`,
    "",
    "# Incidencia automática de disponibilidad",
    "",
    "El monitor de producción no ha conseguido completar el grafo crítico de HTML, CSS, JavaScript, iconos e imágenes en suficientes rondas consecutivas.",
    "",
    "> Esta incidencia se mantiene y se cierra automáticamente. No ejecuta redeploys ni reintentos de publicación a ciegas.",
    "",
    `- **Estado:** ${report.status}`,
    `- **Primera detección:** \`${firstDetected}\``,
    `- **Última comprobación:** \`${report.checkedAt}\``,
    `- **Rondas correctas:** ${report.successRounds}/${report.roundCount} (mínimo ${report.minimumSuccessRounds})`,
    `- **HTTP 503 persistente:** ${report.persistent503 ? "sí" : "no"}`,
    `- **Release observada:** \`${safeText(report.releaseSha || "desconocida", 64)}\``,
    `- **Workflow:** ${run}`,
    "",
    "## Últimos fallos observados",
    "",
  ];

  if (!failures.length) {
    lines.push("No hay detalle de respuesta disponible; el probe no pudo completar la comprobación.");
  } else {
    lines.push(
      "| Ruta | HTTP | Tipo | Error | Referencia Azure | Retry-After |",
      "|---|---:|---|---|---|---|"
    );
    for (const failure of failures) {
      const azureRef =
        failure.headers?.["x-azure-ref"] ||
        failure.headers?.["x-msedge-ref"] ||
        failure.headers?.["x-ms-request-id"] ||
        "—";
      lines.push(
        `| \`${markdownCell(failure.path, 180)}\` | ${failure.status ?? "—"} | ${markdownCell(failure.kind, 40) || "—"} | ${markdownCell(failure.error, 140) || "—"} | ${markdownCell(azureRef, 100) || "—"} | ${markdownCell(failure.headers?.["retry-after"] || "—", 40)} |`
      );
    }
  }

  lines.push(
    "",
    "## Límites de la automatización",
    "",
    "El monitor diagnostica la disponibilidad pública y conserva evidencia de cabeceras. No modifica Azure, DNS ni el artefacto productivo."
  );

  return `${lines.join("\n")}\n`;
}

async function appendSummary(text) {
  if (process.env.GITHUB_STEP_SUMMARY) {
    await appendFile(process.env.GITHUB_STEP_SUMMARY, `${text.trim()}\n`, "utf8");
  }
}

const reportPath = resolve(
  String(process.env.PROBE_REPORT || "production-availability-report.json").trim()
);
const report = JSON.parse(await readFile(reportPath, "utf8"));
if (report?.schema !== REPORT_SCHEMA) {
  throw new Error(`Unexpected availability report schema: ${report?.schema || "<missing>"}`);
}
if (!new Set(["healthy", "degraded", "unavailable"]).has(report.status)) {
  throw new Error(`Unexpected availability status: ${report.status}`);
}

const repository = requireRepository(process.env.GITHUB_REPOSITORY);
const token = String(process.env.GITHUB_TOKEN || "").trim();
if (!token) throw new Error("GITHUB_TOKEN is required for incident synchronization.");
const run = runUrl(repository);

const openIssues = await githubApi(repository, token, "/issues?state=open&per_page=100");
const incidents = (Array.isArray(openIssues) ? openIssues : []).filter((issue) =>
  !issue.pull_request &&
  issue.title === INCIDENT_TITLE &&
  String(issue.body || "").includes(INCIDENT_MARKER)
);
const incident = incidents[0] || null;

if (report.status === "unavailable") {
  const body = buildIssueBody({ report, issue: incident, run });

  if (incident) {
    await githubApi(repository, token, `/issues/${incident.number}`, {
      method: "PATCH",
      body: { title: INCIDENT_TITLE, body, state: "open" },
    });
    console.log(`Updated production availability incident #${incident.number}.`);
    await appendSummary(`Availability incident updated: #${incident.number}`);
  } else {
    const created = await githubApi(repository, token, "/issues", {
      method: "POST",
      body: { title: INCIDENT_TITLE, body },
    });
    console.log(`Created production availability incident #${created.number}.`);
    await appendSummary(`Availability incident created: #${created.number}`);
  }
} else if (report.status === "degraded") {
  if (incident) {
    const body = buildIssueBody({ report, issue: incident, run });
    await githubApi(repository, token, `/issues/${incident.number}`, {
      method: "PATCH",
      body: { title: INCIDENT_TITLE, body, state: "open" },
    });
    console.log(`Kept production availability incident #${incident.number} open while degraded.`);
    await appendSummary(`Availability remains degraded; incident #${incident.number} stays open.`);
  } else {
    console.log("Availability is degraded but not persistently unavailable; no incident opened.");
    await appendSummary("Availability degraded; no persistent incident opened.");
  }
} else if (incident) {
  await githubApi(repository, token, `/issues/${incident.number}/comments`, {
    method: "POST",
    body: {
      body: [
        "### Recuperación automática confirmada",
        "",
        `- Comprobación: \`${report.checkedAt}\``,
        `- Rondas correctas: **${report.successRounds}/${report.roundCount}**`,
        `- Release observada: \`${safeText(report.releaseSha || "desconocida", 64)}\``,
        `- Workflow: ${run}`,
        "",
        "El grafo crítico de recursos vuelve a responder correctamente.",
      ].join("\n"),
    },
  });
  await githubApi(repository, token, `/issues/${incident.number}`, {
    method: "PATCH",
    body: { state: "closed", state_reason: "completed" },
  });
  console.log(`Closed recovered production availability incident #${incident.number}.`);
  await appendSummary(`Availability recovered; incident #${incident.number} closed.`);
} else {
  console.log("Production availability is healthy; no open incident.");
  await appendSummary("Production availability healthy; no open incident.");
}
