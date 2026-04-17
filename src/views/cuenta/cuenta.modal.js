/* =========================================================
   Onion SPA - Cuenta Modal
   Archivo: src/views/cuenta/cuenta.modal.js

   FINAL PRO SYSTEM · DETAIL MODAL · 10/10

   RESPONSABILIDADES:
   - renderizar modal premium de detalle de cuenta
   - abrir / cerrar modal limpio
   - refrescar contenido desde el modal
   - actualizar darkMode / privacyMode desde el modal
   - copiar snapshot de preferencias
   - exponer bridge global para cuentaView.js
   - integrarse con AppCore.events sin acoplar la vista

   HARDENING PRO:
   - tolerancia a payloads heterogéneos
   - modal singleton
   - escape / overlay close
   - render incremental seguro
   - estado visual interno de refresh / save
========================================================= */

import { AppCore } from "../../core/index.js";

/* =========================================================
   CONSTANTS
========================================================= */

const MODAL_ID = "cuenta-detail-modal-root";
const PANEL_ID = "cuenta-detail-modal-panel";

/* =========================================================
   LOCAL STATE
========================================================= */

const modalState = {
  detail: null,
  isOpen: false,
  isRefreshing: false,
  isSaving: false,
  bindingsAttached: false,
  lastActiveElement: null,
  escHandler: null,
};

/* =========================================================
   HELPERS CORE
========================================================= */

function safeEmit(event = "", payload = {}) {
  try {
    AppCore?.events?.emit?.(event, payload);
  } catch {}
}

function safeOn(event = "", handler = null) {
  if (!event || typeof handler !== "function") return false;

  try {
    AppCore?.events?.on?.(event, handler);
    return true;
  } catch {
    return false;
  }
}

function safeOff(event = "", handler = null) {
  if (!event || typeof handler !== "function") return false;

  try {
    AppCore?.events?.off?.(event, handler);
    return true;
  } catch {
    return false;
  }
}

function safeText(value, fallback = "") {
  if (value === null || value === undefined) return fallback;
  const text = String(value).trim();
  return text || fallback;
}

function safeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value)
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
    if (typeof AppCore?.toast?.[type] === "function") {
      AppCore.toast[type](message);
      return;
    }
  } catch {}

  try {
    AppCore?.toast?.show?.(message, type);
    return;
  } catch {}

  try {
    AppCore?.ui?.toast?.[type]?.(message);
  } catch {}
}

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
    textarea.style.pointerEvents = "none";
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

/* =========================================================
   DATE HELPERS
========================================================= */

function formatDate(value = null) {
  if (!value) return "—";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

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
    return diffMin > 0
      ? `En ${absMin} min`
      : `Hace ${absMin} min`;
  }

  const diffHours = Math.round(absMin / 60);
  if (diffHours < 24) {
    return diffMin > 0
      ? `En ${diffHours} h`
      : `Hace ${diffHours} h`;
  }

  const diffDays = Math.round(diffHours / 24);
  if (diffDays <= 7) {
    return diffMin > 0
      ? `En ${diffDays} día${diffDays === 1 ? "" : "s"}`
      : `Hace ${diffDays} día${diffDays === 1 ? "" : "s"}`;
  }

  return formatDate(value);
}

/* =========================================================
   DETAIL NORMALIZATION
========================================================= */

function normalizeCuentaModel(detail = {}) {
  const raw = safeObject(detail);

  const darkMode =
    typeof raw.darkMode === "boolean"
      ? raw.darkMode
      : typeof raw.theme === "string"
      ? raw.theme === "dark"
      : true;

  const privacyMode =
    typeof raw.privacyMode === "boolean"
      ? raw.privacyMode
      : false;

  return {
    ...raw,
    darkMode,
    privacyMode,
    theme: darkMode ? "dark" : "light",
    updatedAt: first(raw.updatedAt, raw.updated_at, null),
    raw,
  };
}

function getDetail(detail = {}) {
  return normalizeCuentaModel(safeObject(detail));
}

function getThemeLabel(detail = {}) {
  return detail.darkMode ? "Dark mode" : "Light mode";
}

function getPrivacyLabel(detail = {}) {
  return detail.privacyMode ? "Privacidad activa" : "Privacidad desactivada";
}

function getStatusLabel(detail = {}) {
  if (detail.darkMode && detail.privacyMode) {
    return "Protección reforzada";
  }

  if (detail.privacyMode) {
    return "Privacidad activa";
  }

  return "Configuración estándar";
}

