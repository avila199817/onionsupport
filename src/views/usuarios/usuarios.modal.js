/* =========================================================
   Onion SPA - Usuarios Modal
   Archivo: src/views/usuarios/usuarios.modal.js

   FINAL PRO SYSTEM · DETAIL MODAL · USUARIOS EDITION · HARDENED 10/10

   RESPONSABILIDADES:
   - renderizar modal premium de detalle de usuario
   - abrir / cerrar modal limpio
   - actualizar modal si ya está abierto
   - refrescar contenido del usuario desde modal vía event bus
   - copiar ID usuario vía event bus con fallback clipboard
   - soportar timeline / docs / metadata
   - bridge global para usuariosView.js
   - integración AppCore.events desacoplada
   - singleton real
   - loader premium durante refresh
   - cierre con ESC / overlay / botón
   - preservar focus y scroll body
   - payloads heterogéneos: detail/user/usuario/item/data/payload/result
========================================================= */

import { AppCore } from "../../core/index.js";

import {
  normalizeUsuarioModel,
  getStatusLabel,
  getRoleLabel,
  getAvatarTheme,
  getInitials,
} from "./usuarios.model.js";

/* =========================================================
   CONSTANTS
========================================================= */

const MODAL_ID = "usuarios-detail-modal-root";
const PANEL_ID = "usuarios-detail-modal-panel";

const REFRESH_FALLBACK_TIMEOUT_MS = 15000;

/* =========================================================
   STATE
========================================================= */

const modalState = {
  detail: null,
  isOpen: false,
  isRefreshing: false,
  bindingsAttached: false,
  lastActiveElement: null,
  previousBodyOverflow: "",
  escHandler: null,
  refreshSeq: 0,
};

/* =========================================================
   SAFE HELPERS
========================================================= */

function safeText(value, fallback = "") {
  if (value === null || value === undefined) return fallback;

  const text = String(value).trim();

  return text || fallback;
}

