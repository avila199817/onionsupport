/* =========================================================
   Onion SPA - Usuarios Template
   Archivo: src/views/usuarios/usuarios.template.js

   FINAL PRO SYSTEM · ADMIN USERS TABLE · 10/10

   Responsabilidades:
   - renderizar la vista admin de usuarios
   - consumir estado real del módulo Usuarios
   - soportar snapshot + data desacoplada desde usuarios.view.js
   - mostrar hero contextual de administración
   - renderizar stats superiores
   - renderizar toolbar de búsqueda y acciones
   - renderizar tabla premium de usuarios
   - soportar loading / error / empty / degraded states
   - exponer hooks DOM claros y compatibles con usuarios.bindings.js
========================================================= */

import { AppCore } from "../../core/index.js";

/* =========================================================
   BASICS
========================================================= */

function escapeHtml(value = "") {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function safeText(
  value,
  fallback = "—"
) {
  if (
    value === null ||
    value === undefined
  ) {
    return fallback;
  }

  const text = String(value).trim();
  return text || fallback;
}

function safeNumber(
  value,
  fallback = 0
) {
  const number = Number(value);
  return Number.isFinite(number)
    ? number
    : fallback;
}

function safeArray(value) {
  return Array.isArray(value)
    ? value
    : [];
}

function safeObject(value) {
  return value &&
    typeof value === "object" &&
    !Array.isArray(value)
    ? value
    : {};
}

function safeBool(
  value,
  fallback = false
) {
  return typeof value === "boolean"
    ? value
    : fallback;
}

function formatNumber(value = 0) {
  try {
    return new Intl.NumberFormat(
      "es-ES"
    ).format(
      safeNumber(value, 0)
    );
  } catch {
    return "0";
  }
}

function formatDateTime(value = "") {
  try {
    if (!value) {
      return "—";
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return "—";
    }

    return new Intl.DateTimeFormat(
      "es-ES",
      {
        dateStyle: "medium",
        timeStyle: "short",
      }
    ).format(date);
  } catch {
    return "—";
  }
}

function formatRelativeDate(
  value = ""
) {
  try {
    if (!value) {
      return "—";
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return "—";
    }

    const diffMs =
      date.getTime() - Date.now();

    const absMs =
      Math.abs(diffMs);

    const minute =
      1000 * 60;
    const hour =
      minute * 60;
    const day =
      hour * 24;

    if (absMs < minute) {
      return diffMs >= 0
        ? "En segundos"
        : "Ahora mismo";
    }

    if (absMs < hour) {
      const minutes = Math.round(
        absMs / minute
      );

      return diffMs >= 0
        ? `En ${minutes} min`
        : `Hace ${minutes} min`;
    }

    if (absMs < day) {
      const hours = Math.round(
        absMs / hour
      );

      return diffMs >= 0
        ? `En ${hours} h`
        : `Hace ${hours} h`;
    }

    return formatDateTime(value);
  } catch {
    return "—";
  }
}

function resolveDisplayName(user) {
  try {
    const byCore =
      typeof AppCore?.getUserDisplayName ===
      "function"
        ? AppCore.getUserDisplayName(user)
        : "";

    if (
      String(byCore || "").trim()
    ) {
      return String(byCore).trim();
    }
  } catch {}

  return safeText(
    user?.username ||
      user?.name ||
      user?.email,
    "admin"
  );
}

/* =========================================================
   STATE RESOLUTION
========================================================= */

function resolveUsuariosState(
  options = {}
) {
  const usuarios =
    safeObject(
      options?.usuarios
    );

  const data =
    safeObject(
      options?.data
    );

  const stats =
    safeObject(data.stats);

  const meta =
    safeObject(data.meta);

  const params =
    safeObject(data.params);

  const ui =
    safeObject(
      usuarios.ui ||
        options?.ui
    );

  const rows =
    safeArray(
      data.rows ||
        data.items ||
        data.usuarios
    );

  const selectedUserId =
    safeText(
      ui.selectedUserId,
      ""
    );

  return {
    loading:
      usuarios.loading === true,

    loaded:
      usuarios.loaded === true,

    error:
      usuarios.error || null,

    source: safeText(
      usuarios.source,
      "idle"
    ),

    remoteOk:
      usuarios.remoteOk === true,

    degraded:
      usuarios.degraded === true,

    cacheHit:
      usuarios.cacheHit === true,

    syncedAt: safeText(
      usuarios.lastSyncAt,
      ""
    ),

    hydratedAt: safeText(
      usuarios.hydratedAt,
      ""
    ),

    rows,

    stats: {
      total: safeNumber(
        stats.total,
        safeNumber(meta.total, rows.length)
      ),
      active: safeNumber(
        stats.active,
        rows.filter(
          (row) =>
            safeText(
              row?.status,
              row?.active === true
                ? "active"
                : "inactive"
            ) === "active"
        ).length
      ),
      inactive: safeNumber(
        stats.inactive,
        rows.filter(
          (row) =>
            safeText(
              row?.status,
              row?.active === true
                ? "active"
                : "inactive"
            ) === "inactive"
        ).length
      ),
      admins: safeNumber(
        stats.admins,
        rows.filter(
          (row) =>
            safeText(
              row?.role,
              ""
            ).toLowerCase() === "admin"
        ).length
      ),
      withAvatar: safeNumber(
        stats.withAvatar,
        rows.filter(
          (row) =>
            row?.hasAvatar === true
        ).length
      ),
    },

    meta: {
      total: safeNumber(
        meta.total,
        rows.length
      ),
      page: Math.max(
        1,
        safeNumber(
          meta.page,
          1
        )
      ),
      pageSize: Math.max(
        1,
        safeNumber(
          meta.pageSize,
          20
        )
      ),
      totalPages: Math.max(
        1,
        safeNumber(
          meta.totalPages,
          1
        )
      ),
      count: Math.max(
        0,
        safeNumber(
          meta.count,
          rows.length
        )
      ),
      hasNextPage:
        meta.hasNextPage === true,
      hasPrevPage:
        meta.hasPrevPage === true,
    },

    params: {
      page: Math.max(
        1,
        safeNumber(
          params.page,
          1
        )
      ),
      pageSize: Math.max(
        1,
        safeNumber(
          params.pageSize,
          20
        )
      ),
      q: safeText(
        params.q,
        ""
      ),
      role: safeText(
        params.role,
        ""
      ),
      status: safeText(
        params.status,
        ""
      ),
      sortBy: safeText(
        params.sortBy,
        "createdAt"
      ),
      sortDir:
        safeText(
          params.sortDir,
          "desc"
        ).toLowerCase() === "asc"
          ? "asc"
          : "desc",
    },

    ui: {
      mounted:
        ui.mounted === true,
      lastAction: safeText(
        ui.lastAction,
        ""
      ),
      searchDraft: safeText(
        ui.searchDraft,
        ""
      ),
      activeFilter: safeText(
        ui.activeFilter,
        ""
      ),
      selectedUserId,
    },
  };
}

/* =========================================================
   DERIVED HELPERS
========================================================= */

function getSourceLabel(
  state = {}
) {
  const source = safeText(
    state.source,
    "idle"
  );

  if (source === "remote") {
    return "Live";
  }

  if (source === "cache:fresh") {
    return "Cache fresca";
  }

  if (source === "cache:stale") {
    return "Cache stale";
  }

  if (source === "fallback:local") {
    return "Modo local";
  }

  if (source === "error") {
    return "Error";
  }

  return "Idle";
}

function getSourceBadgeClass(
  state = {}
) {
  const source = safeText(
    state.source,
    "idle"
  );

  if (source === "remote") {
    return "usuarios-badge--live";
  }

  if (source === "cache:fresh") {
    return "usuarios-badge--cache";
  }

  if (source === "cache:stale") {
    return "usuarios-badge--warning";
  }

  if (
    source === "fallback:local" ||
    source === "error"
  ) {
    return "usuarios-badge--danger";
  }

  return "";
}

function renderStatusHint(
  state = {}
) {
  if (state.degraded === true) {
    return "Visualizando datos degradados. El backend está respondiendo con calidad reducida o caché.";
  }

  if (state.cacheHit === true) {
    return "Visualizando resultados servidos desde caché.";
  }

  if (state.remoteOk === true) {
    return "Listado sincronizado correctamente con el backend.";
  }

  return "Sincronización pendiente.";
}

function hasUsers(state = {}) {
  return safeArray(state.rows)
    .length > 0;
}

function isActiveUser(
  state = {},
  userId = ""
) {
  const normalized =
    safeText(userId, "");

  return (
    safeText(
      state.ui?.selectedUserId,
      ""
    ) === normalized
  );
}

function getStatusChipLabel(
  status = "",
  activeValue = null
) {
  const normalized =
    safeText(status, "")
      .toLowerCase()
      .trim();

  if (normalized === "active") {
    return "Activo";
  }

  if (normalized === "inactive") {
    return "Inactivo";
  }

  if (normalized === "blocked") {
    return "Bloqueado";
  }

  if (normalized === "pending") {
    return "Pendiente";
  }

  if (activeValue === true) {
    return "Activo";
  }

  if (activeValue === false) {
    return "Inactivo";
  }

  return safeText(
    status,
    "Unknown"
  );
}

function getStatusChipClass(
  status = "",
  activeValue = null
) {
  const normalized =
    safeText(status, "")
      .toLowerCase()
      .trim();

  if (
    normalized === "active" ||
    activeValue === true
  ) {
    return "is-active";
  }

  if (
    normalized === "inactive" ||
    activeValue === false
  ) {
    return "is-inactive";
  }

  if (normalized === "blocked") {
    return "is-blocked";
  }

  if (normalized === "pending") {
    return "is-pending";
  }

  return "is-unknown";
}

function getRoleChipClass(
  role = ""
) {
  const normalized =
    safeText(role, "")
      .toLowerCase()
      .trim();

  if (normalized === "admin") {
    return "is-admin";
  }

  return "is-user";
}

function getRoleLabel(
  role = ""
) {
  const normalized =
    safeText(role, "")
      .toLowerCase()
      .trim();

  if (normalized === "admin") {
    return "Admin";
  }

  return safeText(
    role,
    "User"
  );
}

function getUserInitials(
  item = {}
) {
  const raw =
    safeText(
      item.displayName ||
        item.name ||
        item.username ||
        item.email,
      "U"
    );

  const parts = raw
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);

  const initials = parts
    .map((part) =>
      part.charAt(0)
    )
    .join("")
    .toUpperCase();

  return initials || "U";
}

