/* =========================================================
   Onion SPA - Usuarios Modal
   Archivo: src/views/usuarios/usuarios.modal.js

   FINAL PRO SYSTEM · DETAIL MODAL · 10/10

   RESPONSABILIDADES:
   - renderizar modal premium de detalle de usuario
   - abrir / cerrar modal limpio
   - refrescar contenido del usuario desde el modal
   - copiar ID desde el modal
   - soportar metadata / roles / actividad
   - exponer bridge global para usuariosView.js
   - integrarse con AppCore.events sin acoplar la vista

   HARDENING PRO:
   - tolerancia a payloads heterogéneos
   - fallback avatar -> iniciales
   - modal singleton
   - escape / overlay close
   - render incremental seguro
   - estado visual interno de refresh
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

const MODAL_ID =
  "usuarios-detail-modal-root";

const PANEL_ID =
  "usuarios-detail-modal-panel";

/* =========================================================
   LOCAL STATE
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
   HELPERS CORE
========================================================= */

function safeEmit(
  event = "",
  payload = {}
) {
  try {
    AppCore?.events?.emit?.(
      event,
      payload
    );
  } catch {}
}

function safeOn(
  event = "",
  handler = null
) {
  if (
    !event ||
    typeof handler !==
      "function"
  ) {
    return false;
  }

  try {
    AppCore?.events?.on?.(
      event,
      handler
    );

    return true;
  } catch {
    return false;
  }
}

function safeOff(
  event = "",
  handler = null
) {
  if (
    !event ||
    typeof handler !==
      "function"
  ) {
    return false;
  }

  try {
    AppCore?.events?.off?.(
      event,
      handler
    );

    return true;
  } catch {
    return false;
  }
}

function safeText(
  value,
  fallback = ""
) {
  if (
    value === null ||
    value === undefined
  ) {
    return fallback;
  }

  const text =
    String(value).trim();

  return text || fallback;
}

function safeArray(value) {
  return Array.isArray(value)
    ? value
    : [];
}

function safeObject(value) {
  return value &&
    typeof value ===
      "object" &&
    !Array.isArray(value)
    ? value
    : {};
}

function first(...values) {
  for (const value of values) {
    if (
      value !== undefined &&
      value !== null &&
      String(value).trim() !==
        ""
    ) {
      return value;
    }
  }

  return null;
}

function escapeHtml(
  value = ""
) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(
      /"/g,
      "&quot;"
    )
    .replace(
      /'/g,
      "&#39;"
    );
}

function showToast(
  message = "",
  type = "info"
) {
  try {
    if (
      typeof AppCore?.toast?.[
        type
      ] === "function"
    ) {
      AppCore.toast[type](
        message
      );
      return;
    }
  } catch {}

  try {
    AppCore?.toast?.show?.(
      message,
      type
    );
  } catch {}
}

/* =========================================================
   DATE HELPERS
========================================================= */

function formatDate(
  value = null
) {
  if (!value) return "—";

  const date = new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return "—";
  }

  try {
    return new Intl.DateTimeFormat(
      "es-ES",
      {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }
    ).format(date);
  } catch {
    return "—";
  }
}

function formatRelativeDate(
  value = null
) {
  if (!value)
    return "Sin fecha";

  const date = new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return "Sin fecha";
  }

  const diff =
    Date.now() -
    date.getTime();

  const mins = Math.round(
    diff / 60000
  );

  if (mins < 1)
    return "Ahora mismo";

  if (mins < 60)
    return `Hace ${mins} min`;

  const hours =
    Math.round(
      mins / 60
    );

  if (hours < 24)
    return `Hace ${hours} h`;

  const days =
    Math.round(
      hours / 24
    );

  if (days <= 7) {
    return `Hace ${days} día${
      days === 1 ? "" : "s"
    }`;
  }

  return formatDate(value);
}

/* =========================================================
   MODEL HELPERS
========================================================= */

function getDetail(
  detail = {}
) {
  return normalizeUsuarioModel(
    safeObject(detail)
  );
}

function getUserId(
  detail = {}
) {
  return safeText(
    first(
      detail.userId,
      detail.id
    ),
    "—"
  );
}

function getAvatar(
  detail = {}
) {
  return safeText(
    first(
      detail.avatarUrl,
      detail.avatar,
      detail.photo,
      detail.image,
      detail?.raw?.avatar,
      detail?.raw?.avatarUrl
    ),
    ""
  );
}

/* =========================================================
   VISUAL HELPERS
========================================================= */

