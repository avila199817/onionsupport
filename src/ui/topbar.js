/* =========================================================
   Onion SPA - Topbar UI (FULL PRO SAAS PANEL · FINAL PRO)
   Archivo: src/ui/topbar.js

   Responsabilidades:
   - montar el HTML del topbar desde JS
   - controlar la UI global del topbar
   - sincronizar título de la vista actual
   - gestionar toggle mobile de sidebar
   - bind seguro y rebind tras render SPA
   - integrar buscador global del topbar
   - debounce + abort de peticiones
   - renderizar resultados agrupados
   - soportar navegación por teclado
   - soportar click outside
   - mezclar resultados remotos + fallback local
   - tolerar distintos formatos del backend search
   - cleanup sólido anti duplicados
========================================================= */

import { AppCore } from "../core/core.js";
import { Router } from "../router/router.js";

export const TopbarUI = (() => {
  "use strict";

  const SCOPE = "ui:topbar";
  const SEARCH_SCOPE = "ui:topbar:search";

  const SEARCH_DEBOUNCE_MS = 220;
  const MIN_QUERY_LENGTH = 1;
  const MAX_RESULTS_TOTAL = 24;
  const MAX_RESULTS_PER_GROUP = 6;
  const CACHE_TTL_MS = 20 * 1000;

  let initialized = false;
  let searchController = null;
  let searchDebounceTimer = null;
  let activeIndex = -1;
  let currentItems = [];
  let currentQuery = "";
  let cache = new Map();

  /* =========================================================
     TEMPLATE / MOUNT
  ========================================================= */
  function getTopbarTemplate() {
    return `
      <header class="topbar" id="topbar">
        <div class="topbar-left">
          <button
            type="button"
            class="topbar-mobile-toggle"
            id="toggleSidebarMobile"
            aria-label="Abrir navegación"
            aria-controls="sidebar-menu"
            aria-expanded="false"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
            >
              <path d="M4 7h16" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
              <path d="M4 12h16" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
              <path d="M4 17h16" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
            </svg>
          </button>

          <h1 class="topbar-title" id="topbar-title">Onion Support</h1>
        </div>

        <div class="topbar-right">
          <div class="topbar-search-wrap">
            <svg
              class="topbar-search-icon"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
            >
              <circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="2"/>
              <path d="M20 20l-3-3" stroke="currentColor" stroke-width="2"/>
            </svg>

            <input
              type="search"
              id="topbar-search"
              class="topbar-search"
              placeholder="Buscar..."
              autocomplete="off"
              inputmode="search"
              aria-label="Buscar en la aplicación"
              aria-controls="topbar-search-results"
              aria-expanded="false"
              aria-autocomplete="list"
            >

            <div
              id="topbar-search-results"
              class="topbar-search-results"
              hidden
              aria-live="polite"
            ></div>
          </div>
        </div>
      </header>
    `;
  }

  function getMainContentEl() {
    return (
      AppCore.dom.mainContent ||
      document.getElementById("main-content") ||
      document.querySelector(".main-content")
    );
  }

  function mountTopbar() {
    let topbar = document.getElementById("topbar");
    if (topbar) return topbar;

    const mainContent = getMainContentEl();
    if (!mainContent) return null;

    mainContent.insertAdjacentHTML("afterbegin", getTopbarTemplate());
    return document.getElementById("topbar");
  }

  /* =========================================================
     HELPERS BASE
  ========================================================= */
  function escapeHtml(value = "") {
    if (AppCore?.utils?.escapeHtml) {
      return AppCore.utils.escapeHtml(String(value ?? ""));
    }

    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function normalizeText(value = "") {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();
  }

  function normalizeQuery(value = "") {
    return String(value || "").trim();
  }

  function uniqBy(items = [], keyGetter) {
    const seen = new Set();
    const result = [];

    for (const item of items) {
      const key = keyGetter(item);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      result.push(item);
    }

    return result;
  }

  function getDom() {
    const topbar =
      AppCore.dom.topbar ||
      document.getElementById("topbar") ||
      document.querySelector(".topbar");

    const title =
      AppCore.dom.topbarTitle ||
      document.getElementById("topbar-title") ||
      document.querySelector("#topbar-title");

    const mobileToggle =
      AppCore.dom.toggleSidebarMobile ||
      document.getElementById("toggleSidebarMobile") ||
      document.querySelector("#toggleSidebarMobile");

    const sidebar =
      AppCore.dom.sidebar ||
      document.getElementById("sidebar") ||
      document.querySelector(".sidebar");

    const searchInput =
      AppCore.dom.searchInput ||
      document.getElementById("topbar-search") ||
      document.querySelector("#topbar-search");

    const searchResults =
      AppCore.dom.searchResults ||
      document.getElementById("topbar-search-results") ||
      document.querySelector("#topbar-search-results");

    const searchWrap =
      searchInput?.closest(".topbar-search-wrap") ||
      searchResults?.closest(".topbar-search-wrap") ||
      document.querySelector(".topbar-search-wrap");

    return {
      topbar,
      title,
      mobileToggle,
      sidebar,
      searchInput,
      searchResults,
      searchWrap,
    };
  }

  function syncDomCache() {
    const dom = getDom();

    AppCore.dom.topbar = dom.topbar || null;
    AppCore.dom.topbarTitle = dom.title || null;
    AppCore.dom.toggleSidebarMobile = dom.mobileToggle || null;
    AppCore.dom.searchInput = dom.searchInput || null;
    AppCore.dom.searchResults = dom.searchResults || null;
  }

  function safeNormalizePath(path = "/") {
    try {
      return AppCore.utils.normalizePath(path || "/");
    } catch {
      return "/";
    }
  }

  function safeNormalizeCanonicalPath(path = "/") {
    try {
      if (typeof AppCore.utils.normalizeCanonicalPath === "function") {
        return AppCore.utils.normalizeCanonicalPath(path || "/");
      }

      return safeNormalizePath(path);
    } catch {
      return "/";
    }
  }

  function getCurrentPublicPath() {
    return safeNormalizePath(
      `${window.location.pathname || "/"}${window.location.search || ""}`
    );
  }

  function getCurrentCanonicalPath() {
    if (typeof Router?.getCurrentCanonicalPath === "function") {
      try {
        return Router.getCurrentCanonicalPath();
      } catch {
        /* noop */
      }
    }

    return safeNormalizeCanonicalPath(getCurrentPublicPath());
  }

  function isMobileViewport() {
    return window.matchMedia("(max-width: 900px)").matches;
  }

  function clearSearchDebounce() {
    if (searchDebounceTimer) {
      window.clearTimeout(searchDebounceTimer);
      searchDebounceTimer = null;
    }
  }

  function abortSearch() {
    if (searchController) {
      try {
        searchController.abort();
      } catch {
        /* noop */
      }
      searchController = null;
    }
  }

  function clearSearchState() {
    clearSearchDebounce();
    abortSearch();
    activeIndex = -1;
    currentItems = [];
    currentQuery = "";
  }

  /* =========================================================
     TOPBAR TITLE
  ========================================================= */
  function resolveRouteTitle(path = "") {
    const canonicalPath = safeNormalizeCanonicalPath(path || "/");

    const staticMap = {
      "/": "Onion Support",
      "/incidencias": "Incidencias",
      "/facturas": "Facturas",
      "/usuarios": "Usuarios",
      "/clientes": "Clientes",
      "/cuenta": "Cuenta",
      "/ajustes": "Ajustes",
      "/login": "Acceso",
      "/servidor": "Servidor",
    };

    if (staticMap[canonicalPath]) {
      return staticMap[canonicalPath];
    }

    const routes =
      Router?.routes ||
      Router?.table ||
      Router?.routeTable ||
      AppCore?.routes ||
      null;

    if (routes && typeof routes === "object") {
      const exact =
        routes[canonicalPath] ||
        routes[safeNormalizePath(path || "/")] ||
        null;

      if (exact?.title) {
        return String(exact.title);
      }
    }

    if (canonicalPath === "/") {
      return "Onion Support";
    }

    const pretty = canonicalPath
      .replace(/^\/+/, "")
      .split("/")
      .filter(Boolean)
      .map((segment) => {
        const clean = decodeURIComponent(segment)
          .replace(/[-_]+/g, " ")
          .trim();

        if (!clean) return "";
        return clean.charAt(0).toUpperCase() + clean.slice(1);
      })
      .filter(Boolean)
      .join(" · ");

    return pretty || "Onion Support";
  }

  function syncTitle(path = "") {
    const { title } = getDom();
    if (!title) return;

    const nextTitle = resolveRouteTitle(path || getCurrentPublicPath());
    title.textContent = nextTitle;
  }

  /* =========================================================
     SIDEBAR MOBILE
  ========================================================= */
  function setMobileToggleState() {
    const { mobileToggle, sidebar } = getDom();
    if (!mobileToggle || !sidebar) return;

    const isOpen =
      sidebar.classList.contains("open") ||
      sidebar.classList.contains("is-open");

    mobileToggle.setAttribute("aria-expanded", String(isOpen));
    mobileToggle.setAttribute(
      "aria-label",
      isOpen ? "Cerrar navegación" : "Abrir navegación"
    );
    mobileToggle.classList.toggle("is-active", isOpen);
  }

  function openSidebarMobile() {
    const { sidebar } = getDom();
    if (!sidebar) return;

    sidebar.classList.add("open", "is-open");
    setMobileToggleState();
  }

  function closeSidebarMobile() {
    const { sidebar } = getDom();
    if (!sidebar) return;

    sidebar.classList.remove("open", "is-open");
    setMobileToggleState();
  }

  function toggleSidebarMobile() {
    const { sidebar } = getDom();
    if (!sidebar) return;

    const nextOpen =
      !sidebar.classList.contains("open") &&
      !sidebar.classList.contains("is-open");

    sidebar.classList.toggle("open", nextOpen);
    sidebar.classList.toggle("is-open", nextOpen);
    setMobileToggleState();
  }

  function handleMobileToggleClick() {
    if (AppCore.modules?.get?.("sidebar")?.toggleSidebar) {
      AppCore.modules.get("sidebar").toggleSidebar();
      setMobileToggleState();
      return;
    }

    toggleSidebarMobile();
  }

  function handleOutsideSidebarClick(event) {
    if (!isMobileViewport()) return;

    const { sidebar, mobileToggle } = getDom();
    if (!sidebar || !mobileToggle) return;

    const isOpen =
      sidebar.classList.contains("open") ||
      sidebar.classList.contains("is-open");

    if (!isOpen) return;

    const clickedSidebar = event.target?.closest?.("#sidebar, .sidebar");
    const clickedToggle = event.target?.closest?.("#toggleSidebarMobile");

    if (clickedSidebar || clickedToggle) {
      return;
    }

    closeSidebarMobile();
  }

  function handleViewportResize() {
    if (!isMobileViewport()) {
      closeSidebarMobile();
    } else {
      setMobileToggleState();
    }
  }

  /* =========================================================
     SEARCH HELPERS
  ========================================================= */
  function getTypeLabel(type = "general") {
    const map = {
      cliente: "Clientes",
      clientes: "Clientes",
      user: "Usuarios",
      usuario: "Usuarios",
      usuarios: "Usuarios",
      factura: "Facturas",
      facturas: "Facturas",
      incidencia: "Incidencias",
      incidencias: "Incidencias",
      ticket: "Incidencias",
      tickets: "Incidencias",
      nav: "Navegación",
      route: "Navegación",
      routes: "Navegación",
      recent: "Recientes",
      recientes: "Recientes",
      general: "Resultados",
    };

    return map[String(type || "").toLowerCase()] || "Resultados";
  }

  function getTypeIcon(type = "general") {
    const map = {
      cliente: "🏢",
      clientes: "🏢",
      user: "👤",
      usuario: "👤",
      usuarios: "👤",
      factura: "🧾",
      facturas: "🧾",
      incidencia: "🎫",
      incidencias: "🎫",
      ticket: "🎫",
      tickets: "🎫",
      nav: "📂",
      route: "📂",
      routes: "📂",
      recent: "🕘",
      recientes: "🕘",
      general: "🔎",
    };

    return map[String(type || "").toLowerCase()] || "🔎";
  }

  function scoreTextMatch(text = "", query = "") {
    const t = normalizeText(text);
    const q = normalizeText(query);

    if (!t || !q) return 0;
    if (t === q) return 120;
    if (t.startsWith(q)) return 90;
    if (t.includes(` ${q}`)) return 70;
    if (t.includes(q)) return 50;
    return 0;
  }

  function highlight(text = "", query = "") {
    const safeText = String(text || "");
    const safeQuery = String(query || "").trim();

    if (!safeText || !safeQuery) {
      return escapeHtml(safeText);
    }

    const normalizedText = normalizeText(safeText);
    const normalizedQuery = normalizeText(safeQuery);
    const index = normalizedText.indexOf(normalizedQuery);

    if (index === -1) {
      return escapeHtml(safeText);
    }

    const start = safeText.slice(0, index);
    const middle = safeText.slice(index, index + safeQuery.length);
    const end = safeText.slice(index + safeQuery.length);

    return `${escapeHtml(start)}<mark>${escapeHtml(middle)}</mark>${escapeHtml(end)}`;
  }

  function setSearchExpanded(input, expanded = false) {
    if (!input) return;
    input.setAttribute("aria-expanded", String(Boolean(expanded)));
  }

  function showResultsContainer(container) {
    const { searchInput } = getDom();

    if (!container) return;
    container.hidden = false;
    container.classList.add("active");
    container.setAttribute("aria-hidden", "false");
    setSearchExpanded(searchInput, true);
  }

  function hideResultsContainer(container) {
    const { searchInput } = getDom();

    if (!container) return;
    container.classList.remove("active");
    container.hidden = true;
    container.setAttribute("aria-hidden", "true");
    container.innerHTML = "";

    activeIndex = -1;
    currentItems = [];

    setSearchExpanded(searchInput, false);
  }

  function setLoadingState(container, query = "") {
    if (!container) return;

    container.innerHTML = `
      <div class="search-state search-state-loading" aria-live="polite">
        <div class="search-state-title">Buscando</div>
        <div class="search-state-text">
          ${escapeHtml(query ? `Buscando “${query}”...` : "Buscando...")}
        </div>
      </div>
    `;

    showResultsContainer(container);
  }

  function setEmptyState(container, query = "") {
    if (!container) return;

    container.innerHTML = `
      <div class="search-state search-state-empty" aria-live="polite">
        <div class="search-state-title">Sin resultados</div>
        <div class="search-state-text">
          ${escapeHtml(
            query
              ? `No encontramos coincidencias para “${query}”.`
              : "No hay resultados."
          )}
        </div>
      </div>
    `;

    showResultsContainer(container);
  }

  function setErrorState(container) {
    if (!container) return;

    container.innerHTML = `
      <div class="search-state search-state-error" aria-live="polite">
        <div class="search-state-title">No se pudo completar la búsqueda</div>
        <div class="search-state-text">
          Revisa la conexión o inténtalo de nuevo.
        </div>
      </div>
    `;

    showResultsContainer(container);
  }

  function updateActiveItem(items = []) {
    items.forEach((el) => el.classList.remove("active"));

    if (activeIndex >= 0 && items[activeIndex]) {
      items[activeIndex].classList.add("active");
      items[activeIndex].scrollIntoView({
        block: "nearest",
      });
    }
  }

  function updateActiveVisuals(container) {
    if (!container) return;

    const items = Array.from(container.querySelectorAll(".search-result"));

    items.forEach((el, index) => {
      const isActive = index === activeIndex;
      el.classList.toggle("active", isActive);
      el.setAttribute("aria-selected", String(isActive));
    });

    if (activeIndex >= 0 && items[activeIndex]) {
      items[activeIndex].scrollIntoView({
        block: "nearest",
      });
    }
  }

  function goToResult(item = null) {
    if (!item?.url) return;

    const { searchResults, searchInput } = getDom();

    hideResultsContainer(searchResults);

    if (searchInput) {
      searchInput.blur();
    }

    closeSidebarMobile();

    const target = safeNormalizePath(item.url);

    if (typeof Router.navigate === "function") {
      Router.navigate(target, {
        force: true,
      });
      return;
    }

    window.location.href = target;
  }

  /* =========================================================
     SEARCH LOCAL INDEX
  ========================================================= */
  function getLocalIndex() {
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

  function searchLocal(query = "") {
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

  /* =========================================================
     SEARCH API NORMALIZATION
  ========================================================= */
  function normalizeApiItem(raw, index = 0) {
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
      url: url ? safeNormalizePath(url) : null,
      raw,
      source: "api",
    };
  }

  function normalizeApiPayload(data) {
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
        .map((item, index) => normalizeApiItem(item, index))
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

  /* =========================================================
     SEARCH API
  ========================================================= */
  function getCacheKey(query = "") {
    return normalizeText(query);
  }

  function getCached(query = "") {
    const key = getCacheKey(query);
    const found = cache.get(key);

    if (!found) return null;

    if (Date.now() - found.createdAt > CACHE_TTL_MS) {
      cache.delete(key);
      return null;
    }

    return found.value;
  }

  function setCached(query = "", value = []) {
    const key = getCacheKey(query);

    cache.set(key, {
      value,
      createdAt: Date.now(),
    });
  }

  async function searchAPI(query = "") {
    const cached = getCached(query);
    if (cached) {
      return cached;
    }

    if (!AppCore?.apiClient?.get) {
      return [];
    }

    abortSearch();
    searchController = new AbortController();

    try {
      const data = await AppCore.apiClient.get("/api/search", {
        query: { q: query },
        signal: searchController.signal,
        auth: true,
        timeout: 12000,
      });

      const normalized = normalizeApiPayload(data);
      setCached(query, normalized);
      return normalized;
    } catch (error) {
      if (error?.aborted || error?.name === "AbortError") {
        return [];
      }

      AppCore.utils.warn?.("TopbarUI: fallo búsqueda API", error);
      throw error;
    } finally {
      searchController = null;
    }
  }

  /* =========================================================
     SEARCH SCORE / MERGE
  ========================================================= */
  function scoreResult(item, query = "") {
    const titleScore = scoreTextMatch(item.title, query);
    const subtitleScore = scoreTextMatch(item.subtitle, query);
    const urlScore = scoreTextMatch(item.url, query);

    let typeBoost = 0;

    switch (String(item.type || "").toLowerCase()) {
      case "user":
      case "usuario":
      case "usuarios":
        typeBoost = 8;
        break;
      case "cliente":
      case "clientes":
        typeBoost = 7;
        break;
      case "ticket":
      case "tickets":
      case "incidencia":
      case "incidencias":
        typeBoost = 6;
        break;
      case "factura":
      case "facturas":
        typeBoost = 5;
        break;
      case "nav":
      case "route":
      case "routes":
        typeBoost = 3;
        break;
      default:
        typeBoost = 1;
    }

    return titleScore * 2 + subtitleScore + urlScore + typeBoost;
  }

  function mergeResults(apiResults = [], localResults = [], query = "") {
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
      .slice(0, MAX_RESULTS_TOTAL);
  }

  function groupResults(results = []) {
    const groups = new Map();

    results.forEach((item) => {
      const key = String(item.type || "general").toLowerCase();

      if (!groups.has(key)) {
        groups.set(key, []);
      }

      groups.get(key).push(item);
    });

    return Array.from(groups.entries());
  }

  /* =========================================================
     SEARCH RENDER
  ========================================================= */
  function renderResults(container, results = [], query = "") {
    if (!container) return;

    container.innerHTML = "";
    activeIndex = -1;
    currentItems = [];

    if (!results.length) {
      setEmptyState(container, query);
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

      items.slice(0, MAX_RESULTS_PER_GROUP).forEach((item) => {
        const resultEl = document.createElement("button");
        resultEl.type = "button";
        resultEl.className = "search-result";
        resultEl.dataset.type = item.type || "general";
        resultEl.dataset.url = item.url || "";
        resultEl.dataset.index = String(currentItems.length);
        resultEl.setAttribute("role", "option");
        resultEl.setAttribute("aria-selected", "false");

        resultEl.innerHTML = `
          <span class="search-icon" aria-hidden="true">${escapeHtml(
            getTypeIcon(item.type)
          )}</span>
          <span class="search-text">
            <span class="search-title">${highlight(item.title || "", query)}</span>
            ${
              item.subtitle
                ? `<span class="search-subtitle">${highlight(
                    item.subtitle || "",
                    query
                  )}</span>`
                : ""
            }
          </span>
        `;

        resultEl.addEventListener("click", () => {
          goToResult(item);
        });

        resultEl.addEventListener("mouseenter", () => {
          const idx = Number(resultEl.dataset.index);
          if (!Number.isNaN(idx)) {
            activeIndex = idx;
            updateActiveVisuals(container);
          }
        });

        currentItems.push(item);
        groupEl.appendChild(resultEl);
      });

      fragment.appendChild(groupEl);
    });

    container.appendChild(fragment);
    showResultsContainer(container);
  }

  /* =========================================================
     SEARCH EXECUTION
  ========================================================= */
  async function runSearch(query = "") {
    const { searchResults } = getDom();
    const q = normalizeQuery(query);

    currentQuery = q;

    if (!searchResults) return;

    if (!q || q.length < MIN_QUERY_LENGTH) {
      hideResultsContainer(searchResults);
      return;
    }

    setLoadingState(searchResults, q);

    try {
      const [remote, local] = await Promise.all([
        searchAPI(q),
        Promise.resolve(searchLocal(q)),
      ]);

      if (currentQuery !== q) {
        return;
      }

      const merged = mergeResults(remote, local, q);
      renderResults(searchResults, merged, q);
    } catch (error) {
      if (currentQuery !== q) {
        return;
      }

      const local = searchLocal(q);

      if (local.length) {
        renderResults(searchResults, local, q);
        return;
      }

      setErrorState(searchResults);
    }
  }

  /* =========================================================
     SEARCH HANDLERS
  ========================================================= */
  function handleSearchInput() {
    const { searchInput, searchResults } = getDom();
    const value = normalizeQuery(searchInput?.value || "");

    clearSearchDebounce();

    if (!value) {
      hideResultsContainer(searchResults);
      return;
    }

    searchDebounceTimer = window.setTimeout(() => {
      runSearch(value);
    }, SEARCH_DEBOUNCE_MS);
  }

  function handleSearchFocus() {
    const { searchInput, searchResults } = getDom();
    const value = normalizeQuery(searchInput?.value || "");

    if (value.length >= MIN_QUERY_LENGTH) {
      runSearch(value);
      return;
    }

    hideResultsContainer(searchResults);
  }

  function handleSearchKeydown(event) {
    const { searchResults, searchInput } = getDom();
    if (!searchInput || !searchResults) return;
    if (document.activeElement !== searchInput) return;

    const items = Array.from(searchResults.querySelectorAll(".search-result"));

    if (!items.length) {
      if (event.key === "Escape") {
        hideResultsContainer(searchResults);
        searchInput.blur();
      }
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      activeIndex = Math.min(activeIndex + 1, items.length - 1);
      updateActiveItem(items);
      updateActiveVisuals(searchResults);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      activeIndex = Math.max(activeIndex - 1, 0);
      updateActiveItem(items);
      updateActiveVisuals(searchResults);
      return;
    }

    if (event.key === "Enter") {
      if (activeIndex >= 0 && currentItems[activeIndex]) {
        event.preventDefault();
        goToResult(currentItems[activeIndex]);
      }
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      hideResultsContainer(searchResults);
      searchInput.blur();
    }
  }

  function handleSearchOutsideClick(event) {
    const { searchWrap, searchResults } = getDom();
    if (!searchWrap || !searchResults) return;

    if (event.target?.closest?.(".topbar-search-wrap")) {
      return;
    }

    hideResultsContainer(searchResults);
  }

  /* =========================================================
     ROUTE / APP EVENTS
  ========================================================= */
  function handleRouteVisualSync() {
    syncDomCache();
    syncTitle(getCurrentPublicPath());
    closeSidebarMobile();
  }

  /* =========================================================
     BINDS
  ========================================================= */
  function bindTopbarDomEvents() {
    const { mobileToggle } = getDom();

    if (mobileToggle) {
      AppCore.cleanup.on(SCOPE, mobileToggle, "click", handleMobileToggleClick);
    }

    AppCore.cleanup.on(SCOPE, document, "click", handleOutsideSidebarClick);
    AppCore.cleanup.on(SCOPE, window, "resize", handleViewportResize);

    return true;
  }

  function bindSearchDomEvents() {
    const { searchInput, searchResults } = getDom();

    if (!searchInput || !searchResults) {
      return false;
    }

    searchResults.setAttribute("role", "listbox");
    searchResults.setAttribute("aria-hidden", "true");
    setSearchExpanded(searchInput, false);

    AppCore.cleanup.on(
      SEARCH_SCOPE,
      searchInput,
      "input",
      handleSearchInput
    );
    AppCore.cleanup.on(
      SEARCH_SCOPE,
      searchInput,
      "focus",
      handleSearchFocus
    );
    AppCore.cleanup.on(
      SEARCH_SCOPE,
      document,
      "keydown",
      handleSearchKeydown
    );
    AppCore.cleanup.on(
      SEARCH_SCOPE,
      document,
      "click",
      handleSearchOutsideClick
    );

    return true;
  }

  function bindAppEvents() {
    AppCore.cleanup.event(SCOPE, "router:before-render", ({ detail }) => {
      const nextPath =
        detail?.path ||
        detail?.publicPath ||
        detail?.canonicalPath ||
        getCurrentPublicPath();

      syncTitle(nextPath);
    });

    AppCore.cleanup.event(SCOPE, "router:rendered", () => {
      handleRouteVisualSync();
      rebind();
    });

    AppCore.cleanup.event(SCOPE, "app:route:rendered", () => {
      handleRouteVisualSync();
      rebind();
    });

    AppCore.cleanup.event(SCOPE, "app:route:change", () => {
      const { searchResults } = getDom();
      hideResultsContainer(searchResults);
      syncTitle(getCurrentPublicPath());
      closeSidebarMobile();
    });

    AppCore.cleanup.event(SCOPE, "app:public-path:change", () => {
      const { searchResults } = getDom();
      hideResultsContainer(searchResults);
      syncTitle(getCurrentPublicPath());
    });

    AppCore.cleanup.event(SCOPE, "router:shell:change", () => {
      syncDomCache();
      setMobileToggleState();
    });

    AppCore.cleanup.event(SCOPE, "app:user-ui:sync", () => {
      syncDomCache();
    });

    AppCore.cleanup.event(SCOPE, "sidebar:state:synced", () => {
      setMobileToggleState();
    });
  }

  function destroy() {
    AppCore.cleanup.run(SCOPE);
    AppCore.cleanup.run(SEARCH_SCOPE);
    clearSearchState();
  }

  function bind() {
    destroy();
    syncDomCache();

    const { topbar } = getDom();
    if (!topbar) {
      return false;
    }

    bindTopbarDomEvents();
    bindSearchDomEvents();
    bindAppEvents();

    syncTitle(getCurrentPublicPath());
    setMobileToggleState();

    if (AppCore.config?.debug) {
      AppCore.utils.log?.("TopbarUI inicializado correctamente.");
    }

    return true;
  }

  function rebind() {
    syncDomCache();

    const { topbar } = getDom();
    if (!topbar) {
      return false;
    }

    return bind();
  }

  /* =========================================================
     INIT
  ========================================================= */
  function init() {
    if (initialized) {
      syncDomCache();
      syncTitle(getCurrentPublicPath());
      setMobileToggleState();
      return true;
    }

    mountTopbar();
    syncDomCache();

    const done = bind();

    if (!done) {
      window.setTimeout(() => {
        mountTopbar();
        syncDomCache();
        bind();
      }, 120);
    }

    initialized = true;
    return true;
  }

  /* =========================================================
     API PÚBLICA
  ========================================================= */
  return {
    init,
    bind,
    rebind,
    destroy,
    mountTopbar,
    runSearch,
    syncTitle,
    openSidebarMobile,
    closeSidebarMobile,
    toggleSidebarMobile,
    get initialized() {
      return initialized;
    },
  };
})();
