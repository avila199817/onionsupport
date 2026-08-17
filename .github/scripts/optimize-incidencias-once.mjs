import fs from "node:fs";

const ROOT = "src/views/incidencias";

function read(name) {
  return fs.readFileSync(`${ROOT}/${name}`, "utf8");
}

function write(name, source) {
  fs.writeFileSync(`${ROOT}/${name}`, source, "utf8");
  console.log(`updated ${name}: ${Buffer.byteLength(source)} bytes`);
}

function replaceOnce(source, search, replacement, label) {
  const index = source.indexOf(search);
  if (index < 0) throw new Error(`anchor not found: ${label}`);
  if (source.indexOf(search, index + search.length) >= 0) {
    throw new Error(`anchor is not unique: ${label}`);
  }
  return source.slice(0, index) + replacement + source.slice(index + search.length);
}

function replaceRegex(source, regex, replacement, label) {
  const matches = [...source.matchAll(new RegExp(regex.source, regex.flags.includes("g") ? regex.flags : `${regex.flags}g`))];
  if (matches.length !== 1) throw new Error(`${label}: expected 1 match, got ${matches.length}`);
  return source.replace(regex, replacement);
}

function insertBefore(source, anchor, insertion, label) {
  return replaceOnce(source, anchor, `${insertion}${anchor}`, label);
}

