/* =========================================================
   Onion SPA - Topbar Search (FULL PRO SAAS PANEL · GOD MODE)
   Archivo: src/ui/topbarSearch.js

   Responsabilidades:
   - bind seguro del buscador global del topbar
   - no pisar lógica del resto de la SPA
   - soportar rebind tras render SPA
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

export const TopbarSearch = (() => {
  "use strict";

  const SCOPE = "ui:topbar-search";

  const SEARCH_DEBOUNCE_MS = 220;
  const MIN_QUERY_LENGTH = 1;
  const MAX_RESULTS_TOTAL = 24;
  const MAX_RESULTS_PER_GROUP = 6;
  const CACHE_TTL_MS = 20 * 1000;

  let isBound = false;
  let controller = null;
  let debounceTimer = null;
  let activeIndex = -1;
  let currentItems = [];
  let currentQuery = "";
  let cache = new Map();

  /* =========================================================
     HELPERS BASE
  ========================================================= */
  function getDom() {
    const input =
      AppCore.dom.searchInput ||
      document.getElementById("topbar-search") ||
      document.querySelector("#topbar-search");

    const container =
      AppCore.dom.searchResults ||
      document.getElementById("topbar-search-results") ||
      document.querySelector("#topbar-search-results");

    const wrap =
      input?.closest(".topbar-search-wrap") ||
      container?.closest(".topbar-search-wrap") ||
      document.querySelector(".topbar-search-wrap");

    return {
      input,
      container,
      wrap,
    };
  }

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

  function clearDebounce() {
    if (debounceTimer) {
      window.clearTimeout(debounceTimer);
      debounceTimer = null;
    }
  }

  function abortSearch() {
    if (controller) {
      try {
        controller.abort();
      } catch {
        /* no-op */
      }
      controller = null;
    }
  }

  function clearState() {
    clearDebounce();
    abortSearch();
    activeIndex = -1;
    currentItems = [];
    currentQuery = "";
  }

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

  function safeUrl(url = "/") {
    try {
      return AppCore.utils.normalizePath(url || "/");
    } catch {
      return "/";
    }
  }

  function showContainer(container) {
    if (!container) return;
    container.hidden = false;
    container.classList.add("active");
    container.setAttribute("aria-hidden", "false");
  }

  function hideContainer(container) {
    if (!container) return;
    container.classList.remove("active");
    container.hidden = true;
    container.setAttribute("aria-hidden", "true");
    container.innerHTML = "";
    activeIndex = -1;
    currentItems = [];
  }

  function setLoading(container, query = "") {
    if (!container) return;

    container.innerHTML = `
      <div class="search-state search-state-loading" aria-live="polite">
        <div class="search-state-title">Buscando</div>
        <div class="search-state-text">
          ${escapeHtml(query ? `Buscando “${query}”...` : "Buscando...")}
        </div>
      </div>
    `;

    showContainer(container);
  }

  function setEmpty(container, query = "") {
    if (!container) return;

    container.innerHTML = `
      <div class="search-state search-state-empty" aria-live="polite">
        <div class="search-state-title">Sin resultados</div>
        <div class="search-state-text">
          ${escapeHtml(query ? `No encontramos coincidencias para “${query}”.` : "No hay resultados.")}
        </div>
      </div>
    `;

    showContainer(container);
  }

  function setError(container) {
    if (!container) return;

    container.innerHTML = `
      <div class="search-state search-state-error" aria-live="polite">
        <div class="search-state-title">No se pudo completar la búsqueda</div>
        <div class="search-state-text">
          Revisa la conexión o inténtalo de nuevo.
        </div>
      </div>
    `;

    showContainer(container);
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

  function goToResult(item = null) {
    if (!item?.url) return;

    const { container, input } = getDom();

    hideContainer(container);

    if (input) {
      input.blur();
    }

    const target = safeUrl(item.url);

    if (typeof Router.navigate === "function") {
      Router.navigate(target, {
        force: true,
      });
      return;
    }

    window.location.href = target;
  }

  /* =========================================================
     FALLBACK LOCAL
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
     NORMALIZACIÓN RESPUESTA API
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
      url: url ? safeUrl(url) : null,
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
     API SEARCH
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

    abortSearch();
    controller = new AbortController();

    try {
      const data = await AppCore.apiClient.get("/api/search", {
        query: { q: query },
        signal: controller.signal,
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

      AppCore.utils.warn?.("TopbarSearch: fallo búsqueda API", error);
      throw error;
    } finally {
      controller = null;
    }
  }

  /* =========================================================
     MERGE / SCORE
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
      (item) => `${item.type}|${item.url || ""}|${item.title || ""}|${item.subtitle || ""}`
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
     RENDER
  ========================================================= */
  function renderResults(container, results = [], query = "") {
    if (!container) return;

    container.innerHTML = "";
    activeIndex = -1;
    currentItems = [];

    if (!results.length) {
      setEmpty(container, query);
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

      items.slice(0, MAX_RESULTS_PER_GROUP).forEach((item, index) => {
        const resultEl = document.createElement("button");
        resultEl.type = "button";
        resultEl.className = "search-result";
        resultEl.dataset.type = item.type || "general";
        resultEl.dataset.url = item.url || "";
        resultEl.dataset.index = String(currentItems.length);
        resultEl.setAttribute("role", "option");
        resultEl.setAttribute("aria-selected", "false");

        resultEl.innerHTML = `
          <span class="search-icon" aria-hidden="true">${escapeHtml(getTypeIcon(item.type))}</span>
          <span class="search-text">
            <span class="search-title">${highlight(item.title || "", query)}</span>
            ${
              item.subtitle
                ? `<span class="search-subtitle">${highlight(item.subtitle || "", query)}</span>`
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
    showContainer(container);
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

  /* =========================================================
     RUN SEARCH
  ========================================================= */
  async function runSearch(query = "") {
    const { container } = getDom();
    const q = normalizeQuery(query);

    currentQuery = q;

    if (!container) return;
    if (!q || q.length < MIN_QUERY_LENGTH) {
      hideContainer(container);
      return;
    }

    setLoading(container, q);

    try {
      const [remote, local] = await Promise.all([
        searchAPI(q),
        Promise.resolve(searchLocal(q)),
      ]);

      if (currentQuery !== q) {
        return;
      }

      const merged = mergeResults(remote, local, q);
      renderResults(container, merged, q);
    } catch (error) {
      if (currentQuery !== q) {
        return;
      }

      const local = searchLocal(q);

      if (local.length) {
        renderResults(container, local, q);
        return;
      }

      setError(container);
    }
  }

  /* =========================================================
     INPUT / KEYBOARD
  ========================================================= */
  function handleInput() {
    const { input, container } = getDom();
    const value = normalizeQuery(input?.value || "");

    clearDebounce();

    if (!value) {
      hideContainer(container);
      return;
    }

    debounceTimer = window.setTimeout(() => {
      runSearch(value);
    }, SEARCH_DEBOUNCE_MS);
  }

  function handleFocus() {
    const { input, container } = getDom();
    const value = normalizeQuery(input?.value || "");

    if (value.length >= MIN_QUERY_LENGTH) {
      runSearch(value);
      return;
    }

    hideContainer(container);
  }

  function handleKeydown(event) {
    const { container, input } = getDom();
    if (!input || !container) return;
    if (document.activeElement !== input) return;

    const items = Array.from(container.querySelectorAll(".search-result"));
    if (!items.length) {
      if (event.key === "Escape") {
        hideContainer(container);
      }
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      activeIndex = Math.min(activeIndex + 1, items.length - 1);
      updateActiveItem(items);
      updateActiveVisuals(container);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      activeIndex = Math.max(activeIndex - 1, 0);
      updateActiveItem(items);
      updateActiveVisuals(container);
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
      hideContainer(container);
      input.blur();
    }
  }

  function handleDocumentClick(event) {
    const { wrap, container } = getDom();
    if (!wrap || !container) return;

    if (event.target?.closest?.(".topbar-search-wrap")) {
      return;
    }

    hideContainer(container);
  }

  /* =========================================================
     BIND / REBIND
  ========================================================= */
  function bindDomEvents() {
    const { input, container } = getDom();

    if (!input || !container) {
      return false;
    }

    AppCore.cleanup.on(SCOPE, input, "input", handleInput);
    AppCore.cleanup.on(SCOPE, input, "focus", handleFocus);
    AppCore.cleanup.on(SCOPE, document, "keydown", handleKeydown);
    AppCore.cleanup.on(SCOPE, document, "click", handleDocumentClick);

    return true;
  }

  function bindAppEvents() {
    AppCore.cleanup.event(SCOPE, "app:route:change", () => {
      const { container } = getDom();
      hideContainer(container);
    });

    AppCore.cleanup.event(SCOPE, "app:public-path:change", () => {
      const { container } = getDom();
      hideContainer(container);
    });

    AppCore.cleanup.event(SCOPE, "router:rendered", () => {
      rebind();
    });

    AppCore.cleanup.event(SCOPE, "app:route:rendered", () => {
      rebind();
    });
  }

  function destroy() {
    AppCore.cleanup.run(SCOPE);
    clearState();
    isBound = false;
  }

  function bind() {
    destroy();

    const ok = bindDomEvents();
    if (!ok) {
      return false;
    }

    bindAppEvents();
    isBound = true;

    if (AppCore.config?.debug) {
      AppCore.utils.log?.("TopbarSearch inicializado correctamente.");
    }

    return true;
  }

  function rebind() {
    const { input, container } = getDom();

    if (!input || !container) {
      isBound = false;
      return false;
    }

    return bind();
  }

  /* =========================================================
     INIT
  ========================================================= */
  function init() {
    const done = bind();

    if (!done) {
      window.setTimeout(() => {
        bind();
      }, 120);
    }

    return done;
  }

  function ready() {
    if (document.readyState === "loading") {
      document.addEventListener(
        "DOMContentLoaded",
        () => {
          init();
        },
        { once: true }
      );
      return;
    }

    init();
  }

  ready();

  /* =========================================================
     API PÚBLICA
  ========================================================= */
  return {
    init,
    bind,
    rebind,
    destroy,
    runSearch,
  };
})();