function getSnapshot(detail = {}) {
  const item = getDetail(detail);

  return {
    darkMode: Boolean(item.darkMode),
    privacyMode: Boolean(item.privacyMode),
    theme: safeText(item.theme, item.darkMode ? "dark" : "light"),
    updatedAt: item.updatedAt || null,
  };
}

/* =========================================================
   VISUAL HELPERS
========================================================= */

function getStatusChipStyle(detail = {}) {
  if (detail.darkMode && detail.privacyMode) {
    return `
      color:var(--success-strong, #36c690);
      background:color-mix(in srgb, var(--success-strong, #36c690) 14%, transparent);
      border:1px solid color-mix(in srgb, var(--success-strong, #36c690) 26%, transparent);
    `;
  }

  if (detail.privacyMode) {
    return `
      color:var(--accent-strong, var(--accent, #7c5cff));
      background:color-mix(in srgb, var(--accent, #7c5cff) 14%, transparent);
      border:1px solid color-mix(in srgb, var(--accent, #7c5cff) 26%, transparent);
    `;
  }

  return `
    color:var(--text-soft);
    background:var(--surface-glass);
    border:1px solid var(--border-soft);
  `;
}

function getThemeChipStyle(detail = {}) {
  if (detail.darkMode) {
    return `
      color:#efeaff;
      background:color-mix(in srgb, var(--accent, #7c5cff) 16%, transparent);
      border:1px solid color-mix(in srgb, var(--accent, #7c5cff) 28%, transparent);
    `;
  }

  return `
    color:#1f2937;
    background:rgba(255,255,255,.82);
    border:1px solid rgba(255,255,255,.48);
  `;
}

function renderChip(label = "", style = "") {
  return `
    <span
      style="
        display:inline-flex;
        align-items:center;
        justify-content:center;
        min-height:32px;
        padding:0 12px;
        border-radius:999px;
        font-size:12px;
        font-weight:var(--weight-bold, 700);
        letter-spacing:.05em;
        text-transform:uppercase;
        white-space:nowrap;
        ${style}
      "
    >
      ${escapeHtml(label)}
    </span>
  `;
}

function renderIdentityCard(detail = {}) {
  const themeLabel = getThemeLabel(detail);

  return `
    <div
      style="
        position:relative;
        flex:0 0 76px;
        width:76px;
        height:76px;
        border-radius:22px;
        display:grid;
        place-items:center;
        background:
          radial-gradient(circle at top left, color-mix(in srgb, var(--accent, #7c5cff) 28%, transparent), transparent 56%),
          linear-gradient(135deg, rgba(124,92,255,.20), rgba(255,255,255,.04));
        border:1px solid color-mix(in srgb, var(--accent, #7c5cff) 24%, var(--border-soft));
        color:var(--text-strong, #fff);
        font-size:28px;
        font-weight:var(--weight-black, 800);
        letter-spacing:.03em;
        box-shadow:0 18px 42px rgba(0,0,0,.24);
      "
      aria-hidden="true"
    >
      ${detail.darkMode ? "◐" : "☼"}
    </div>
  `;
}

function renderMetaField(label = "", value = "") {
  return `
    <div
      style="
        display:grid;
        gap:6px;
        padding:14px;
        border-radius:16px;
        border:1px solid var(--border-soft);
        background:var(--surface-1, var(--surface-glass));
      "
    >
      <span
        style="
          font-size:11px;
          color:var(--text-faint, #8b8b8b);
          text-transform:uppercase;
          letter-spacing:.08em;
          font-weight:var(--weight-bold, 700);
        "
      >
        ${escapeHtml(label)}
      </span>

      <strong
        style="
          color:var(--text-strong, #fff);
          font-size:14px;
          line-height:1.4;
          word-break:break-word;
        "
      >
        ${escapeHtml(safeText(value, "—"))}
      </strong>
    </div>
  `;
}