function safeLower(value = "", fallback = "") {
  return safeText(value, fallback).toLowerCase();
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function safeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function safeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function first(...values) {
  for (const value of values) {
    if (value === undefined || value === null) continue;
    if (typeof value === "string" && value.trim() === "") continue;
    if (Array.isArray(value) && value.length === 0) continue;

    return value;
  }

  return null;
}

function escapeHtml(value = "") {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizeWhitespace(value = "") {
  return safeText(value, "").replace(/\s+/g, " ").trim();
}

function safeEmit(event = "", payload = {}) {
  const eventName = safeText(event, "");
  if (!eventName) return false;

  try {
    AppCore?.events?.emit?.(eventName, payload);
    return true;
  } catch {}

  try {
    window.dispatchEvent(
      new CustomEvent(eventName, {
        detail: payload,
      })
    );
    return true;
  } catch {}

  return false;
}

function safeOn(event = "", handler = null) {
  const eventName = safeText(event, "");
  if (!eventName || typeof handler !== "function") return false;

  let attached = false;

  try {
    AppCore?.events?.on?.(eventName, handler);
    attached = true;
  } catch {}

  try {
    window.addEventListener(eventName, handler);
    attached = true;
  } catch {}

  return attached;
}

function safeOff(event = "", handler = null) {
  const eventName = safeText(event, "");
  if (!eventName || typeof handler !== "function") return false;

  let detached = false;

  try {
    AppCore?.events?.off?.(eventName, handler);
    detached = true;
  } catch {}

  try {
    window.removeEventListener(eventName, handler);
    detached = true;
  } catch {}

  return detached;
}

function showToast(message = "", type = "info") {
  const text = safeText(message, "");
  if (!text) return;

  try {
    if (typeof AppCore?.toast?.[type] === "function") {
      AppCore.toast[type](text);
      return;
    }
  } catch {}

  try {
    AppCore?.toast?.show?.(text, type);
    return;
  } catch {}

  try {
    AppCore?.ui?.toast?.[type]?.(text);
  } catch {}
}

function unwrapEventDetail(event = null) {
  return safeObject(
    first(
      event?.detail?.detail,
      event?.detail?.user,
      event?.detail?.usuario,
      event?.detail?.data,
      event?.detail,
      event?.payload?.detail,
      event?.payload,
      event
    )
  );
}

/* =========================================================
   DATE / FORMAT
========================================================= */

function formatDate(value = null) {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  try {
    return new Intl.DateTimeFormat("es-ES", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  } catch {
    return "—";
  }
}

function formatRelativeDate(value = null) {
  if (!value) return "Sin fecha";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Sin fecha";

  const diffMs = date.getTime() - Date.now();
  const diffMin = Math.round(diffMs / 60000);
  const absMin = Math.abs(diffMin);

  if (absMin < 1) return "Ahora mismo";

  if (absMin < 60) {
    return diffMin > 0 ? `En ${absMin} min` : `Hace ${absMin} min`;
  }

  const diffHours = Math.round(absMin / 60);

  if (diffHours < 24) {
    return diffMin > 0 ? `En ${diffHours} h` : `Hace ${diffHours} h`;
  }

  const diffDays = Math.round(diffHours / 24);

  if (diffDays <= 7) {
    return diffMin > 0
      ? `En ${diffDays} día${diffDays === 1 ? "" : "s"}`
      : `Hace ${diffDays} día${diffDays === 1 ? "" : "s"}`;
  }

  return formatDate(value);
}

function formatPhone(value = "") {
  const raw = safeText(value, "");
  if (!raw || raw === "Sin teléfono") return "Sin teléfono";

  const digits = raw.replace(/[^\d]/g, "");

  if (!digits) return raw;

  let prefix = "";
  let national = digits;

  if (digits.length === 11 && digits.startsWith("34")) {
    prefix = "+34 ";
    national = digits.slice(2);
  } else if (raw.trim().startsWith("+34") && digits.length >= 11) {
    prefix = "+34 ";
    national = digits.slice(-9);
  }

  if (national.length === 9) {
    return `${prefix}${national.slice(0, 3)} ${national.slice(3, 6)} ${national.slice(6)}`;
  }

  return raw;
}

function formatBoolean(value = null, yes = "Sí", no = "No", fallback = "—") {
  if (typeof value === "boolean") return value ? yes : no;

  if (typeof value === "string") {
    const key = value.trim().toLowerCase();

    if (["true", "1", "yes", "si", "sí"].includes(key)) return yes;
    if (["false", "0", "no"].includes(key)) return no;
  }

  if (typeof value === "number") {
    if (value === 1) return yes;
    if (value === 0) return no;
  }

  return fallback;
}

function formatBytes(bytes = 0) {
  const size = Number(bytes);

  if (!Number.isFinite(size) || size <= 0) return "";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;

  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

/* =========================================================
   PAYLOAD / MODEL
========================================================= */

function isLikelyUsuario(value = null) {
  const obj = safeObject(value);

  return Boolean(
    obj.userId ||
      obj.usuarioId ||
      obj.id ||
      obj.uid ||
      obj._id ||
      obj.username ||
      obj.userName ||
      obj.name ||
      obj.nombre ||
      obj.fullName ||
      obj.displayName ||
      obj.email ||
      obj.mail
  );
}

function unwrapUsuarioPayload(payload = null) {
  if (!payload) return null;

  if (Array.isArray(payload)) {
    return unwrapUsuarioPayload(payload[0] || null);
  }

  if (isLikelyUsuario(payload)) {
    return payload;
  }

  const obj = safeObject(payload);

  const candidates = [
    obj.detail,
    obj.user,
    obj.usuario,
    obj.item,
    obj.data?.user,
    obj.data?.usuario,
    obj.data?.item,
    obj.result?.user,
    obj.result?.usuario,
    obj.result?.item,
    obj.payload?.user,
    obj.payload?.usuario,
    obj.payload?.item,
    obj.data,
    obj.result,
    obj.payload,
  ];

  for (const candidate of candidates) {
    if (!candidate) continue;

    const unwrapped = unwrapUsuarioPayload(candidate);
    if (unwrapped) return unwrapped;
  }

  return Object.keys(obj).length ? obj : null;
}

function normalizeDetail(detail = {}) {
  const raw = safeObject(unwrapUsuarioPayload(detail) || detail);
  const normalized = normalizeUsuarioModel(raw);

  return {
    ...raw,
    ...normalized,
    raw,
  };
}

function getRaw(detail = {}) {
  return safeObject(first(detail.raw, detail));
}

function getUserId(detail = {}) {
  const raw = getRaw(detail);

  return safeText(
    first(
      detail.userId,
      detail.usuarioId,
      detail.id,
      detail.uid,
      detail._id,
      raw.userId,
      raw.usuarioId,
      raw.id,
      raw.uid,
      raw._id,
      detail.username,
      raw.username,
      detail.email,
      raw.email
    ),
    ""
  );
}

function getUsername(detail = {}) {
  const raw = getRaw(detail);

  return safeText(
    first(
      detail.username,
      detail.userName,
      raw.username,
      raw.userName,
      detail.email,
      raw.email
    ),
    "Sin username"
  );
}

function getName(detail = {}) {
  const raw = getRaw(detail);

  return safeText(
    first(
      detail.name,
      detail.nombre,
      detail.fullName,
      detail.displayName,
      raw.name,
      raw.nombre,
      raw.fullName,
      raw.displayName,
      raw.profile?.name,
      raw.profile?.displayName,
      getUsername(detail)
    ),
    "Usuario"
  );
}

function getEmail(detail = {}) {
  const raw = getRaw(detail);

  return safeText(
    first(
      detail.email,
      detail.mail,
      raw.email,
      raw.mail,
      raw.profile?.email,
      raw.contact?.email
    ),
    "Sin email"
  );
}

function getPhone(detail = {}) {
  const raw = getRaw(detail);

  return formatPhone(
    first(
      detail.phone,
      detail.telefono,
      detail.mobile,
      raw.phone,
      raw.telefono,
      raw.mobile,
      raw.profile?.phone,
      raw.contact?.phone
    ) || ""
  );
}

function getAvatar(detail = {}) {
  const raw = getRaw(detail);

  return safeText(
    first(
      detail.avatar,
      detail.avatarUrl,
      detail.photo,
      detail.photoUrl,
      detail.image,
      detail.imageUrl,
      raw.avatar,
      raw.avatarUrl,
      raw.avatar_url,
      raw.photo,
      raw.photoUrl,
      raw.photo_url,
      raw.image,
      raw.imageUrl,
      raw.picture,
      raw.pictureUrl,
      raw.profile?.avatar,
      raw.profile?.avatarUrl
    ),
    ""
  );
}

function getCity(detail = {}) {
  const raw = getRaw(detail);

  return safeText(
    first(
      detail.city,
      detail.ciudad,
      detail.locationCity,
      raw.city,
      raw.ciudad,
      raw.locationCity,
      raw.location?.city,
      raw.location?.ciudad,
      raw.ubicacion?.city,
      raw.ubicacion?.ciudad,
      raw.address?.city,
      raw.address?.ciudad,
      raw.direccion?.city,
      raw.direccion?.ciudad,
      raw.profile?.city,
      raw.profile?.ciudad
    ),
    "Sin ciudad"
  );
}

function getAddress(detail = {}) {
  const raw = getRaw(detail);
  const direccion = safeObject(first(detail.direccion, detail.address, raw.direccion, raw.address));

  const street = safeText(
    first(
      detail.addressStreet,
      detail.street,
      detail.calle,
      raw.addressStreet,
      raw.street,
      raw.calle,
      direccion.calle,
      direccion.street
    ),
    ""
  );

  const cp = safeText(
    first(
      detail.addressCp,
      detail.cp,
      detail.postalCode,
      raw.addressCp,
      raw.cp,
      raw.postalCode,
      direccion.cp,
      direccion.postalCode
    ),
    ""
  );

  const city = safeText(first(getCity(detail), direccion.ciudad, direccion.city), "");
  const province = safeText(
    first(
      detail.addressProvince,
      detail.province,
      detail.provincia,
      raw.addressProvince,
      raw.province,
      raw.provincia,
      direccion.provincia,
      direccion.province
    ),
    ""
  );

  const country = safeText(
    first(
      detail.addressCountry,
      detail.country,
      detail.pais,
      raw.addressCountry,
      raw.country,
      raw.pais,
      direccion.pais,
      direccion.country
    ),
    ""
  );

  return {
    street,
    cp,
    city,
    province,
    country,
    hasAny: Boolean(street || cp || city || province || country),
  };
}

function getNif(detail = {}) {
  const raw = getRaw(detail);

  return safeText(
    first(
      detail.nif,
      detail.cif,
      detail.documentId,
      detail.taxId,
      raw.nif,
      raw.cif,
      raw.documentId,
      raw.taxId
    ),
    "—"
  );
}

function getNotes(detail = {}) {
  const raw = getRaw(detail);

  return safeText(
    first(
      detail.notes,
      detail.notas,
      detail.internalNotes,
      detail.description,
      detail.descripcion,
      raw.notes,
      raw.notas,
      raw.internalNotes,
      raw.description,
      raw.descripcion
    ),
    "Sin notas internas."
  );
}

function getCreatedAt(detail = {}) {
  const raw = getRaw(detail);

  return first(
    detail.createdAt,
    detail.created_at,
    detail.fechaAlta,
    detail.fechaCreacion,
    raw.createdAt,
    raw.created_at,
    raw.fechaAlta,
    raw.fechaCreacion
  );
}

function getUpdatedAt(detail = {}) {
  const raw = getRaw(detail);

  return first(
    detail.updatedAt,
    detail.updated_at,
    detail.modifiedAt,
    detail.lastUpdate,
    raw.updatedAt,
    raw.updated_at,
    raw.modifiedAt,
    raw.lastUpdate,
    getCreatedAt(detail)
  );
}

function getLastLoginAt(detail = {}) {
  const raw = getRaw(detail);

  return first(
    detail.lastLoginAt,
    detail.last_login_at,
    detail.lastAccessAt,
    detail.ultimoAcceso,
    detail.lastSeenAt,
    detail.lastActivityAt,
    raw.lastLoginAt,
    raw.last_login_at,
    raw.lastAccessAt,
    raw.ultimoAcceso,
    raw.lastSeenAt,
    raw.lastActivityAt
  );
}

function getRole(detail = {}) {
  const raw = getRaw(detail);

  return safeText(
    first(
      detail.role,
      detail.rol,
      detail.userRole,
      detail.profile,
      raw.role,
      raw.rol,
      raw.userRole,
      raw.profile
    ),
    "user"
  );
}

function getStatus(detail = {}) {
  const raw = getRaw(detail);

  return safeText(
    first(
      detail.status,
      detail.estado,
      detail.state,
      raw.status,
      raw.estado,
      raw.state,
      typeof detail.isActive === "boolean" ? (detail.isActive ? "active" : "inactive") : null,
      typeof raw.isActive === "boolean" ? (raw.isActive ? "active" : "inactive") : null,
      typeof detail.enabled === "boolean" ? (detail.enabled ? "active" : "inactive") : null,
      typeof raw.enabled === "boolean" ? (raw.enabled ? "active" : "inactive") : null
    ),
    "active"
  );
}

function getDocuments(detail = {}) {
  const raw = getRaw(detail);

  return safeArray(
    first(
      detail.documents,
      detail.docs,
      detail.files,
      detail.attachments,
      detail.adjuntos,
      raw.documents,
      raw.docs,
      raw.files,
      raw.attachments,
      raw.adjuntos
    )
  );
}

function getDocName(doc = {}, index = 0) {
  return safeText(
    first(
      doc.name,
      doc.filename,
      doc.fileName,
      doc.title,
      doc.originalName,
      doc.label
    ),
    `Documento ${index + 1}`
  );
}

function getDocMeta(doc = {}) {
  return [
    safeText(first(doc.type, doc.mimeType, doc.mimetype), ""),
    formatBytes(first(doc.size, doc.bytes)),
  ]
    .filter(Boolean)
    .join(" · ");
}

/* =========================================================
   AVATAR
========================================================= */

function getAvatarThemeStyles(seed = "") {
  const theme = getAvatarTheme(seed);

  const themes = {
    violet: {
      bg: "linear-gradient(135deg, rgba(124,92,255,.24), rgba(88,72,200,.12))",
      border: "rgba(124,92,255,.28)",
      text: "#f3eeff",
    },
    emerald: {
      bg: "linear-gradient(135deg, rgba(54,198,144,.24), rgba(35,131,95,.12))",
      border: "rgba(54,198,144,.28)",
      text: "#e7fff4",
    },
    blue: {
      bg: "linear-gradient(135deg, rgba(96,165,250,.24), rgba(37,99,235,.12))",
      border: "rgba(96,165,250,.28)",
      text: "#edf5ff",
    },
    amber: {
      bg: "linear-gradient(135deg, rgba(255,188,66,.24), rgba(217,119,6,.12))",
      border: "rgba(255,188,66,.28)",
      text: "#fff6df",
    },
    rose: {
      bg: "linear-gradient(135deg, rgba(255,107,107,.24), rgba(190,24,93,.12))",
      border: "rgba(255,107,107,.28)",
      text: "#fff0f0",
    },
    purple: {
      bg: "linear-gradient(135deg, rgba(179,136,255,.24), rgba(109,40,217,.12))",
      border: "rgba(179,136,255,.28)",
      text: "#f7efff",
    },
    cyan: {
      bg: "linear-gradient(135deg, rgba(34,211,238,.22), rgba(8,145,178,.12))",
      border: "rgba(34,211,238,.28)",
      text: "#ecfeff",
    },
    orange: {
      bg: "linear-gradient(135deg, rgba(251,146,60,.24), rgba(194,65,12,.12))",
      border: "rgba(251,146,60,.28)",
      text: "#fff7ed",
    },
  };

  return themes[theme] || themes.violet;
}

function renderAvatar(detail = {}) {
  const avatar = getAvatar(detail);
  const name = getName(detail);
  const initials = getInitials(name || getUsername(detail) || "US");
  const theme = getAvatarThemeStyles(
    first(getUserId(detail), getEmail(detail), getUsername(detail), name, "usuario")
  );

  if (avatar) {
    return `
      <div
        class="usr-modal-avatar"
        style="
          --usr-modal-avatar-bg:${theme.bg};
          --usr-modal-avatar-border:${theme.border};
          --usr-modal-avatar-text:${theme.text};
        "
        aria-label="${escapeHtml(name)}"
      >
        <img
          src="${escapeHtml(avatar)}"
          alt="${escapeHtml(name)}"
          loading="lazy"
          referrerpolicy="no-referrer"
          onerror="this.style.display='none'; this.parentNode.setAttribute('data-fallback','true');"
        >
        <span>${escapeHtml(initials)}</span>
      </div>
    `;
  }

  return `
    <div
      class="usr-modal-avatar usr-modal-avatar--fallback"
      style="
        --usr-modal-avatar-bg:${theme.bg};
        --usr-modal-avatar-border:${theme.border};
        --usr-modal-avatar-text:${theme.text};
      "
      aria-label="${escapeHtml(name)}"
    >
      <span>${escapeHtml(initials)}</span>
    </div>
  `;
}

/* =========================================================
   UI PARTIALS
========================================================= */

function renderSpinner(label = "") {
  return `
    <span class="usr-modal-inline-loading">
      <span class="usr-modal-spinner" aria-hidden="true"></span>
      <span>${escapeHtml(label)}</span>
    </span>
  `;
}

function renderRefreshOverlay() {
  return `
    <div class="usr-modal-loading-overlay" aria-live="polite" aria-busy="true">
      <div class="usr-modal-loading-card">
        <span class="usr-modal-loading-spinner" aria-hidden="true"></span>
        <strong>Actualizando usuario...</strong>
      </div>
    </div>
  `;
}

function renderChip(label = "", type = "neutral") {
  return `
    <span class="usr-modal-chip usr-modal-chip--${escapeHtml(type)}">
      ${escapeHtml(label)}
    </span>
  `;
}

function renderMetaCard(label = "", value = "", options = {}) {
  const opts = safeObject(options);
  const isMuted = Boolean(opts.muted);

  return `
    <article class="usr-modal-meta-card${isMuted ? " is-muted" : ""}">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(safeText(value, "—"))}</strong>
    </article>
  `;
}

function renderSection(title = "", body = "") {
  return `
    <section class="usr-modal-section">
      <h3>${escapeHtml(title)}</h3>
      ${body}
    </section>
  `;
}

function renderNotes(detail = {}) {
  const notes = getNotes(detail);

  return renderSection(
    "Notas internas",
    `
      <div class="usr-modal-notes">
        ${escapeHtml(notes)}
      </div>
    `
  );
}

function renderAddress(detail = {}) {
  const address = getAddress(detail);

  if (!address.hasAny) {
    return renderSection(
      "Dirección",
      `
        <div class="usr-modal-notes">
          Sin dirección registrada.
        </div>
      `
    );
  }

  return renderSection(
    "Dirección",
    `
      <div class="usr-modal-address-grid">
        ${renderMetaCard("Calle", address.street || "—")}
        ${renderMetaCard("Código postal", address.cp || "—")}
        ${renderMetaCard("Ciudad", address.city || "—")}
        ${renderMetaCard("Provincia", address.province || "—")}
        ${renderMetaCard("País", address.country || "—")}
      </div>
    `
  );
}

function renderTimeline(detail = {}) {
  const createdAt = getCreatedAt(detail);
  const updatedAt = getUpdatedAt(detail);
  const lastLoginAt = getLastLoginAt(detail);

  return renderSection(
    "Actividad",
    `
      <div class="usr-modal-timeline">
        <div class="usr-modal-timeline-item">
          <span></span>
          <div>
            <strong>Creación</strong>
            <p>${escapeHtml(formatDate(createdAt))}</p>
          </div>
        </div>

        <div class="usr-modal-timeline-item">
          <span></span>
          <div>
            <strong>Última actualización</strong>
            <p>${escapeHtml(formatDate(updatedAt))}</p>
          </div>
        </div>

        <div class="usr-modal-timeline-item">
          <span></span>
          <div>
            <strong>Última conexión</strong>
            <p>${escapeHtml(lastLoginAt ? formatRelativeDate(lastLoginAt) : "Sin acceso")}</p>
          </div>
        </div>
      </div>
    `
  );
}

function renderDocuments(detail = {}) {
  const docs = getDocuments(detail);

  if (!docs.length) {
    return renderSection(
      "Documentos",
      `
        <div class="usr-modal-notes">
          Sin documentos asociados.
        </div>
      `
    );
  }

  return renderSection(
    "Documentos",
    `
      <div class="usr-modal-docs">
        ${docs
          .map((doc, index) => {
            const name = getDocName(doc, index);
            const meta = getDocMeta(doc);
            const url = safeText(first(doc.url, doc.href, doc.downloadUrl, doc.link), "");

            return `
              ${
                url
                  ? `
                    <a
                      class="usr-modal-doc-row"
                      href="${escapeHtml(url)}"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <div>
                        <strong>${escapeHtml(name)}</strong>
                        <span>${escapeHtml(meta || "Documento")}</span>
                      </div>
                    </a>
                  `
                  : `
                    <div class="usr-modal-doc-row">
                      <div>
                        <strong>${escapeHtml(name)}</strong>
                        <span>${escapeHtml(meta || "Documento")}</span>
                      </div>
                    </div>
                  `
              }
            `;
          })
          .join("")}
      </div>
    `
  );
}

function renderMetadata(detail = {}) {
  const raw = getRaw(detail);

  const metadata = [
    ["ID", getUserId(detail)],
    ["NIF / CIF", getNif(detail)],
    ["Cliente ID", first(detail.clienteId, detail.clientId, raw.clienteId, raw.clientId) || "—"],
    ["Email verificado", formatBoolean(first(detail.emailVerified, raw.emailVerified, raw.email_verified))],
    ["Modo privacidad", formatBoolean(first(detail.privacyMode, raw.privacyMode, raw.privacy_mode))],
    ["Activo", formatBoolean(first(detail.active, detail.isActive, raw.active, raw.isActive))],
  ];

  return renderSection(
    "Metadata",
    `
      <div class="usr-modal-metadata-grid">
        ${metadata.map(([label, value]) => renderMetaCard(label, value, { muted: true })).join("")}
      </div>
    `
  );
}

/* =========================================================
   STYLES
========================================================= */

function renderStyles() {
  return `
    <style>
      @keyframes usuariosModalSpin{
        to{ transform:rotate(360deg); }
      }

      .usr-modal-overlay{
        position:fixed;
        inset:0;
        z-index:9999;
        display:grid;
        place-items:center;
        padding:18px;
        background:rgba(0,0,0,.66);
        backdrop-filter:blur(10px);
        -webkit-backdrop-filter:blur(10px);
      }

      .usr-modal-panel{
        position:relative;
        width:min(1040px, 100%);
        max-height:92vh;
        overflow:auto;
        border-radius:24px;
        border:1px solid var(--border-soft, rgba(255,255,255,.12));
        background:
          radial-gradient(circle at top left, color-mix(in srgb, var(--accent, #7c5cff) 10%, transparent), transparent 34%),
          linear-gradient(180deg, var(--surface-2, #171717), var(--surface-1, #111));
        box-shadow:0 34px 84px rgba(0,0,0,.45);
      }

      .usr-modal-panel.is-refreshing{
        overflow:hidden;
      }

      .usr-modal-loading-overlay{
        position:absolute;
        inset:0;
        z-index:30;
        display:grid;
        place-items:center;
        padding:22px;
        background:color-mix(in srgb, var(--surface-1, #f8fafc) 74%, transparent);
        backdrop-filter:blur(5px);
        -webkit-backdrop-filter:blur(5px);
      }

      .usr-modal-loading-card{
        display:grid;
        justify-items:center;
        gap:12px;
        min-width:min(100%, 275px);
        padding:24px 28px;
        border-radius:18px;
        border:1px solid color-mix(in srgb, var(--accent, #7c5cff) 26%, rgba(15,23,42,.08));
        background:
          linear-gradient(180deg, color-mix(in srgb, var(--accent, #7c5cff) 8%, transparent), transparent 100%),
          rgba(255,255,255,.78);
        box-shadow:
          0 30px 70px rgba(15,23,42,.18),
          0 1px 0 rgba(255,255,255,.72) inset;
      }

      .usr-modal-loading-card strong{
        color:var(--text-strong, #111827);
        font-size:14px;
        line-height:1.35;
        font-weight:var(--weight-bold, 700);
        letter-spacing:-.015em;
      }

      .usr-modal-loading-spinner,
      .usr-modal-spinner{
        border-radius:999px;
        border-style:solid;
        animation:usuariosModalSpin .78s linear infinite;
      }

      .usr-modal-loading-spinner{
        width:30px;
        height:30px;
        border-width:3px;
        border-color:color-mix(in srgb, var(--accent, #7c5cff) 18%, transparent);
        border-top-color:var(--accent, #7c5cff);
      }

      .usr-modal-spinner{
        width:13px;
        height:13px;
        border-width:2px;
        border-color:rgba(255,255,255,.26);
        border-top-color:currentColor;
      }

      .usr-modal-inline-loading{
        display:inline-flex;
        align-items:center;
        gap:8px;
      }

      .usr-modal-header{
        display:flex;
        align-items:flex-start;
        justify-content:space-between;
        gap:18px;
        padding:18px 18px 15px;
        border-bottom:1px solid var(--border-soft, rgba(255,255,255,.10));
      }

      .usr-modal-identity{
        min-width:0;
        display:flex;
        gap:15px;
        align-items:flex-start;
      }

      .usr-modal-avatar{
        position:relative;
        width:72px;
        height:72px;
        flex:0 0 72px;
        border-radius:22px;
        overflow:hidden;
        display:grid;
        place-items:center;
        background:var(--usr-modal-avatar-bg);
        border:1px solid var(--usr-modal-avatar-border);
      }

      .usr-modal-avatar img{
        display:block;
        width:100%;
        height:100%;
        object-fit:cover;
      }

      .usr-modal-avatar span{
        position:absolute;
        inset:0;
        display:none;
        place-items:center;
        color:var(--usr-modal-avatar-text);
        font-size:24px;
        font-weight:800;
        letter-spacing:-.04em;
      }

      .usr-modal-avatar--fallback span,
      .usr-modal-avatar[data-fallback="true"] span{
        display:grid;
      }

      .usr-modal-avatar[data-fallback="true"] img{
        display:none !important;
      }

      .usr-modal-heading{
        min-width:0;
        display:grid;
        gap:9px;
      }

      .usr-modal-chips{
        display:flex;
        gap:8px;
        flex-wrap:wrap;
      }

      .usr-modal-chip{
        min-height:28px;
        padding:0 10px;
        border-radius:999px;
        display:inline-flex;
        align-items:center;
        justify-content:center;
        font-size:11px;
        font-weight:760;
        letter-spacing:.045em;
        text-transform:uppercase;
        border:1px solid var(--border-soft, rgba(255,255,255,.12));
        background:var(--surface-glass, rgba(255,255,255,.05));
        color:var(--text-soft, rgba(255,255,255,.74));
        white-space:nowrap;
      }

      .usr-modal-chip--active{
        color:#8e7dff;
        border-color:rgba(124,92,255,.28);
        background:rgba(124,92,255,.11);
      }

      .usr-modal-chip--inactive,
      .usr-modal-chip--blocked{
        color:#ff8f8f;
        border-color:rgba(255,107,107,.28);
        background:rgba(255,107,107,.10);
      }

      .usr-modal-chip--pending{
        color:#ffd27a;
        border-color:rgba(255,188,66,.28);
        background:rgba(255,188,66,.10);
      }

      .usr-modal-title{
        margin:0;
        color:var(--text-strong, #fff);
        font-size:clamp(28px, 4vw, 40px);
        line-height:.98;
        letter-spacing:-.05em;
        font-weight:800;
      }

      .usr-modal-subtitle{
        color:var(--text-dim, rgba(255,255,255,.62));
        font-size:13px;
        line-height:1.45;
      }

      .usr-modal-actions{
        display:flex;
        align-items:flex-start;
        gap:8px;
        flex-wrap:wrap;
        justify-content:flex-end;
      }

      .usr-modal-btn{
        min-height:40px;
        padding:0 13px;
        border-radius:13px;
        border:1px solid var(--border-soft, rgba(255,255,255,.12));
        background:var(--surface-glass, rgba(255,255,255,.05));
        color:var(--text-strong, #fff);
        font-size:12px;
        font-weight:740;
        cursor:pointer;
        display:inline-flex;
        align-items:center;
        justify-content:center;
        transition:
          transform .16s ease,
          background .16s ease,
          border-color .16s ease,
          opacity .16s ease;
      }

      .usr-modal-btn:hover{
        transform:translateY(-1px);
        border-color:color-mix(in srgb, var(--accent, #7c5cff) 24%, var(--border-soft, rgba(255,255,255,.12)));
      }

      .usr-modal-btn:disabled{
        opacity:.72;
        cursor:wait;
        pointer-events:none;
      }

      .usr-modal-close{
        width:40px;
        padding:0;
        font-size:17px;
      }

      .usr-modal-body{
        display:grid;
        gap:16px;
        padding:16px 18px 18px;
      }

      .usr-modal-meta-grid,
      .usr-modal-address-grid,
      .usr-modal-metadata-grid{
        display:grid;
        gap:12px;
      }

      .usr-modal-meta-grid{
        grid-template-columns:repeat(4, minmax(0, 1fr));
      }

      .usr-modal-address-grid{
        grid-template-columns:repeat(5, minmax(0, 1fr));
      }

      .usr-modal-metadata-grid{
        grid-template-columns:repeat(3, minmax(0, 1fr));
      }

      .usr-modal-meta-card{
        display:grid;
        gap:7px;
        min-height:86px;
        padding:13px;
        border-radius:16px;
        border:1px solid var(--border-soft, rgba(255,255,255,.12));
        background:var(--surface-1, rgba(255,255,255,.04));
      }

      .usr-modal-meta-card span{
        color:var(--text-dim, rgba(255,255,255,.62));
        font-size:10px;
        line-height:1.25;
        font-weight:780;
        letter-spacing:.07em;
        text-transform:uppercase;
      }

      .usr-modal-meta-card strong{
        color:var(--text-strong, #fff);
        font-size:13px;
        line-height:1.35;
        font-weight:720;
        word-break:break-word;
      }

      .usr-modal-meta-card.is-muted strong{
        color:var(--text-soft, rgba(255,255,255,.76));
      }

      .usr-modal-section{
        display:grid;
        gap:10px;
      }

      .usr-modal-section h3{
        margin:0;
        color:var(--text-strong, #fff);
        font-size:16px;
        line-height:1.25;
        font-weight:760;
        letter-spacing:-.025em;
      }

      .usr-modal-notes{
        padding:14px;
        border-radius:16px;
        border:1px solid var(--border-soft, rgba(255,255,255,.12));
        background:var(--surface-1, rgba(255,255,255,.04));
        color:var(--text-soft, rgba(255,255,255,.74));
        font-size:13px;
        line-height:1.65;
        white-space:pre-wrap;
      }

      .usr-modal-timeline{
        display:grid;
        gap:9px;
        padding:13px;
        border-radius:16px;
        border:1px solid var(--border-soft, rgba(255,255,255,.12));
        background:var(--surface-1, rgba(255,255,255,.04));
      }

      .usr-modal-timeline-item{
        display:grid;
        grid-template-columns:12px minmax(0, 1fr);
        gap:10px;
        align-items:start;
      }

      .usr-modal-timeline-item > span{
        width:9px;
        height:9px;
        margin-top:5px;
        border-radius:999px;
        background:var(--accent, #7c5cff);
        box-shadow:0 0 0 4px color-mix(in srgb, var(--accent, #7c5cff) 12%, transparent);
      }

      .usr-modal-timeline-item strong{
        display:block;
        color:var(--text-strong, #fff);
        font-size:13px;
        line-height:1.35;
      }

      .usr-modal-timeline-item p{
        margin:2px 0 0;
        color:var(--text-dim, rgba(255,255,255,.62));
        font-size:12px;
        line-height:1.4;
      }

      .usr-modal-docs{
        display:grid;
        gap:8px;
      }

      .usr-modal-doc-row{
        display:flex;
        gap:10px;
        align-items:center;
        justify-content:space-between;
        padding:11px 13px;
        border-radius:14px;
        border:1px solid var(--border-soft, rgba(255,255,255,.12));
        background:var(--surface-1, rgba(255,255,255,.04));
        text-decoration:none;
      }

      .usr-modal-doc-row strong{
        display:block;
        color:var(--text-strong, #fff);
        font-size:13px;
        line-height:1.35;
        word-break:break-word;
      }

      .usr-modal-doc-row span{
        display:block;
        margin-top:2px;
        color:var(--text-dim, rgba(255,255,255,.62));
        font-size:11px;
        line-height:1.35;
      }

      [data-theme="dark"] .usr-modal-loading-overlay{
        background:color-mix(in srgb, var(--surface-1, #111) 78%, transparent);
      }

      [data-theme="dark"] .usr-modal-loading-card{
        background:
          linear-gradient(180deg, color-mix(in srgb, var(--accent, #7c5cff) 12%, transparent), transparent 100%),
          color-mix(in srgb, var(--surface-2, #171717) 92%, transparent);
        box-shadow:
          0 30px 70px rgba(0,0,0,.36),
          0 1px 0 rgba(255,255,255,.06) inset;
      }

      [data-theme="dark"] .usr-modal-loading-card strong{
        color:var(--text-strong, #fff);
      }

      [data-theme="light"] .usr-modal-panel{
        background:
          radial-gradient(circle at top left, color-mix(in srgb, var(--accent, #7c5cff) 8%, transparent), transparent 34%),
          linear-gradient(180deg, rgba(255,255,255,.98), rgba(248,250,255,.96));
        box-shadow:
          0 28px 70px rgba(15,23,42,.14),
          0 0 0 1px rgba(255,255,255,.68) inset;
      }

      [data-theme="light"] .usr-modal-title,
      [data-theme="light"] .usr-modal-section h3,
      [data-theme="light"] .usr-modal-meta-card strong,
      [data-theme="light"] .usr-modal-timeline-item strong,
      [data-theme="light"] .usr-modal-doc-row strong{
        color:var(--text-strong, #111827);
      }

      [data-theme="light"] .usr-modal-subtitle,
      [data-theme="light"] .usr-modal-meta-card span,
      [data-theme="light"] .usr-modal-notes,
      [data-theme="light"] .usr-modal-timeline-item p,
      [data-theme="light"] .usr-modal-doc-row span{
        color:var(--text-dim, #6b7280);
      }

      [data-theme="light"] .usr-modal-btn,
      [data-theme="light"] .usr-modal-meta-card,
      [data-theme="light"] .usr-modal-notes,
      [data-theme="light"] .usr-modal-timeline,
      [data-theme="light"] .usr-modal-doc-row{
        background:rgba(255,255,255,.64);
        border-color:rgba(15,23,42,.08);
        box-shadow:0 6px 16px rgba(15,23,42,.04);
      }

      @media (max-width: 920px){
        .usr-modal-header{
          display:grid;
        }

        .usr-modal-actions{
          justify-content:flex-start;
        }

        .usr-modal-meta-grid,
        .usr-modal-address-grid,
        .usr-modal-metadata-grid{
          grid-template-columns:repeat(2, minmax(0, 1fr));
        }
      }

      @media (max-width: 640px){
        .usr-modal-overlay{
          padding:10px;
        }

        .usr-modal-panel{
          max-height:94vh;
          border-radius:18px;
        }

        .usr-modal-header{
          padding:14px 14px 12px;
        }

        .usr-modal-body{
          padding:14px;
        }

        .usr-modal-identity{
          display:grid;
        }

        .usr-modal-avatar{
          width:64px;
          height:64px;
          border-radius:19px;
        }

        .usr-modal-meta-grid,
        .usr-modal-address-grid,
        .usr-modal-metadata-grid{
          grid-template-columns:1fr;
        }

        .usr-modal-btn{
          flex:1 1 auto;
        }

        .usr-modal-close{
          flex:0 0 40px;
        }
      }
    </style>
  `;
}

/* =========================================================
   MAIN TEMPLATE
========================================================= */

function renderModalInner(detail = {}) {
  const item = normalizeDetail(detail);

  const userId = getUserId(item);
  const username = getUsername(item);
  const name = getName(item);
  const email = getEmail(item);
  const phone = getPhone(item);
  const city = getCity(item);

  const roleValue = getRole(item);
  const statusValue = getStatus(item);

  const roleLabel = getRoleLabel(roleValue);
  const statusLabel = getStatusLabel(statusValue);

  const createdAt = getCreatedAt(item);
  const updatedAt = getUpdatedAt(item);
  const lastLoginAt = getLastLoginAt(item);

  const statusKey = safeLower(statusValue).includes("pending")
    ? "pending"
    : safeLower(statusValue).includes("block") ||
        safeLower(statusValue).includes("suspend") ||
        safeLower(statusValue).includes("inactive")
      ? "blocked"
      : "active";

  return `
    <div
      data-usuarios-modal-overlay="true"
      class="usr-modal-overlay"
    >
      <div
        id="${PANEL_ID}"
        data-usuarios-modal-panel="true"
        role="dialog"
        aria-modal="true"
        aria-labelledby="usuarios-detail-modal-title"
        tabindex="-1"
        class="usr-modal-panel${modalState.isRefreshing ? " is-refreshing" : ""}"
      >
        ${modalState.isRefreshing ? renderRefreshOverlay() : ""}

        <div class="usr-modal-header">
          <div class="usr-modal-identity">
            ${renderAvatar(item)}

            <div class="usr-modal-heading">
              <div class="usr-modal-chips">
                ${renderChip(`Usuario ${userId || "—"}`)}
                ${renderChip(statusLabel, statusKey)}
                ${renderChip(roleLabel)}
              </div>

              <h2 id="usuarios-detail-modal-title" class="usr-modal-title">
                ${escapeHtml(name)}
              </h2>

              <div class="usr-modal-subtitle">
                ${escapeHtml(`@${username}`)}
              </div>
            </div>
          </div>

          <div class="usr-modal-actions">
            <button
              type="button"
              class="usr-modal-btn"
              data-usuarios-modal-action="copy-id"
              ${modalState.isRefreshing || !userId ? "disabled" : ""}
            >
              Copiar ID
            </button>

            <button
              type="button"
              class="usr-modal-btn"
              data-usuarios-modal-action="refresh"
              ${modalState.isRefreshing || !userId ? 'disabled aria-busy="true"' : ""}
            >
              ${
                modalState.isRefreshing
                  ? renderSpinner("Actualizando...")
                  : "Actualizar"
              }
            </button>

            <button
              type="button"
              class="usr-modal-btn usr-modal-close"
              data-modal-close="true"
              aria-label="Cerrar modal"
            >
              ✕
            </button>
          </div>
        </div>

        <div class="usr-modal-body">
          <div class="usr-modal-meta-grid">
            ${renderMetaCard("Username", username)}
            ${renderMetaCard("Nombre", name)}
            ${renderMetaCard("Email", email)}
            ${renderMetaCard("Teléfono", phone)}
            ${renderMetaCard("Ciudad", city)}
            ${renderMetaCard("Rol", roleLabel)}
            ${renderMetaCard("Estado", statusLabel)}
            ${renderMetaCard("Última conexión", lastLoginAt ? formatRelativeDate(lastLoginAt) : "Sin acceso")}
            ${renderMetaCard("Creado", formatDate(createdAt))}
            ${renderMetaCard("Actualizado", formatDate(updatedAt))}
            ${renderMetaCard("ID", userId || "—")}
            ${renderMetaCard("NIF / CIF", getNif(item))}
          </div>

          ${renderAddress(item)}
          ${renderTimeline(item)}
          ${renderDocuments(item)}
          ${renderMetadata(item)}
          ${renderNotes(item)}
        </div>

        ${renderStyles()}
      </div>
    </div>
  `;
}

/* =========================================================
   ROOT MANAGEMENT
========================================================= */

function getRoot() {
  return document.getElementById(MODAL_ID);
}

function ensureRoot() {
  let root = getRoot();

  if (root) {
    return root;
  }

  root = document.createElement("div");
  root.id = MODAL_ID;
  document.body.appendChild(root);

  return root;
}

function lockBody() {
  try {
    modalState.previousBodyOverflow = document.body.style.overflow || "";
    document.body.classList.add("modal-open");
    document.body.style.overflow = "hidden";
  } catch {}
}

function unlockBody() {
  try {
    document.body.classList.remove("modal-open");
    document.body.style.overflow = modalState.previousBodyOverflow || "";
    modalState.previousBodyOverflow = "";
  } catch {}
}

function restoreFocus() {
  try {
    modalState.lastActiveElement?.focus?.();
  } catch {}
}

function focusPanel() {
  try {
    document.getElementById(PANEL_ID)?.focus?.();
  } catch {}
}

/* =========================================================
   ESC HANDLER
========================================================= */

function detachEscHandler() {
  if (!modalState.escHandler) {
    return;
  }

  try {
    document.removeEventListener("keydown", modalState.escHandler);
  } catch {}

  modalState.escHandler = null;
}

function attachEscHandler() {
  detachEscHandler();

  modalState.escHandler = (event) => {
    if (event.key === "Escape") {
      closeUsuariosModal();
    }
  };

  try {
    document.addEventListener("keydown", modalState.escHandler);
  } catch {}
}

/* =========================================================
   RENDER CONTROL
========================================================= */

function renderModal() {
  const root = ensureRoot();

  if (!modalState.isOpen) {
    detachRootBindings();
    root.innerHTML = "";
    return root;
  }

  detachRootBindings();
  root.innerHTML = renderModalInner(modalState.detail || {});
  modalState.bindingsAttached = false;

  return root;
}

function rerenderModal() {
  const root = renderModal();
  attachRootBindings();
  focusPanel();

  return root;
}

/* =========================================================
   ACTIONS
========================================================= */

async function writeClipboardText(text = "") {
  const value = safeText(text, "");
  if (!value) return false;

  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {}

  try {
    const textarea = document.createElement("textarea");

    textarea.value = value;
    textarea.setAttribute("readonly", "true");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";

    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();

    const ok = document.execCommand("copy");

    textarea.remove();

    return Boolean(ok);
  } catch {
    return false;
  }
}

async function handleCopyId() {
  const userId = getUserId(modalState.detail || {});

  if (!userId) {
    showToast("No hay ID para copiar.", "error");
    return false;
  }

  const emitted = safeEmit("usuarios:modal:copy", {
    userId,
    detail: modalState.detail,
  });

  if (emitted) {
    return true;
  }

  const copied = await writeClipboardText(userId);

  if (copied) {
    showToast("ID copiado", "success");
    return true;
  }

  showToast("No se pudo copiar el ID.", "error");
  return false;
}

function handleRefresh() {
  const userId = getUserId(modalState.detail || {});

  if (!userId || modalState.isRefreshing) {
    return false;
  }

  modalState.isRefreshing = true;
  modalState.refreshSeq += 1;

  const seq = modalState.refreshSeq;

  rerenderModal();

  const emitted = safeEmit("usuarios:modal:refresh", {
    userId,
    detail: modalState.detail,
  });

  if (!emitted) {
    modalState.isRefreshing = false;
    rerenderModal();
    showToast("No se pudo solicitar la actualización del usuario.", "error");
    return false;
  }

  try {
    window.setTimeout(() => {
      if (
        modalState.isOpen &&
        modalState.isRefreshing &&
        modalState.refreshSeq === seq
      ) {
        modalState.isRefreshing = false;
        rerenderModal();
      }
    }, REFRESH_FALLBACK_TIMEOUT_MS);
  } catch {}

  return true;
}

/* =========================================================
   OPEN / CLOSE / UPDATE
========================================================= */

export function openUsuariosModal(detail = {}) {
  const normalized = normalizeDetail(detail);

  if (!getUserId(normalized) && !getEmail(normalized) && !getUsername(normalized)) {
    showToast("No se pudo abrir el detalle del usuario.", "error");
    return false;
  }

  modalState.lastActiveElement = document.activeElement || null;
  modalState.detail = normalized;
  modalState.isOpen = true;
  modalState.isRefreshing = false;

  renderModal();
  lockBody();
  attachEscHandler();
  attachRootBindings();
  focusPanel();

  safeEmit("usuarios:modal:opened", {
    detail: modalState.detail,
    userId: getUserId(modalState.detail),
  });

  return true;
}

export function closeUsuariosModal() {
  const root = getRoot();

  modalState.isOpen = false;
  modalState.isRefreshing = false;
  modalState.detail = null;
  modalState.refreshSeq += 1;

  detachRootBindings();

  if (root) {
    root.innerHTML = "";
  }

  unlockBody();
  detachEscHandler();
  restoreFocus();

  safeEmit("usuarios:modal:closed", {});

  return true;
}

export function updateUsuariosModal(detail = {}) {
  if (!modalState.isOpen) {
    return openUsuariosModal(detail);
  }

  modalState.detail = normalizeDetail(detail);
  modalState.isRefreshing = false;
  modalState.refreshSeq += 1;

  rerenderModal();

  safeEmit("usuarios:modal:updated", {
    detail: modalState.detail,
    userId: getUserId(modalState.detail),
  });

  return true;
}

/* =========================================================
   ROOT BINDINGS
========================================================= */

function attachRootBindings() {
  if (modalState.bindingsAttached) {
    return;
  }

  const root = ensureRoot();

  const onClick = async (event) => {
    const target = event.target;

    if (!(target instanceof Element)) return;

    const closeBtn = target.closest("[data-modal-close='true']");

    if (closeBtn) {
      event.preventDefault();
      closeUsuariosModal();
      return;
    }

    const copyBtn = target.closest("[data-usuarios-modal-action='copy-id']");

    if (copyBtn) {
      event.preventDefault();
      await handleCopyId();
      return;
    }

    const refreshBtn = target.closest("[data-usuarios-modal-action='refresh']");

    if (refreshBtn) {
      event.preventDefault();
      handleRefresh();
      return;
    }

    const overlay = target.closest("[data-usuarios-modal-overlay='true']");
    const panel = target.closest("[data-usuarios-modal-panel='true']");

    if (overlay && !panel && target === overlay) {
      closeUsuariosModal();
    }
  };

  root.__usuariosModalClickHandler = onClick;
  root.addEventListener("click", onClick);

  modalState.bindingsAttached = true;
}

function detachRootBindings() {
  const root = getRoot();

  if (!root) {
    modalState.bindingsAttached = false;
    return;
  }

  if (root.__usuariosModalClickHandler) {
    try {
      root.removeEventListener("click", root.__usuariosModalClickHandler);
    } catch {}

    delete root.__usuariosModalClickHandler;
  }

  modalState.bindingsAttached = false;
}

/* =========================================================
   EVENT BUS BRIDGE
========================================================= */

function handleOpenEvent(event) {
  const detail = unwrapEventDetail(event);
  if (!Object.keys(detail).length) return;

  openUsuariosModal(detail);
}

function handleCloseEvent() {
  closeUsuariosModal();
}

function handleUpdateEvent(event) {
  const detail = unwrapEventDetail(event);
  if (!Object.keys(detail).length) return;

  updateUsuariosModal(detail);
}

function handleDetailRefreshEvent(event) {
  const payload = unwrapEventDetail(event);

  const detail = safeObject(first(payload.detail, payload.user, payload.usuario, payload));
  if (!Object.keys(detail).length) return;

  if (!modalState.isOpen) return;

  const currentId = getUserId(modalState.detail || {});
  const incomingId = getUserId(detail);

  if (currentId && incomingId && currentId !== incomingId) {
    return;
  }

  updateUsuariosModal(detail);
}

let busAttached = false;

function attachBus() {
  if (busAttached) return;

  safeOn("usuarios:modal:open", handleOpenEvent);
  safeOn("usuarios:modal:close", handleCloseEvent);
  safeOn("usuarios:modal:update", handleUpdateEvent);

  safeOn("usuarios:detail:refresh", handleDetailRefreshEvent);
  safeOn("usuarios:detail:success", handleDetailRefreshEvent);

  busAttached = true;
}

function detachBus() {
  if (!busAttached) return;

  safeOff("usuarios:modal:open", handleOpenEvent);
  safeOff("usuarios:modal:close", handleCloseEvent);
  safeOff("usuarios:modal:update", handleUpdateEvent);

  safeOff("usuarios:detail:refresh", handleDetailRefreshEvent);
  safeOff("usuarios:detail:success", handleDetailRefreshEvent);

  busAttached = false;
}

/* =========================================================
   GLOBAL BRIDGE
========================================================= */

export const OnionUsuariosModal = {
  open(detail = {}) {
    return openUsuariosModal(detail);
  },

  close() {
    return closeUsuariosModal();
  },

  update(detail = {}) {
    return updateUsuariosModal(detail);
  },

  refresh() {
    return handleRefresh();
  },

  copyId() {
    return handleCopyId();
  },

  getState() {
    return {
      isOpen: Boolean(modalState.isOpen),
      isRefreshing: Boolean(modalState.isRefreshing),
      bindingsAttached: Boolean(modalState.bindingsAttached),
      detail: modalState.detail
        ? {
            ...safeObject(modalState.detail),
            raw: { ...safeObject(modalState.detail.raw) },
          }
        : null,
      userId: modalState.detail ? getUserId(modalState.detail) : "",
    };
  },

  destroy() {
    detachRootBindings();
    closeUsuariosModal();
    detachEscHandler();
    detachBus();

    const root = getRoot();

    try {
      root?.remove?.();
    } catch {}

    return true;
  },
};

try {
  window.OnionUsuariosModal = OnionUsuariosModal;

  window.renderUsuarioDetailModal = OnionUsuariosModal.open;
  window.renderUsuarioModal = OnionUsuariosModal.open;
  window.renderUsuariosModal = OnionUsuariosModal.open;
} catch {}

/* =========================================================
   AUTO BOOT
========================================================= */

attachBus();

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default OnionUsuariosModal;
