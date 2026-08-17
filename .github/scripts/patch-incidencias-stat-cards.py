from pathlib import Path
import re

TEMPLATE_PATH = Path("src/views/incidencias/incidencias.template.js")
INDEX_PATH = Path("src/views/incidencias/index.js")
CSS_PATH = Path("src/css/views/incidencias/index.css")


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected 1 match, got {count}")
    return text.replace(old, new, 1)


def regex_once(text, pattern, replacement, label, flags=0):
    out, count = re.subn(pattern, replacement, text, count=1, flags=flags)
    if count != 1:
        raise SystemExit(f"{label}: expected 1 regex match, got {count}")
    return out


# ==========================================================
# TEMPLATE: one canonical filtering/sorting implementation
# ==========================================================
t = TEMPLATE_PATH.read_text(encoding="utf-8")

t = replace_once(
    t,
    'export const INCIDENCIAS_TEMPLATE_VERSION = "incidencias.template.extreme.v20";',
    'export const INCIDENCIAS_TEMPLATE_VERSION = "incidencias.template.extreme.v21.interactive-stats";',
    "template version",
)

t = replace_once(
    t,
    '  FILTER: "filter",\n  SORT_TOGGLE: "sort-toggle",',
    '  FILTER: "filter",\n  STAT_APPLY: "stat-apply",\n  SORT_TOGGLE: "sort-toggle",',
    "stat action",
)

t = replace_once(
    t,
    'const DEFAULT_SORT_ORDER = "desc";\nconst TABLE_SCALE = "110";',
    'const DEFAULT_SORT_ORDER = "desc";\nconst DEFAULT_SORT_MODE = "date";\nconst TABLE_SCALE = "110";',
    "sort mode constant",
)

t = replace_once(
    t,
    '  { key: "closed", label: "Cerradas" },\n]);',
    '  { key: "closed", label: "Cerradas" },\n  { key: "urgent", label: "Urgentes" },\n]);',
    "urgent filter tab",
)

normalize_block = r'''function normalizeFilter(v = "all") {
  const k = key(v || "all");
  if (["all", "todas", "todos"].includes(k)) return "all";
  if (["open", "abiertas", "abiertos", "active", "activas", "activos", "pending", "progress", "in_progress"].includes(k)) return "open";
  if (["closed", "cerradas", "cerrados", "resolved", "resueltas", "resueltos"].includes(k)) return "closed";
  if (["urgent", "urgentes", "critical", "critica", "criticas", "critico", "criticos", "high", "alta", "altas"].includes(k)) return "urgent";
  return "all";
}

function normalizeSort(v = DEFAULT_SORT_ORDER) {
  const k = key(v || DEFAULT_SORT_ORDER);
  return ["asc", "ascending", "menor", "menor_mayor", "menor_a_mayor", "menor-a-mayor", "oldest"].includes(k) ? "asc" : "desc";
}

function normalizeSortMode(v = DEFAULT_SORT_MODE) {
  const k = key(v || DEFAULT_SORT_MODE);
  return ["amount", "importe", "invoice", "factura", "billing"].includes(k) ? "amount" : "date";
}

const sortLabel = (o = DEFAULT_SORT_ORDER, mode = DEFAULT_SORT_MODE) => {
  const direction = normalizeSort(o) === "asc" ? "↑" : "↓";
  return normalizeSortMode(mode) === "amount" ? `Importe ${direction}` : `Fecha ${direction}`;
};
const nextSort = (o = DEFAULT_SORT_ORDER) => (normalizeSort(o) === "asc" ? "desc" : "asc");
'''

t = regex_once(
    t,
    r'function normalizeFilter\(v = "all"\) \{.*?const nextSort = \(o = DEFAULT_SORT_ORDER\) => \(normalizeSort\(o\) === "asc" \? "desc" : "asc"\);\n',
    normalize_block,
    "normalizers",
    flags=re.S,
)