function renderBooleanCard({
  title = "",
  value = false,
  description = "",
  action = "",
  disabled = false,
} = {}) {
  return `
    <article
      style="
        display:grid;
        gap:14px;
        padding:18px;
        border-radius:20px;
        border:1px solid var(--border-soft);
        background:var(--surface-glass);
      "
    >
      <div
        style="
          display:flex;
          align-items:flex-start;
          justify-content:space-between;
          gap:16px;
          flex-wrap:wrap;
        "
      >
        <div style="display:grid; gap:6px;">
          <h3
            style="
              margin:0;
              color:var(--text-strong);
              font-size:18px;
              letter-spacing:-.02em;
            "
          >
            ${escapeHtml(title)}
          </h3>

          <span
            style="
              color:var(--text-dim);
              font-size:13px;
              line-height:1.5;
            "
          >
            ${escapeHtml(description)}
          </span>
        </div>

        <span
          style="
            display:inline-flex;
            align-items:center;
            min-height:30px;
            padding:0 10px;
            border-radius:999px;
            font-size:12px;
            font-weight:var(--weight-bold, 700);
            letter-spacing:.04em;
            border:1px solid ${
              value
                ? "color-mix(in srgb, var(--success-strong, #36c690) 28%, transparent)"
                : "var(--border-soft)"
            };
            background:${
              value
                ? "color-mix(in srgb, var(--success-strong, #36c690) 14%, transparent)"
                : "var(--surface-1, var(--surface-glass))"
            };
            color:${
              value
                ? "var(--success-strong, #36c690)"
                : "var(--text-dim)"
            };
          "
        >
          ${value ? "ACTIVO" : "INACTIVO"}
        </span>
      </div>

      <button
        type="button"
        data-modal-action="${escapeHtml(action)}"
        ${disabled ? "disabled" : ""}
        style="
          min-height:44px;
          padding:0 16px;
          border-radius:14px;
          border:1px solid var(--border-soft);
          background:var(--surface-1, var(--surface-glass));
          color:var(--text-soft);
          font-weight:var(--weight-bold, 700);
          cursor:${disabled ? "wait" : "pointer"};
          opacity:${disabled ? ".72" : "1"};
        "
      >
        ${
          value
            ? "Desactivar"
            : "Activar"
        }
      </button>
    </article>
  `;
}

function renderJsonSnapshot(detail = {}) {
  const snapshot = getSnapshot(detail);

  return `
    <pre
      style="
        margin:0;
        padding:18px;
        border-radius:18px;
        background:var(--surface-glass);
        border:1px solid var(--border-soft);
        color:var(--text-soft);
        font-size:13px;
        line-height:1.7;
        overflow:auto;
        white-space:pre-wrap;
        word-break:break-word;
      "
    >${escapeHtml(JSON.stringify(snapshot, null, 2))}</pre>
  `;
}

function renderLoadingOverlay(label = "Procesando...") {
  return `
    <div
      style="
        position:absolute;
        inset:0;
        display:grid;
        place-items:center;
        padding:20px;
        background:color-mix(in srgb, var(--surface-1, #0f1115) 76%, transparent);
        backdrop-filter:blur(4px);
        z-index:5;
      "
    >
      <div
        style="
          display:grid;
          justify-items:center;
          gap:12px;
          min-width:min(100%, 240px);
          padding:18px 20px;
          border-radius:18px;
          border:1px solid color-mix(in srgb, var(--accent, #7c5cff) 22%, var(--border-soft));
          background:linear-gradient(180deg, color-mix(in srgb, var(--accent, #7c5cff) 12%, transparent), transparent), var(--surface-1, var(--surface-glass));
          box-shadow:0 20px 40px rgba(0,0,0,.22);
        "
      >
        <span
          aria-hidden="true"
          style="
            width:28px;
            height:28px;
            border-radius:999px;
            border:3px solid color-mix(in srgb, var(--accent, #7c5cff) 16%, transparent);
            border-top-color:var(--accent, #7c5cff);
            animation:cuentaModalSpin .8s linear infinite;
          "
        ></span>

        <strong
          style="
            color:var(--text-strong);
            font-size:14px;
            letter-spacing:-.02em;
          "
        >
          ${escapeHtml(label)}
        </strong>
      </div>
    </div>
  `;
}

/* =========================================================
   RENDER
========================================================= */