function optimizeApi() {
  let s = read("incidencias.api.js");

  s = replaceOnce(
    s,
    'export const INCIDENCIAS_API_VERSION = "incidencias.api.paint-safe.v13.sas-preview-contract";',
    'export const INCIDENCIAS_API_VERSION = "incidencias.api.extreme.v20";',
    "api version"
  );

  s = replaceOnce(
    s,
    'export const INCIDENCIAS_CACHE_TTL_MS = 60000;',
    'export const INCIDENCIAS_CACHE_TTL_MS = 60000;\nexport const INCIDENCIAS_DETAIL_CACHE_TTL_MS = 20000;',
    "detail cache ttl"
  );

  s = replaceOnce(
    s,
    'let inFlightListKey = "";\n\nlet lastList = {',
    'let inFlightListKey = "";\n\nconst detailCache = new Map();\nconst detailInFlight = new Map();\nlet usersSearchController = null;\n\nlet lastList = {',
    "api cache state"
  );

  s = replaceRegex(
    s,
    /function collectArraysDeep\([\s\S]*?\n}\n\nfunction usersListFromPayload/,
    `function listFromPayload(payload = null) {
  if (Array.isArray(payload)) return payload;

  const root = safeObject(payload, {});
  const data = safeObject(root.data, {});
  const candidates = [
    root.items,
    root.rows,
    root.tickets,
    root.incidencias,
    root.results,
    root.records,
    data.items,
    data.rows,
    data.tickets,
    data.incidencias,
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate;
  }

  return [];
}

function usersListFromPayload`,
    "api list payload fast path"
  );

  s = replaceRegex(
    s,
    /function buildUsersSearchQuery\([\s\S]*?\n}\n\nexport async function searchIncidenciaUsers\([\s\S]*?\n}\n\n\/\* =========================================================\n   NORMALIZE TICKETS/,
    `function buildUsersSearchQuery(query = "", limit = USERS_SEARCH_LIMIT) {
  return { q: query, limit, includeTotal: false };
}

export async function searchIncidenciaUsers(query = "", options = {}) {
  const q = cleanText(query, "");
  const limit = Math.max(1, Math.min(number(options.limit, USERS_SEARCH_LIMIT), 20));

  if (q.length < USERS_SEARCH_MIN_LENGTH) {
    usersSearchController?.abort?.();
    usersSearchController = null;
    return [];
  }

  const externalSignal = options.signal || null;
  let controller = null;

  if (!externalSignal && typeof AbortController !== "undefined") {
    usersSearchController?.abort?.();
    controller = new AbortController();
    usersSearchController = controller;
  }

  try {
    const response = await getJson(USERS_SEARCH_ENDPOINT, {
      timeout: options.timeout || INCIDENCIAS_TIMEOUT,
      query: buildUsersSearchQuery(q, limit),
      source: "views.incidencias.users.search",
      signal: externalSignal || controller?.signal,
    });

    if (responseLooksFailed(response)) throw new Error(responseErrorMessage(response));

    return usersListFromPayload(response)
      .map(normalizeCreateSearchUser)
      .filter((user) => user.userId || user.id)
      .slice(0, limit);
  } finally {
    if (controller && usersSearchController === controller) usersSearchController = null;
  }
}

/* =========================================================
   NORMALIZE TICKETS`,
    "api users search cancellation"
  );

  s = replaceRegex(
    s,
    /function normalizeTechnician\(item = \{\}\) \{[\s\S]*?\n}\n\nfunction normalizeAttachment/,
    `function normalizeTechnician(item = {}) {
  const raw = unwrapTicket(item);
  const assignment = safeObject(raw.assignment);
  const base = normalizePerson(
    first(
      raw.tecnico,
      raw.assignedTo,
      raw.technician,
      raw.agent,
      assignment.technician,
      assignment.assignedTo,
      {}
    )
  );

  const userId = cleanText(
    first(
      raw.assignedToUserId,
      raw.technicianUserId,
      raw.tecnicoUserId,
      assignment.assignedToUserId,
      assignment.userId,
      base.userId
    ),
    ""
  );
  const name = cleanText(
    first(
      raw.assignedToName,
      raw.technicianName,
      raw.tecnicoName,
      raw.agentName,
      assignment.assignedToName,
      assignment.technicianName,
      assignment.name,
      base.name
    ),
    ""
  );
  const email = firstEmail(
    raw.assignedToEmail,
    raw.technicianEmail,
    raw.tecnicoEmail,
    raw.agentEmail,
    assignment.assignedToEmail,
    assignment.technicianEmail,
    assignment.email,
    base.email
  );
  const avatar = firstUrl(
    raw.assignedToAvatarUrl,
    raw.assignedToAvatar,
    raw.technicianAvatarUrl,
    raw.technicianAvatar,
    raw.tecnicoAvatarUrl,
    raw.tecnicoAvatar,
    raw.agentAvatarUrl,
    raw.agentAvatar,
    assignment.assignedToAvatarUrl,
    assignment.assignedToAvatar,
    assignment.technicianAvatarUrl,
    assignment.technicianAvatar,
    assignment.avatarUrl,
    assignment.avatar,
    base.avatarUrl
  );
  const role = normalizeKey(base.role || assignment.role || "");

  return {
    id: userId || null,
    userId: userId || null,
    name,
    nombre: name,
    displayName: name,
    email,
    emailLower: email,
    avatar: avatar || null,
    avatarUrl: avatar || null,
    hasAvatar: Boolean(avatar),
    role,
    display: name ? (email ? \`${"${name} <${email}>"}\` : name) : email,
    assigned: Boolean(userId || email || name),
  };
}

function normalizeAttachment`,
    "api technician no invented fallback"
  );

  s = replaceOnce(
    s,
    `    assignedToUserId: FIXED_TECHNICIAN.userId,
    assignedToName: FIXED_TECHNICIAN.name,
    assignedToEmail: FIXED_TECHNICIAN.email,
    assignmentPolicy: "fixed_default_technician",
`,
    "",
    "api remove frontend assignment policy"
  );

  s = replaceOnce(
    s,
    `  inFlightListPromise = null;
  inFlightListKey = "";
  loading = false;
  return true;`,
    `  inFlightListPromise = null;
  inFlightListKey = "";
  detailCache.clear();
  detailInFlight.clear();
  usersSearchController?.abort?.();
  usersSearchController = null;
  loading = false;
  return true;`,
    "api clear all caches"
  );

  s = replaceOnce(
    s,
    `function upsertCachedIncidencia(item = null) {
  const normalized = normalizeIncidencia(item);
  if (!normalized) return null;

  const id = getTicketId(normalized);
  if (!id) return normalized;`,
    `function upsertCachedIncidencia(item = null) {
  const normalized = normalizeIncidencia(item);
  if (!normalized) return null;

  const id = getTicketId(normalized);
  if (!id) return normalized;

  detailCache.set(id, { item: normalized, at: now() });`,
    "api detail cache upsert"
  );

  s = replaceRegex(
    s,
    /async function getJson\([\s\S]*?\n}\n\nasync function postMultipart\([\s\S]*?\n}\n\n\/\* =========================================================\n   LIST \/ DETAIL/,
    `async function getJson(endpoint = "", options = {}) {
  return Http.get(endpoint, {
    timeout: options.timeout || INCIDENCIAS_TIMEOUT,
    query: safeObject(options.query || options.params),
    source: options.source || "views.incidencias",
    signal: options.signal,
  });
}

async function postJson(endpoint = "", body = {}, options = {}) {
  return Http.post(endpoint, body, {
    timeout: options.timeout || INCIDENCIAS_TIMEOUT,
    source: options.source || "views.incidencias",
    signal: options.signal,
  });
}

async function patchJson(endpoint = "", body = {}, options = {}) {
  return Http.patch(endpoint, body, {
    timeout: options.timeout || INCIDENCIAS_TIMEOUT,
    source: options.source || "views.incidencias",
    signal: options.signal,
  });
}

async function postMultipart(endpoint = "", formData = null, options = {}) {
  if (!formData || typeof FormData === "undefined" || !(formData instanceof FormData)) {
    return postJson(endpoint, formData, options);
  }

  return Http.post(endpoint, formData, {
    timeout: options.timeout || INCIDENCIAS_UPLOAD_TIMEOUT,
    source: options.source || "views.incidencias.multipart",
    signal: options.signal,
    multipart: true,
    formData: true,
    isFormData: true,
    rawBody: true,
    skipJson: true,
    skipContentType: true,
    headers: {},
  });
}

/* =========================================================
   LIST / DETAIL`,
    "api http signal forwarding"
  );

  s = replaceOnce(
    s,
    `    query: buildListQuery(options),
    source: "views.incidencias.list",
  });`,
    `    query: buildListQuery(options),
    source: "views.incidencias.list",
    signal: options.signal,
  });`,
    "api list signal"
  );

  s = replaceRegex(
    s,
    /export async function getIncidenciaByIdRequest\([\s\S]*?\nexport const loadIncidenciaDetail = getIncidenciaByIdRequest;/,
    `export async function getIncidenciaByIdRequest(id = "", options = {}) {
  const key = normalizeIncidenciaId(id);
  if (!key) throw new Error("INCIDENCIA_ID_REQUIRED");

  const force = options.force === true || options.forceRefresh === true;
  const useCache = options.cache !== false && options.noCache !== true;
  const ttl = Math.max(0, number(options.ttlMs ?? options.cacheTtlMs, INCIDENCIAS_DETAIL_CACHE_TTL_MS));
  const cached = detailCache.get(key);

  if (!force && useCache && cached && now() - cached.at <= ttl) return cached.item;
  if (!force && !options.signal && detailInFlight.has(key)) return detailInFlight.get(key);

  const task = (async () => {
    const response = await getJson(getIncidenciaEndpoint(key), {
      timeout: options.timeout || INCIDENCIAS_DETAIL_TIMEOUT,
      source: "views.incidencias.detail",
      signal: options.signal,
    });

    if (responseLooksFailed(response)) {
      throw new Error(responseErrorMessage(response, "No se pudo cargar la incidencia."));
    }

    const detail = detailFromPayload(response);
    return detail ? upsertCachedIncidencia(detail) : null;
  })();

  if (options.signal) return task;

  detailInFlight.set(key, task);
  try {
    return await task;
  } finally {
    if (detailInFlight.get(key) === task) detailInFlight.delete(key);
  }
}

export const loadIncidenciaDetail = getIncidenciaByIdRequest;`,
    "api detail cache and dedupe"
  );

  const signatureReplacements = [
    [
      'export async function createIncidenciaRequest(payload = {}, { timeout = INCIDENCIAS_UPLOAD_TIMEOUT } = {}) {',
      'export async function createIncidenciaRequest(payload = {}, { timeout = INCIDENCIAS_UPLOAD_TIMEOUT, signal } = {}) {'
    ],
    [
      'export async function updateIncidenciaRequest(id = "", payload = {}, { timeout = INCIDENCIAS_TIMEOUT, method = "PATCH" } = {}) {',
      'export async function updateIncidenciaRequest(id = "", payload = {}, { timeout = INCIDENCIAS_TIMEOUT, method = "PATCH", signal } = {}) {'
    ],
    [
      'export async function commentIncidenciaRequest(id = "", message = "", { timeout = INCIDENCIAS_TIMEOUT, status = "open" } = {}) {',
      'export async function commentIncidenciaRequest(id = "", message = "", { timeout = INCIDENCIAS_TIMEOUT, status = "open", signal } = {}) {'
    ],
    [
      'export async function reopenIncidenciaRequest(id = "", { timeout = INCIDENCIAS_TIMEOUT } = {}) {',
      'export async function reopenIncidenciaRequest(id = "", { timeout = INCIDENCIAS_TIMEOUT, signal } = {}) {'
    ],
    [
      'export async function uploadIncidenciaAttachmentsRequest(id = "", files = [], { timeout = INCIDENCIAS_UPLOAD_TIMEOUT, status = "open", extra = {} } = {}) {',
      'export async function uploadIncidenciaAttachmentsRequest(id = "", files = [], { timeout = INCIDENCIAS_UPLOAD_TIMEOUT, status = "open", extra = {}, signal } = {}) {'
    ],
    [
      'export async function getIncidenciaAttachmentFileRequest({ ticketId = "", attachmentId = "", mode = "view", kind = "attachments" } = {}, { timeout = INCIDENCIAS_DETAIL_TIMEOUT } = {}) {',
      'export async function getIncidenciaAttachmentFileRequest({ ticketId = "", attachmentId = "", mode = "view", kind = "attachments" } = {}, { timeout = INCIDENCIAS_DETAIL_TIMEOUT, signal } = {}) {'
    ],
  ];
  for (const [from, to] of signatureReplacements) s = replaceOnce(s, from, to, `api signature ${from.slice(22, 50)}`);

  s = s.replace(/source: "views\.incidencias\.create\.multipart",\n      \}/g, 'source: "views.incidencias.create.multipart",\n        signal,\n      }');
  s = s.replace(/source: "views\.incidencias\.create\.json",\n      \}/g, 'source: "views.incidencias.create.json",\n        signal,\n      }');
  s = s.replace('{ timeout, source: "views.incidencias.update" }', '{ timeout, source: "views.incidencias.update", signal }');
  s = s.replace('{ timeout, source: "views.incidencias.comment" }', '{ timeout, source: "views.incidencias.comment", signal }');
  s = s.replace('{ timeout, source: "views.incidencias.reopen" }', '{ timeout, source: "views.incidencias.reopen", signal }');
  s = s.replace('source: "views.incidencias.attachments.multipart",\n  });', 'source: "views.incidencias.attachments.multipart",\n    signal,\n  });');
  s = s.replace('const response = await getJson(endpoint, { timeout, source: "views.incidencias.attachment.file" });', 'const response = await getJson(endpoint, { timeout, source: "views.incidencias.attachment.file", signal });');

  s = replaceOnce(
    s,
    '  return updated ? upsertCachedIncidencia(updated) : await getIncidenciaByIdRequest(id);',
    '  return updated ? upsertCachedIncidencia(updated) : null;',
    "api update avoid redundant detail get"
  );
  s = replaceOnce(
    s,
    '  return updated ? upsertCachedIncidencia(updated) : await getIncidenciaByIdRequest(id);',
    '  return updated ? upsertCachedIncidencia(updated) : null;',
    "api comment avoid redundant detail get"
  );
  s = replaceOnce(
    s,
    '  return updated ? upsertCachedIncidencia(updated) : await getIncidenciaByIdRequest(id);',
    '  return updated ? upsertCachedIncidencia(updated) : null;',
    "api reopen avoid redundant detail get"
  );
  s = replaceOnce(
    s,
    '  return updated ? upsertCachedIncidencia(updated) : await getIncidenciaByIdRequest(id);',
    '  return updated ? upsertCachedIncidencia(updated) : null;',
    "api upload avoid redundant detail get"
  );

  s = replaceOnce(
    s,
    '    fixedTechnician: FIXED_TECHNICIAN,',
    '    detailCache: { size: detailCache.size, inFlight: detailInFlight.size, ttlMs: INCIDENCIAS_DETAIL_CACHE_TTL_MS },\n    fixedTechnicianPolicyOwnedByBackend: true,',
    "api snapshot cache"
  );

  write("incidencias.api.js", s);
}

