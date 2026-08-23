export const INCIDENCIAS_USER_UPDATE_TURN_VERSION =
  "incidencias-user-update-turn.v3.hidden-pending-newest-first";

const VIEW = "#view-container, [data-router-view='true']";
const HOST = "[data-incidencias-modal-host='true']";
const ROOT = "[data-incidencias-modal-root='true']";
const ADMIN = "[data-modal-admin-editor='true']";
const COMPOSER = "[data-modal-composer='true']";
const SUCCESS = ".incidencias-modal-feedback--success";
const COMMENTS = ".incidencias-modal-description-comments";
const COMMENT = ".incidencias-modal-description-comment";
const FILES = ".incidencias-modal-attachments-grid";
const FILE = ".incidencias-modal-attachment-card[data-attachment-id]";
const POLL_MS = 30000;

const SUPPORT_ROLES = new Set(["admin","support","technician","tecnico","agent","staff"]);
const USER_ROLES = new Set(["user","standard","client","cliente","customer","requester"]);
const SUPPORT_SOURCES = new Set(["support","admin","technician","tecnico","agent","staff"]);
const USER_SOURCES = new Set(["user","client","cliente","customer","requester"]);
const COMMENT_FIELDS = new Set(["comments","comment","comentarios","comentario"]);
const FILE_FIELDS = new Set(["attachments","attachment","adjuntos","adjunto","files","file"]);

let mounted = false;
let mountRoot = null;
let host = null;
let viewObserver = null;
let modalObserver = null;
let frame = 0;
let pollTimer = 0;
let requestSeq = 0;
let request = null;
let activeRoot = null;
let activeId = "";
let lastSuccess = "";
let internalMutation = false;
let apiPromise = null;
const detached = new WeakMap();

const browser = () => typeof window !== "undefined" && typeof document !== "undefined";
const text = (value = "", fallback = "") => String(value ?? "").replace(/[\r\n\t]/g," ").replace(/\s+/g," ").trim() || fallback;
const lower = (value = "") => text(value).toLowerCase();
const obj = (value, fallback = {}) => value && typeof value === "object" && !Array.isArray(value) ? value : fallback;
const arr = (value) => Array.isArray(value) ? value : [];

function first(...values) {
  for (const value of values) {
    if (value == null) continue;
    if (typeof value === "string" && !value.trim()) continue;
    if (Array.isArray(value) && !value.length) continue;
    if (value && typeof value === "object" && !Array.isArray(value) && !Object.keys(value).length) continue;
    return value;
  }
  return null;
}