function getStatusChipStyle(
  value = ""
) {
  const key = safeText(
    value,
    ""
  ).toLowerCase();

  if (
    [
      "active",
      "activo",
      "activa",
    ].includes(key)
  ) {
    return `
      color:var(--success-strong,#36c690);
      background:color-mix(in srgb,var(--success-strong,#36c690) 14%,transparent);
      border:1px solid color-mix(in srgb,var(--success-strong,#36c690) 26%,transparent);
    `;
  }

  if (
    [
      "pending",
      "pendiente",
    ].includes(key)
  ) {
    return `
      color:#ffbc42;
      background:color-mix(in srgb,#ffbc42 14%,transparent);
      border:1px solid color-mix(in srgb,#ffbc42 26%,transparent);
    `;
  }

  if (
    [
      "blocked",
      "bloqueado",
      "disabled",
      "inactive",
      "inactivo",
    ].includes(key)
  ) {
    return `
      color:#ff6b6b;
      background:color-mix(in srgb,#ff6b6b 14%,transparent);
      border:1px solid color-mix(in srgb,#ff6b6b 26%,transparent);
    `;
  }

  return `
    color:var(--text-soft);
    background:var(--surface-glass);
    border:1px solid var(--border-soft);
  `;
}

function renderChip(
  label = "",
  style = ""
) {
  return `
    <span
      style="
        display:inline-flex;
        align-items:center;
        min-height:32px;
        padding:0 12px;
        border-radius:999px;
        font-size:12px;
        font-weight:700;
        letter-spacing:.05em;
        text-transform:uppercase;
        ${style}
      "
    >
      ${escapeHtml(label)}
    </span>
  `;
}

