import fs from "node:fs";

const ROOT = "src/views/incidencias";

function read(name) {
  return fs.readFileSync(`${ROOT}/${name}`, "utf8");
}

function write(name, source) {
  fs.writeFileSync(`${ROOT}/${name}`, source, "utf8");
  console.log(`${name}: ${Buffer.byteLength(source)} bytes`);
}

function replaceExact(source, from, to, label, expected = 1) {
  const count = source.split(from).length - 1;
  if (count !== expected) throw new Error(`${label}: expected ${expected}, got ${count}`);
  return source.replace(from, to);
}

function replaceAllExact(source, from, to, label, expected) {
  const count = source.split(from).length - 1;
  if (count !== expected) throw new Error(`${label}: expected ${expected}, got ${count}`);
  return source.split(from).join(to);
}

function replacePattern(source, pattern, to, label) {
  const matches = source.match(new RegExp(pattern.source, `${pattern.flags.replace("g", "")}g`)) || [];
  if (matches.length !== 1) throw new Error(`${label}: expected 1, got ${matches.length}`);
  return source.replace(pattern, to);
}

function refineApi() {
  let s = read("incidencias.api.js");

  s = replacePattern(
    s,
    /const FIXED_TECHNICIAN = Object\.freeze\(\{.*?\}\);\n\n/s,
    "",
    "remove dead fixed technician"
  );

  s = replaceExact(
    s,
    ': await patchJson(endpoint, safeObject(payload), { timeout, source: "views.incidencias.update" });',
    ': await patchJson(endpoint, safeObject(payload), { timeout, source: "views.incidencias.update", signal });',
    "forward update PATCH signal"
  );

  s = replaceExact(
    s,
    `  const assignment = {
    ...safeObject(raw.assignment),
    status: "assigned",
    policy: cleanText(raw.assignment?.policy || raw.meta?.assignmentPolicy || "fixed_default_technician", "fixed_default_technician"),`,
    `  const assignment = {
    ...safeObject(raw.assignment),
    status: cleanText(
      first(raw.assignment?.status, technician.assigned ? "assigned" : "unassigned"),
      technician.assigned ? "assigned" : "unassigned"
    ),
    policy: cleanText(raw.assignment?.policy || raw.meta?.assignmentPolicy || "", ""),`,
    "truthful assignment state"
  );

  s = replaceExact(
    s,
    '    team: cleanText(first(raw.assignment?.team, "support"), "support"),',
    '    team: cleanText(first(raw.assignment?.team, technician.assigned ? "support" : ""), technician.assigned ? "support" : ""),',
    "truthful assignment team"
  );

  s = replacePattern(
    s,
    /export async function listIncidencias\(options = \{\}\) \{.*?\n\}\n\nexport async function loadIncidencias/s,
    `export async function listIncidencias(options = {}) {
  const force = options.force === true || options.forceRefresh === true;
  const useCache = options.cache !== false && options.noCache !== true;
  const returnStaleOnError = options.returnStaleOnError !== false;
  const key = listCacheKey(options);
  const canDedupe = !options.signal;

  if (!force && useCache && isCacheFresh(options)) {
    return cachedListResponse({ cached: true, stale: false, options });
  }

  if (!force && canDedupe && inFlightListPromise && inFlightListKey === key) {
    return inFlightListPromise;
  }

  loading = true;
  lastError = null;

  const task = (async () => {
    try {
      const response = await fetchIncidenciasRequest(options);
      if (responseLooksFailed(response)) {
        throw new Error(responseErrorMessage(response, "No se pudieron cargar las incidencias."));
      }

      const rawItems = listFromPayload(response);
      const items = normalizeList(rawItems);
      const total = totalFromPayload(response, items.length);
      setListCache({ items, total, key });

      return {
        ok: true,
        cached: false,
        stale: false,
        items: lastList.items,
        total: lastList.total,
        count: lastList.items.length,
        loadedAt: lastLoadedAt,
        rawCount: rawItems.length,
        cache: {
          hydrated: true,
          key: lastCacheKey,
          ageMs: 0,
          ttlMs: number(options.ttlMs ?? options.cacheTtlMs, INCIDENCIAS_CACHE_TTL_MS),
          fresh: true,
        },
      };
    } catch (error) {
      lastError = normalizeError(error);
      if (returnStaleOnError && lastLoadedAt) {
        return cachedListResponse({ cached: true, stale: true, error: lastError, options });
      }
      throw error;
    }
  })();

  if (canDedupe) {
    inFlightListPromise = task;
    inFlightListKey = key;
  }

  try {
    return await task;
  } finally {
    if (canDedupe && inFlightListPromise === task) {
      inFlightListPromise = null;
      inFlightListKey = "";
    }
    loading = Boolean(inFlightListPromise);
  }
}

export async function loadIncidencias`,
    "signal-safe list dedupe"
  );

  s = replaceExact(
    s,
    `  {
    timeout = INCIDENCIAS_DETAIL_TIMEOUT,
    autoDownload = true,
  } = {}
) {`,
    `  {
    timeout = INCIDENCIAS_DETAIL_TIMEOUT,
    autoDownload = true,
    signal,
  } = {}
) {`,
    "download signal option"
  );

  s = replaceExact(
    s,
    `    {
      timeout,
    }
  );`,
    `    {
      timeout,
      signal,
    }
  );`,
    "download signal forwarding"
  );

  write("incidencias.api.js", s);
}