sort_items = r'''function sortItems(items = [], order = DEFAULT_SORT_ORDER, mode = DEFAULT_SORT_MODE) {
  const dir = normalizeSort(order) === "asc" ? 1 : -1;
  const sortMode = normalizeSortMode(mode);

  return [...arr(items)].sort((a, b) => {
    if (sortMode === "amount") {
      const amountDiff = getInvoiceTotal(a) - getInvoiceTotal(b);
      if (amountDiff) return amountDiff * dir;

      const timeDiff = itemTime(b) - itemTime(a);
      if (timeDiff) return timeDiff;

      return getId(a).localeCompare(getId(b), "es", { numeric: true, sensitivity: "base" });
    }

    const diff = itemTime(a) - itemTime(b);
    if (diff) return diff * dir;
    return getId(a).localeCompare(getId(b), "es", { numeric: true, sensitivity: "base" }) * dir;
  });
}
'''

t = regex_once(
    t,
    r'function sortItems\(items = \[\], order = DEFAULT_SORT_ORDER\) \{.*?\n\}\n\nfunction itemMatchesFilter',
    sort_items + "\nfunction itemMatchesFilter",
    "sort items",
    flags=re.S,
)

t = replace_once(
    t,
    '  if (f === "closed") return isClosed(it);\n  return true;',
    '  if (f === "closed") return isClosed(it);\n  if (f === "urgent") return isUrgent(it);\n  return true;',
    "urgent item filter",
)

t = replace_once(
    t,
    "  const counts = { all: 0, open: 0, closed: 0 };",
    "  const counts = { all: 0, open: 0, closed: 0, urgent: 0 };",
    "urgent filter count shape",
)

t = replace_once(
    t,
    "    if (isClosed(item)) counts.closed += 1;\n  }",
    "    if (isClosed(item)) counts.closed += 1;\n    if (isUrgent(item)) counts.urgent += 1;\n  }",
    "urgent filter count increment",
)

t = replace_once(
    t,
    '  const order = normalizeSort(first(d.sortOrder, d.order, d.sort?.order, d.sort?.direction, DEFAULT_SORT_ORDER));\n  const visibleLimit = Math.max(1, num(d.visibleLimit, DEFAULT_VISIBLE_ROWS));\n  const filtered = sortItems(items.filter((it) => itemMatchesFilter(it, filter)).filter((it) => itemMatchesSearch(it, search)), order);',
    '  const order = normalizeSort(first(d.sortOrder, d.order, d.sort?.order, d.sort?.direction, DEFAULT_SORT_ORDER));\n  const sortMode = normalizeSortMode(first(d.sortMode, d.sort?.mode, d.sort?.field, DEFAULT_SORT_MODE));\n  const visibleLimit = Math.max(1, num(d.visibleLimit, DEFAULT_VISIBLE_ROWS));\n  const filtered = sortItems(items.filter((it) => itemMatchesFilter(it, filter)).filter((it) => itemMatchesSearch(it, search)), order, sortMode);',
    "build vm sort mode",
)

t = replace_once(
    t,
    '    sortOrder: order,\n    sortLabel: sortLabel(order),\n    nextSortOrder: nextSort(order),\n    nextSortLabel: sortLabel(nextSort(order)),',
    '    sortOrder: order,\n    sortMode,\n    sortLabel: sortLabel(order, sortMode),\n    nextSortOrder: nextSort(order),\n    nextSortLabel: sortLabel(nextSort(order), sortMode),',
    "vm sort fields",
)

