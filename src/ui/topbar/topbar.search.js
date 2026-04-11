/* =========================================================
   Onion SPA - Topbar Search
   Archivo: src/ui/topbar.search.js

   Responsabilidades:
   - gestionar cache de búsqueda
   - construir índice local
   - normalizar payloads remotos
   - ejecutar búsqueda API
   - fusionar resultados locales + remotos
   - renderizar resultados del buscador
   - gestionar navegación a resultados
   - actualizar estados visuales del panel search
========================================================= */

import {
  TOPBAR_SEARCH_CONFIG,
  escapeHtml,
  normalizeText,
  normalizeQuery,
  uniqBy,
  safeNormalizePath,
  getTypeLabel,
  getTypeIcon,
  highlight,
  scoreTextMatch,
  scoreResult,
  groupResults,
} from "./topbar.helpers.js";

export function clearSearchDebounce(runtime) {
  if (runtime.searchDebounceTimer) {
    window.clearTimeout(runtime.searchDebounceTimer);
    runtime.searchDebounceTimer = null;
  }
}

export function abortSearch(runtime) {
  if (runtime.searchController) {
    try {
      runtime.searchController.abort();
    } catch {
      /* noop */
    }

    runtime.searchController = null;
  }
}

export function clearSearchState(runtime) {
  clearSearchDebounce(runtime);
  abortSearch(runtime);

  runtime.activeIndex = -1;
  runtime.currentItems = [];
  runtime.currentQuery = "";
}

export function getCacheKey(query = "") {
  return normalizeText(query);
}

export function getCached(runtime, query = "") {
  const key = getCacheKey(query);
  const found = runtime.cache.get(key);

  if (!found) return null;

  if (Date.now() - found.createdAt > TOPBAR_SEARCH_CONFIG.cacheTtlMs) {
    runtime.cache.delete(key);
    return null;
  }

  return found.value;
}

export function setCached(runtime, query = "", value = []) {
  const key = getCacheKey(query);

  runtime.cache.set(key, {
    value,
    createdAt: Date.now(),
  });
}

export function getLocalIndex() {
  return [
    {
      id: "nav:/",
      type: "nav",
      title: "Inicio",
      subtitle: "Panel principal",
      url: "/",
    },
    {
      id: "nav:/incidencias",
      type: "nav",
      title: "Incidencias",
      subtitle: "Gestión de tickets e incidencias",
      url: "/incidencias",
    },
    {
      id: "nav:/facturas",
      type: "nav",
      title: "Facturas",
      subtitle: "Facturación y documentos",
      url: "/facturas",
    },
    {
      id: "nav:/usuarios",
      type: "nav",
      title: "Usuarios",
      subtitle: "Gestión de usuarios",
      url: "/usuarios",
    },
    {
      id: "nav:/clientes",
      type: "nav",
      title: "Clientes",
      subtitle: "Gestión de clientes",
      url: "/clientes",
    },
    {
      id: "nav:/cuenta",
      type: "nav",
      title: "Cuenta",
      subtitle: "Perfil y datos personales",
      url: "/cuenta",
    },
    {
      id: "nav:/ajustes",
      type: "nav",
      title: "Ajustes",
      subtitle: "Configuración del sistema",
      url: "/ajustes",
    },
    {
      id: "nav:/servidor",
      type: "nav",
      title: "Servidor",
      subtitle: "Estado del servidor",
      url: "/servidor",
    },
  ];
}