function stamp(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value < 1e11 ? value * 1000 : value;
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function eventTime(entry = {}) {
  const raw = obj(entry);
  return Math.max(stamp(raw.createdAt),stamp(raw.updatedAt),stamp(raw.uploadedAt),stamp(raw.date),stamp(raw.timestamp),stamp(raw.at));
}

function currentRoot() { return host?.querySelector?.(ROOT) || null; }
function ticketId(root = currentRoot()) { return text(first(root?.dataset?.ticketId, root?.dataset?.incidenciaId), ""); }
const api = () => apiPromise ||= import("../../views/incidencias/incidencias.api.js");

function supportIdentity(detail = {}) {
  const raw = obj(first(detail?.raw, detail));
  const assignment = obj(raw.assignment);
  const tech = obj(assignment.technician);
  const assigned = obj(raw.assignedTo);
  const tecnico = obj(raw.tecnico);
  const meta = obj(raw.meta);
  return {
    ids: new Set([raw.assignedToUserId,raw.technicianUserId,assignment.assignedToUserId,assignment.technicianUserId,tech.userId,tech.id,assigned.userId,assigned.id,tecnico.userId,tecnico.id,meta.technicianUserId,meta.lastTechnicianUserId].map(text).filter(Boolean)),
    emails: new Set([raw.assignedToEmail,raw.technicianEmail,assignment.assignedToEmail,assignment.technicianEmail,tech.email,assigned.email,tecnico.email,meta.technicianEmail,meta.lastTechnicianEmail].map(lower).filter(Boolean)),
  };
}

function side(entry = {}, detail = {}) {
  const raw = obj(entry);
  const source = lower(raw.source || raw.origin || raw.actorType);
  if (SUPPORT_SOURCES.has(source)) return "support";
  if (USER_SOURCES.has(source)) return "user";
  const role = lower(raw.role || raw.rol || raw.actorRole || raw.by?.role || raw.createdBy?.role || raw.uploadedBy?.role);
  if (SUPPORT_ROLES.has(role)) return "support";
  if (USER_ROLES.has(role)) return "user";
  const identity = supportIdentity(detail);
  const id = text(raw.byUserId || raw.userId || raw.actorUserId || raw.by?.userId || raw.createdBy?.userId || raw.uploadedBy?.userId);
  if (id && identity.ids.has(id)) return "support";
  const email = lower(raw.byEmail || raw.email || raw.actorEmail || raw.by?.email || raw.createdBy?.email || raw.uploadedBy?.email);
  if (email && identity.emails.has(email)) return "support";
  return "";
}

function historyKinds(entry = {}) {
  const raw = obj(entry);
  const kinds = new Set();
  for (const change of arr(raw.changes)) {
    const c = obj(change);
    const action = lower(c.action || "add");
    if (!["add","create","created","upload","uploaded"].includes(action)) continue;
    const field = lower(c.field || c.type || c.kind);
    if (COMMENT_FIELDS.has(field)) kinds.add("comment");
    if (FILE_FIELDS.has(field)) kinds.add("attachment");
  }
  const type = lower(raw.kind || raw.type || raw.action || raw.event);
  if (["comment","comentario","comment_added"].includes(type)) kinds.add("comment");
  if (["attachments_added","attachment_added","attachment_uploaded"].includes(type)) kinds.add("attachment");
  return kinds;
}

function awaiting(detail = {}) {
  const raw = obj(first(detail?.raw, detail));
  const explicit = first(detail?.userUpdatePolicy,detail?.meta?.userUpdatePolicy,raw.userUpdatePolicy,raw.meta?.userUpdatePolicy);
  if (typeof explicit?.awaitingSupportResponse === "boolean") return explicit.awaitingSupportResponse;
  let latestUser = 0;
  let latestSupport = 0;
  for (const comment of arr(first(detail?.comments,raw.comments,[]))) {
    const at = eventTime(comment);
    if (side(comment,raw) === "user") latestUser = Math.max(latestUser,at);
    if (side(comment,raw) === "support") latestSupport = Math.max(latestSupport,at);
  }
  for (const entry of arr(first(detail?.history,raw.history,[]))) {
    if (!historyKinds(entry).size) continue;
    const at = eventTime(entry);
    if (side(entry,raw) === "user") latestUser = Math.max(latestUser,at);
    if (side(entry,raw) === "support") latestSupport = Math.max(latestSupport,at);
  }
  return latestUser > latestSupport;
}

function ownMutation(callback) {
  internalMutation = true;
  try { callback(); }
  finally { queueMicrotask(() => { internalMutation = false; }); }
}

function hideComposer(root) {
  if (!root || root.querySelector(ADMIN)) return false;
  const state = detached.get(root);
  if (state?.marker?.isConnected && !state.composer?.isConnected) return true;
  const composer = root.querySelector(COMPOSER);
  if (!composer?.parentNode) return false;
  const marker = document.createComment("onion-user-update-turn");
  ownMutation(() => composer.replaceWith(marker));
  detached.set(root,{marker,composer});
  return true;
}

function showComposer(root) {
  if (!root || root.querySelector(ADMIN)) return false;
  const state = detached.get(root);
  if (!state) return Boolean(root.querySelector(COMPOSER));
  if (state.marker?.isConnected && !state.composer?.isConnected) ownMutation(() => state.marker.replaceWith(state.composer));
  detached.delete(root);
  return true;
}

function commentsForOrder(detail = {}) {
  const raw = obj(first(detail?.raw,detail?.data,detail?.item,detail));
  const timeline = arr(first(detail?.timeline,raw.timeline,[]));
  let source = timeline.length
    ? timeline.filter((entry) => ["comment","comentario"].includes(lower(first(entry?.kind,entry?.type,entry?.action,entry?.event,""))))
    : arr(first(detail?.comments,detail?.notes,detail?.messages,raw.comments,raw.notes,raw.messages,[]));
  return source.map((entry,index) => ({index,time:eventTime(entry)})).sort((a,b) => a.time - b.time || a.index - b.index);
}

function sortComments(root, detail = {}) {
  const list = root?.querySelector?.(COMMENTS);
  if (!list) return false;
  const cards = Array.from(list.querySelectorAll(`:scope > ${COMMENT}`));
  const order = commentsForOrder(detail);
  if (cards.length < 2 || cards.length !== order.length) return false;
  const ranked = cards.map((card,index) => ({card,index,time:order[index]?.time || 0}));
  const desired = [...ranked].sort((a,b) => b.time - a.time || a.index - b.index);
  if (!desired.some((entry,index) => entry.card !== cards[index])) return true;
  ownMutation(() => desired.forEach((entry) => list.appendChild(entry.card)));
  return true;
}

function fileId(file = {}, index = 0) {
  return text(first(file?.id,file?.attachmentId,file?.fileId,file?.storageKey,file?.path,file?.blobPath,file?.blobName,`att_${index}`),`att_${index}`);
}

function sortFiles(root, detail = {}) {
  const grid = root?.querySelector?.(FILES);
  if (!grid) return false;
  const cards = Array.from(grid.querySelectorAll(`:scope > ${FILE}`));
  if (cards.length < 2) return false;
  const raw = obj(first(detail?.raw,detail));
  const times = new Map(arr(first(detail?.attachments,detail?.files,detail?.adjuntos,raw.attachments,raw.files,raw.adjuntos,[])).map((file,index) => [fileId(file,index),Math.max(stamp(file?.uploadedAt),stamp(file?.createdAt),stamp(file?.updatedAt),stamp(file?.date))]));
  const ranked = cards.map((card,index) => ({card,index,time:times.get(text(card.dataset?.attachmentId)) || 0}));
  const desired = [...ranked].sort((a,b) => b.time - a.time || a.index - b.index);
  if (!desired.some((entry,index) => entry.card !== cards[index])) return true;
  ownMutation(() => desired.forEach((entry) => grid.appendChild(entry.card)));
  return true;
}

function project(root, detail = {}) {
  if (!root?.isConnected) return false;
  if (root.querySelector(ADMIN)) showComposer(root);
  else if (awaiting(detail)) hideComposer(root);
  else showComposer(root);
  sortComments(root,detail);
  sortFiles(root,detail);
  return true;
}

function clearPoll() {
  if (!pollTimer || !browser()) return false;
  window.clearTimeout(pollTimer);
  pollTimer = 0;
  return true;
}

function planPoll(id, detail) {
  clearPoll();
  if (!browser() || !awaiting(detail)) return false;
  pollTimer = window.setTimeout(() => {
    pollTimer = 0;
    const root = currentRoot();
    if (root && ticketId(root) === id) hydrate(id,true);
  },POLL_MS);
  return true;
}

function hydrate(id, force = false) {
  const cleanId = text(id);
  if (!cleanId) return null;
  if (request?.ticketId === cleanId && request?.promise && !force) return request;
  const seq = ++requestSeq;
  const current = {ticketId:cleanId,detail:!force && request?.ticketId === cleanId ? request.detail : null,resolved:false,error:null,promise:null};
  current.promise = (async () => {
    try {
      const source = await api();
      const detail = await source.loadIncidenciaDetail(cleanId,{force:true,cache:false});
      if (seq !== requestSeq) return null;
      current.detail = detail || null;
      current.resolved = true;
      planPoll(cleanId,current.detail || {});
      return current.detail;
    } catch (error) {
      if (seq === requestSeq) { current.error = error; current.resolved = true; }
      return null;
    } finally { schedule(); }
  })();
  request = current;
  return current;
}

function nodeTouches(node, selectors) {
  return node instanceof Element && selectors.some((selector) => node.matches?.(selector) || node.querySelector?.(selector));
}

function modalMatters(mutations) {
  if (internalMutation) return false;
  const selectors = [ROOT,SUCCESS,COMMENTS,COMMENT,FILES,FILE];
  for (const mutation of mutations) {
    if (mutation.type === "attributes" && mutation.attributeName === "data-submitting") return true;
    for (const node of [...mutation.addedNodes,...mutation.removedNodes]) if (nodeTouches(node,selectors)) return true;
  }
  return false;
}

function syncHostObserver() {
  const next = document.querySelector(HOST);
  if (next === host) return Boolean(next);
  modalObserver?.disconnect?.();
  host = next || null;
  if (host && typeof MutationObserver !== "undefined") {
    modalObserver = new MutationObserver((mutations) => { if (modalMatters(mutations)) schedule(); });
    modalObserver.observe(host,{childList:true,subtree:true,attributes:true,attributeFilter:["data-submitting"]});
  }
  return Boolean(host);
}

function refreshAfterSuccess(root) {
  const success = root?.querySelector?.(SUCCESS);
  const id = ticketId(root);
  if (!success || !id) return false;
  const key = `${id}::${text(success.textContent)}`;
  if (!key || key === lastSuccess) return false;
  lastSuccess = key;
  hydrate(id,true);
  return true;
}

function sync() {
  if (!browser()) return false;
  syncHostObserver();
  const root = currentRoot();
  const id = ticketId(root);
  if (!root || !id) {
    clearPoll();
    activeRoot = null;
    activeId = "";
    lastSuccess = "";
    return false;
  }
  if (root.querySelector(ADMIN)) {
    activeRoot = root;
    activeId = id;
    showComposer(root);
    return true;
  }
  if (activeRoot !== root || activeId !== id) {
    activeRoot = root;
    activeId = id;
    lastSuccess = "";
    hideComposer(root);
    hydrate(id,true);
    return true;
  }
  if (refreshAfterSuccess(root)) return true;
  if (request?.ticketId === id && request?.detail) return project(root,request.detail);
  if (request?.ticketId === id && request?.resolved && request?.error) return showComposer(root);
  if (!request?.promise) { hideComposer(root); hydrate(id,true); }
  return true;
}

function schedule() {
  if (!browser() || frame) return false;
  frame = window.requestAnimationFrame(() => { frame = 0; sync(); });
  return true;
}

export function mountIncidenciasUserUpdateTurn() {
  if (!browser()) return false;
  if (mounted) return true;
  mountRoot = document.querySelector(VIEW) || document.body;
  if (!mountRoot) return false;
  mounted = true;
  if (typeof MutationObserver !== "undefined") {
    viewObserver = new MutationObserver((mutations) => {
      if (internalMutation) return;
      for (const mutation of mutations) {
        for (const node of [...mutation.addedNodes,...mutation.removedNodes]) {
          if (nodeTouches(node,[HOST,ROOT])) { schedule(); return; }
        }
      }
    });
    viewObserver.observe(mountRoot,{childList:true,subtree:true});
  }
  schedule();
  return true;
}

export function destroyIncidenciasUserUpdateTurn() {
  viewObserver?.disconnect?.();
  modalObserver?.disconnect?.();
  clearPoll();
  if (frame && browser()) window.cancelAnimationFrame?.(frame);
  mounted = false;
  mountRoot = null;
  host = null;
  viewObserver = null;
  modalObserver = null;
  frame = 0;
  request = null;
  activeRoot = null;
  activeId = "";
  lastSuccess = "";
  internalMutation = false;
  requestSeq += 1;
  return true;
}

export function getIncidenciasUserUpdateTurnSnapshot() {
  return Object.freeze({
    version: INCIDENCIAS_USER_UPDATE_TURN_VERSION,
    mounted,
    ticketId: request?.ticketId || "",
    hydrated: Boolean(request?.detail),
    awaitingSupportResponse: request?.detail ? awaiting(request.detail) : null,
    backendIsAuthority: true,
    composerPolicy: "remove_while_awaiting_support",
    ordering: "newest_first",
    unlocksOn: "support_comment_or_attachment",
  });
}

if (browser()) mountIncidenciasUserUpdateTurn();

export default Object.freeze({
  version: INCIDENCIAS_USER_UPDATE_TURN_VERSION,
  mount: mountIncidenciasUserUpdateTurn,
  destroy: destroyIncidenciasUserUpdateTurn,
  getSnapshot: getIncidenciasUserUpdateTurnSnapshot,
});