function getSortIndicator(
  state = {},
  sortBy = ""
) {
  const currentBy = safeText(
    state.params?.sortBy,
    "createdAt"
  );

  const currentDir = safeText(
    state.params?.sortDir,
    "desc"
  );

  if (currentBy !== sortBy) {
    return "";
  }

  return currentDir === "asc"
    ? "↑"
    : "↓";
}

/* =========================================================
   PARTIALS
========================================================= */

function renderHero({
  user = null,
  state = {},
} = {}) {
  const displayName =
    resolveDisplayName(user);

  const sourceLabel =
    getSourceLabel(state);

  const sourceClass =
    getSourceBadgeClass(state);

  const hint =
    renderStatusHint(state);

  return `
    <section class="usuarios-hero">
      <div class="usuarios-hero__eyebrow">
        Onion Support · Admin · Usuarios
      </div>

      <div class="usuarios-hero__content">
        <div class="usuarios-hero__copy">
          <h1 class="usuarios-hero__title">
            Gestión de usuarios
          </h1>

          <p class="usuarios-hero__subtitle">
            Controla los usuarios de la plataforma, revisa estado, rol y actividad
            operativa desde un único panel premium.
          </p>

          <div class="usuarios-hero__meta">
            <span class="usuarios-meta-pill">
              Sesión admin: ${escapeHtml(displayName)}
            </span>

            <span class="usuarios-meta-pill">
              Total visible: ${escapeHtml(
                formatNumber(
                  state.meta?.total || 0
                )
              )}
            </span>

            <span class="usuarios-badge ${escapeHtml(sourceClass)}">
              ${escapeHtml(sourceLabel)}
            </span>
          </div>

          <p class="usuarios-hero__hint">
            ${escapeHtml(hint)}
          </p>

          <div class="usuarios-hero__actions">
            <button
              type="button"
              class="usuarios-toolbar-button"
              data-usuarios-action="refresh"
              aria-label="Actualizar usuarios"
            >
              Actualizar
            </button>
          </div>
        </div>
      </div>
    </section>
  `;
}

