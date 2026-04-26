/* =========================================================
   Onion SPA - Usuarios Table Template
   Archivo: src/views/usuarios/usuarios.table.template.js

   FINAL PRODUCTION TEMPLATE · USERS VIEW · CLON 1:1 INCIDENCIAS

   RESPONSABILIDADES:
   - render del hero/header de usuarios
   - render de tabla productiva con paginación real
   - compatibilidad con usuariosView.js
   - estado loading visual en "Ver detalle"
   - estado loading visual en "Nuevo usuario"
   - estado loading visual en refresh / retry / export
   - soporte para payloads backend heterogéneos
   - soporte para envelope backend { ok, count, users }
   - lenguaje visual alineado 1:1 con incidencias
   - versión desktop + cards mobile
   - sin columna rol
   - sin columna equipo
   - sin columna contacto duplicada
   - columna email dedicada
   - columna ubicación solo ciudad
   - actividad mostrando solo última conexión
   - límite fijo de 5 usuarios por hoja

   HARDENING PRO:
   - no depende de imports externos
   - tolera payload heterogéneo
   - soporta state + props directas
   - paginación defensiva
   - estilos encapsulados
   - responsive robusto
   - acciones compatibles con data-usuarios-action y data-action
   - restricción admin no duplicada: la controla la View
========================================================= */

/* =========================================================
   CONSTANTS
========================================================= */

const PAGE_SIZE = 5;

/* =========================================================
   HELPERS
========================================================= */

function safeText(value, fallback = "") {
  if (value === null || value === undefined) return fallback;

  const text = String(value).trim();

  return text || fallback;
}

function safeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function safeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function first(...values) {
  for (const value of values) {
    if (value === undefined || value === null) continue;

    if (typeof value === "string" && value.trim() === "") {
      continue;
    }

    if (Array.isArray(value) && value.length === 0) {
      continue;
    }

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

function normalizeKey(value = "") {
  return safeText(value, "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s-]+/g, "_")
    .replace(/[^a-z0-9_:.]/g, "")
    .trim();
}

function truncate(value = "", max = 96) {
  const text = normalizeWhitespace(value);

  if (!text) return "";

  if (text.length <= max) {
    return text;
  }

  return `${text.slice(0, Math.max(0, max - 1)).trim()}…`;
}

function formatDate(value = null) {
  if (!value) return "—";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  try {
    return new Intl.DateTimeFormat("es-ES", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(date);
  } catch {
    return "—";
  }
}

function formatDateTime(value = null) {
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

  return formatDateTime(value);
}

function formatLastUpdate(value = null) {
  if (!value) return "Sin acceso";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Sin acceso";

  const diffHours = Math.abs(Date.now() - date.getTime()) / 3600000;

  if (diffHours <= 72) {
    return formatRelativeDate(value);
  }

  return formatDateTime(value);
}

/* =========================================================
   BACKEND ENVELOPE / RESOLVE
========================================================= */

function unwrapItemsEnvelope(value) {
  if (Array.isArray(value)) {
    return value;
  }

  const obj = safeObject(value);

  if (Array.isArray(obj.usuarios)) return obj.usuarios;
  if (Array.isArray(obj.users)) return obj.users;
  if (Array.isArray(obj.items)) return obj.items;
  if (Array.isArray(obj.rows)) return obj.rows;
  if (Array.isArray(obj.data)) return obj.data;
  if (Array.isArray(obj.results)) return obj.results;

  if (obj.data && typeof obj.data === "object") {
    return unwrapItemsEnvelope(obj.data);
  }

  if (obj.payload && typeof obj.payload === "object") {
    return unwrapItemsEnvelope(obj.payload);
  }

  if (obj.response && typeof obj.response === "object") {
    return unwrapItemsEnvelope(obj.response);
  }

  return [];
}

function getResolvedItems(input = {}) {
  const data = safeObject(input);
  const state = safeObject(data.state);

  const candidates = [
    data.items,
    data.rows,
    data.users,
    data.usuarios,
    data.data,
    data.results,
    data.payload,
    data.response,

    state.items,
    state.rows,
    state.users,
    state.usuarios,
    state.data,
    state.results,
    state.payload,
    state.response,

    input,
  ];

  for (const candidate of candidates) {
    const rows = unwrapItemsEnvelope(candidate);

    if (rows.length) {
      return sortUsuariosByUpdatedDesc(rows);
    }
  }

  return [];
}

function resolveRemoteCount(input = {}, items = []) {
  const data = safeObject(input);
  const state = safeObject(data.state);

  const payload = safeObject(first(data.payload, state.payload));
  const response = safeObject(first(data.response, state.response));
  const lastResponse = safeObject(first(data.lastResponse, state.lastResponse));
  const stats = safeObject(first(data.stats, state.stats));

  return Math.max(
    safeArray(items).length,
    safeNumber(
      first(
        data.remoteCount,
        data.totalCount,
        data.count,
        data.total,

        state.remoteCount,
        state.totalCount,
        state.count,
        state.total,

        stats.total,
        payload.count,
        payload.total,
        response.count,
        response.total,
        lastResponse.count,
        lastResponse.total,

        safeArray(items).length
      ),
      safeArray(items).length
    )
  );
}

function shouldRenderRestricted(input = {}) {
  const data = safeObject(input);
  const state = safeObject(data.state);

  return Boolean(
    data.forbidden === true ||
      data.accessDenied === true ||
      state.forbidden === true ||
      state.accessDenied === true
  );
}

/* =========================================================
   DATA PICKERS
========================================================= */

function getUsuarioId(item = {}) {
  return safeText(
    first(
      item.userId,
      item.usuarioId,
      item.id,
      item.code,
      item.username,
      item.userName,
      item.email,

      item?.raw?.userId,
      item?.raw?.usuarioId,
      item?.raw?.id,
      item?.raw?.code,
      item?.raw?.username,
      item?.raw?.userName,
      item?.raw?.email
    ),
    ""
  );
}

function getUsuarioCode(item = {}) {
  return safeText(
    first(
      item.username,
      item.userName,
      item.userId,
      item.usuarioId,
      item.id,
      item.code,
      item.email,

      item?.raw?.username,
      item?.raw?.userName,
      item?.raw?.userId,
      item?.raw?.usuarioId,
      item?.raw?.id,
      item?.raw?.code,
      item?.raw?.email
    ),
    "USR-SIN-ID"
  );
}

function getUsuarioName(item = {}) {
  const composedName = [
    safeText(first(item.firstName, item.nombre), ""),
    safeText(first(item.lastName, item.apellidos), ""),
  ]
    .filter(Boolean)
    .join(" ");

  return safeText(
    first(
      item.fullName,
      item.displayName,
      item.name,
      item.nombre,
      item.usuario?.nombre,
      item.usuario?.name,
      item.profile?.name,
      item.profile?.displayName,
      composedName,
      item.username,
      item.userName,
      item.email,

      item?.raw?.fullName,
      item?.raw?.displayName,
      item?.raw?.name,
      item?.raw?.nombre,
      item?.raw?.usuario?.nombre,
      item?.raw?.usuario?.name,
      item?.raw?.profile?.name,
      item?.raw?.profile?.displayName,
      item?.raw?.username,
      item?.raw?.userName,
      item?.raw?.email
    ),
    "Usuario"
  );
}

function getUsuarioDescription(item = {}) {
  return safeText(
    first(
      item.phone,
      item.telefono,
      item.mobile,
      item.profile?.phone,
      item.usuario?.phone,
      item.usuario?.telefono,
      item.description,
      item.descripcion,
      item.notes,

      item?.raw?.phone,
      item?.raw?.telefono,
      item?.raw?.mobile,
      item?.raw?.profile?.phone,
      item?.raw?.usuario?.phone,
      item?.raw?.usuario?.telefono,
      item?.raw?.description,
      item?.raw?.descripcion,
      item?.raw?.notes
    ),
    "Sin teléfono"
  );
}

function getUsuarioEmail(item = {}) {
  return safeText(
    first(
      item.email,
      item.mail,
      item.userEmail,
      item.usuario?.email,
      item.profile?.email,
      item.contact?.email,

      item?.raw?.email,
      item?.raw?.mail,
      item?.raw?.userEmail,
      item?.raw?.usuario?.email,
      item?.raw?.profile?.email,
      item?.raw?.contact?.email
    ),
    "Sin email"
  );
}

function getUsuarioLocation(item = {}) {
  return safeText(
    first(
      item.city,
      item.ciudad,
      item.locationCity,
      item.location?.city,
      item.location?.ciudad,
      item.ubicacion?.city,
      item.ubicacion?.ciudad,
      item.address?.city,
      item.address?.ciudad,
      item.direccion?.city,
      item.direccion?.ciudad,
      item.profile?.city,
      item.profile?.ciudad,
      item.usuario?.city,
      item.usuario?.ciudad,

      item?.raw?.city,
      item?.raw?.ciudad,
      item?.raw?.locationCity,
      item?.raw?.location?.city,
      item?.raw?.location?.ciudad,
      item?.raw?.ubicacion?.city,
      item?.raw?.ubicacion?.ciudad,
      item?.raw?.address?.city,
      item?.raw?.address?.ciudad,
      item?.raw?.direccion?.city,
      item?.raw?.direccion?.ciudad,
      item?.raw?.profile?.city,
      item?.raw?.profile?.ciudad,
      item?.raw?.usuario?.city,
      item?.raw?.usuario?.ciudad
    ),
    "Sin ciudad"
  );
}

function getUsuarioAvatarUrl(item = {}) {
  return safeText(
    first(
      item.avatar,
      item.avatarUrl,
      item.userAvatar,
      item.userAvatarUrl,
      item.photo,
      item.photoUrl,
      item.image,
      item.imageUrl,
      item.usuario?.avatar,
      item.usuario?.avatarUrl,
      item.profile?.avatar,
      item.profile?.avatarUrl,

      item?.raw?.avatar,
      item?.raw?.avatarUrl,
      item?.raw?.userAvatar,
      item?.raw?.userAvatarUrl,
      item?.raw?.photo,
      item?.raw?.photoUrl,
      item?.raw?.image,
      item?.raw?.imageUrl,
      item?.raw?.usuario?.avatar,
      item?.raw?.usuario?.avatarUrl,
      item?.raw?.profile?.avatar,
      item?.raw?.profile?.avatarUrl
    ),
    ""
  );
}

function getUsuarioInitials(item = {}) {
  const text = normalizeWhitespace(
    first(
      item.userInitials,
      item.initials,
      getUsuarioName(item),
      getUsuarioCode(item),
      "US"
    )
  );

  if (!text) return "US";

  const parts = text.split(" ").filter(Boolean);

  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }

  return `${parts[0]?.[0] || ""}${parts[1]?.[0] || ""}`.toUpperCase() || "US";
}

function getStatusValue(item = {}) {
  return first(
    item.status,
    item.estado,
    item.state,
    item.accountStatus,
    item.userStatus,

    item?.raw?.status,
    item?.raw?.estado,
    item?.raw?.state,
    item?.raw?.accountStatus,
    item?.raw?.userStatus,

    typeof item.isActive === "boolean"
      ? item.isActive
        ? "active"
        : "inactive"
      : null,

    typeof item.enabled === "boolean"
      ? item.enabled
        ? "active"
        : "inactive"
      : null,

    typeof item?.raw?.isActive === "boolean"
      ? item.raw.isActive
        ? "active"
        : "inactive"
      : null,

    typeof item?.raw?.enabled === "boolean"
      ? item.raw.enabled
        ? "active"
        : "inactive"
      : null,

    "active"
  );
}

function getStatusKey(value = "") {
  const key = normalizeKey(value);

  if (["active", "activo", "activa", "enabled", "habilitado"].includes(key)) {
    return "active";
  }

  if (["pending", "pendiente", "invited", "invitado", "invite"].includes(key)) {
    return "pending";
  }

  if (
    [
      "blocked",
      "bloqueado",
      "bloqueada",
      "suspended",
      "suspendido",
      "suspendida",
      "locked",
    ].includes(key)
  ) {
    return "blocked";
  }

  if (
    [
      "disabled",
      "inactive",
      "inactivo",
      "inactiva",
      "deshabilitado",
      "deshabilitada",
    ].includes(key)
  ) {
    return "inactive";
  }

  return "active";
}

function getStatusLabel(value = "") {
  const key = getStatusKey(value);

  if (key === "active") return "Activo";
  if (key === "pending") return "Pendiente";
  if (key === "blocked") return "Bloqueado";
  if (key === "inactive") return "Inactivo";

  return safeText(value, "Activo");
}

function getCreatedAt(item = {}) {
  return first(
    item.createdAt,
    item.created_at,
    item.fechaCreacion,
    item.registeredAt,
    item.created,
    item.date,
    item.updatedAt,

    item?.raw?.createdAt,
    item?.raw?.created_at,
    item?.raw?.fechaCreacion,
    item?.raw?.registeredAt,
    item?.raw?.created,
    item?.raw?.date,
    item?.raw?.updatedAt
  );
}

function getUpdatedAt(item = {}) {
  return first(
    item.updatedAt,
    item.updated_at,
    item.modifiedAt,
    item.lastModifiedAt,
    item.lastLoginAt,
    item.last_login_at,
    item.lastAccessAt,
    item.ultimoAcceso,
    item.createdAt,
    item.created_at,

    item?.raw?.updatedAt,
    item?.raw?.updated_at,
    item?.raw?.modifiedAt,
    item?.raw?.lastModifiedAt,
    item?.raw?.lastLoginAt,
    item?.raw?.last_login_at,
    item?.raw?.lastAccessAt,
    item?.raw?.ultimoAcceso,
    item?.raw?.createdAt,
    item?.raw?.created_at
  );
}

function getLastLoginAt(item = {}) {
  return first(
    item.lastLoginAt,
    item.last_login_at,
    item.lastAccessAt,
    item.ultimoAcceso,
    item.lastSeenAt,
    item.lastActivityAt,

    item?.raw?.lastLoginAt,
    item?.raw?.last_login_at,
    item?.raw?.lastAccessAt,
    item?.raw?.ultimoAcceso,
    item?.raw?.lastSeenAt,
    item?.raw?.lastActivityAt
  );
}

function getSortTimestamp(item = {}) {
  const value = first(getUpdatedAt(item), getCreatedAt(item), 0);
  const date = new Date(value);
  const time = date.getTime();

  return Number.isFinite(time) ? time : 0;
}

function sortUsuariosByUpdatedDesc(items = []) {
  return safeArray(items)
    .slice()
    .sort((a, b) => getSortTimestamp(b) - getSortTimestamp(a));
}

/* =========================================================
   STATS / PAGINATION
========================================================= */

function isActiveLike(item = {}) {
  return getStatusKey(getStatusValue(item)) === "active";
}

function isPendingLike(item = {}) {
  return getStatusKey(getStatusValue(item)) === "pending";
}

function isBlockedLike(item = {}) {
  return ["blocked", "inactive"].includes(getStatusKey(getStatusValue(item)));
}

function computeStats(items = []) {
  const rows = safeArray(items);

  return {
    total: rows.length,
    activeCount: rows.filter((item) => isActiveLike(item)).length,
    pendingCount: rows.filter((item) => isPendingLike(item)).length,
    blockedCount: rows.filter((item) => isBlockedLike(item)).length,
  };
}

function getPagination(items = [], input = {}) {
  const allItems = safeArray(items);
  const data = safeObject(input);
  const runtime = safeObject(data.state);

  const pageSize = PAGE_SIZE;

  const reportedTotal = Math.max(
    allItems.length,
    safeNumber(
      first(
        data.totalCount,
        data.remoteCount,
        data.count,
        data.total,
        runtime.totalCount,
        runtime.remoteCount,
        runtime.count,
        runtime.total,
        allItems.length
      ),
      allItems.length
    )
  );

  const totalPagesFromProps = safeNumber(
    first(data.totalPages, runtime.totalPages),
    0
  );

  const totalPages = Math.max(
    1,
    totalPagesFromProps || Math.ceil((reportedTotal || 1) / pageSize)
  );

  const currentPage = Math.min(
    Math.max(
      1,
      safeNumber(first(data.page, runtime.page, runtime.currentPage, 1), 1)
    ),
    totalPages
  );

  const startIndex = (currentPage - 1) * pageSize;
  const pageItems = allItems.slice(startIndex, startIndex + pageSize);

  const rangeStart = reportedTotal && pageItems.length ? startIndex + 1 : 0;
  const rangeEnd = reportedTotal
    ? Math.min(startIndex + pageItems.length, reportedTotal)
    : 0;

  return {
    allItems,
    pageItems,
    pageSize,
    currentPage,
    totalPages,
    totalCount: reportedTotal,
    rangeStart,
    rangeEnd,
    hasPrev: currentPage > 1,
    hasNext: currentPage < totalPages,
  };
}

/* =========================================================
   UI PARTIALS
========================================================= */

function renderSpinner(label = "") {
  return `
    <span class="usuarios-inline-loading">
      <span class="usuarios-inline-spinner" aria-hidden="true"></span>
      <span>${escapeHtml(label)}</span>
    </span>
  `;
}

function getStableHash(value = "") {
  const source = String(value || "onion");
  let hash = 0;

  for (let i = 0; i < source.length; i += 1) {
    hash = (hash << 5) - hash + source.charCodeAt(i);
    hash |= 0;
  }

  return Math.abs(hash);
}

function getFallbackAvatarTheme(seed = "") {
  const themes = [
    {
      bg: "linear-gradient(135deg, rgba(124,92,255,.22), rgba(88,72,200,.10))",
      border: "rgba(124,92,255,.20)",
      text: "#f3eeff",
    },
    {
      bg: "linear-gradient(135deg, rgba(54,198,144,.22), rgba(35,131,95,.10))",
      border: "rgba(54,198,144,.20)",
      text: "#e7fff4",
    },
    {
      bg: "linear-gradient(135deg, rgba(96,165,250,.22), rgba(37,99,235,.10))",
      border: "rgba(96,165,250,.20)",
      text: "#edf5ff",
    },
    {
      bg: "linear-gradient(135deg, rgba(255,188,66,.22), rgba(217,119,6,.10))",
      border: "rgba(255,188,66,.20)",
      text: "#fff6df",
    },
    {
      bg: "linear-gradient(135deg, rgba(255,107,107,.22), rgba(190,24,93,.10))",
      border: "rgba(255,107,107,.20)",
      text: "#fff0f0",
    },
    {
      bg: "linear-gradient(135deg, rgba(179,136,255,.22), rgba(109,40,217,.10))",
      border: "rgba(179,136,255,.20)",
      text: "#f7efff",
    },
  ];

  return themes[getStableHash(seed) % themes.length];
}

function renderAvatar(item = {}) {
  const fullName = getUsuarioName(item);
  const initials = getUsuarioInitials(item);
  const avatarUrl = getUsuarioAvatarUrl(item);
  const theme = getFallbackAvatarTheme(
    first(getUsuarioId(item), fullName, getUsuarioEmail(item), getUsuarioCode(item))
  );

  if (avatarUrl) {
    return `
      <div
        class="usuarios-avatar"
        style="
          --avatar-fallback-bg:${theme.bg};
          --avatar-fallback-border:${theme.border};
          --avatar-fallback-text:${theme.text};
        "
        aria-label="${escapeHtml(fullName)}"
        data-tooltip="${escapeHtml(fullName)}"
      >
        <img
          src="${escapeHtml(avatarUrl)}"
          alt="${escapeHtml(fullName)}"
          loading="lazy"
          referrerpolicy="no-referrer"
          onerror="this.style.display='none'; this.parentNode.setAttribute('data-fallback','true');"
        />
        <span class="usuarios-avatar-fallback">${escapeHtml(initials)}</span>
      </div>
    `;
  }

  return `
    <div
      class="usuarios-avatar usuarios-avatar--fallback"
      style="
        --avatar-fallback-bg:${theme.bg};
        --avatar-fallback-border:${theme.border};
        --avatar-fallback-text:${theme.text};
      "
      aria-label="${escapeHtml(fullName)}"
      data-tooltip="${escapeHtml(fullName)}"
    >
      <span class="usuarios-avatar-fallback">${escapeHtml(initials)}</span>
    </div>
  `;
}

function renderStatusChip(item = {}) {
  const rawStatus = getStatusValue(item);
  const key = getStatusKey(rawStatus);
  const label = getStatusLabel(rawStatus);

  return `
    <span class="usuarios-chip usuarios-chip--${escapeHtml(key)}">
      ${escapeHtml(label)}
    </span>
  `;
}

function renderOpenUsuarioButton({ userId = "", isOpening = false } = {}) {
  return `
    <button
      type="button"
      class="usuarios-detail-btn${isOpening ? " is-loading" : ""}"
      data-usuarios-action="detail"
      data-action="open-user"
      data-user-id="${escapeHtml(userId)}"
      ${isOpening ? 'disabled aria-busy="true"' : ""}
    >
      ${
        isOpening
          ? renderSpinner("Cargando...")
          : '<span class="usuarios-btn-text">Ver detalle</span>'
      }
    </button>
  `;
}

function renderUsuarioRow(item = {}, state = {}) {
  const runtime = safeObject(state);

  const userId = getUsuarioId(item);
  const code = getUsuarioCode(item);
  const name = getUsuarioName(item);
  const preview = truncate(getUsuarioDescription(item), 96);
  const email = getUsuarioEmail(item);
  const city = getUsuarioLocation(item);
  const createdAt = formatDate(getCreatedAt(item));
  const lastLoginAtRaw = getLastLoginAt(item);
  const lastLoginAt = lastLoginAtRaw
    ? formatLastUpdate(lastLoginAtRaw)
    : "Sin acceso";

  const openingUserId = safeText(runtime.openingUserId, "");
  const isOpening = Boolean(openingUserId && openingUserId === userId);

  return `
    <tr class="usuarios-row" data-user-id="${escapeHtml(userId)}">
      <td class="usuarios-cell usuarios-cell--main">
        <div class="usuarios-main">
          ${renderAvatar(item)}

          <div class="usuarios-main-copy">
            <div class="usuarios-user-id">${escapeHtml(code)}</div>
            <div class="usuarios-user-subject">${escapeHtml(name)}</div>
            <div class="usuarios-user-description">${escapeHtml(preview)}</div>
          </div>
        </div>
      </td>

      <td class="usuarios-cell usuarios-cell--status">
        ${renderStatusChip(item)}
      </td>

      <td class="usuarios-cell usuarios-cell--date">
        <span class="usuarios-date-inline">${escapeHtml(createdAt)}</span>
      </td>

      <td class="usuarios-cell usuarios-cell--email">
        <span class="usuarios-email-inline">${escapeHtml(email)}</span>
      </td>

      <td class="usuarios-cell usuarios-cell--location">
        <span class="usuarios-location-inline">${escapeHtml(city)}</span>
      </td>

      <td class="usuarios-cell usuarios-cell--activity">
        <span class="usuarios-activity-inline">${escapeHtml(lastLoginAt)}</span>
      </td>

      <td class="usuarios-cell usuarios-cell--actions">
        ${renderOpenUsuarioButton({ userId, isOpening })}
      </td>
    </tr>
  `;
}

function renderMobileUsuarioCard(item = {}, state = {}) {
  const runtime = safeObject(state);

  const userId = getUsuarioId(item);
  const code = getUsuarioCode(item);
  const name = getUsuarioName(item);
  const preview = truncate(getUsuarioDescription(item), 120);
  const email = getUsuarioEmail(item);
  const city = getUsuarioLocation(item);
  const createdAt = formatDate(getCreatedAt(item));
  const lastLoginAtRaw = getLastLoginAt(item);
  const lastLoginAt = lastLoginAtRaw
    ? formatLastUpdate(lastLoginAtRaw)
    : "Sin acceso";

  const openingUserId = safeText(runtime.openingUserId, "");
  const isOpening = Boolean(openingUserId && openingUserId === userId);

  return `
    <article class="usuarios-mobile-card" data-user-id="${escapeHtml(userId)}">
      <div class="usuarios-mobile-top">
        <div class="usuarios-mobile-main">
          ${renderAvatar(item)}

          <div class="usuarios-main-copy">
            <div class="usuarios-user-id">${escapeHtml(code)}</div>
            <div class="usuarios-user-subject">${escapeHtml(name)}</div>
            <div class="usuarios-user-description">${escapeHtml(preview)}</div>
          </div>
        </div>

        ${renderStatusChip(item)}
      </div>

      <div class="usuarios-mobile-meta">
        <div class="usuarios-mobile-meta-card">
          <span class="usuarios-mobile-meta-label">Alta</span>
          <strong class="usuarios-mobile-meta-value">${escapeHtml(createdAt)}</strong>
        </div>

        <div class="usuarios-mobile-meta-card">
          <span class="usuarios-mobile-meta-label">Email</span>
          <strong class="usuarios-mobile-meta-value">${escapeHtml(email)}</strong>
        </div>

        <div class="usuarios-mobile-meta-card">
          <span class="usuarios-mobile-meta-label">Ubicación</span>
          <strong class="usuarios-mobile-meta-value">${escapeHtml(city)}</strong>
        </div>

        <div class="usuarios-mobile-meta-card">
          <span class="usuarios-mobile-meta-label">Última conexión</span>
          <strong class="usuarios-mobile-meta-value">${escapeHtml(lastLoginAt)}</strong>
        </div>
      </div>

      <div class="usuarios-mobile-actions">
        ${renderOpenUsuarioButton({ userId, isOpening })}
      </div>
    </article>
  `;
}

function renderEmptyContent({ hasError = false, message = "" } = {}) {
  return `
    <div class="usuarios-empty">
      <h3 class="usuarios-empty-title">
        ${
          hasError
            ? "No se pudieron cargar los usuarios"
            : "No hay usuarios para mostrar"
        }
      </h3>

      <p class="usuarios-empty-text">
        ${
          hasError
            ? escapeHtml(
                safeText(
                  message,
                  "Puedes reintentar la carga desde el botón de actualizar."
                )
              )
            : "Cuando haya usuarios registrados aparecerán aquí."
        }
      </p>

      ${
        hasError
          ? `
            <button
              type="button"
              id="usuarios-retry-btn"
              class="usuarios-btn usuarios-btn--primary"
              data-usuarios-action="retry"
              data-action="retry"
            >
              Reintentar
            </button>
          `
          : `
            <button
              type="button"
              id="usuarios-create-empty-btn"
              class="usuarios-btn usuarios-btn--primary"
              data-usuarios-action="create"
              data-action="create-user"
            >
              Crear usuario
            </button>
          `
      }
    </div>
  `;
}

function renderAccessDeniedContent() {
  return `
    <div class="usuarios-empty usuarios-empty--forbidden">
      <h3 class="usuarios-empty-title">Acceso restringido</h3>
      <p class="usuarios-empty-text">
        La vista de usuarios está reservada para administradores.
      </p>
    </div>
  `;
}

function renderTableLoading(rows = PAGE_SIZE) {
  return `
    <div class="usuarios-table-loading" aria-hidden="true">
      ${Array.from({ length: rows })
        .map(
          () => `
            <div class="usuarios-table-loading-row">
              <div class="usuarios-skeleton usuarios-skeleton--avatar"></div>
              <div class="usuarios-table-loading-copy">
                <div class="usuarios-skeleton usuarios-skeleton--xs"></div>
                <div class="usuarios-skeleton usuarios-skeleton--lg"></div>
                <div class="usuarios-skeleton usuarios-skeleton--md"></div>
              </div>
              <div class="usuarios-skeleton usuarios-skeleton--pill"></div>
              <div class="usuarios-skeleton usuarios-skeleton--date"></div>
              <div class="usuarios-skeleton usuarios-skeleton--email"></div>
              <div class="usuarios-skeleton usuarios-skeleton--date"></div>
              <div class="usuarios-skeleton usuarios-skeleton--btn"></div>
            </div>
          `
        )
        .join("")}
    </div>
  `;
}

function renderRefreshOverlay() {
  return `
    <div class="usuarios-refresh-overlay" aria-live="polite">
      <div class="usuarios-refresh-card">
        ${renderSpinner("Actualizando usuarios...")}
      </div>
    </div>
  `;
}

/* =========================================================
   STYLES
========================================================= */

function renderStyles() {
  return `
    <style>
      .usuarios-view-root{
        display:grid;
        gap:18px;
      }

      .usuarios-hero{
        position:relative;
        overflow:hidden;
        border-radius:24px;
        border:1px solid color-mix(in srgb, var(--border-soft, rgba(15,23,42,.08)) 88%, transparent);
        background:
          linear-gradient(180deg, rgba(255,255,255,.58), rgba(255,255,255,.36)),
          color-mix(in srgb, var(--panel-bg, #ffffff) 92%, transparent);
        box-shadow:
          0 10px 30px rgba(15,23,42,.04),
          0 1px 0 rgba(255,255,255,.55) inset;
        padding:22px 24px 22px;
      }

      .usuarios-hero-top{
        display:grid;
        grid-template-columns:minmax(0, 1fr) auto;
        gap:18px;
        align-items:start;
      }

      .usuarios-hero-copy{
        min-width:0;
        display:grid;
        gap:10px;
      }

      .usuarios-page-title{
        margin:0;
        max-width:100%;
        font-size:clamp(26px, 2.6vw, 42px);
        line-height:.98;
        letter-spacing:-.05em;
        font-weight:780;
        color:var(--text-strong, #0f172a);
        white-space:nowrap;
      }

      .usuarios-page-subtitle{
        margin:0;
        max-width:860px;
        font-size:15px;
        line-height:1.58;
        color:var(--text-dim, #6b7280);
      }

      .usuarios-hero-actions{
        display:flex;
        align-items:flex-start;
        justify-content:flex-end;
        gap:10px;
        flex-wrap:wrap;
      }

      .usuarios-btn{
        min-height:44px;
        padding:0 16px;
        border-radius:14px;
        border:1px solid color-mix(in srgb, var(--border-soft, rgba(15,23,42,.08)) 92%, transparent);
        background:rgba(255,255,255,.72);
        color:var(--text-strong, #111827);
        font-size:13px;
        font-weight:680;
        line-height:1;
        cursor:pointer;
        display:inline-flex;
        align-items:center;
        justify-content:center;
        text-decoration:none;
        box-shadow:0 4px 14px rgba(15,23,42,.04);
        transition:
          transform .16s ease,
          box-shadow .16s ease,
          border-color .16s ease,
          background .16s ease,
          opacity .16s ease;
      }

      .usuarios-btn:hover{
        transform:translateY(-1px);
        box-shadow:0 8px 18px rgba(15,23,42,.06);
      }

      .usuarios-btn--primary{
        border-color:color-mix(in srgb, var(--accent, #7c5cff) 16%, rgba(15,23,42,.06));
        background:linear-gradient(
          180deg,
          color-mix(in srgb, var(--accent, #7c5cff) 86%, white 14%),
          color-mix(in srgb, var(--accent, #7c5cff) 92%, black 8%)
        );
        color:#fff;
        box-shadow:0 8px 20px color-mix(in srgb, var(--accent, #7c5cff) 18%, transparent);
      }

      .usuarios-btn.is-loading,
      .usuarios-detail-btn.is-loading{
        cursor:wait;
        opacity:.9;
      }

      .usuarios-btn:disabled,
      .usuarios-detail-btn:disabled{
        pointer-events:none;
        opacity:.72;
      }

      .usuarios-hero-meta{
        margin-top:14px;
        display:flex;
        align-items:center;
        gap:8px;
        flex-wrap:wrap;
      }

      .usuarios-meta-pill{
        min-height:30px;
        padding:0 12px;
        border-radius:999px;
        border:1px solid rgba(15,23,42,.06);
        background:rgba(255,255,255,.52);
        color:#7a8392;
        font-size:11px;
        font-weight:760;
        letter-spacing:.045em;
        text-transform:uppercase;
        display:inline-flex;
        align-items:center;
        white-space:nowrap;
      }

      .usuarios-stats{
        margin-top:16px;
        display:grid;
        grid-template-columns:repeat(4, minmax(0, 1fr));
        gap:12px;
      }

      .usuarios-stat-card{
        display:grid;
        gap:8px;
        min-height:122px;
        padding:16px 18px;
        border-radius:20px;
        border:1px solid rgba(15,23,42,.06);
        background:
          linear-gradient(180deg, rgba(255,255,255,.58), rgba(255,255,255,.22)),
          rgba(255,255,255,.46);
        box-shadow:0 6px 20px rgba(15,23,42,.03);
      }

      .usuarios-stat-card--total{
        border-color:color-mix(in srgb, var(--accent, #7c5cff) 16%, rgba(15,23,42,.06));
      }

      .usuarios-stat-card--active{
        border-color:color-mix(in srgb, var(--success-strong, #36c690) 18%, rgba(15,23,42,.06));
      }

      .usuarios-stat-card--pending{
        border-color:color-mix(in srgb, var(--warning-strong, #ffbc42) 18%, rgba(15,23,42,.06));
      }

      .usuarios-stat-card--blocked{
        border-color:color-mix(in srgb, var(--danger-strong, #ff6b6b) 18%, rgba(15,23,42,.06));
      }

      .usuarios-stat-label{
        font-size:11px;
        font-weight:760;
        letter-spacing:.08em;
        text-transform:uppercase;
        color:#7b8494;
      }

      .usuarios-stat-value{
        font-size:40px;
        line-height:.92;
        letter-spacing:-.045em;
        font-weight:780;
        color:var(--text-strong, #111827);
      }

      .usuarios-stat-text{
        font-size:13px;
        line-height:1.45;
        color:var(--text-dim, #6b7280);
      }

      .usuarios-history{
        overflow:hidden;
        border-radius:24px;
        border:1px solid color-mix(in srgb, var(--border-soft, rgba(15,23,42,.08)) 88%, transparent);
        background:
          linear-gradient(180deg, rgba(255,255,255,.6), rgba(255,255,255,.4)),
          color-mix(in srgb, var(--panel-bg, #ffffff) 94%, transparent);
        box-shadow:
          0 10px 30px rgba(15,23,42,.04),
          0 1px 0 rgba(255,255,255,.5) inset;
      }

      .usuarios-history-head{
        display:grid;
        grid-template-columns:minmax(0, 1fr) auto;
        gap:14px;
        align-items:start;
        padding:14px 18px 12px;
        border-bottom:1px solid rgba(15,23,42,.06);
      }

      .usuarios-history-copy{
        min-width:0;
        display:grid;
        gap:2px;
      }

      .usuarios-history-title{
        margin:0;
        font-size:16px;
        line-height:1.2;
        font-weight:760;
        color:var(--text-strong, #111827);
      }

      .usuarios-history-subtitle{
        margin:0;
        font-size:12px;
        line-height:1.4;
        color:var(--text-dim, #7b8494);
      }

      .usuarios-pagination{
        display:flex;
        gap:8px;
        flex-wrap:wrap;
      }

      .usuarios-pagination-btn{
        min-height:38px;
        padding:0 14px;
        border-radius:13px;
        border:1px solid rgba(15,23,42,.06);
        background:rgba(255,255,255,.66);
        color:#273142;
        font-size:12px;
        font-weight:680;
        cursor:pointer;
        display:inline-flex;
        align-items:center;
        justify-content:center;
        text-decoration:none;
        transition:
          background .16s ease,
          border-color .16s ease,
          opacity .16s ease;
      }

      .usuarios-pagination-btn:hover{
        background:rgba(255,255,255,.9);
        border-color:rgba(15,23,42,.10);
      }

      .usuarios-pagination-btn[disabled],
      .usuarios-pagination-btn[aria-disabled="true"]{
        opacity:.48;
        cursor:not-allowed;
        pointer-events:none;
      }

      .usuarios-table-wrap{
        position:relative;
        min-height:120px;
      }

      .usuarios-table-wrap.is-refreshing .usuarios-table-shell,
      .usuarios-table-wrap.is-refreshing .usuarios-mobile-list{
        opacity:.56;
        filter:blur(.7px);
        transition:opacity .18s ease, filter .18s ease;
      }

      .usuarios-table-shell{
        width:100%;
        overflow-x:auto;
        overflow-y:hidden;
        transition:opacity .18s ease, filter .18s ease;
      }

      .usuarios-table{
        width:100%;
        border-collapse:separate;
        border-spacing:0;
        min-width:1120px;
      }

      .usuarios-table thead th{
        padding:12px 18px;
        text-align:left;
        font-size:11px;
        font-weight:760;
        letter-spacing:.08em;
        text-transform:uppercase;
        color:#97a0af;
        background:rgba(248,250,252,.62);
        border-bottom:1px solid rgba(15,23,42,.06);
        white-space:nowrap;
      }

      .usuarios-table tbody td{
        padding:14px 18px;
        vertical-align:middle;
        border-bottom:1px solid rgba(15,23,42,.055);
      }

      .usuarios-table tbody tr:last-child td{
        border-bottom:none;
      }

      .usuarios-row{
        transition:background .16s ease;
      }

      .usuarios-row:hover{
        background:rgba(124,92,255,.018);
      }

      .usuarios-main{
        display:grid;
        grid-template-columns:44px minmax(0, 1fr);
        gap:12px;
        align-items:center;
        min-width:0;
      }

      .usuarios-avatar{
        position:relative;
        width:44px;
        height:44px;
        border-radius:999px;
        overflow:hidden;
        flex:0 0 44px;
        background:var(--avatar-fallback-bg, linear-gradient(135deg, rgba(124,92,255,.12), rgba(139,92,246,.24)));
        border:1px solid var(--avatar-fallback-border, rgba(124,92,255,.18));
      }

      .usuarios-avatar img{
        display:block;
        width:100%;
        height:100%;
        object-fit:cover;
      }

      .usuarios-avatar-fallback{
        position:absolute;
        inset:0;
        display:none;
        align-items:center;
        justify-content:center;
        font-size:18px;
        font-weight:780;
        color:var(--avatar-fallback-text, #fff);
        letter-spacing:-.03em;
      }

      .usuarios-avatar[data-fallback="true"] .usuarios-avatar-fallback{
        display:flex;
      }

      .usuarios-avatar[data-fallback="true"] img{
        display:none !important;
      }

      .usuarios-avatar--fallback .usuarios-avatar-fallback{
        display:flex;
      }

      .usuarios-main-copy{
        min-width:0;
        display:grid;
        gap:3px;
      }

      .usuarios-user-id{
        font-size:12px;
        line-height:1.15;
        font-weight:760;
        letter-spacing:.055em;
        color:#667084;
        text-transform:uppercase;
      }

      .usuarios-user-subject{
        font-size:15px;
        line-height:1.14;
        font-weight:760;
        letter-spacing:-.025em;
        color:var(--text-strong, #111827);
        overflow:hidden;
        text-overflow:ellipsis;
        display:-webkit-box;
        -webkit-line-clamp:2;
        -webkit-box-orient:vertical;
      }

      .usuarios-user-description{
        font-size:13px;
        line-height:1.3;
        color:#8a93a3;
        overflow:hidden;
        text-overflow:ellipsis;
        white-space:nowrap;
      }

      .usuarios-chip{
        min-height:32px;
        padding:0 12px;
        border-radius:999px;
        display:inline-flex;
        align-items:center;
        justify-content:center;
        font-size:11px;
        font-weight:760;
        letter-spacing:.045em;
        text-transform:uppercase;
        white-space:nowrap;
        border:1px solid transparent;
      }

      .usuarios-chip--active{
        color:#258a59;
        background:rgba(54,198,144,.10);
        border-color:rgba(54,198,144,.22);
      }

      .usuarios-chip--pending{
        color:#b7791f;
        background:rgba(255,188,66,.11);
        border-color:rgba(255,188,66,.22);
      }

      .usuarios-chip--blocked{
        color:#b42318;
        background:rgba(255,107,107,.10);
        border-color:rgba(255,107,107,.22);
      }

      .usuarios-chip--inactive{
        color:#64748b;
        background:rgba(100,116,139,.10);
        border-color:rgba(100,116,139,.18);
      }

      .usuarios-date-inline,
      .usuarios-email-inline,
      .usuarios-location-inline,
      .usuarios-activity-inline{
        display:inline-block;
        white-space:nowrap;
        font-size:13px;
        line-height:1.2;
        font-weight:650;
        font-variant-numeric:tabular-nums;
        color:#344054;
        max-width:100%;
        overflow:hidden;
        text-overflow:ellipsis;
      }

      .usuarios-cell--email{
        max-width:220px;
      }

      .usuarios-cell--location{
        max-width:150px;
      }

      .usuarios-cell--actions{
        width:1%;
        white-space:nowrap;
      }

      .usuarios-detail-btn{
        width:auto;
        min-width:0;
        min-height:34px;
        padding:0 12px;
        border-radius:12px;
        border:1px solid rgba(15,23,42,.07);
        background:rgba(255,255,255,.68);
        color:#1f2937;
        font-size:13px;
        font-weight:700;
        line-height:1;
        cursor:pointer;
        display:inline-flex;
        align-items:center;
        justify-content:center;
        white-space:nowrap;
        box-shadow:none;
        transition:
          border-color .16s ease,
          background .16s ease,
          transform .16s ease,
          opacity .16s ease;
      }

      .usuarios-detail-btn:hover{
        border-color:rgba(15,23,42,.11);
        background:rgba(255,255,255,.9);
        transform:translateY(-1px);
      }

      .usuarios-inline-loading{
        display:inline-flex;
        align-items:center;
        gap:7px;
        white-space:nowrap;
      }

      .usuarios-inline-spinner{
        width:13px;
        height:13px;
        border-radius:999px;
        border:2px solid rgba(255,255,255,.30);
        border-top-color:currentColor;
        animation:usuariosSpin .78s linear infinite;
        flex:0 0 auto;
      }

      .usuarios-btn:not(.usuarios-btn--primary) .usuarios-inline-spinner,
      .usuarios-detail-btn .usuarios-inline-spinner{
        border-color:rgba(15,23,42,.16);
        border-top-color:currentColor;
      }

      .usuarios-refresh-overlay{
        position:absolute;
        inset:0;
        z-index:3;
        display:grid;
        place-items:center;
        pointer-events:none;
        background:linear-gradient(180deg, rgba(255,255,255,.24), rgba(255,255,255,.12));
        backdrop-filter:blur(2px);
      }

      .usuarios-refresh-card{
        display:inline-flex;
        align-items:center;
        justify-content:center;
        min-height:42px;
        padding:0 16px;
        border-radius:14px;
        border:1px solid rgba(15,23,42,.07);
        background:rgba(255,255,255,.82);
        color:#344054;
        font-size:13px;
        font-weight:720;
        box-shadow:0 10px 26px rgba(15,23,42,.08);
      }

      .usuarios-table-loading{
        padding:12px 18px 16px;
        display:grid;
        gap:12px;
      }

      .usuarios-table-loading-row{
        display:grid;
        grid-template-columns:44px minmax(220px, 1.45fr) 112px 140px 180px 130px 112px;
        gap:12px;
        align-items:center;
      }

      .usuarios-table-loading-copy{
        display:grid;
        gap:7px;
      }

      .usuarios-skeleton{
        position:relative;
        overflow:hidden;
        border-radius:999px;
        background:rgba(148,163,184,.14);
      }

      .usuarios-skeleton::after{
        content:"";
        position:absolute;
        inset:0;
        transform:translateX(-100%);
        background:linear-gradient(
          90deg,
          transparent,
          rgba(255,255,255,.55),
          transparent
        );
        animation:usuariosSkeleton 1.2s ease-in-out infinite;
      }

      .usuarios-skeleton--avatar{
        width:44px;
        height:44px;
        border-radius:999px;
      }

      .usuarios-skeleton--xs{
        width:120px;
        height:10px;
      }

      .usuarios-skeleton--lg{
        width:74%;
        height:14px;
      }

      .usuarios-skeleton--md{
        width:56%;
        height:12px;
      }

      .usuarios-skeleton--pill{
        width:86px;
        height:30px;
      }

      .usuarios-skeleton--date{
        width:124px;
        height:12px;
      }

      .usuarios-skeleton--email{
        width:160px;
        height:12px;
      }

      .usuarios-skeleton--btn{
        width:98px;
        height:34px;
      }

      .usuarios-empty{
        display:grid;
        justify-items:center;
        gap:8px;
        padding:44px 20px 48px;
        text-align:center;
      }

      .usuarios-empty-title{
        margin:0;
        font-size:18px;
        font-weight:760;
        color:var(--text-strong, #111827);
      }

      .usuarios-empty-text{
        margin:0;
        max-width:520px;
        font-size:13px;
        line-height:1.55;
        color:var(--text-dim, #6b7280);
      }

      .usuarios-mobile-list{
        display:none;
        gap:12px;
        padding:12px;
      }

      .usuarios-mobile-card{
        display:grid;
        gap:12px;
        padding:16px;
        border-radius:18px;
        border:1px solid rgba(15,23,42,.06);
        background:
          linear-gradient(180deg, rgba(255,255,255,.58), rgba(255,255,255,.22)),
          rgba(255,255,255,.46);
      }

      .usuarios-mobile-top{
        display:flex;
        gap:12px;
        align-items:flex-start;
        justify-content:space-between;
      }

      .usuarios-mobile-main{
        display:flex;
        gap:12px;
        min-width:0;
        flex:1;
      }

      .usuarios-mobile-meta{
        display:grid;
        grid-template-columns:repeat(2, minmax(0, 1fr));
        gap:10px;
      }

      .usuarios-mobile-meta-card{
        display:grid;
        gap:4px;
        padding:12px;
        border-radius:14px;
        border:1px solid rgba(15,23,42,.06);
        background:rgba(255,255,255,.52);
      }

      .usuarios-mobile-meta-label{
        font-size:11px;
        color:#97a0af;
        font-weight:760;
        letter-spacing:.05em;
        text-transform:uppercase;
      }

      .usuarios-mobile-meta-value{
        color:var(--text-strong, #111827);
        font-size:13px;
        line-height:1.35;
        font-weight:700;
        word-break:break-word;
      }

      .usuarios-mobile-actions{
        display:flex;
        gap:8px;
        flex-wrap:wrap;
      }

      @keyframes usuariosSpin{
        to{ transform:rotate(360deg); }
      }

      @keyframes usuariosSkeleton{
        to{ transform:translateX(100%); }
      }

      [data-theme="light"] .usuarios-hero,
      [data-theme="light"] .usuarios-history{
        background:
          linear-gradient(180deg, rgba(255,255,255,.82), rgba(248,250,252,.74)),
          rgba(255,255,255,.82);
        box-shadow:
          0 12px 28px rgba(15,23,42,.035),
          0 0 0 1px rgba(255,255,255,.72) inset;
      }

      [data-theme="light"] .usuarios-stat-card,
      [data-theme="light"] .usuarios-mobile-card{
        background:
          linear-gradient(180deg, rgba(255,255,255,.78), rgba(255,255,255,.48)),
          rgba(255,255,255,.56);
      }

      [data-theme="dark"] .usuarios-hero,
      [data-theme="dark"] .usuarios-history{
        background:
          radial-gradient(circle at top left, color-mix(in srgb, var(--accent, #7c5cff) 7%, transparent), transparent 34%),
          linear-gradient(180deg, var(--surface-2, #171922), var(--surface-1, #10121a));
        border-color:var(--border-soft, rgba(255,255,255,.08));
      }

      [data-theme="dark"] .usuarios-page-title,
      [data-theme="dark"] .usuarios-history-title,
      [data-theme="dark"] .usuarios-stat-value,
      [data-theme="dark"] .usuarios-user-subject,
      [data-theme="dark"] .usuarios-empty-title,
      [data-theme="dark"] .usuarios-mobile-meta-value{
        color:var(--text-strong, #f8fafc);
      }

      [data-theme="dark"] .usuarios-page-subtitle,
      [data-theme="dark"] .usuarios-history-subtitle,
      [data-theme="dark"] .usuarios-stat-text,
      [data-theme="dark"] .usuarios-user-description,
      [data-theme="dark"] .usuarios-empty-text{
        color:var(--text-dim, #94a3b8);
      }

      [data-theme="dark"] .usuarios-btn,
      [data-theme="dark"] .usuarios-pagination-btn,
      [data-theme="dark"] .usuarios-detail-btn,
      [data-theme="dark"] .usuarios-refresh-card{
        background:rgba(255,255,255,.06);
        border-color:rgba(255,255,255,.08);
        color:var(--text-strong, #f8fafc);
      }

      [data-theme="dark"] .usuarios-table thead th{
        background:rgba(255,255,255,.035);
        border-bottom-color:rgba(255,255,255,.07);
      }

      [data-theme="dark"] .usuarios-table tbody td{
        border-bottom-color:rgba(255,255,255,.055);
      }

      [data-theme="dark"] .usuarios-date-inline,
      [data-theme="dark"] .usuarios-email-inline,
      [data-theme="dark"] .usuarios-location-inline,
      [data-theme="dark"] .usuarios-activity-inline{
        color:var(--text-soft, #cbd5e1);
      }

      [data-theme="dark"] .usuarios-mobile-card,
      [data-theme="dark"] .usuarios-mobile-meta-card{
        background:rgba(255,255,255,.04);
        border-color:rgba(255,255,255,.07);
      }

      @media (max-width: 1240px){
        .usuarios-page-title{
          font-size:clamp(24px, 2.4vw, 36px);
        }

        .usuarios-stats{
          grid-template-columns:repeat(2, minmax(0, 1fr));
        }
      }

      @media (max-width: 1180px){
        .usuarios-hero{
          padding:20px;
        }

        .usuarios-hero-top{
          grid-template-columns:1fr;
        }

        .usuarios-hero-actions{
          justify-content:flex-start;
        }

        .usuarios-page-title{
          white-space:normal;
        }
      }

      @media (max-width: 980px){
        .usuarios-desktop-table{
          display:none;
        }

        .usuarios-mobile-list{
          display:grid;
        }
      }

      @media (max-width: 760px){
        .usuarios-view-root{
          gap:16px;
        }

        .usuarios-hero{
          padding:18px 16px;
          border-radius:20px;
        }

        .usuarios-history{
          border-radius:20px;
        }

        .usuarios-history-head{
          grid-template-columns:1fr;
          padding:14px 14px 12px;
        }

        .usuarios-pagination{
          justify-content:flex-start;
        }

        .usuarios-stats{
          grid-template-columns:1fr;
        }

        .usuarios-page-title{
          font-size:clamp(24px, 8vw, 34px);
          line-height:1;
          white-space:normal;
        }

        .usuarios-page-subtitle{
          font-size:14px;
        }

        .usuarios-hero-actions{
          width:100%;
        }

        .usuarios-btn{
          flex:1 1 auto;
        }

        .usuarios-mobile-meta{
          grid-template-columns:1fr;
        }
      }
    </style>
  `;
}

/* =========================================================
   HEADER
========================================================= */

export function renderHeader(input = {}) {
  const data = safeObject(input);
  const items = getResolvedItems(data);
  const state = safeObject(data.state);
  const stats = computeStats(items);
  const remoteCount = resolveRemoteCount(data, items);

  const updatedAt = first(
    data.lastUpdatedAt,
    data.updatedAt,
    state.lastSyncAt,
    state.lastUpdatedAt,
    state.updatedAt,
    ...items.map((item) => getUpdatedAt(item))
  );

  const title = safeText(
    first(data.title, "Usuarios y accesos"),
    "Usuarios y accesos"
  );

  const subtitle = safeText(
    first(
      data.subtitle,
      "Consulta usuarios registrados, revisa su estado, ubicación y última conexión desde una vista clara, compacta y alineada con el sistema."
    ),
    ""
  );

  const creating = Boolean(state.creating);
  const refreshing = Boolean(state.refreshing);
  const loading = Boolean(state.loading);

  return `
    ${renderStyles()}

    <section class="usuarios-hero">
      <div class="usuarios-hero-top">
        <div class="usuarios-hero-copy">
          <h1 class="usuarios-page-title">${escapeHtml(title)}</h1>
          <p class="usuarios-page-subtitle">${escapeHtml(subtitle)}</p>
        </div>

        <div class="usuarios-hero-actions">
          <button
            type="button"
            id="usuarios-refresh-btn"
            class="usuarios-btn${refreshing ? " is-loading" : ""}"
            data-usuarios-action="refresh"
            data-action="refresh"
            ${refreshing || loading ? 'disabled aria-busy="true"' : ""}
          >
            ${
              refreshing
                ? renderSpinner("Actualizando...")
                : '<span class="usuarios-btn-text">Actualizar</span>'
            }
          </button>

          <button
            type="button"
            id="usuarios-export-btn"
            class="usuarios-btn"
            data-usuarios-action="export"
            data-action="export-csv"
            ${loading || refreshing || !items.length ? "disabled" : ""}
          >
            <span class="usuarios-btn-text">Exportar historial</span>
          </button>

          <button
            type="button"
            id="usuarios-create-btn"
            class="usuarios-btn usuarios-btn--primary${creating ? " is-loading" : ""}"
            data-usuarios-action="create"
            data-action="create-user"
            ${creating ? 'disabled aria-busy="true"' : ""}
          >
            ${
              creating
                ? renderSpinner("Abriendo...")
                : '<span class="usuarios-btn-text">Nuevo usuario</span>'
            }
          </button>
        </div>
      </div>

      <div class="usuarios-hero-meta">
        <span class="usuarios-meta-pill">Panel admin</span>

        <span class="usuarios-meta-pill">
          ${escapeHtml(`${remoteCount} usuarios registrados`)}
        </span>

        <span class="usuarios-meta-pill">
          ${
            updatedAt
              ? escapeHtml(`Última actualización · ${formatRelativeDate(updatedAt)}`)
              : "Sin sincronización reciente"
          }
        </span>
      </div>

      <div class="usuarios-stats">
        <article class="usuarios-stat-card usuarios-stat-card--total">
          <div class="usuarios-stat-label">Usuarios visibles</div>
          <div class="usuarios-stat-value">${escapeHtml(String(stats.total))}</div>
          <div class="usuarios-stat-text">Cuentas cargadas en la colección actual.</div>
        </article>

        <article class="usuarios-stat-card usuarios-stat-card--active">
          <div class="usuarios-stat-label">Activos</div>
          <div class="usuarios-stat-value">${escapeHtml(String(stats.activeCount))}</div>
          <div class="usuarios-stat-text">Usuarios operativos o habilitados actualmente.</div>
        </article>

        <article class="usuarios-stat-card usuarios-stat-card--pending">
          <div class="usuarios-stat-label">Pendientes</div>
          <div class="usuarios-stat-value">${escapeHtml(String(stats.pendingCount))}</div>
          <div class="usuarios-stat-text">Invitaciones o accesos pendientes de completar.</div>
        </article>

        <article class="usuarios-stat-card usuarios-stat-card--blocked">
          <div class="usuarios-stat-label">Bloqueados</div>
          <div class="usuarios-stat-value">${escapeHtml(String(stats.blockedCount))}</div>
          <div class="usuarios-stat-text">Cuentas bloqueadas, inactivas o restringidas.</div>
        </article>
      </div>
    </section>
  `;
}

/* =========================================================
   TABLE
========================================================= */

function renderDesktopTable(items = [], state = {}) {
  return `
    <div class="usuarios-desktop-table">
      <div class="usuarios-table-shell">
        <table class="usuarios-table" role="table" aria-label="Listado de usuarios">
          <colgroup>
            <col style="width:36%;">
            <col style="width:11%;">
            <col style="width:13%;">
            <col style="width:18%;">
            <col style="width:10%;">
            <col style="width:12%;">
            <col style="width:7%;">
          </colgroup>

          <thead>
            <tr>
              <th>Usuario</th>
              <th>Estado</th>
              <th>Alta</th>
              <th>Email</th>
              <th>Ciudad</th>
              <th>Última conexión</th>
              <th>Acciones</th>
            </tr>
          </thead>

          <tbody>
            ${safeArray(items).map((item) => renderUsuarioRow(item, state)).join("")}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function renderMobileCards(items = [], state = {}) {
  return `
    <div class="usuarios-mobile-list">
      ${safeArray(items).map((item) => renderMobileUsuarioCard(item, state)).join("")}
    </div>
  `;
}

export function renderTable(input = {}) {
  const data = safeObject(input);
  const items = getResolvedItems(data);
  const state = safeObject(data.state);

  const pagination = getPagination(items, {
    ...data,
    remoteCount: resolveRemoteCount(data, items),
    pageSize: PAGE_SIZE,
  });

  const loading = Boolean(state.loading);
  const refreshing = Boolean(state.refreshing);
  const hasError = Boolean(safeText(first(state.error, data.error), ""));
  const errorMessage = safeText(first(state.error, data.error), "");

  const showInitialLoading = loading && !pagination.pageItems.length;
  const showRefreshOverlay = refreshing && pagination.pageItems.length;

  return `
    <section class="usuarios-history">
      <div class="usuarios-history-head">
        <div class="usuarios-history-copy">
          <h2 class="usuarios-history-title">Historial de usuarios</h2>
          <p class="usuarios-history-subtitle">
            ${
              showInitialLoading
                ? "Cargando usuarios..."
                : escapeHtml(
                    `Mostrando ${pagination.rangeStart}-${pagination.rangeEnd} de ${pagination.totalCount} · página ${pagination.currentPage} de ${pagination.totalPages}`
                  )
            }
          </p>
        </div>

        <div class="usuarios-pagination">
          <button
            type="button"
            class="usuarios-pagination-btn"
            data-usuarios-action="prev-page"
            data-action="prev-page"
            data-page="${escapeHtml(String(Math.max(1, pagination.currentPage - 1)))}"
            ${!pagination.hasPrev || loading || refreshing ? 'disabled aria-disabled="true"' : ""}
          >
            Anterior
          </button>

          <button
            type="button"
            class="usuarios-pagination-btn"
            data-usuarios-action="next-page"
            data-action="next-page"
            data-page="${escapeHtml(String(Math.min(pagination.totalPages, pagination.currentPage + 1)))}"
            ${!pagination.hasNext || loading || refreshing ? 'disabled aria-disabled="true"' : ""}
          >
            Siguiente
          </button>
        </div>
      </div>

      ${
        showInitialLoading
          ? renderTableLoading(Math.max(3, pagination.pageSize || PAGE_SIZE))
          : `
            <div class="usuarios-table-wrap${refreshing ? " is-refreshing" : ""}">
              ${showRefreshOverlay ? renderRefreshOverlay() : ""}

              ${
                pagination.pageItems.length
                  ? `
                    ${renderDesktopTable(pagination.pageItems, state)}
                    ${renderMobileCards(pagination.pageItems, state)}
                  `
                  : renderEmptyContent({ hasError, message: errorMessage })
              }
            </div>
          `
      }
    </section>
  `;
}

/* =========================================================
   BACKWARD COMPAT EXPORTS
========================================================= */

export function renderLoadingState(rows = PAGE_SIZE) {
  return `
    ${renderStyles()}

    <section class="usuarios-history">
      <div class="usuarios-history-head">
        <div class="usuarios-history-copy">
          <h2 class="usuarios-history-title">Historial de usuarios</h2>
          <p class="usuarios-history-subtitle">Cargando usuarios...</p>
        </div>
      </div>

      ${renderTableLoading(Math.max(3, safeNumber(rows, PAGE_SIZE)))}
    </section>
  `;
}

export function renderErrorState(message = "No se pudo cargar la colección.") {
  return `
    ${renderStyles()}

    <section class="usuarios-history">
      ${renderEmptyContent({
        hasError: true,
        message: safeText(message, "Error desconocido al cargar la vista."),
      })}
    </section>
  `;
}

export function renderEmptyState(options = {}) {
  return `
    ${renderStyles()}

    <section class="usuarios-history">
      ${renderEmptyContent({
        hasError: Boolean(options?.hasError),
        message: safeText(options?.message, ""),
      })}
    </section>
  `;
}

export function renderEmptyUsuariosState() {
  return renderEmptyState({
    hasError: false,
  });
}

export function renderAccessDeniedState() {
  return `
    ${renderStyles()}

    <section class="usuarios-history">
      ${renderAccessDeniedContent()}
    </section>
  `;
}

export function renderCards(input = {}) {
  return renderTable(input);
}

/* =========================================================
   FULL TEMPLATE
========================================================= */

export function renderUsuariosTableTemplate(input = {}) {
  const data = safeObject(input);

  if (shouldRenderRestricted(data)) {
    return `
      <section class="usuarios-view-root">
        ${renderAccessDeniedState()}
      </section>
    `;
  }

  return `
    <section class="usuarios-view-root">
      ${renderHeader(data)}
      ${renderTable(data)}
    </section>
  `;
}

export default renderUsuariosTableTemplate;