function optimizeIndex() {
  let s = read("index.js");

  s = replaceOnce(
    s,
    '  "incidencias.index.productivo.modal-10x10.v14.preview-reveal";',
    '  "incidencias.index.extreme.v20";',
    "index version"
  );

  s = replaceOnce(
    s,
    '  let attachmentPreviewSeq = 0;\n',
    '  let attachmentPreviewSeq = 0;\n\n  let loadController = null;\n  let detailController = null;\n',
    "index abort state"
  );

  s = replaceRegex(
    s,
    /  function viewPayload\([\s\S]*?\n  }\n\n  function createModalPayload/,
    `  function viewPayload(extra = {}) {
    return payload({
      canonical: true,
      items,
      createModal: { ...createModal, open: false },
      detailModal: { ...detailModal, open: false },
      ...extra,
    });
  }

  function createModalPayload`,
    "index canonical payload"
  );

  const listPatchHelpers = `  /* =======================================================
     LIST PATCHING
     Hot interactions never replace the active search input or the full view.
  ======================================================= */

  function syncListSearch(currentRoot = null, nextRoot = null) {
    const currentSearch = currentRoot?.querySelector?.(".incidencias-search");
    const nextSearch = nextRoot?.querySelector?.(".incidencias-search");
    if (!currentSearch || !nextSearch) return false;

    const currentInput = currentSearch.querySelector("[data-incidencias-search-input='true']");
    const nextInput = nextSearch.querySelector("[data-incidencias-search-input='true']");
    if (currentInput && nextInput && document.activeElement !== currentInput) {
      currentInput.value = nextInput.value;
      syncAttributes(currentInput, nextInput);
    }

    const currentClear = currentSearch.querySelector(".incidencias-search-clear");
    const nextClear = nextSearch.querySelector(".incidencias-search-clear");
    if (!currentClear && nextClear) currentSearch.appendChild(nextClear.cloneNode(true));
    else if (currentClear && !nextClear) currentClear.remove();
    else if (currentClear && nextClear) syncAttributes(currentClear, nextClear);

    return true;
  }

  function patchListDom(html = "") {
    if (!html || !host?.isConnected) return false;

    const currentRoot = host.querySelector("[data-incidencias-scope='true']");
    const nextRoot = cloneTemplateRoot(html, "[data-incidencias-scope='true']");
    if (!currentRoot || !nextRoot) return false;

    try {
      syncAttributes(currentRoot, nextRoot);
      syncListSearch(currentRoot, nextRoot);

      for (const selector of [
        ".incidencias-history-copy",
        ".incidencias-filter-pills",
        ".incidencias-sort-pills",
        "[data-incidencias-table-wrap='true']",
      ]) {
        if (!replacePart(currentRoot, nextRoot, selector, { preserveFocus: false })) return false;
      }

      return true;
    } catch {
      return false;
    }
  }

`;
  s = insertBefore(
    s,
    '  /* =======================================================\n     CREATE MODAL PATCHING',
    listPatchHelpers,
    "index list patch helpers"
  );

  s = replaceRegex(
    s,
    /  function renderNow\([\s\S]*?\n  }\n\n  function render\(/,
    `  function renderNow(options = {}) {
    if (destroyed || !host) return false;

    cancelScheduledRender();
    const html = renderIncidenciasTemplate(viewPayload());
    const patched = options.listPatch === true && patchListDom(html);
    if (!patched) host.innerHTML = html;

    if (!options.skipModals) renderModalsNow();
    return true;
  }

  function render(`,
    "index fast render"
  );

  s = replaceOnce(
    s,
    '    render(options);\n    return true;\n  }\n\n  function setSearch(',
    '    render({ ...options, listPatch: true });\n    return true;\n  }\n\n  function setSearch(',
    "index filtered render patch"
  );

  s = replaceOnce(
    s,
    `    try {
      const response =
        await listIncidencias({
          returnStaleOnError: true,
          force,
        });`,
    `    loadController?.abort?.();
    const requestController = typeof AbortController !== "undefined" ? new AbortController() : null;
    loadController = requestController;

    try {
      const response =
        await listIncidencias({
          returnStaleOnError: true,
          force,
          signal: requestController?.signal,
        });`,
    "index cancel obsolete list"
  );

  s = replaceOnce(
    s,
    `  function resetDetailModal() {
    attachmentPreviewSeq += 1;`,
    `  function resetDetailModal() {
    detailController?.abort?.();
    detailController = null;
    attachmentPreviewSeq += 1;`,
    "index abort detail on close"
  );

  s = replaceOnce(
    s,
    `    try {
      const detail =
        await loadIncidenciaDetail(
          id
        );`,
    `    detailController?.abort?.();
    const requestController = typeof AbortController !== "undefined" ? new AbortController() : null;
    detailController = requestController;

    try {
      const detail =
        await loadIncidenciaDetail(
          id,
          { signal: requestController?.signal }
        );`,
    "index cancel obsolete detail"
  );

  s = replaceOnce(
    s,
    `      loadSeq += 1;
      userSearchSeq += 1;

      clearUserSearchTimer();`,
    `      loadSeq += 1;
      userSearchSeq += 1;

      loadController?.abort?.();
      detailController?.abort?.();
      loadController = null;
      detailController = null;

      clearUserSearchTimer();`,
    "index abort on destroy"
  );

  write("index.js", s);
}

function optimizeListTemplate() {
  let s = read("incidencias.template.js");

  s = replaceOnce(
    s,
    'export const INCIDENCIAS_TEMPLATE_VERSION = "incidencias.template.css-1-1.v12";',
    'export const INCIDENCIAS_TEMPLATE_VERSION = "incidencias.template.extreme.v20";',
    "template version"
  );

  s = replaceRegex(
    s,
    /function first\(\.\.\.values\) \{[\s\S]*?\n}\n\nfunction num/,
    `function first(...values) {
  for (const v of values) {
    if (v === null || v === undefined) continue;
    if (typeof v === "string" && !v.trim()) continue;
    if (Array.isArray(v) && !v.length) continue;
    if (isObj(v) && !Object.keys(v).length) continue;
    return v;
  }
  return null;
}

function num`,
    "template first no domain flatten"
  );

  s = replaceRegex(
    s,
    /function icon\(name = ""\) \{[\s\S]*?\n}\n\n\/\* =========================================================\n   FORMATTERS/,
    `const ICON_COMMON = \`aria-hidden="true" focusable="false" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"\`;
const ICONS = Object.freeze({
  ticket: \`<svg \${ICON_COMMON}><path d="M3 9a3 3 0 0 0 0 6v2a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-2a3 3 0 0 0 0-6V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2Z"/><path d="M13 5v14"/></svg>\`,
  refresh: \`<svg \${ICON_COMMON}><path d="M21 12a9 9 0 0 0-15-6.7L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 15 6.7l3-2.7"/><path d="M21 21v-5h-5"/></svg>\`,
  plus: \`<svg \${ICON_COMMON}><path d="M12 5v14"/><path d="M5 12h14"/></svg>\`,
  search: \`<svg \${ICON_COMMON}><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>\`,
  close: \`<svg \${ICON_COMMON}><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>\`,
  alert: \`<svg \${ICON_COMMON}><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>\`,
  paperclip: \`<svg \${ICON_COMMON}><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.82-2.82l8.48-8.49"/></svg>\`,
  euro: \`<svg \${ICON_COMMON}><path d="M4 10h12"/><path d="M4 14h9"/><path d="M19 6a7.7 7.7 0 0 0-5.2-2C8.9 4 5 7.6 5 12s3.9 8 8.8 8A7.7 7.7 0 0 0 19 18"/></svg>\`,
  chevronDown: \`<svg \${ICON_COMMON}><path d="m6 9 6 6 6-6"/></svg>\`,
  calendar: \`<svg \${ICON_COMMON}><path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/></svg>\`,
  hash: \`<svg \${ICON_COMMON}><path d="M4 9h16"/><path d="M4 15h16"/><path d="M10 3 8 21"/><path d="m16 3-2 18"/></svg>\`,
});
function icon(name = "") { return ICONS[name] || ICONS.ticket; }

/* =========================================================
   FORMATTERS`,
    "template static icons"
  );

  s = replaceRegex(
    s,
    /function formatNumber\([\s\S]*?\n}\n\nfunction formatMoney\([\s\S]*?\n}\n\nfunction formatDate\([\s\S]*?\n}\n\nfunction formatShortDate\([\s\S]*?\n}/,
    `const NUMBER_FORMATTER = new Intl.NumberFormat("es-ES");
const DATE_FORMATTER = new Intl.DateTimeFormat("es-ES", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
const SHORT_DATE_FORMATTER = new Intl.DateTimeFormat("es-ES", { day: "2-digit", month: "short", year: "numeric" });
const MONEY_FORMATTERS = new Map();

function formatNumber(v = 0) { return NUMBER_FORMATTER.format(num(v, 0)); }
function formatMoney(v = 0, currency = DEFAULT_CURRENCY) {
  const code = txt(currency, DEFAULT_CURRENCY).toUpperCase();
  let formatter = MONEY_FORMATTERS.get(code);
  if (!formatter) {
    try { formatter = new Intl.NumberFormat("es-ES", { style: "currency", currency: code, maximumFractionDigits: 2 }); }
    catch { return \`${"${num(v, 0).toFixed(2)} €"}\`; }
    MONEY_FORMATTERS.set(code, formatter);
  }
  return formatter.format(num(v, 0));
}
function formatDate(v = "") {
  const raw = first(v, "");
  if (!raw) return "—";
  const d = new Date(raw);
  if (!Number.isFinite(d.getTime())) return txt(raw, "—");
  try { return DATE_FORMATTER.format(d); } catch { return d.toISOString(); }
}
function formatShortDate(v = "") {
  const raw = first(v, "");
  if (!raw) return "—";
  const d = new Date(raw);
  if (!Number.isFinite(d.getTime())) return txt(raw, "—");
  try { return SHORT_DATE_FORMATTER.format(d); } catch { return d.toISOString().slice(0, 10); }
}`,
    "template cached intl"
  );

  s = replaceOnce(
    s,
    '  return txt(first(r.assignedToName, r.technicianName, r.tecnicoName, r.agentName, a.assignedToName, a.technician?.name, a.technician?.displayName, tec.displayName, tec.name, tec.nombre, asg.displayName, asg.name, asg.nombre, t.displayName, t.name, t.nombre, "Cristian Ávila Luque"), "Cristian Ávila Luque");',
    '  return txt(first(r.assignedToName, r.technicianName, r.tecnicoName, r.agentName, a.assignedToName, a.technician?.name, a.technician?.displayName, tec.displayName, tec.name, tec.nombre, asg.displayName, asg.name, asg.nombre, t.displayName, t.name, t.nombre, ""), "");',
    "template no invented technician"
  );

  s = replaceOnce(
    s,
    'function normalizeItems(input = {}) {\n  const candidates = Array.isArray(input) ? [input] : arrayCandidates(input);',
    'function normalizeItems(input = {}) {\n  if (isObj(input) && input.canonical === true && Array.isArray(input.items)) return input.items;\n  const candidates = Array.isArray(input) ? [input] : arrayCandidates(input);',
    "template canonical fast path"
  );

  s = replaceRegex(
    s,
    /function filterCounts\(items = \[\]\) \{[\s\S]*?\n}/,
    `function filterCounts(items = []) {
  const counts = { all: 0, open: 0, closed: 0 };
  for (const item of arr(items)) {
    counts.all += 1;
    if (isOpen(item)) counts.open += 1;
    if (isClosed(item)) counts.closed += 1;
  }
  return counts;
}`,
    "template filter counts one pass"
  );

  s = replaceOnce(
    s,
    '  const stats = mergeStats(items, d.stats);',
    '  const stats = d.canonical === true && isObj(d.stats) ? d.stats : mergeStats(items, d.stats);',
    "template canonical stats"
  );

  s = replaceOnce(
    s,
    'function itemText(it = {}) {\n  return searchKey([getId(it), getSubject(it), getDesc(it), getClientName(it), getClientEmail(it), getAssignedName(it), getAssignedEmail(it), getCategory(it), statusLabel(getStatusRaw(it)), priorityLabel(it)].join(" "));\n}',
    'const ITEM_TEXT_CACHE = new WeakMap();\nfunction itemText(it = {}) {\n  if (isObj(it) && ITEM_TEXT_CACHE.has(it)) return ITEM_TEXT_CACHE.get(it);\n  const value = searchKey([getId(it), getSubject(it), getDesc(it), getClientName(it), getClientEmail(it), getAssignedName(it), getAssignedEmail(it), getCategory(it), statusLabel(getStatusRaw(it)), priorityLabel(it)].join(" "));\n  if (isObj(it)) ITEM_TEXT_CACHE.set(it, value);\n  return value;\n}',
    "template search cache"
  );

  write("incidencias.template.js", s);
}

function optimizeCreateTemplate() {
  let s = read("incidencias.template.create.js");

  s = replaceOnce(
    s,
    '  "incidencias.template.create.productivo.no-copy.v12";',
    '  "incidencias.template.create.extreme.v20";',
    "create version"
  );

  s = replaceRegex(
    s,
    /function first\(\.\.\.values\) \{[\s\S]*?\n}\n\nfunction number/,
    `function first(...values) {
  for (const value of values) {
    if (value === undefined || value === null) continue;
    if (typeof value === "string" && value.trim() === "") continue;
    if (Array.isArray(value) && value.length === 0) continue;
    if (isObject(value) && Object.keys(value).length === 0) continue;
    return value;
  }
  return null;
}

function number`,
    "create first no flatten"
  );

  s = replaceOnce(
    s,
    '];\n\nconst CATEGORY_OPTIONS = Object.freeze([',
    '];\n\nconst ACCEPT_EXTENSION_SET = new Set(ACCEPT_EXTENSIONS);\nconst ACCEPT_ATTRIBUTE = ACCEPT_EXTENSIONS.join(",");\n\nconst CATEGORY_OPTIONS = Object.freeze([',
    "create accept caches"
  );

  s = s.replace(/ACCEPT_EXTENSIONS\.includes\(([^)]+)\)/g, 'ACCEPT_EXTENSION_SET.has($1)');
  s = s.replace(/ACCEPT_EXTENSIONS\.join\("\,"\)/g, 'ACCEPT_ATTRIBUTE');

  write("incidencias.template.create.js", s);
}