function renderStatCard({
  label = "",
  value = "",
  helper = "",
  accent = "",
} = {}) {
  return `
    <article class="usuarios-stat ${escapeHtml(accent)}">
      <div class="usuarios-stat__label">
        ${escapeHtml(label)}
      </div>

      <div class="usuarios-stat__value">
        ${escapeHtml(value)}
      </div>

      ${
        helper
          ? `
        <div class="usuarios-stat__helper">
          ${escapeHtml(helper)}
        </div>
      `
          : ""
      }
    </article>
  `;
}

function renderStats(
  state = {}
) {
  const stats = safeObject(
    state.stats
  );

  return `
    <section class="usuarios-grid usuarios-grid--5">
      ${renderStatCard({
        label: "Total",
        value: formatNumber(
          stats.total
        ),
        helper:
          "Usuarios visibles",
      })}

      ${renderStatCard({
        label: "Activos",
        value: formatNumber(
          stats.active
        ),
        helper:
          "Con acceso operativo",
        accent: "is-success",
      })}

      ${renderStatCard({
        label: "Inactivos",
        value: formatNumber(
          stats.inactive
        ),
        helper:
          "Sin actividad operativa",
      })}

      ${renderStatCard({
        label: "Con avatar",
        value: formatNumber(
          stats.withAvatar
        ),
        helper:
          "Perfil visual configurado",
        accent: "is-warning",
      })}

      ${renderStatCard({
        label: "Admins",
        value: formatNumber(
          stats.admins
        ),
        helper:
          "Privilegios elevados",
        accent: "is-danger",
      })}
    </section>
  `;
}