function refineIndex() {
  let s = read("index.js");

  s = replaceExact(
    s,
    `  let loadController = null;
  let detailController = null;
`,
    `  let loadController = null;
  let detailController = null;
  let detailLoadSeq = 0;
`,
    "detail load sequence state"
  );

  s = replaceExact(
    s,
    `  function resetDetailModal() {
    detailController?.abort?.();
    detailController = null;
    attachmentPreviewSeq += 1;`,
    `  function resetDetailModal() {
    detailController?.abort?.();
    detailController = null;
    detailLoadSeq += 1;
    attachmentPreviewSeq += 1;`,
    "detail load sequence invalidation"
  );

  s = replaceExact(
    s,
    `    if (!id) {
      return false;
    }

    rememberModalReturnFocus();`,
    `    if (!id) {
      return false;
    }

    const detailSeq = ++detailLoadSeq;
    rememberModalReturnFocus();`,
    "detail load sequence capture"
  );

  s = replaceAllExact(
    s,
    `        destroyed ||
        openingTicketId !== id`,
    `        destroyed ||
        detailSeq !== detailLoadSeq ||
        openingTicketId !== id`,
    "detail load race guards",
    2
  );

  write("index.js", s);
}

function refineListTemplate() {
  let s = read("incidencias.template.js");

  s = replacePattern(
    s,
    /function unwrap\(v = \{\}\) \{.*?\n\}\n\nconst getId = .*?\nconst getCategory = .*?;\n\nfunction getClientName/s,
    `function unwrap(v = {}) {
  const it = obj(v, {});
  if (it.meta?.frontendReady === true) return it;
  return obj(first(it.ticket, it.incidencia, it.item, it.detail, it.data?.ticket, it.data?.incidencia, it.data?.item, it.data, it), it);
}

function getId(it = {}) {
  const r = unwrap(it);
  return txt(first(r.ticketId, r.incidenciaId, r.id, r.entityId, r.code, r.numero, r.ticketCode, r.reference, r.ref, ""), "");
}
function getSubject(it = {}) {
  const r = unwrap(it);
  return txt(first(r.subject, r.asunto, r.title, r.name, "Sin asunto"), "Sin asunto");
}
function getDesc(it = {}) {
  const r = unwrap(it);
  return txt(first(r.preview, r.description, r.descripcion, r.message, r.body, ""), "");
}
function getStatusRaw(it = {}) {
  const r = unwrap(it);
  return txt(first(r.status, r.estado, r.statusKey, r.lifecycle?.status, "open"), "open");
}
function getPriorityRaw(it = {}) {
  const r = unwrap(it);
  return txt(first(r.priority, r.prioridad, r.severity, "medium"), "medium");
}
function getCategory(it = {}) {
  const r = unwrap(it);
  return txt(first(r.category, r.categoria, r.tipo, r.type, "general"), "general");
}

function getClientName`,
    "canonical getter fast path"
  );

  s = replaceExact(
    s,
    `const getCreated = (it = {}) => first(unwrap(it).createdAt, unwrap(it).fechaCreacion, unwrap(it).created_at, unwrap(it).lifecycle?.createdAt, "");
const getUpdated = (it = {}) => first(unwrap(it).lastActivityAt, unwrap(it).updatedAt, unwrap(it).modifiedAt, unwrap(it).updated_at, unwrap(it).lifecycle?.lastActivityAt, unwrap(it).lifecycle?.updatedAt, getCreated(it), "");`,
    `function getCreated(it = {}) {
  const r = unwrap(it);
  return first(r.createdAt, r.fechaCreacion, r.created_at, r.lifecycle?.createdAt, "");
}
function getUpdated(it = {}) {
  const r = unwrap(it);
  return first(r.lastActivityAt, r.updatedAt, r.modifiedAt, r.updated_at, r.lifecycle?.lastActivityAt, r.lifecycle?.updatedAt, getCreated(r), "");
}`,
    "date getter fast path"
  );

  s = replacePattern(
    s,
    /function statusKey\(v = ""\) \{.*?\nconst amountKey/s,
    `const STATUS_MAP = Object.freeze({
  open: "open", opened: "open", abierta: "open", abierto: "open",
  pending: "pending", pendiente: "pending", new: "pending", nueva: "pending", nuevo: "pending",
  in_progress: "progress", inprogress: "progress", progress: "progress", proceso: "progress", en_proceso: "progress", working: "progress", assigned: "progress", asignada: "progress", asignado: "progress",
  resolved: "resolved", resuelta: "resolved", resuelto: "resolved", solved: "resolved",
  closed: "closed", close: "closed", cerrada: "closed", cerrado: "closed",
  cancelled: "closed", canceled: "closed", cancelada: "closed", cancelado: "closed", archived: "closed", archivada: "closed", archivado: "closed",
});
const STATUS_LABELS = Object.freeze({ open: "Abierta", pending: "Pendiente", progress: "En proceso", resolved: "Resuelta", closed: "Cerrada" });
const PRIORITY_MAP = Object.freeze({
  low: "low", baja: "low", minor: "low", p3: "low",
  medium: "medium", media: "medium", normal: "medium", p2: "medium",
  high: "urgent", alta: "urgent", p1: "urgent",
  urgent: "urgent", urgente: "urgent",
  critical: "critical", critica: "critical", critico: "critical", crítico: "critical", crítica: "critical", p0: "critical",
});
const PRIORITY_LABELS = Object.freeze({ low: "Baja", medium: "Media", urgent: "Urgente", critical: "Crítica" });
const OPEN_STATUS_KEYS = new Set(["open", "pending", "progress"]);
const CLOSED_STATUS_KEYS = new Set(["resolved", "closed"]);
const URGENT_PRIORITY_KEYS = new Set(["urgent", "critical"]);

function statusKey(v = "") {
  const k = key(v || "open");
  return STATUS_MAP[k] || k || "open";
}
function statusLabel(v = "") {
  const normalized = statusKey(v);
  return STATUS_LABELS[normalized] || txt(v, "Abierta");
}
function priorityKey(it = {}) {
  const k = key(getPriorityRaw(it) || "medium");
  return PRIORITY_MAP[k] || k || "medium";
}
function priorityLabel(it = {}) {
  const raw = key(getPriorityRaw(it));
  if (raw === "high" || raw === "alta" || raw === "p1") return "Alta";
  const normalized = priorityKey(it);
  return PRIORITY_LABELS[normalized] || normalized;
}
const isOpen = (it = {}) => OPEN_STATUS_KEYS.has(statusKey(getStatusRaw(it)));
const isClosed = (it = {}) => CLOSED_STATUS_KEYS.has(statusKey(getStatusRaw(it)));
const isUrgent = (it = {}) => URGENT_PRIORITY_KEYS.has(priorityKey(it));
const amountKey`,
    "static status and priority maps"
  );

  write("incidencias.template.js", s);
}

function refineCreateTemplate() {
  let s = read("incidencias.template.create.js");

  s = replaceExact(
    s,
    "const ACCEPT_ATTRIBUTE = ACCEPT_ATTRIBUTE;",
    'const ACCEPT_ATTRIBUTE = ACCEPT_EXTENSIONS.join(",");',
    "fix accept attribute"
  );

  s = replaceExact(
    s,
    'function icon(name = "") {\n  const common =',
    'const CREATE_ICON_CACHE = new Map();\n\nfunction icon(name = "") {\n  if (CREATE_ICON_CACHE.has(name)) return CREATE_ICON_CACHE.get(name);\n\n  const common =',
    "create icon cache lookup"
  );

  s = replaceExact(
    s,
    '  return icons[name] || "";\n}',
    '  const result = icons[name] || "";\n  CREATE_ICON_CACHE.set(name, result);\n  return result;\n}',
    "create icon cache store"
  );

  write("incidencias.template.create.js", s);
}

refineApi();
refineIndex();
refineListTemplate();
refineCreateTemplate();
console.log("incidencias precision refinement complete");