stats_markup = r'''      <div class="incidencias-stats" aria-label="Accesos rápidos del historial">
        <button type="button" class="incidencias-stat-card incidencias-stat-card--open${vm.filter === "open" && vm.sortMode !== "amount" ? " is-active" : ""}" data-incidencias-action="${INCIDENCIAS_ACTIONS.STAT_APPLY}" data-stat="open" aria-pressed="${vm.filter === "open" && vm.sortMode !== "amount" ? "true" : "false"}" aria-label="Mostrar solo incidencias abiertas">
          <div class="incidencias-stat-label">Abiertas</div>
          <div class="incidencias-stat-value">${esc(formatNumber(s.open))}</div>
          <div class="incidencias-stat-text">Solicitudes activas, pendientes o en proceso.</div>
        </button>
        <button type="button" class="incidencias-stat-card incidencias-stat-card--closed${vm.filter === "closed" && vm.sortMode !== "amount" ? " is-active" : ""}" data-incidencias-action="${INCIDENCIAS_ACTIONS.STAT_APPLY}" data-stat="closed" aria-pressed="${vm.filter === "closed" && vm.sortMode !== "amount" ? "true" : "false"}" aria-label="Mostrar solo incidencias cerradas">
          <div class="incidencias-stat-label">Cerradas</div>
          <div class="incidencias-stat-value">${esc(formatNumber(s.closed))}</div>
          <div class="incidencias-stat-text">Casos resueltos o cerrados.</div>
        </button>
        <button type="button" class="incidencias-stat-card incidencias-stat-card--urgent${vm.filter === "urgent" && vm.sortMode !== "amount" ? " is-active" : ""}" data-incidencias-action="${INCIDENCIAS_ACTIONS.STAT_APPLY}" data-stat="urgent" aria-pressed="${vm.filter === "urgent" && vm.sortMode !== "amount" ? "true" : "false"}" aria-label="Mostrar solo incidencias urgentes o críticas">
          <div class="incidencias-stat-label">Urgentes</div>
          <div class="incidencias-stat-value">${esc(formatNumber(s.urgent))}</div>
          <div class="incidencias-stat-text">Incidencias marcadas como urgentes o críticas.</div>
        </button>
        <button type="button" class="incidencias-stat-card incidencias-stat-card--amount${vm.sortMode === "amount" ? " is-active" : ""}" data-incidencias-action="${INCIDENCIAS_ACTIONS.STAT_APPLY}" data-stat="amount" aria-pressed="${vm.sortMode === "amount" ? "true" : "false"}" aria-label="Ordenar incidencias por importe asociado de mayor a menor">
          <div class="incidencias-stat-label">Importe asociado</div>
          <div class="incidencias-stat-value">${esc(formatMoney(s.invoiceTotal, DEFAULT_CURRENCY))}</div>
          <div class="incidencias-stat-text">Ordenar incidencias de mayor a menor importe.</div>
        </button>
      </div>'''

t = regex_once(
    t,
    r'      <div class="incidencias-stats">.*?      </div>\n    </section>',
    stats_markup + "\n    </section>",
    "interactive stat cards markup",
    flags=re.S,
)

render_filters = r'''function renderFilters(vm = {}) {
  const order = normalizeSort(vm.sortOrder);
  const sortMode = normalizeSortMode(vm.sortMode);
  const next = nextSort(order);
  const currentSortLabel = sortLabel(order, sortMode);
  const nextSortLabel = sortLabel(next, sortMode);
  const sortIcon = sortMode === "amount" ? "euro" : "calendar";

  return `
    <div class="incidencias-filters" data-incidencias-filters="true">
      <div class="incidencias-filter-pills" role="tablist" aria-label="Filtrar incidencias">
        ${FILTERS.map((f) => {
          const active = f.key === vm.filter;
          return `<button type="button" role="tab" class="incidencias-filter-pill${active ? " is-active" : ""}" data-incidencias-action="${INCIDENCIAS_ACTIONS.FILTER}" data-filter="${at(f.key)}" aria-selected="${active ? "true" : "false"}" aria-pressed="${active ? "true" : "false"}"><span>${esc(f.label)}</span><strong>${esc(formatNumber(vm.filterCounts?.[f.key] || 0))}</strong></button>`;
        }).join("")}
      </div>
      <div class="incidencias-sort-pills" data-incidencias-sort-pills="true">
        <button type="button" class="incidencias-sort-pill is-active" data-incidencias-action="${INCIDENCIAS_ACTIONS.SORT_TOGGLE}" data-sort-mode="${at(sortMode)}" data-sort-order="${at(order)}" data-next-sort-order="${at(next)}" aria-pressed="true" aria-label="Cambiar orden a ${at(nextSortLabel)}" title="Cambiar orden a ${at(nextSortLabel)}">${icon(sortIcon)}<span>${esc(currentSortLabel)}</span></button>
      </div>
      ${renderSearch(vm)}
    </div>
  `;
}
'''