function renderToolbar(
  state = {}
) {
  const params = safeObject(
    state.params
  );

  const searchValue =
    safeText(
      state.ui?.searchDraft ||
        params.q,
      ""
    );

  return `
    <section class="usuarios-panel">
      <div class="usuarios-toolbar">
        <div class="usuarios-toolbar__left">
          <div class="usuarios-search">
            <input
              class="usuarios-search__input"
              type="search"
              placeholder="Buscar por nombre, email o username"
              value="${escapeHtml(searchValue)}"
              data-usuarios-input="search"
              aria-label="Buscar usuarios"
            />

            <button
              type="button"
              class="usuarios-toolbar-button"
              data-usuarios-action="submit-search"
              aria-label="Buscar usuarios"
            >
              Buscar
            </button>
          </div>
        </div>

        <div class="usuarios-toolbar__right">
          <select
            class="usuarios-select"
            data-usuarios-filter="role"
            aria-label="Filtrar por rol"
          >
            <option value="" ${
              !params.role ? "selected" : ""
            }>
              Todos los roles
            </option>
            <option value="admin" ${
              params.role === "admin"
                ? "selected"
                : ""
            }>
              Admin
            </option>
            <option value="user" ${
              params.role === "user"
                ? "selected"
                : ""
            }>
              User
            </option>
          </select>

          <select
            class="usuarios-select"
            data-usuarios-filter="status"
            aria-label="Filtrar por estado"
          >
            <option value="" ${
              !params.status
                ? "selected"
                : ""
            }>
              Todos los estados
            </option>
            <option value="active" ${
              params.status === "active"
                ? "selected"
                : ""
            }>
              Activo
            </option>
            <option value="inactive" ${
              params.status === "inactive"
                ? "selected"
                : ""
            }>
              Inactivo
            </option>
          </select>

          <select
            class="usuarios-select"
            data-usuarios-page-size="true"
            aria-label="Tamaño de página"
          >
            ${[10, 20, 50, 100]
              .map(
                (size) => `
              <option value="${size}" ${
                  safeNumber(
                    params.pageSize,
                    20
                  ) === size
                    ? "selected"
                    : ""
                }>
                ${size} por página
              </option>
            `
              )
              .join("")}
          </select>

          <button
            type="button"
            class="usuarios-toolbar-button"
            data-usuarios-action="clear-selection"
            aria-label="Limpiar selección"
          >
            Limpiar foco
          </button>
        </div>
      </div>

      <div class="usuarios-toolbar__footer">
        <span class="usuarios-toolbar__hint">
          Página ${escapeHtml(
            formatNumber(
              state.meta?.page || 1
            )
          )} · ${escapeHtml(
            formatNumber(
              state.meta?.count || 0
            )
          )} visibles
        </span>

        <button
          type="button"
          class="usuarios-toolbar-link"
          data-usuarios-action="reset-filters"
          aria-label="Resetear filtros"
        >
          Resetear filtros
        </button>
      </div>
    </section>
  `;
}

function renderStatusChip(
  status = "",
  activeValue = null
) {
  return `
    <span class="usuarios-chip usuarios-chip--status ${escapeHtml(getStatusChipClass(status, activeValue))}">
      ${escapeHtml(
        getStatusChipLabel(
          status,
          activeValue
        )
      )}
    </span>
  `;
}

function renderRoleChip(
  role = ""
) {
  return `
    <span class="usuarios-chip usuarios-chip--role ${escapeHtml(getRoleChipClass(role))}">
      ${escapeHtml(
        getRoleLabel(role)
      )}
    </span>
  `;
}

