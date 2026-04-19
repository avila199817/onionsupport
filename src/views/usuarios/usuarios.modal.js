/* =========================================================
   Onion SPA - Usuarios Modal
   Archivo: src/views/usuarios/usuarios.modal.js

   FINAL PRO SYSTEM · DETAIL MODAL · USUARIOS EDITION

   RESPONSABILIDADES:
   - renderizar modal premium de detalle de usuario
   - abrir / cerrar modal limpio
   - refrescar contenido del usuario desde modal
   - copiar ID usuario
   - soportar timeline / docs / metadata
   - bridge global para usuariosView.js
   - integración AppCore.events desacoplada

   HARDENING PRO:
   - payloads heterogéneos
   - avatar fallback iniciales
   - modal singleton
   - escape / overlay close
   - render incremental seguro
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

/* =========================================================
   STATE
========================================================= */

const modalState = {
  detail: null,
  isOpen: false,
  isRefreshing: false,
  bindingsAttached: false,
  lastActiveElement: null,
  escHandler: null,
};

/* =========================================================
   SAFE HELPERS
========================================================= */

function safeEmit(event = "", payload = {}) {
  try {
    AppCore?.events?.emit?.(event, payload);
  } catch {}
}

function safeOn(event = "", handler = null) {
  try {
    AppCore?.events?.on?.(event, handler);
  } catch {}
}

function safeOff(event = "", handler = null) {
  try {
    AppCore?.events?.off?.(event, handler);
  } catch {}
}