t = regex_once(
    t,
    r'function renderFilters\(vm = \{\}\) \{.*?\n\}\n\n/\* =========================================================\n   TABLE / STATES',
    render_filters + "\n/* =========================================================\n   TABLE / STATES",
    "filters render",
    flags=re.S,
)

t = replace_once(
    t,
    'data-table-scale="${at(TABLE_SCALE)}" data-sort-order="${at(vm.sortOrder)}">',
    'data-table-scale="${at(TABLE_SCALE)}" data-sort-mode="${at(vm.sortMode)}" data-sort-order="${at(vm.sortOrder)}">',
    "table sort mode attr",
)

t = replace_once(
    t,
    'const criteria = [vm.filter !== "all" ? activeLabel : "", vm.search ? `búsqueda “${vm.search}”` : ""].filter(Boolean);',
    'const criteria = [vm.filter !== "all" ? activeLabel : "", vm.search ? `búsqueda “${vm.search}”` : ""].filter(Boolean);\n  const activeSortLabel = sortLabel(vm.sortOrder, vm.sortMode).toLowerCase();',
    "history active sort label",
)

t = replace_once(
    t,
    '      ? `Mostrando ${formatNumber(vm.visibleCount)} de ${formatNumber(vm.filteredTotal)}${criteria.length ? ` · ${criteria.join(" · ")}` : ""} · orden ${sortLabel(vm.sortOrder).toLowerCase()}`\n      : `Mostrando ${formatNumber(vm.visibleCount)} de ${formatNumber(vm.total)} · orden ${sortLabel(vm.sortOrder).toLowerCase()}`;',
    '      ? `Mostrando ${formatNumber(vm.visibleCount)} de ${formatNumber(vm.filteredTotal)}${criteria.length ? ` · ${criteria.join(" · ")}` : ""} · orden ${activeSortLabel}`\n      : `Mostrando ${formatNumber(vm.visibleCount)} de ${formatNumber(vm.total)} · orden ${activeSortLabel}`;',
    "history sort subtitle",
)

TEMPLATE_PATH.write_text(t, encoding="utf-8")


# ==========================================================
# CONTROLLER: state/actions only; template owns filtering/sorting
# ==========================================================
i = INDEX_PATH.read_text(encoding="utf-8")

i = replace_once(
    i,
    '"incidencias.index.extreme.v28.close-confirm-loader";',
    '"incidencias.index.extreme.v29.interactive-stats";',
    "index version",
)

i = replace_once(
    i,
    'const DEFAULT_SORT_ORDER = "desc";\n\nconst USER_SEARCH_MIN_LENGTH',
    'const DEFAULT_SORT_ORDER = "desc";\nconst DEFAULT_SORT_MODE = "date";\n\nconst USER_SEARCH_MIN_LENGTH',
    "index sort mode constant",
)

i = replace_once(
    i,
    '  let sortOrder =\n    DEFAULT_SORT_ORDER;\n\n  let visibleLimit =',
    '  let sortOrder =\n    DEFAULT_SORT_ORDER;\n\n  let sortMode =\n    DEFAULT_SORT_MODE;\n\n  let visibleLimit =',
    "controller sort mode state",
)

i = replace_once(
    i,
    '      sortOrder,\n      visibleLimit,',
    '      sortOrder,\n      sortMode,\n      visibleLimit,',
    "payload sort mode",
)

# This implementation duplicated template filtering and was not called.
i = regex_once(
    i,
    r'\n  function filteredItems\(\) \{.*?\n  \}\n\n  function viewPayload',
    '\n  function viewPayload',
    "remove duplicate filteredItems",
    flags=re.S,
)