function renderModalInner(
  detail = {},
  {
    isRefreshing = false,
    isSaving = false,
  } = {}
) {
  const item = getDetail(detail);
  const statusLabel = getStatusLabel(item);
  const themeLabel = getThemeLabel(item);
  const privacyLabel = getPrivacyLabel(item);
  const updatedAt = formatDate(item.updatedAt);
  const updatedAgo = formatRelativeDate(item.updatedAt);

  return `
    <div
      data-cuenta-modal-overlay="true"
      style="
        position:fixed;
        inset:0;
        z-index:9999;
        padding:24px;
        display:grid;
        place-items:center;
        background:rgba(0,0,0,.68);
        backdrop-filter:blur(10px);
      "
    >
      <div
        id="${PANEL_ID}"
        data-cuenta-modal-panel="true"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cuenta-modal-title"
        tabindex="-1"
        style="
          position:relative;
          width:min(1080px, 100%);
          max-height:92vh;
          overflow:auto;
          border-radius:28px;
          border:1px solid var(--border-soft, #2b2b2b);
          background:
            radial-gradient(circle at top left, color-mix(in srgb, var(--accent, #7c5cff) 10%, transparent), transparent 34%),
            linear-gradient(180deg, var(--surface-2, #151515), var(--surface-1, #121212));
          box-shadow:0 40px 100px rgba(0,0,0,.45);
        "
      >
        ${isRefreshing ? renderLoadingOverlay("Actualizando cuenta...") : ""}
        ${!isRefreshing && isSaving ? renderLoadingOverlay("Guardando preferencias...") : ""}

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
              min-width:min(100%, 540px);
            "
          >
            ${renderIdentityCard(item)}

            <div style="display:grid; gap:10px; min-width:0;">
              <div
                style="
                  display:flex;
                  align-items:center;
                  gap:10px;
                  flex-wrap:wrap;
                "
              >
                <span
                  style="
                    display:inline-flex;
                    align-items:center;
                    min-height:28px;
                    padding:0 10px;
                    border-radius:999px;
                    border:1px solid var(--border-soft);
                    background:var(--surface-glass);
                    color:var(--text-dim);
                    font-size:12px;
                    font-weight:var(--weight-bold, 700);
                    letter-spacing:.04em;
                    text-transform:uppercase;
                  "
                >
                  Cuenta · Preferencias
                </span>

                ${renderChip(statusLabel, getStatusChipStyle(item))}
                ${renderChip(themeLabel, getThemeChipStyle(item))}
              </div>

              <div style="display:grid; gap:6px; min-width:0;">
                <h2
                  id="cuenta-modal-title"
                  style="
                    margin:0;
                    color:var(--text-strong);
                    font-size:clamp(28px, 4vw, 42px);
                    line-height:1;
                    letter-spacing:-.04em;
                    word-break:break-word;
                  "
                >
                  Configuración de cuenta
                </h2>

                <span
                  style="
                    color:var(--text-dim);
                    font-size:14px;
                  "
                >
                  Actualizado ${escapeHtml(updatedAgo)}
                </span>
              </div>
            </div>
          </div>

          <div
            style="
              display:flex;
              gap:10px;
              flex-wrap:wrap;
              align-items:flex-start;
            "
          >
            <button
              type="button"
              data-modal-action="refresh"
              ${isRefreshing || isSaving ? "disabled" : ""}
              style="
                min-height:44px;
                padding:0 16px;
                border-radius:14px;
                border:1px solid var(--border-soft);
                background:var(--surface-glass);
                color:var(--text-soft);
                font-weight:var(--weight-bold, 700);
                cursor:${isRefreshing || isSaving ? "wait" : "pointer"};
                opacity:${isRefreshing || isSaving ? ".78" : "1"};
              "
            >
              ${
                isRefreshing
                  ? `
                    <span style="display:inline-flex; align-items:center; gap:8px;">
                      <span
                        aria-hidden="true"
                        style="
                          width:14px;
                          height:14px;
                          border-radius:999px;
                          border:2px solid color-mix(in srgb, var(--text-soft) 22%, transparent);
                          border-top-color:var(--text-soft);
                          animation:cuentaModalSpin .8s linear infinite;
                        "
                      ></span>
                      Refrescando...
                    </span>
                  `
                  : "Actualizar"
              }
            </button>

            <button
              type="button"
              data-modal-action="copy"
              ${isRefreshing || isSaving ? "disabled" : ""}
              style="
                min-height:44px;
                padding:0 16px;
                border-radius:14px;
                border:1px solid var(--btn-primary-border, color-mix(in srgb, var(--accent, #7c5cff) 28%, transparent));
                background:var(--btn-primary-bg, var(--accent, #7c5cff));
                color:var(--btn-primary-text, #fff);
                font-weight:var(--weight-bold, 700);
                cursor:${isRefreshing || isSaving ? "wait" : "pointer"};
                opacity:${isRefreshing || isSaving ? ".78" : "1"};
              "
            >
              Copiar snapshot
            </button>

            <button
              type="button"
              data-modal-close="true"
              aria-label="Cerrar modal"
              style="
                width:48px;
                height:48px;
                border:none;
                border-radius:16px;
                cursor:pointer;
                font-size:20px;
                background:var(--surface-glass);
                color:var(--text-strong);
                border:1px solid var(--border-soft);
              "
            >
              ✕
            </button>
          </div>
        </div>

        <div
          style="
            padding:24px;
            display:grid;
            gap:22px;
          "
        >
          <div
            style="
              display:grid;
              grid-template-columns:repeat(4, minmax(0, 1fr));
              gap:14px;
            "
            class="cuenta-modal-meta-grid"
          >
            ${renderMetaField("Tema", themeLabel)}
            ${renderMetaField("Privacidad", privacyLabel)}
            ${renderMetaField("Dark mode", item.darkMode ? "Activo" : "Inactivo")}
            ${renderMetaField("Privacy mode", item.privacyMode ? "Activo" : "Inactivo")}
            ${renderMetaField("Estado", statusLabel)}
            ${renderMetaField("Actualizado", updatedAt)}
            ${renderMetaField("Theme key", safeText(item.theme, "dark"))}
            ${renderMetaField("Endpoint", "/api/user/preferences")}
          </div>

          <div
            style="
              display:grid;
              grid-template-columns:1fr 1fr;
              gap:18px;
            "
            class="cuenta-modal-actions-grid"
          >
            ${renderBooleanCard({
              title: "Dark mode",
              value: Boolean(item.darkMode),
              description:
                "Activa o desactiva el modo oscuro usando el endpoint fino de tema.",
              action: "toggle-theme",
              disabled: isRefreshing || isSaving,
            })}

            ${renderBooleanCard({
              title: "Privacy mode",
              value: Boolean(item.privacyMode),
              description:
                "Activa o desactiva la preferencia de privacidad persistida para el usuario autenticado.",
              action: "toggle-privacy",
              disabled: isRefreshing || isSaving,
            })}
          </div>

          <section
            style="
              display:grid;
              gap:10px;
            "
          >
            <div
              style="
                display:flex;
                align-items:center;
                justify-content:space-between;
                gap:10px;
                flex-wrap:wrap;
              "
            >
              <h3
                style="
                  margin:0;
                  color:var(--text-strong);
                  font-size:20px;
                  letter-spacing:-.02em;
                "
              >
                Snapshot
              </h3>

              <button
                type="button"
                data-modal-action="save-both"
                ${isRefreshing || isSaving ? "disabled" : ""}
                style="
                  min-height:42px;
                  padding:0 14px;
                  border-radius:12px;
                  border:1px solid var(--border-soft);
                  background:var(--surface-glass);
                  color:var(--text-soft);
                  font-weight:var(--weight-bold, 700);
                  cursor:${isRefreshing || isSaving ? "wait" : "pointer"};
                  opacity:${isRefreshing || isSaving ? ".72" : "1"};
                "
              >
                Guardar estado actual
              </button>
            </div>

            ${renderJsonSnapshot(item)}
          </section>
        </div>

        <style>
          @keyframes cuentaModalSpin {
            to { transform: rotate(360deg); }
          }

          @media (max-width: 980px) {
            .cuenta-modal-meta-grid {
              grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
            }

            .cuenta-modal-actions-grid {
              grid-template-columns: 1fr !important;
            }
          }

          @media (max-width: 640px) {
            .cuenta-modal-meta-grid {
              grid-template-columns: 1fr !important;
            }
          }
        </style>
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
    document.body.classList.add("modal-open");
  } catch {}

  try {
    document.body.style.overflow = "hidden";
  } catch {}
}

function unlockBody() {
  try {
    document.body.classList.remove("modal-open");
  } catch {}

  try {
    document.body.style.overflow = "";
  } catch {}
}

function restoreFocus() {
  try {
    modalState.lastActiveElement?.focus?.();
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
      closeCuentaModal();
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

  if (!modalState.detail) {
    root.innerHTML = "";
    return root;
  }

  root.innerHTML = renderModalInner(modalState.detail, {
    isRefreshing: modalState.isRefreshing,
    isSaving: modalState.isSaving,
  });

  return root;
}

function focusPanel() {
  try {
    const panel = document.getElementById(PANEL_ID);
    panel?.focus?.();
  } catch {}
}

/* =========================================================
   OPEN / CLOSE
========================================================= */

export function openCuentaModal(detail = {}) {
  modalState.lastActiveElement = document.activeElement || null;
  modalState.detail = getDetail(detail);
  modalState.isOpen = true;
  modalState.isRefreshing = false;
  modalState.isSaving = false;

  renderModal();
  lockBody();
  attachEscHandler();
  attachRootBindings();
  focusPanel();

  safeEmit("cuenta:modal:opened", {
    detail: modalState.detail,
  });

  return true;
}

export function closeCuentaModal() {
  const root = getRoot();

  modalState.isOpen = false;
  modalState.isRefreshing = false;
  modalState.isSaving = false;
  modalState.detail = null;

  detachRootBindings();

  if (root) {
    root.innerHTML = "";
  }

  unlockBody();
  detachEscHandler();
  restoreFocus();

  safeEmit("cuenta:modal:closed", {});

  return true;
}

export function updateCuentaModal(detail = {}) {
  if (!modalState.isOpen) {
    return openCuentaModal(detail);
  }

  modalState.detail = getDetail(detail);
  modalState.isRefreshing = false;
  modalState.isSaving = false;

  detachRootBindings();
  renderModal();
  attachRootBindings();

  return true;
}

/* =========================================================
   ACTION HELPERS
========================================================= */

function getCurrentSnapshot() {
  return getSnapshot(modalState.detail || {});
}

async function handleCopy() {
  const payload = getCurrentSnapshot();
  const ok = await writeClipboardText(
    JSON.stringify(payload, null, 2)
  );

  if (!ok) {
    showToast("No se pudo copiar el snapshot.", "error");
    return false;
  }

  safeEmit("cuenta:modal:copy", {
    snapshot: payload,
  });

  showToast("Snapshot copiado", "success");

  return true;
}

async function handleRefresh() {
  if (modalState.isRefreshing || modalState.isSaving) {
    return false;
  }

  modalState.isRefreshing = true;
  detachRootBindings();
  renderModal();
  attachRootBindings();

  safeEmit("cuenta:modal:refresh", {});

  return true;
}

async function handleToggleTheme() {
  if (modalState.isRefreshing || modalState.isSaving) {
    return false;
  }

  const current = getDetail(modalState.detail || {});
  const nextDarkMode = !Boolean(current.darkMode);

  modalState.isSaving = true;
  detachRootBindings();
  renderModal();
  attachRootBindings();

  safeEmit("cuenta:modal:update-theme", {
    darkMode: nextDarkMode,
  });

  return true;
}

async function handleTogglePrivacy() {
  if (modalState.isRefreshing || modalState.isSaving) {
    return false;
  }

  const current = getDetail(modalState.detail || {});
  const nextPrivacyMode = !Boolean(current.privacyMode);

  modalState.isSaving = true;
  detachRootBindings();
  renderModal();
  attachRootBindings();

  safeEmit("cuenta:modal:update-preferences", {
    privacyMode: nextPrivacyMode,
  });

  return true;
}

async function handleSaveBoth() {
  if (modalState.isRefreshing || modalState.isSaving) {
    return false;
  }

  const current = getDetail(modalState.detail || {});

  modalState.isSaving = true;
  detachRootBindings();
  renderModal();
  attachRootBindings();

  safeEmit("cuenta:modal:update-preferences", {
    darkMode: Boolean(current.darkMode),
    privacyMode: Boolean(current.privacyMode),
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
    const closeBtn = event.target.closest("[data-modal-close='true']");
    if (closeBtn) {
      event.preventDefault();
      closeCuentaModal();
      return;
    }

    const refreshBtn = event.target.closest('[data-modal-action="refresh"]');
    if (refreshBtn) {
      event.preventDefault();
      await handleRefresh();
      return;
    }

    const copyBtn = event.target.closest('[data-modal-action="copy"]');
    if (copyBtn) {
      event.preventDefault();
      await handleCopy();
      return;
    }

    const toggleThemeBtn = event.target.closest('[data-modal-action="toggle-theme"]');
    if (toggleThemeBtn) {
      event.preventDefault();
      await handleToggleTheme();
      return;
    }

    const togglePrivacyBtn = event.target.closest('[data-modal-action="toggle-privacy"]');
    if (togglePrivacyBtn) {
      event.preventDefault();
      await handleTogglePrivacy();
      return;
    }

    const saveBothBtn = event.target.closest('[data-modal-action="save-both"]');
    if (saveBothBtn) {
      event.preventDefault();
      await handleSaveBoth();
      return;
    }

    const overlay = event.target.closest("[data-cuenta-modal-overlay='true']");
    const panel = event.target.closest("[data-cuenta-modal-panel='true']");

    if (overlay && !panel && event.target === overlay) {
      closeCuentaModal();
    }
  };

  root.__cuentaModalClickHandler = onClick;
  root.addEventListener("click", onClick);

  modalState.bindingsAttached = true;
}

function detachRootBindings() {
  const root = getRoot();
  if (!root) {
    modalState.bindingsAttached = false;
    return;
  }

  if (root.__cuentaModalClickHandler) {
    try {
      root.removeEventListener("click", root.__cuentaModalClickHandler);
    } catch {}
    delete root.__cuentaModalClickHandler;
  }

  modalState.bindingsAttached = false;
}

/* =========================================================
   EVENT BUS BRIDGE
========================================================= */

function handleOpenEvent(event) {
  const detail = event?.detail?.detail || event?.detail || event || null;
  if (!detail) return;
  openCuentaModal(detail);
}

function handleCloseEvent() {
  closeCuentaModal();
}

function handleLoadedDetailEvent(event) {
  const detail = event?.detail?.detail || event?.detail || event || null;
  if (!detail) return;

  if (modalState.isOpen) {
    updateCuentaModal(detail);
  }
}

function handleRefreshSuccess(event) {
  const detail = event?.detail?.detail || event?.detail || event || null;

  if (!detail) {
    modalState.isRefreshing = false;
    modalState.isSaving = false;
    detachRootBindings();
    renderModal();
    attachRootBindings();
    return;
  }

  updateCuentaModal(detail);
}

function handleRefreshError() {
  modalState.isRefreshing = false;
  modalState.isSaving = false;
  detachRootBindings();
  renderModal();
  attachRootBindings();
}

let busAttached = false;

function attachBus() {
  if (busAttached) return;

  safeOn("cuenta:modal:open", handleOpenEvent);
  safeOn("cuenta:modal:close", handleCloseEvent);
  safeOn("cuenta:loaded", handleLoadedDetailEvent);
  safeOn("cuenta:detail:success", handleLoadedDetailEvent);
  safeOn("cuenta:update:success", handleRefreshSuccess);
  safeOn("cuenta:theme:update:success", handleRefreshSuccess);
  safeOn("cuenta:refresh:success", handleRefreshSuccess);
  safeOn("cuenta:update:error", handleRefreshError);
  safeOn("cuenta:theme:update:error", handleRefreshError);
  safeOn("cuenta:refresh:error", handleRefreshError);

  busAttached = true;
}

function detachBus() {
  if (!busAttached) return;

  safeOff("cuenta:modal:open", handleOpenEvent);
  safeOff("cuenta:modal:close", handleCloseEvent);
  safeOff("cuenta:loaded", handleLoadedDetailEvent);
  safeOff("cuenta:detail:success", handleLoadedDetailEvent);
  safeOff("cuenta:update:success", handleRefreshSuccess);
  safeOff("cuenta:theme:update:success", handleRefreshSuccess);
  safeOff("cuenta:refresh:success", handleRefreshSuccess);
  safeOff("cuenta:update:error", handleRefreshError);
  safeOff("cuenta:theme:update:error", handleRefreshError);
  safeOff("cuenta:refresh:error", handleRefreshError);

  busAttached = false;
}

/* =========================================================
   GLOBAL BRIDGE
========================================================= */

export const OnionCuentaModal = {
  open(detail = {}) {
    return openCuentaModal(detail);
  },

  close() {
    return closeCuentaModal();
  },

  update(detail = {}) {
    return updateCuentaModal(detail);
  },

  getState() {
    return {
      ...modalState,
      detail: modalState.detail ? { ...modalState.detail } : null,
    };
  },

  destroy() {
    closeCuentaModal();
    detachEscHandler();
    detachRootBindings();
    detachBus();

    const root = getRoot();
    try {
      root?.remove?.();
    } catch {}

    return true;
  },
};

try {
  window.OnionCuentaModal = OnionCuentaModal;
  window.renderCuentaModal = OnionCuentaModal.open;
} catch {}

/* =========================================================
   AUTO BOOT
========================================================= */

attachBus();

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default OnionCuentaModal;