function safeText(value, fallback = "") {
  if (value === null || value === undefined) return fallback;
  const text = String(value).trim();
  return text || fallback;
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function safeObject(value) {
  return value &&
    typeof value === "object" &&
    !Array.isArray(value)
    ? value
    : {};
}

function first(...values) {
  for (const value of values) {
    if (
      value !== undefined &&
      value !== null &&
      String(value).trim() !== ""
    ) {
      return value;
    }
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

function showToast(message = "", type = "info") {
  try {
    AppCore?.toast?.[type]?.(message);
  } catch {}

  try {
    AppCore?.toast?.show?.(message, type);
  } catch {}
}

/* =========================================================
   DATE
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

/* =========================================================
   MODEL
========================================================= */

function getDetail(detail = {}) {
  return normalizeUsuarioModel(
    safeObject(detail)
  );
}

function getUserId(detail = {}) {
  return safeText(
    first(
      detail.userId,
      detail.usuarioId,
      detail.id
    ),
    "—"
  );
}

function getAvatar(detail = {}) {
  return safeText(
    first(
      detail.avatar,
      detail.avatarUrl,
      detail.photo,
      detail.photoUrl,
      detail.image,
      detail.imageUrl
    ),
    ""
  );
}

/* =========================================================
   CHIP STYLES
========================================================= */

function chipStyle() {
  return `
    display:inline-flex;
    align-items:center;
    min-height:30px;
    padding:0 12px;
    border-radius:999px;
    font-size:12px;
    font-weight:700;
    border:1px solid var(--border-soft);
    background:var(--surface-glass);
    color:var(--text-soft);
  `;
}

/* =========================================================
   AVATAR
========================================================= */

function renderAvatar(detail = {}) {
  const avatar = getAvatar(detail);
  const initials = getInitials(
    safeText(
      first(
        detail.name,
        detail.username,
        "US"
      ),
      "US"
    )
  );

  const theme = getAvatarTheme(
    safeText(
      first(
        detail.userId,
        detail.email,
        detail.username
      ),
      ""
    )
  );

  const bg =
    theme === "emerald"
      ? "rgba(54,198,144,.18)"
      : "rgba(124,92,255,.18)";

  if (avatar) {
    return `
      <img
        src="${escapeHtml(avatar)}"
        alt=""
        style="
          width:72px;
          height:72px;
          border-radius:22px;
          object-fit:cover;
          border:1px solid var(--border-soft);
        "
      />
    `;
  }

  return `
    <div
      style="
        width:72px;
        height:72px;
        border-radius:22px;
        display:grid;
        place-items:center;
        font-size:24px;
        font-weight:800;
        color:#fff;
        background:${bg};
        border:1px solid var(--border-soft);
      "
    >
      ${escapeHtml(initials)}
    </div>
  `;
}

/* =========================================================
   META
========================================================= */

function meta(label = "", value = "") {
  return `
    <div
      style="
        padding:14px;
        border-radius:16px;
        border:1px solid var(--border-soft);
        background:var(--surface-glass);
        display:grid;
        gap:6px;
      "
    >
      <span
        style="
          font-size:11px;
          color:var(--text-dim);
          text-transform:uppercase;
          font-weight:700;
        "
      >
        ${escapeHtml(label)}
      </span>

      <strong
        style="
          font-size:14px;
          color:var(--text-strong);
          word-break:break-word;
        "
      >
        ${escapeHtml(
          safeText(value, "—")
        )}
      </strong>
    </div>
  `;
}

/* =========================================================
   MAIN RENDER
========================================================= */

function renderModalInner(detail = {}) {
  const item = getDetail(detail);

  const userId =
    getUserId(item);

  const username = safeText(
    item.username,
    "Sin username"
  );

  const name = safeText(
    item.name,
    "Usuario"
  );

  const email = safeText(
    item.email,
    "Sin email"
  );

  const phone = safeText(
    item.phone,
    "Sin teléfono"
  );

  const role = getRoleLabel(
    item.role
  );

  const status = getStatusLabel(
    item.status
  );

  const createdAt = formatDate(
    item.createdAt
  );

  const updatedAt = formatDate(
    item.updatedAt
  );

  const notes = safeText(
    item.notes,
    "Sin notas internas."
  );

  return `
    <div
      data-usuarios-modal-overlay="true"
      style="
        position:fixed;
        inset:0;
        z-index:9999;
        display:grid;
        place-items:center;
        padding:24px;
        background:rgba(0,0,0,.72);
        backdrop-filter:blur(10px);
      "
    >
      <div
        id="${PANEL_ID}"
        data-usuarios-modal-panel="true"
        role="dialog"
        aria-modal="true"
        style="
          width:min(1100px,100%);
          max-height:92vh;
          overflow:auto;
          border-radius:28px;
          border:1px solid var(--border-soft);
          background:linear-gradient(
            180deg,
            var(--surface-2,#181818),
            var(--surface-1,#111)
          );
          box-shadow:0 40px 100px rgba(0,0,0,.45);
        "
      >
        <div
          style="
            padding:24px;
            border-bottom:1px solid var(--border-soft);
            display:flex;
            justify-content:space-between;
            gap:18px;
            flex-wrap:wrap;
          "
        >
          <div
            style="
              display:flex;
              gap:16px;
              align-items:flex-start;
            "
          >
            ${renderAvatar(item)}

            <div
              style="
                display:grid;
                gap:10px;
              "
            >
              <div
                style="
                  display:flex;
                  gap:10px;
                  flex-wrap:wrap;
                "
              >
                <span style="${chipStyle()}">
                  Usuario ${escapeHtml(userId)}
                </span>

                <span style="${chipStyle()}">
                  ${escapeHtml(status)}
                </span>

                <span style="${chipStyle()}">
                  ${escapeHtml(role)}
                </span>
              </div>

              <h2
                style="
                  margin:0;
                  color:var(--text-strong);
                  font-size:38px;
                  letter-spacing:-.04em;
                "
              >
                ${escapeHtml(name)}
              </h2>

              <span
                style="
                  color:var(--text-dim);
                  font-size:14px;
                "
              >
                @${escapeHtml(username)}
              </span>
            </div>
          </div>

          <button
            type="button"
            data-modal-close="true"
            style="
              width:48px;
              height:48px;
              border:none;
              border-radius:16px;
              cursor:pointer;
              font-size:20px;
              background:var(--surface-glass);
              color:var(--text-strong);
            "
          >
            ✕
          </button>
        </div>

        <div
          style="
            padding:24px;
            display:grid;
            gap:18px;
          "
        >
          <div
            style="
              display:grid;
              grid-template-columns:
                repeat(4,minmax(0,1fr));
              gap:14px;
            "
          >
            ${meta("Username", username)}
            ${meta("Nombre", name)}
            ${meta("Email", email)}
            ${meta("Teléfono", phone)}
            ${meta("Rol", role)}
            ${meta("Estado", status)}
            ${meta("Creado", createdAt)}
            ${meta("Actualizado", updatedAt)}
            ${meta("ID", userId)}
          </div>

          <section
            style="
              display:grid;
              gap:10px;
            "
          >
            <h3
              style="
                margin:0;
                font-size:20px;
                color:var(--text-strong);
              "
            >
              Notas internas
            </h3>

            <div
              style="
                padding:18px;
                border-radius:18px;
                border:1px solid var(--border-soft);
                background:var(--surface-glass);
                color:var(--text-soft);
                line-height:1.7;
                white-space:pre-wrap;
              "
            >
              ${escapeHtml(notes)}
            </div>
          </section>
        </div>
      </div>
    </div>
  `;
}

/* =========================================================
   ROOT
========================================================= */

function getRoot() {
  return document.getElementById(
    MODAL_ID
  );
}

function ensureRoot() {
  let root = getRoot();

  if (root) return root;

  root =
    document.createElement("div");

  root.id = MODAL_ID;

  document.body.appendChild(root);

  return root;
}

/* =========================================================
   OPEN CLOSE
========================================================= */

export function openUsuariosModal(
  detail = {}
) {
  modalState.detail =
    getDetail(detail);

  modalState.isOpen = true;

  const root = ensureRoot();

  root.innerHTML =
    renderModalInner(
      modalState.detail
    );

  document.body.style.overflow =
    "hidden";

  attachBindings();

  safeEmit(
    "usuarios:modal:opened",
    {
      detail:
        modalState.detail,
      userId:
        getUserId(
          modalState.detail
        ),
    }
  );

  return true;
}

export function closeUsuariosModal() {
  const root = getRoot();

  if (root) {
    root.innerHTML = "";
  }

  modalState.isOpen = false;
  modalState.detail = null;

  document.body.style.overflow =
    "";

  safeEmit(
    "usuarios:modal:closed",
    {}
  );

  return true;
}

/* =========================================================
   EVENTS
========================================================= */

function attachBindings() {
  const root = getRoot();

  if (!root) return;

  root.onclick = (event) => {
    const closeBtn =
      event.target.closest(
        "[data-modal-close='true']"
      );

    if (closeBtn) {
      closeUsuariosModal();
      return;
    }

    const overlay =
      event.target.closest(
        "[data-usuarios-modal-overlay='true']"
      );

    const panel =
      event.target.closest(
        "[data-usuarios-modal-panel='true']"
      );

    if (
      overlay &&
      !panel &&
      event.target === overlay
    ) {
      closeUsuariosModal();
    }
  };
}

/* =========================================================
   BUS
========================================================= */

function handleOpen(event) {
  const detail =
    event?.detail?.detail ||
    event?.detail ||
    event;

  if (!detail) return;

  openUsuariosModal(detail);
}

function handleClose() {
  closeUsuariosModal();
}

safeOn(
  "usuarios:modal:open",
  handleOpen
);

safeOn(
  "usuarios:modal:close",
  handleClose
);

/* =========================================================
   GLOBAL
========================================================= */

export const OnionUsuariosModal =
{
  open: openUsuariosModal,
  close: closeUsuariosModal,
};

try {
  window.OnionUsuariosModal =
    OnionUsuariosModal;

  window.renderUsuarioModal =
    OnionUsuariosModal.open;
} catch {}

/* =========================================================
   EXPORT
========================================================= */

export default OnionUsuariosModal;