set_filter_block = r'''  function setFilter(
    value = "all"
  ) {
    filter =
      cleanText(
        value,
        "all"
      ) ||
      "all";

    sortMode =
      DEFAULT_SORT_MODE;

    sortOrder =
      DEFAULT_SORT_ORDER;

    visibleLimit =
      DEFAULT_VISIBLE_LIMIT;

    renderWithFilteredItems();

    return true;
  }

  function applyStatAction(
    value = ""
  ) {
    const stat =
      cleanText(
        value,
        ""
      ).toLowerCase();

    if (
      ![
        "open",
        "closed",
        "urgent",
        "amount",
      ].includes(stat)
    ) {
      return false;
    }

    search = "";
    visibleLimit =
      DEFAULT_VISIBLE_LIMIT;

    if (stat === "amount") {
      filter = "all";
      sortMode = "amount";
      sortOrder = "desc";
    } else {
      filter = stat;
      sortMode = DEFAULT_SORT_MODE;
      sortOrder = DEFAULT_SORT_ORDER;
    }

    renderWithFilteredItems();
    return true;
  }
'''

i = regex_once(
    i,
    r'  function setFilter\(\n    value = "all"\n  \) \{.*?\n  \}\n\n  function clearFilters',
    set_filter_block + "\n  function clearFilters",
    "set filter and stat action",
    flags=re.S,
)

i = replace_once(
    i,
    '    filter = "all";\n    search = "";\n\n    visibleLimit =',
    '    filter = "all";\n    search = "";\n    sortMode = DEFAULT_SORT_MODE;\n    sortOrder = DEFAULT_SORT_ORDER;\n\n    visibleLimit =',
    "clear filters sort reset",
)

i = replace_once(
    i,
    '    if (\n      type ===\n      INCIDENCIAS_ACTIONS.FILTER\n    ) {',
    '    if (\n      type ===\n      INCIDENCIAS_ACTIONS.STAT_APPLY\n    ) {\n      return applyStatAction(\n        node?.dataset?.stat ||\n        ""\n      );\n    }\n\n    if (\n      type ===\n      INCIDENCIAS_ACTIONS.FILTER\n    ) {',
    "stat action handler",
)

i = replace_once(
    i,
    '       viewPayload() ya aplica filteredItems().\n       No mutamos `items` temporalmente; evita condiciones de carrera\n       con requestAnimationFrame.',
    '       El template aplica filtro y orden desde viewPayload().\n       `items` sigue siendo la colección canónica; evitamos duplicar\n       la lógica de filtrado/orden en el controlador.',
    "list rendering comment",
)

INDEX_PATH.write_text(i, encoding="utf-8")


# ==========================================================
# CSS: button semantics + active/focus feedback
# ==========================================================
c = CSS_PATH.read_text(encoding="utf-8")

c = replace_once(
    c,
    '  --inc-stat-color: var(--inc-blue);\n  --inc-stat-color-2: var(--inc-cyan);\n\n  position: relative;',
    '  --inc-stat-color: var(--inc-blue);\n  --inc-stat-color-2: var(--inc-cyan);\n\n  appearance: none;\n  inline-size: 100%;\n  margin: 0;\n  color: inherit;\n  font: inherit;\n  text-align: start;\n  cursor: pointer;\n  -webkit-tap-highlight-color: transparent;\n  user-select: none;\n\n  position: relative;',
    "stat button reset",
)

active_css = r'''
.incidencias-stat-card:active {
  transform: translateY(-1px) scale(.992);
}

.incidencias-stat-card:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--inc-stat-color) 72%, #ffffff 28%);
  outline-offset: 3px;
}

.incidencias-stat-card.is-active,
.incidencias-stat-card[aria-pressed="true"] {
  border-color: color-mix(in srgb, var(--inc-stat-color) 72%, rgba(255, 255, 255, .30));

  box-shadow:
    0 24px 74px rgba(0, 0, 0, .44),
    inset 0 0 0 1px color-mix(in srgb, var(--inc-stat-color) 18%, transparent),
    inset 0 1px 0 rgba(255, 255, 255, .11),
    0 0 64px color-mix(in srgb, var(--inc-stat-color) 21%, transparent);
}

.incidencias-stat-card.is-active::before,
.incidencias-stat-card[aria-pressed="true"]::before {
  block-size: 2px;
  opacity: 1;
}
'''

c = replace_once(
    c,
    '.incidencias-stat-card > * {\n  position: relative;',
    active_css + '\n.incidencias-stat-card > * {\n  position: relative;',
    "stat active css",
)

CSS_PATH.write_text(c, encoding="utf-8")

print("Incidencias interactive stat cards patch applied")