export function searchLocal(query = "") {
  const q = normalizeQuery(query);
  if (!q) return [];

  return getLocalIndex()
    .map((item) => {
      const score =
        scoreTextMatch(item.title, q) +
        scoreTextMatch(item.subtitle, q) +
        scoreTextMatch(item.url, q);

      return {
        ...item,
        score,
        source: "local",
      };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);
}

export function normalizeApiItem(AppCore, raw, index = 0) {
  if (!raw || typeof raw !== "object") return null;

  const type =
    raw.type ||
    raw.entity ||
    raw.kind ||
    raw.group ||
    raw.category ||
    "general";

  const title =
    raw.title ||
    raw.name ||
    raw.nombre ||
    raw.label ||
    raw.username ||
    raw.email ||
    raw.id ||
    "Resultado";

  const subtitle =
    raw.subtitle ||
    raw.description ||
    raw.descripcion ||
    raw.cliente ||
    raw.email ||
    raw.role ||
    raw.estado ||
    raw.status ||
    raw.numero ||
    raw.code ||
    "";

  const url =
    raw.url ||
    raw.path ||
    raw.href ||
    raw.route ||
    raw.to ||
    raw.link ||
    null;

  const id =
    raw.id ||
    raw._id ||
    raw.uuid ||
    `${String(type)}:${String(url || title)}:${index}`;

  if (!title && !url) return null;

  return {
    id: String(id),
    type: String(type || "general").toLowerCase(),
    title: String(title || "Resultado"),
    subtitle: String(subtitle || ""),
    url: url ? safeNormalizePath(AppCore, url) : null,
    raw,
    source: "api",
  };
}

export function normalizeApiPayload(AppCore, data) {
  if (!data) return [];

  const directArray = Array.isArray(data)
    ? data
    : Array.isArray(data?.results)
    ? data.results
    : Array.isArray(data?.items)
    ? data.items
    : Array.isArray(data?.data)
    ? data.data
    : null;

  if (directArray) {
    return directArray
      .map((item, index) => normalizeApiItem(AppCore, item, index))
      .filter(Boolean);
  }

  const groupedKeys = [
    "clientes",
    "usuarios",
    "users",
    "facturas",
    "tickets",
    "incidencias",
    "nav",
    "routes",
    "recentes",
    "recientes",
  ];

  const collected = [];

  groupedKeys.forEach((key) => {
    if (Array.isArray(data?.[key])) {
      data[key].forEach((item, index) => {
        const normalized = normalizeApiItem(
          AppCore,
          { ...item, type: item?.type || key },
          index
        );

        if (normalized) {
          collected.push(normalized);
        }
      });
    }
  });

  return collected;
}

export async function searchAPI({
  AppCore,
  runtime,
  query = "",
}) {
  const cached = getCached(runtime, query);
  if (cached) {
    return cached;
  }

  if (!AppCore?.apiClient?.get) {
    return [];
  }

  abortSearch(runtime);
  runtime.searchController = new AbortController();

  try {
    const data = await AppCore.apiClient.get("/api/search", {
      query: { q: query },
      signal: runtime.searchController.signal,
      auth: true,
      timeout: 12000,
    });

    const normalized = normalizeApiPayload(AppCore, data);
    setCached(runtime, query, normalized);

    return normalized;
  } catch (error) {
    if (error?.aborted || error?.name === "AbortError") {
      return [];
    }

    AppCore.utils.warn?.("TopbarUI: fallo búsqueda API", error);
    throw error;
  } finally {
    runtime.searchController = null;
  }
}

export function mergeResults(apiResults = [], localResults = [], query = "") {
  const merged = uniqBy(
    [...apiResults, ...localResults].map((item) => ({
      ...item,
      score: scoreResult(item, query),
    })),
    (item) =>
      `${item.type}|${item.url || ""}|${item.title || ""}|${item.subtitle || ""}`
  );

  return merged
    .filter((item) => item.score > 0 || item.source === "api")
    .sort((a, b) => b.score - a.score)
    .slice(0, TOPBAR_SEARCH_CONFIG.maxResultsTotal);
}

export function setSearchExpanded(input, expanded = false) {
  if (!input) return;
  input.setAttribute("aria-expanded", String(Boolean(expanded)));
}

export function showResultsContainer(runtime, getDom) {
  const { searchResults, searchInput } = getDom();

  if (!searchResults) return;

  searchResults.hidden = false;
  searchResults.classList.add("active");
  searchResults.setAttribute("aria-hidden", "false");

  setSearchExpanded(searchInput, true);
}

export function hideResultsContainer(runtime, getDom) {
  const { searchResults, searchInput } = getDom();

  if (!searchResults) return;

  searchResults.classList.remove("active");
  searchResults.hidden = true;
  searchResults.setAttribute("aria-hidden", "true");
  searchResults.innerHTML = "";

  runtime.activeIndex = -1;
  runtime.currentItems = [];

  setSearchExpanded(searchInput, false);
}

export function setLoadingState(AppCore, runtime, getDom, query = "") {
  const { searchResults } = getDom();
  if (!searchResults) return;

  searchResults.innerHTML = `
    <div class="search-state search-state-loading" aria-live="polite">
      <div class="search-state-title">Buscando</div>
      <div class="search-state-text">
        ${escapeHtml(
          AppCore,
          query ? `Buscando “${query}”...` : "Buscando..."
        )}
      </div>
    </div>
  `;

  showResultsContainer(runtime, getDom);
}

export function setEmptyState(AppCore, runtime, getDom, query = "") {
  const { searchResults } = getDom();
  if (!searchResults) return;

  searchResults.innerHTML = `
    <div class="search-state search-state-empty" aria-live="polite">
      <div class="search-state-title">Sin resultados</div>
      <div class="search-state-text">
        ${escapeHtml(
          AppCore,
          query
            ? `No encontramos coincidencias para “${query}”.`
            : "No hay resultados."
        )}
      </div>
    </div>
  `;

  showResultsContainer(runtime, getDom);
}

export function setErrorState(runtime, getDom) {
  const { searchResults } = getDom();
  if (!searchResults) return;

  searchResults.innerHTML = `
    <div class="search-state search-state-error" aria-live="polite">
      <div class="search-state-title">No se pudo completar la búsqueda</div>
      <div class="search-state-text">
        Revisa la conexión o inténtalo de nuevo.
      </div>
    </div>
  `;

  showResultsContainer(runtime, getDom);
}

export function updateActiveItem(runtime, items = []) {
  items.forEach((el) => el.classList.remove("active"));

  if (runtime.activeIndex >= 0 && items[runtime.activeIndex]) {
    items[runtime.activeIndex].classList.add("active");
    items[runtime.activeIndex].scrollIntoView({
      block: "nearest",
    });
  }
}

export function updateActiveVisuals(runtime, getDom) {
  const { searchResults } = getDom();
  if (!searchResults) return;

  const items = Array.from(searchResults.querySelectorAll(".search-result"));

  items.forEach((el, index) => {
    const isActive = index === runtime.activeIndex;
    el.classList.toggle("active", isActive);
    el.setAttribute("aria-selected", String(isActive));
  });

  if (runtime.activeIndex >= 0 && items[runtime.activeIndex]) {
    items[runtime.activeIndex].scrollIntoView({
      block: "nearest",
    });
  }
}

export function goToResult({
  AppCore,
  Router,
  runtime,
  getDom,
  closeSidebarMobile,
  item = null,
}) {
  if (!item?.url) return;

  const { searchInput } = getDom();

  hideResultsContainer(runtime, getDom);

  if (searchInput) {
    searchInput.blur();
  }

  closeSidebarMobile();

  const target = safeNormalizePath(AppCore, item.url);

  if (typeof Router.navigate === "function") {
    Router.navigate(target, {
      force: true,
    });
    return;
  }

  window.location.href = target;
}

export function renderResults({
  AppCore,
  Router,
  runtime,
  getDom,
  closeSidebarMobile,
  results = [],
  query = "",
}) {
  const { searchResults } = getDom();
  if (!searchResults) return;

  searchResults.innerHTML = "";
  runtime.activeIndex = -1;
  runtime.currentItems = [];

  if (!results.length) {
    setEmptyState(AppCore, runtime, getDom, query);
    return;
  }

  const groups = groupResults(results);
  const fragment = document.createDocumentFragment();

  groups.forEach(([type, items]) => {
    const groupEl = document.createElement("section");
    groupEl.className = "search-group-block";
    groupEl.dataset.group = type;

    const header = document.createElement("div");
    header.className = "search-group";
    header.textContent = getTypeLabel(type);
    groupEl.appendChild(header);

    items
      .slice(0, TOPBAR_SEARCH_CONFIG.maxResultsPerGroup)
      .forEach((item) => {
        const resultEl = document.createElement("button");
        resultEl.type = "button";
        resultEl.className = "search-result";
        resultEl.dataset.type = item.type || "general";
        resultEl.dataset.url = item.url || "";
        resultEl.dataset.index = String(runtime.currentItems.length);
        resultEl.setAttribute("role", "option");
        resultEl.setAttribute("aria-selected", "false");

        resultEl.innerHTML = `
          <span class="search-icon" aria-hidden="true">${escapeHtml(
            AppCore,
            getTypeIcon(item.type)
          )}</span>
          <span class="search-text">
            <span class="search-title">${highlight(
              AppCore,
              item.title || "",
              query
            )}</span>
            ${
              item.subtitle
                ? `<span class="search-subtitle">${highlight(
                    AppCore,
                    item.subtitle || "",
                    query
                  )}</span>`
                : ""
            }
          </span>
        `;

        resultEl.addEventListener("click", () => {
          goToResult({
            AppCore,
            Router,
            runtime,
            getDom,
            closeSidebarMobile,
            item,
          });
        });

        resultEl.addEventListener("mouseenter", () => {
          const idx = Number(resultEl.dataset.index);

          if (!Number.isNaN(idx)) {
            runtime.activeIndex = idx;
            updateActiveVisuals(runtime, getDom);
          }
        });

        runtime.currentItems.push(item);
        groupEl.appendChild(resultEl);
      });

    fragment.appendChild(groupEl);
  });

  searchResults.appendChild(fragment);
  showResultsContainer(runtime, getDom);
}

export async function runSearch({
  AppCore,
  Router,
  runtime,
  getDom,
  closeSidebarMobile,
  query = "",
}) {
  const q = normalizeQuery(query);
  runtime.currentQuery = q;

  if (!q || q.length < TOPBAR_SEARCH_CONFIG.minQueryLength) {
    hideResultsContainer(runtime, getDom);
    return;
  }

  setLoadingState(AppCore, runtime, getDom, q);

  try {
    const [remote, local] = await Promise.all([
      searchAPI({
        AppCore,
        runtime,
        query: q,
      }),
      Promise.resolve(searchLocal(q)),
    ]);

    if (runtime.currentQuery !== q) {
      return;
    }

    const merged = mergeResults(remote, local, q);

    renderResults({
      AppCore,
      Router,
      runtime,
      getDom,
      closeSidebarMobile,
      results: merged,
      query: q,
    });
  } catch (error) {
    if (runtime.currentQuery !== q) {
      return;
    }

    const local = searchLocal(q);

    if (local.length) {
      renderResults({
        AppCore,
        Router,
        runtime,
        getDom,
        closeSidebarMobile,
        results: local,
        query: q,
      });
      return;
    }

    setErrorState(runtime, getDom);
  }
}