function optimizeModalTemplate() {
  let s = read("incidencias.template.modal.js");

  s = replaceOnce(
    s,
    '  "incidencias.template.modal.production.v16.preview-sas-safe";',
    '  "incidencias.template.modal.extreme.v20.preview-sas-safe";',
    "modal version"
  );

  s = insertBefore(
    s,
    'function icon(name = "") {',
    'const MODAL_ICON_CACHE = new Map();\n\n',
    "modal icon cache declaration"
  );

  s = replaceOnce(
    s,
    'function icon(name = "") {\n  const common =',
    'function icon(name = "") {\n  if (MODAL_ICON_CACHE.has(name)) return MODAL_ICON_CACHE.get(name);\n\n  const common =',
    "modal icon cache lookup"
  );

  s = replaceOnce(
    s,
    `  return (
    icons[name] ||
    icons.file
  );
}`,
    `  const result = icons[name] || icons.file;
  MODAL_ICON_CACHE.set(name, result);
  return result;
}`,
    "modal icon cache store"
  );

  s = replaceRegex(
    s,
    /function formatMoney\([\s\S]*?\n}\n\nfunction formatDate\([\s\S]*?\n}\n\nfunction formatRelativeDate/,
    `const MODAL_MONEY_FORMATTERS = new Map();
const MODAL_DATE_FORMATTER = new Intl.DateTimeFormat("es-ES", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function formatMoney(value = 0, currency = DEFAULT_CURRENCY) {
  const code = cleanText(currency, DEFAULT_CURRENCY).toUpperCase();
  let formatter = MODAL_MONEY_FORMATTERS.get(code);
  if (!formatter) {
    try {
      formatter = new Intl.NumberFormat("es-ES", { style: "currency", currency: code, maximumFractionDigits: 2 });
      MODAL_MONEY_FORMATTERS.set(code, formatter);
    } catch {
      return \`${"${number(value, 0).toFixed(2)} €"}\`;
    }
  }
  return formatter.format(number(value, 0));
}

function formatDate(value = "") {
  const raw = first(value, "");
  if (!raw) return "—";
  const date = new Date(raw);
  if (!Number.isFinite(date.getTime())) return cleanText(raw, "—");
  try { return MODAL_DATE_FORMATTER.format(date); }
  catch { return date.toISOString(); }
}

function formatRelativeDate`,
    "modal cached intl"
  );

  write("incidencias.template.modal.js", s);
}

optimizeApi();
optimizeIndex();
optimizeListTemplate();
optimizeCreateTemplate();
optimizeModalTemplate();

console.log("incidencias one-shot optimization complete");