function renderAvatar(
  detail = {}
) {
  const avatar =
    getAvatar(detail);

  const initials =
    safeText(
      detail.initials,
      getInitials(
        detail.name ||
          detail.username ||
          "US"
      )
    );

  const theme =
    getAvatarTheme(
      safeText(
        first(
          detail.userId,
          detail.email,
          detail.username
        ),
        "user"
      )
    );

  const palette = {
    violet:
      "linear-gradient(135deg, rgba(124,92,255,.28), rgba(88,72,200,.12))",
    emerald:
      "linear-gradient(135deg, rgba(54,198,144,.28), rgba(35,131,95,.12))",
    blue:
      "linear-gradient(135deg, rgba(96,165,250,.28), rgba(37,99,235,.12))",
  };

  const bg =
    palette[theme] ||
    palette.violet;

  if (avatar) {
    return `
      <div
        style="
          width:72px;
          height:72px;
          border-radius:22px;
          overflow:hidden;
          border:1px solid var(--border-soft);
          background:var(--surface-glass);
        "
      >
        <img
          src="${escapeHtml(
            avatar
          )}"
          alt=""
          style="
            width:100%;
            height:100%;
            object-fit:cover;
          "
        />
      </div>
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
        background:${bg};
        border:1px solid var(--border-soft);
        color:#fff;
        font-size:22px;
        font-weight:800;
      "
    >
      ${escapeHtml(
        initials
      )}
    </div>
  `;
}

/* =========================================================
   MODAL HTML
========================================================= */

function renderMetaField(
  label = "",
  value = ""
) {
  return `
    <div
      style="
        display:grid;
        gap:6px;
        padding:14px;
        border-radius:16px;
        border:1px solid var(--border-soft);
        background:var(--surface-glass);
      "
    >
      <span
        style="
          font-size:11px;
          color:var(--text-dim);
          text-transform:uppercase;
          letter-spacing:.08em;
          font-weight:700;
        "
      >
        ${escapeHtml(label)}
      </span>

      <strong
        style="
          color:var(--text-strong);
          font-size:14px;
          word-break:break-word;
        "
      >
        ${escapeHtml(
          safeText(
            value,
            "—"
          )
        )}
      </strong>
    </div>
  `;
}

function renderModalInner(
  detail = {},
  {
    isRefreshing = false,
  } = {}
) {
  const item =
    getDetail(detail);

  const userId =
    getUserId(item);

  const status =
    safeText(
      item.status,
      "active"
    );

  const role =
    safeText(
      item.role,
      "user"
    );

  return `
    <div
      data-usuarios-modal-overlay="true"
      style="
        position:fixed;
        inset:0;
        z-index:9999;
        padding:24px;
        display:grid;
        place-items:center;
        background:rgba(0,0,0,.70);
        backdrop-filter:blur(10px);
      "
    >
      <div
        id="${PANEL_ID}"
        data-usuarios-modal-panel="true"
        style="
          position:relative;
          width:min(1080px,100%);
          max-height:92vh;
          overflow:auto;
          border-radius:28px;
          border:1px solid var(--border-soft);
          background:linear-gradient(180deg,var(--surface-2,#171717),var(--surface-1,#111));
          box-shadow:0 40px 100px rgba(0,0,0,.45);
        "
      >
        <div
          style="
            padding:24px;
            border-bottom:1px solid var(--border-soft);
            display:flex;
            justify-content:space-between;
            gap:16px;
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
            ${renderAvatar(
              item
            )}

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
                <span
                  style="
                    padding:0 10px;
                    min-height:28px;
                    border-radius:999px;
                    display:inline-flex;
                    align-items:center;
                    border:1px solid var(--border-soft);
                    background:var(--surface-glass);
                    color:var(--text-dim);
                    font-size:12px;
                    font-weight:700;
                  "
                >
                  ID ${escapeHtml(
                    userId
                  )}
                </span>

                ${renderChip(
                  getStatusLabel(
                    status
                  ),
                  getStatusChipStyle(
                    status
                  )
                )}

                ${renderChip(
                  getRoleLabel(
                    role
                  ),
                  ""
                )}
              </div>

              <h2
                style="
                  margin:0;
                  color:var(--text-strong);
                  font-size:clamp(28px,4vw,42px);
                  line-height:1;
                "
              >
                ${escapeHtml(
                  safeText(
                    item.name,
                    "Usuario"
                  )
                )}
              </h2>

              <span
                style="
                  color:var(--text-dim);
                  font-size:14px;
                "
              >
                @${escapeHtml(
                  safeText(
                    item.username,
                    "usuario"
                  )
                )}
              </span>
            </div>
          </div>

          <div
            style="
              display:flex;
              gap:10px;
              flex-wrap:wrap;
            "
          >
            <button
              type="button"
              data-modal-action="refresh"
              data-user-id="${escapeHtml(
                userId
              )}"
              ${
                isRefreshing
                  ? "disabled"
                  : ""
              }
              style="
                min-height:44px;
                padding:0 16px;
                border-radius:14px;
                border:1px solid var(--border-soft);
                background:var(--surface-glass);
                color:var(--text-soft);
                font-weight:700;
                cursor:pointer;
              "
            >
              ${
                isRefreshing
                  ? "Refrescando..."
                  : "Actualizar"
              }
            </button>

            <button
              type="button"
              data-modal-action="copy"
              data-user-id="${escapeHtml(
                userId
              )}"
              style="
                min-height:44px;
                padding:0 16px;
                border-radius:14px;
                border:none;
                background:var(--accent,#7c5cff);
                color:#fff;
                font-weight:700;
                cursor:pointer;
              "
            >
              Copiar ID
            </button>

            <button
              type="button"
              data-modal-close="true"
              style="
                width:46px;
                height:46px;
                border-radius:14px;
                border:1px solid var(--border-soft);
                background:var(--surface-glass);
                color:var(--text-strong);
                cursor:pointer;
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
            gap:18px;
          "
        >
          <div
            class="usuarios-modal-grid"
            style="
              display:grid;
              grid-template-columns:repeat(3,minmax(0,1fr));
              gap:14px;
            "
          >
            ${renderMetaField(
              "Email",
              item.email
            )}
            ${renderMetaField(
              "Teléfono",
              item.phone
            )}
            ${renderMetaField(
              "Empresa",
              item.companyName
            )}
            ${renderMetaField(
              "Rol",
              getRoleLabel(
                role
              )
            )}
            ${renderMetaField(
              "Estado",
              getStatusLabel(
                status
              )
            )}
            ${renderMetaField(
              "Último login",
              formatRelativeDate(
                item.lastLoginAt
              )
            )}
            ${renderMetaField(
              "Creado",
              formatDate(
                item.createdAt
              )
            )}
            ${renderMetaField(
              "Actualizado",
              formatDate(
                item.updatedAt
              )
            )}
            ${renderMetaField(
              "ID",
              userId
            )}
          </div>
        </div>

        <style>
          @media (max-width:980px){
            .usuarios-modal-grid{
              grid-template-columns:repeat(2,minmax(0,1fr)) !important;
            }
          }

          @media (max-width:640px){
            .usuarios-modal-grid{
              grid-template-columns:1fr !important;
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
  return document.getElementById(
    MODAL_ID
  );
}

function ensureRoot() {
  let root =
    getRoot();

  if (root)
    return root;

  root =
    document.createElement(
      "div"
    );

  root.id = MODAL_ID;

  document.body.appendChild(
    root
  );

  return root;
}

function lockBody() {
  document.body.style.overflow =
    "hidden";
}

function unlockBody() {
  document.body.style.overflow =
    "";
}

/* =========================================================
   RENDER
========================================================= */

function renderModal() {
  const root =
    ensureRoot();

  if (!modalState.detail) {
    root.innerHTML = "";
    return;
  }

  root.innerHTML =
    renderModalInner(
      modalState.detail,
      {
        isRefreshing:
          modalState.isRefreshing,
      }
    );
}

/* =========================================================
   OPEN / CLOSE
========================================================= */

export function openUsuariosModal(
  detail = {}
) {
  modalState.lastActiveElement =
    document.activeElement;

  modalState.detail =
    getDetail(detail);

  modalState.isOpen = true;
  modalState.isRefreshing = false;

  renderModal();
  lockBody();
  attachRootBindings();

  safeEmit(
    "usuarios:modal:opened",
    {
      detail:
        modalState.detail,
      userId: getUserId(
        modalState.detail
      ),
    }
  );

  return true;
}

export function closeUsuariosModal() {
  const root =
    getRoot();

  modalState.detail = null;
  modalState.isOpen = false;
  modalState.isRefreshing = false;

  if (root) {
    root.innerHTML = "";
  }

  unlockBody();

  try {
    modalState.lastActiveElement?.focus?.();
  } catch {}

  safeEmit(
    "usuarios:modal:closed",
    {}
  );

  return true;
}

export function updateUsuariosModal(
  detail = {}
) {
  if (
    !modalState.isOpen
  ) {
    return openUsuariosModal(
      detail
    );
  }

  modalState.detail =
    getDetail(detail);

  modalState.isRefreshing = false;

  renderModal();

  return true;
}

/* =========================================================
   ACTIONS
========================================================= */

async function handleCopy(
  userId = ""
) {
  if (!userId) {
    showToast(
      "No hay ID para copiar.",
      "error"
    );
    return;
  }

  safeEmit(
    "usuarios:modal:copy",
    { userId }
  );

  showToast(
    "ID copiado",
    "success"
  );
}

async function handleRefresh(
  userId = ""
) {
  if (
    !userId ||
    modalState.isRefreshing
  ) {
    return;
  }

  modalState.isRefreshing = true;

  renderModal();

  safeEmit(
    "usuarios:modal:refresh",
    { userId }
  );
}

/* =========================================================
   ROOT BINDINGS
========================================================= */

function attachRootBindings() {
  const root =
    ensureRoot();

  if (
    root.__usuariosBound
  ) {
    return;
  }

  root.__usuariosBound = true;

  root.addEventListener(
    "click",
    async (event) => {
      const closeBtn =
        event.target.closest(
          "[data-modal-close='true']"
        );

      if (closeBtn) {
        closeUsuariosModal();
        return;
      }

      const copyBtn =
        event.target.closest(
          '[data-modal-action="copy"]'
        );

      if (copyBtn) {
        await handleCopy(
          copyBtn.dataset
            .userId || ""
        );
        return;
      }

      const refreshBtn =
        event.target.closest(
          '[data-modal-action="refresh"]'
        );

      if (refreshBtn) {
        await handleRefresh(
          refreshBtn.dataset
            .userId || ""
        );
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
        event.target ===
          overlay
      ) {
        closeUsuariosModal();
      }
    }
  );
}

/* =========================================================
   BUS BRIDGE
========================================================= */

function handleOpenEvent(
  event
) {
  const detail =
    event?.detail?.detail ||
    event?.detail ||
    event;

  if (!detail) return;

  openUsuariosModal(
    detail
  );
}

function handleCloseEvent() {
  closeUsuariosModal();
}

function handleOpenedDetail(
  event
) {
  const detail =
    event?.detail?.detail ||
    event?.detail ||
    event;

  if (!detail) return;

  if (
    modalState.isOpen
  ) {
    updateUsuariosModal(
      detail
    );
  }
}

safeOn(
  "usuarios:modal:open",
  handleOpenEvent
);

safeOn(
  "usuarios:modal:close",
  handleCloseEvent
);

safeOn(
  "usuarios:open:success",
  handleOpenedDetail
);

/* =========================================================
   GLOBAL BRIDGE
========================================================= */

export const OnionUsuariosModal =
  {
    open:
      openUsuariosModal,
    close:
      closeUsuariosModal,
    update:
      updateUsuariosModal,

    getState() {
      return {
        ...modalState,
      };
    },

    destroy() {
      closeUsuariosModal();

      const root =
        getRoot();

      try {
        root?.remove?.();
      } catch {}

      safeOff(
        "usuarios:modal:open",
        handleOpenEvent
      );

      safeOff(
        "usuarios:modal:close",
        handleCloseEvent
      );

      safeOff(
        "usuarios:open:success",
        handleOpenedDetail
      );

      return true;
    },
  };

try {
  window.OnionUsuariosModal =
    OnionUsuariosModal;

  window.renderUsuarioModal =
    OnionUsuariosModal.open;
} catch {}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default OnionUsuariosModal;