function renderTable(
  state = {}
) {
  const rows = safeArray(
    state.rows
  );

  return `
    <section class="usuarios-panel">
      <div class="usuarios-table-wrap">
        <table class="usuarios-table">
          <thead>
            <tr>
              <th>
                Usuario
              </th>

              <th>
                <button
                  type="button"
                  class="usuarios-sort"
                  data-usuarios-sort="email"
                >
                  Email ${escapeHtml(
                    getSortIndicator(
                      state,
                      "email"
                    )
                  )}
                </button>
              </th>

              <th>
                Rol
              </th>

              <th>
                Estado
              </th>

              <th>
                <button
                  type="button"
                  class="usuarios-sort"
                  data-usuarios-sort="createdAt"
                >
                  Alta ${escapeHtml(
                    getSortIndicator(
                      state,
                      "createdAt"
                    )
                  )}
                </button>
              </th>

              <th>
                Último acceso
              </th>

              <th class="usuarios-table__actions">
                Acciones
              </th>
            </tr>
          </thead>

          <tbody>
            ${rows
              .map((item) => {
                const userId = safeText(
                  item?.id ||
                    item?.userId,
                  ""
                );

                const active =
                  isActiveUser(
                    state,
                    userId
                  );

                return `
                  <tr class="${
                    active
                      ? "is-active-row"
                      : ""
                  }">
                    <td>
                      <button
                        type="button"
                        class="usuarios-user-cell"
                        data-usuarios-action="open-detail"
                        data-usuarios-user-id="${escapeHtml(userId)}"
                        aria-label="Abrir detalle de usuario"
                      >
                        <span class="usuarios-avatar">
                          ${
                            item?.hasAvatar ===
                              true &&
                            item?.avatar
                              ? `<img class="usuarios-avatar__img" src="${escapeHtml(item.avatar)}" alt="${escapeHtml(safeText(item?.displayName || item?.username || "Usuario", "Usuario"))}" />`
                              : escapeHtml(
                                  getUserInitials(
                                    item
                                  )
                                )
                          }
                        </span>

                        <span class="usuarios-user-cell__text">
                          <span class="usuarios-user-cell__name">
                            ${escapeHtml(
                              item?.displayName ||
                                item?.name ||
                                item?.username ||
                                "Usuario"
                            )}
                          </span>

                          <span class="usuarios-user-cell__sub">
                            ${escapeHtml(
                              safeText(
                                item?.username,
                                userId
                              )
                            )}
                          </span>
                        </span>
                      </button>
                    </td>

                    <td>
                      <span class="usuarios-email">
                        ${escapeHtml(
                          safeText(
                            item?.email,
                            "—"
                          )
                        )}
                      </span>
                    </td>

                    <td>
                      ${renderRoleChip(
                        item?.role
                      )}
                    </td>

                    <td>
                      ${renderStatusChip(
                        item?.status,
                        item?.active
                      )}
                    </td>

                    <td>
                      <span class="usuarios-date">
                        ${escapeHtml(
                          formatDateTime(
                            item?.createdAt
                          )
                        )}
                      </span>
                    </td>

                    <td>
                      <span class="usuarios-date">
                        ${escapeHtml(
                          formatRelativeDate(
                            item?.lastLoginAt
                          )
                        )}
                      </span>
                    </td>

                    <td class="usuarios-table__actions">
                      <div class="usuarios-row-actions">
                        <button
                          type="button"
                          class="usuarios-row-action"
                          data-usuarios-action="select-user"
                          data-usuarios-user-id="${escapeHtml(userId)}"
                          aria-label="Seleccionar usuario"
                        >
                          Seleccionar
                        </button>

                        <button
                          type="button"
                          class="usuarios-row-action"
                          data-usuarios-action="open-detail"
                          data-usuarios-user-id="${escapeHtml(userId)}"
                          aria-label="Ver detalle del usuario"
                        >
                          Ver
                        </button>
                      </div>
                    </td>
                  </tr>
                `;
              })
              .join("")}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function renderPagination(
  state = {}
) {
  const meta = safeObject(
    state.meta
  );

  return `
    <section class="usuarios-panel">
      <div class="usuarios-pagination">
        <div class="usuarios-pagination__info">
          Página ${escapeHtml(
            formatNumber(meta.page)
          )} de ${escapeHtml(
            formatNumber(
              meta.totalPages
            )
          )} · Total ${escapeHtml(
            formatNumber(meta.total)
          )}
        </div>

        <div class="usuarios-pagination__actions">
          <button
            type="button"
            class="usuarios-toolbar-button"
            data-usuarios-action="prev-page"
            ${
              meta.hasPrevPage ===
              true
                ? ""
                : "disabled"
            }
            aria-label="Página anterior"
          >
            Anterior
          </button>

          <button
            type="button"
            class="usuarios-toolbar-button"
            data-usuarios-action="next-page"
            ${
              meta.hasNextPage ===
              true
                ? ""
                : "disabled"
            }
            aria-label="Página siguiente"
          >
            Siguiente
          </button>
        </div>
      </div>
    </section>
  `;
}

function renderLoading() {
  return `
    <section class="usuarios-grid usuarios-grid--5">
      ${Array.from({ length: 5 })
        .map(
          () => `
        <article class="usuarios-stat usuarios-stat--skeleton">
          <div class="usuarios-skeleton usuarios-skeleton--sm"></div>
          <div class="usuarios-skeleton usuarios-skeleton--lg"></div>
          <div class="usuarios-skeleton usuarios-skeleton--xs"></div>
        </article>
      `
        )
        .join("")}
    </section>

    <section class="usuarios-panel usuarios-panel--skeleton">
      <div class="usuarios-skeleton usuarios-skeleton--md"></div>
      <div class="usuarios-skeleton-table">
        ${Array.from({ length: 7 })
          .map(
            () => `
          <div class="usuarios-skeleton-row"></div>
        `
          )
          .join("")}
      </div>
    </section>
  `;
}

function renderEmptyState() {
  return `
    <section class="usuarios-panel">
      <div class="usuarios-empty usuarios-empty--xl">
        <div class="usuarios-empty__title">
          No hay usuarios para mostrar
        </div>

        <div class="usuarios-empty__text">
          Ajusta los filtros, la búsqueda o la paginación para intentar encontrar resultados.
        </div>
      </div>
    </section>
  `;
}

function renderError(
  error = null
) {
  const message = safeText(
    error?.message ||
      error ||
      "Error cargando usuarios.",
    "Error cargando usuarios."
  );

  return `
    <section class="usuarios-panel">
      <div class="usuarios-error">
        <div class="usuarios-error__title">
          No se pudo cargar el listado
        </div>

        <div class="usuarios-error__text">
          ${escapeHtml(message)}
        </div>

        <button
          type="button"
          class="usuarios-toolbar-button usuarios-toolbar-button--danger"
          data-usuarios-action="refresh"
          aria-label="Reintentar carga"
        >
          Reintentar
        </button>
      </div>
    </section>
  `;
}

/* =========================================================
   STYLES
========================================================= */

function renderStyles() {
  return `
  <style>
    .usuarios-view{
      width:100%;
      display:grid;
      gap:24px;
      padding:24px;
    }

    .usuarios-hero,
    .usuarios-panel,
    .usuarios-stat{
      border-radius:28px;
      border:1px solid rgba(255,255,255,.08);
      background:
        linear-gradient(
          180deg,
          rgba(255,255,255,.03),
          rgba(255,255,255,.01)
        ),
        rgba(24,24,27,.72);
      box-shadow:
        0 18px 48px rgba(0,0,0,.16),
        inset 0 1px 0 rgba(255,255,255,.04);
    }

    .usuarios-hero,
    .usuarios-panel{
      padding:28px;
    }

    .usuarios-hero__content,
    .usuarios-hero__copy{
      display:grid;
      gap:14px;
    }

    .usuarios-hero__eyebrow,
    .usuarios-badge,
    .usuarios-meta-pill,
    .usuarios-toolbar-button,
    .usuarios-toolbar-link,
    .usuarios-chip{
      display:inline-flex;
      align-items:center;
      justify-content:center;
      width:max-content;
      min-height:34px;
      padding:0 14px;
      border-radius:999px;
      font-size:12px;
      font-weight:800;
      letter-spacing:.05em;
      text-transform:uppercase;
      text-decoration:none;
    }

    .usuarios-hero__eyebrow{
      color:var(--text-soft);
      border:1px solid rgba(255,255,255,.08);
      background:rgba(255,255,255,.03);
    }

    .usuarios-meta-pill{
      border:1px solid rgba(255,255,255,.08);
      background:rgba(255,255,255,.03);
      color:var(--text-dim);
    }

    .usuarios-badge--live{
      background:rgba(34,197,94,.10);
      color:#86efac;
      border:1px solid rgba(34,197,94,.14);
    }

    .usuarios-badge--cache{
      background:rgba(59,130,246,.10);
      color:#93c5fd;
      border:1px solid rgba(59,130,246,.14);
    }

    .usuarios-badge--warning{
      background:rgba(245,158,11,.10);
      color:#fcd34d;
      border:1px solid rgba(245,158,11,.14);
    }

    .usuarios-badge--danger{
      background:rgba(239,68,68,.10);
      color:#fca5a5;
      border:1px solid rgba(239,68,68,.14);
    }

    .usuarios-toolbar-button,
    .usuarios-toolbar-link{
      border:1px solid rgba(255,255,255,.10);
      background:rgba(255,255,255,.04);
      color:var(--text-strong);
      cursor:pointer;
      transition:
        transform .18s ease,
        border-color .18s ease,
        background .18s ease,
        opacity .18s ease;
    }

    .usuarios-toolbar-button:hover,
    .usuarios-toolbar-link:hover{
      transform:translateY(-1px);
      border-color:rgba(255,255,255,.16);
      background:rgba(255,255,255,.06);
    }

    .usuarios-toolbar-button:disabled{
      opacity:.45;
      cursor:not-allowed;
      transform:none;
    }

    .usuarios-toolbar-button--danger{
      color:#fecaca;
      border-color:rgba(239,68,68,.16);
      background:rgba(239,68,68,.06);
    }

    .usuarios-hero__title{
      margin:0;
      font-size:clamp(30px,4vw,46px);
      line-height:1.04;
      letter-spacing:-.03em;
      font-weight:900;
      color:var(--text-strong);
    }

    .usuarios-hero__subtitle{
      margin:0;
      color:var(--text-dim);
      line-height:1.7;
      max-width:78ch;
    }

    .usuarios-hero__meta{
      display:flex;
      flex-wrap:wrap;
      gap:10px;
      color:var(--text-muted);
      font-size:13px;
    }

    .usuarios-hero__hint{
      margin:0;
      color:var(--text-muted);
      font-size:13px;
      line-height:1.6;
    }

    .usuarios-hero__actions{
      display:flex;
      flex-wrap:wrap;
      gap:10px;
      margin-top:2px;
    }

    .usuarios-grid{
      display:grid;
      gap:18px;
    }

    .usuarios-grid--5{
      grid-template-columns:repeat(5,minmax(0,1fr));
    }

    .usuarios-stat{
      padding:22px;
      display:grid;
      gap:10px;
    }

    .usuarios-stat__label{
      font-size:12px;
      letter-spacing:.08em;
      text-transform:uppercase;
      font-weight:800;
      color:var(--text-dim);
    }

    .usuarios-stat__value{
      font-size:30px;
      line-height:1;
      font-weight:900;
      letter-spacing:-.03em;
      color:var(--text-strong);
    }

    .usuarios-stat__helper{
      font-size:12px;
      color:var(--text-muted);
      line-height:1.5;
    }

    .usuarios-stat.is-success{
      border-color:rgba(34,197,94,.20);
    }

    .usuarios-stat.is-warning{
      border-color:rgba(245,158,11,.20);
    }

    .usuarios-stat.is-danger{
      border-color:rgba(239,68,68,.20);
    }

    .usuarios-toolbar{
      display:flex;
      justify-content:space-between;
      gap:16px;
      flex-wrap:wrap;
    }

    .usuarios-toolbar__left,
    .usuarios-toolbar__right{
      display:flex;
      align-items:center;
      gap:12px;
      flex-wrap:wrap;
    }

    .usuarios-toolbar__footer{
      display:flex;
      justify-content:space-between;
      gap:12px;
      margin-top:16px;
      align-items:center;
      flex-wrap:wrap;
    }

    .usuarios-toolbar__hint{
      color:var(--text-muted);
      font-size:13px;
    }

    .usuarios-search{
      display:flex;
      gap:10px;
      flex-wrap:wrap;
      width:100%;
      max-width:620px;
    }

    .usuarios-search__input,
    .usuarios-select{
      min-height:46px;
      border-radius:16px;
      border:1px solid rgba(255,255,255,.08);
      background:rgba(255,255,255,.03);
      color:var(--text-strong);
      padding:0 14px;
      outline:none;
    }

    .usuarios-search__input{
      flex:1 1 320px;
      min-width:240px;
    }

    .usuarios-select{
      min-width:160px;
    }

    .usuarios-table-wrap{
      width:100%;
      overflow:auto;
      border-radius:20px;
      border:1px solid rgba(255,255,255,.06);
      margin-top:0;
    }

    .usuarios-table{
      width:100%;
      min-width:1080px;
      border-collapse:separate;
      border-spacing:0;
    }

    .usuarios-table thead th{
      position:sticky;
      top:0;
      z-index:1;
      text-align:left;
      font-size:12px;
      letter-spacing:.08em;
      text-transform:uppercase;
      font-weight:800;
      color:var(--text-dim);
      background:rgba(255,255,255,.03);
      padding:16px 14px;
      border-bottom:1px solid rgba(255,255,255,.06);
      backdrop-filter:blur(10px);
    }

    .usuarios-table tbody td{
      padding:14px;
      border-bottom:1px solid rgba(255,255,255,.05);
      color:var(--text-dim);
      vertical-align:middle;
    }

    .usuarios-table tbody tr{
      transition:background .18s ease;
    }

    .usuarios-table tbody tr:hover{
      background:rgba(255,255,255,.02);
    }

    .usuarios-table tbody tr.is-active-row{
      background:rgba(59,130,246,.05);
      box-shadow:inset 3px 0 0 rgba(59,130,246,.65);
    }

    .usuarios-table__actions{
      width:180px;
    }

    .usuarios-user-cell{
      display:flex;
      align-items:center;
      gap:12px;
      border:none;
      background:none;
      padding:0;
      text-align:left;
      cursor:pointer;
      color:inherit;
    }

    .usuarios-avatar{
      width:40px;
      height:40px;
      border-radius:50%;
      display:grid;
      place-items:center;
      font-size:12px;
      font-weight:900;
      color:#dbeafe;
      background:rgba(59,130,246,.18);
      border:1px solid rgba(59,130,246,.20);
      flex:0 0 auto;
      overflow:hidden;
    }

    .usuarios-avatar__img{
      width:100%;
      height:100%;
      object-fit:cover;
      display:block;
    }

    .usuarios-user-cell__text{
      display:grid;
      gap:4px;
      min-width:0;
    }

    .usuarios-user-cell__name{
      color:var(--text-strong);
      font-weight:800;
      line-height:1.4;
      word-break:break-word;
    }

    .usuarios-user-cell__sub{
      color:var(--text-muted);
      font-size:12px;
      line-height:1.4;
      word-break:break-word;
    }

    .usuarios-email,
    .usuarios-date{
      color:var(--text-dim);
      font-size:13px;
      line-height:1.5;
    }

    .usuarios-chip{
      border:1px solid transparent;
    }

    .usuarios-chip--status.is-active{
      background:rgba(34,197,94,.10);
      color:#86efac;
      border-color:rgba(34,197,94,.14);
    }

    .usuarios-chip--status.is-inactive{
      background:rgba(148,163,184,.10);
      color:#cbd5e1;
      border-color:rgba(148,163,184,.14);
    }

    .usuarios-chip--status.is-blocked{
      background:rgba(239,68,68,.10);
      color:#fca5a5;
      border-color:rgba(239,68,68,.14);
    }

    .usuarios-chip--status.is-pending{
      background:rgba(245,158,11,.10);
      color:#fcd34d;
      border-color:rgba(245,158,11,.14);
    }

    .usuarios-chip--status.is-unknown{
      background:rgba(255,255,255,.05);
      color:var(--text-dim);
      border-color:rgba(255,255,255,.08);
    }

    .usuarios-chip--role.is-admin{
      background:rgba(168,85,247,.10);
      color:#d8b4fe;
      border-color:rgba(168,85,247,.14);
    }

    .usuarios-chip--role.is-user{
      background:rgba(59,130,246,.10);
      color:#93c5fd;
      border-color:rgba(59,130,246,.14);
    }

    .usuarios-row-actions{
      display:flex;
      gap:8px;
      flex-wrap:wrap;
    }

    .usuarios-row-action,
    .usuarios-sort{
      border:none;
      background:none;
      color:var(--text-strong);
      cursor:pointer;
      font-weight:800;
      padding:0;
    }

    .usuarios-sort{
      font-size:12px;
      letter-spacing:.08em;
      text-transform:uppercase;
      color:var(--text-dim);
    }

    .usuarios-pagination{
      display:flex;
      justify-content:space-between;
      align-items:center;
      gap:12px;
      flex-wrap:wrap;
    }

    .usuarios-pagination__info{
      color:var(--text-muted);
      font-size:13px;
    }

    .usuarios-pagination__actions{
      display:flex;
      gap:10px;
      flex-wrap:wrap;
    }

    .usuarios-empty,
    .usuarios-error{
      min-height:160px;
      display:grid;
      place-items:center;
      border-radius:20px;
      text-align:center;
      padding:18px;
    }

    .usuarios-empty{
      color:var(--text-dim);
      border:1px dashed rgba(255,255,255,.08);
    }

    .usuarios-empty--xl{
      min-height:240px;
      gap:10px;
    }

    .usuarios-empty__title{
      font-size:20px;
      line-height:1.2;
      font-weight:900;
      color:var(--text-strong);
    }

    .usuarios-empty__text{
      color:var(--text-dim);
      max-width:60ch;
      line-height:1.7;
    }

    .usuarios-error{
      gap:12px;
      color:#fca5a5;
      background:rgba(239,68,68,.05);
      border:1px solid rgba(239,68,68,.12);
    }

    .usuarios-error__title{
      font-size:20px;
      line-height:1.2;
      font-weight:900;
      color:#fecaca;
    }

    .usuarios-error__text{
      color:#fca5a5;
      line-height:1.7;
      max-width:64ch;
    }

    .usuarios-panel--skeleton,
    .usuarios-stat--skeleton{
      overflow:hidden;
    }

    .usuarios-skeleton{
      border-radius:999px;
      background:
        linear-gradient(
          90deg,
          rgba(255,255,255,.05) 0%,
          rgba(255,255,255,.10) 50%,
          rgba(255,255,255,.05) 100%
        );
      background-size:200% 100%;
      animation:usuariosSkeleton 1.4s linear infinite;
    }

    .usuarios-skeleton--xs{
      width:36%;
      height:12px;
    }

    .usuarios-skeleton--sm{
      width:42%;
      height:14px;
    }

    .usuarios-skeleton--md{
      width:28%;
      height:16px;
    }

    .usuarios-skeleton--lg{
      width:64%;
      height:34px;
    }

    .usuarios-skeleton-table{
      display:grid;
      gap:12px;
      margin-top:18px;
    }

    .usuarios-skeleton-row{
      height:56px;
      border-radius:16px;
      background:
        linear-gradient(
          90deg,
          rgba(255,255,255,.04) 0%,
          rgba(255,255,255,.09) 50%,
          rgba(255,255,255,.04) 100%
        );
      background-size:200% 100%;
      animation:usuariosSkeleton 1.4s linear infinite;
    }

    @keyframes usuariosSkeleton{
      0%{
        background-position:200% 0;
      }
      100%{
        background-position:-200% 0;
      }
    }

    [data-theme="light"] .usuarios-hero,
    [data-theme="light"] .usuarios-panel,
    [data-theme="light"] .usuarios-stat{
      border-color:rgba(15,23,42,.08);
      background:
        linear-gradient(
          180deg,
          rgba(255,255,255,.94),
          rgba(255,255,255,.82)
        ),
        rgba(255,255,255,.92);
      box-shadow:
        0 18px 44px rgba(15,23,42,.08),
        inset 0 1px 0 rgba(255,255,255,.82);
    }

    [data-theme="light"] .usuarios-table-wrap,
    [data-theme="light"] .usuarios-search__input,
    [data-theme="light"] .usuarios-select{
      border-color:rgba(15,23,42,.08);
      background:rgba(15,23,42,.02);
    }

    [data-theme="light"] .usuarios-table thead th{
      background:rgba(15,23,42,.03);
      border-bottom-color:rgba(15,23,42,.06);
    }

    [data-theme="light"] .usuarios-table tbody td{
      border-bottom-color:rgba(15,23,42,.05);
    }

    [data-theme="light"] .usuarios-table tbody tr:hover,
    [data-theme="light"] .usuarios-table tbody tr.is-active-row{
      background:rgba(15,23,42,.03);
    }

    [data-theme="light"] .usuarios-empty{
      border-color:rgba(15,23,42,.08);
    }

    @media (max-width:1400px){
      .usuarios-grid--5{
        grid-template-columns:repeat(3,minmax(0,1fr));
      }
    }

    @media (max-width:980px){
      .usuarios-grid--5{
        grid-template-columns:repeat(2,minmax(0,1fr));
      }
    }

    @media (max-width:760px){
      .usuarios-view{
        padding:16px;
        gap:16px;
      }

      .usuarios-grid--5{
        grid-template-columns:1fr;
      }

      .usuarios-hero,
      .usuarios-panel,
      .usuarios-stat{
        border-radius:22px;
      }

      .usuarios-hero,
      .usuarios-panel{
        padding:20px;
      }

      .usuarios-toolbar{
        flex-direction:column;
        align-items:stretch;
      }

      .usuarios-toolbar__left,
      .usuarios-toolbar__right{
        width:100%;
      }

      .usuarios-search{
        max-width:none;
      }

      .usuarios-toolbar__footer,
      .usuarios-pagination{
        flex-direction:column;
        align-items:flex-start;
      }
    }
  </style>
  `;
}

/* =========================================================
   FULL TEMPLATE
========================================================= */

export function getUsuariosTemplate(
  options = {}
) {
  const user =
    options?.user || null;

  const state =
    resolveUsuariosState(
      options
    );

  let body = "";

  if (state.error) {
    body = renderError(
      state.error
    );
  } else if (
    state.loading &&
    state.loaded !== true
  ) {
    body = renderLoading();
  } else if (hasUsers(state)) {
    body = `
      ${renderStats(state)}
      ${renderToolbar(state)}
      ${renderTable(state)}
      ${renderPagination(state)}
    `;
  } else {
    body = `
      ${renderStats(state)}
      ${renderToolbar(state)}
      ${renderEmptyState()}
    `;
  }

  return `
    ${renderStyles()}

    <section
      class="usuarios-view"
      data-view="usuarios"
      data-usuarios-view="true"
      data-usuarios-source="${escapeHtml(
        safeText(
          state.source,
          "idle"
        )
      )}"
      data-usuarios-degraded="${
        state.degraded === true
          ? "true"
          : "false"
      }"
    >
      ${renderHero({
        user,
        state,
      })}

      ${body}
    </section>
  `;
}

export {
  getUsuariosTemplate as UsuariosTemplate,
};

export default getUsuariosTemplate;
