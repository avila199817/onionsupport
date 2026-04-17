/* =========================================================
   Onion SPA - Ajustes Template
   Archivo: src/views/ajustes/ajustes.table.template.js

   MODO PROVISIONAL:
   - diseño temporal
   - card mínima
   - rápido de iterar
   - foco en ajustes de cliente
========================================================= */

export function renderHeader({ items = [], state = {} } = {}) {
  return `
    <section
      class="panel-surface"
      style="
        padding:24px;
        border-radius:var(--panel-radius);
        border:1px solid var(--border-soft);
        background:var(--surface-1, var(--surface-glass));
      "
    >
      <h1
        style="
          margin:0;
          font-size:32px;
          line-height:1;
          letter-spacing:-.04em;
          color:var(--text-strong);
        "
      >
        Ajustes
      </h1>
    </section>
  `;
}

export function renderLoadingState() {
  return `
    <section
      class="panel-surface"
      style="
        padding:24px;
        border-radius:var(--panel-radius);
        border:1px solid var(--border-soft);
        background:var(--surface-1, var(--surface-glass));
      "
    >
      <strong style="color:var(--text-strong);">
        Cargando ajustes...
      </strong>
    </section>
  `;
}

export function renderErrorState(message = "No se pudo cargar la colección.") {
  return `
    <section
      class="panel-surface"
      style="
        padding:24px;
        border-radius:var(--panel-radius);
        border:1px solid color-mix(in srgb, var(--danger-strong, #ff6b6b) 26%, var(--border-soft));
        background:var(--surface-1, var(--surface-glass));
      "
    >
      <strong
        style="
          display:block;
          margin-bottom:8px;
          color:var(--danger-strong, #ff6b6b);
        "
      >
        Error
      </strong>

      <p
        style="
          margin:0;
          color:var(--text-dim);
          line-height:1.5;
        "
      >
        ${String(message || "No se pudo cargar la colección.")}
      </p>
    </section>
  `;
}

export function renderEmptyState() {
  return `
    <section
      class="panel-surface"
      style="
        padding:24px;
        border-radius:var(--panel-radius);
        border:1px solid var(--border-soft);
        background:var(--surface-1, var(--surface-glass));
      "
    >
      <strong style="color:var(--text-strong);">
        No hay ajustes
      </strong>
    </section>
  `;
}

export function renderTable({ items = [], state = {} } = {}) {
  const list = Array.isArray(items) ? items : [];
  const loading = Boolean(state?.loading);
  const error = state?.error || "";

  if (loading && !list.length) {
    return renderLoadingState();
  }

  if (error && !list.length) {
    return renderErrorState(error);
  }

  if (!list.length) {
    return renderEmptyState();
  }

  return `
    <section
      class="ajustes-simple-grid"
      style="
        display:grid;
        gap:14px;
        grid-template-columns:repeat(auto-fill,minmax(260px,1fr));
      "
    >
      ${list
        .map((item) => {
          const clientName =
            item?.cliente?.nombre ||
            item?.cliente?.name ||
            item?.client?.name ||
            item?.clientName ||
            item?.company ||
            item?.empresa ||
            item?.title ||
            item?.name ||
            "Cliente";

          return `
            <article
              class="panel-surface"
              style="
                padding:18px;
                border-radius:18px;
                border:1px solid var(--border-soft);
                background:var(--surface-1, var(--surface-glass));
                box-shadow:var(--shadow-sm);
              "
            >
              <span
                style="
                  display:block;
                  font-size:12px;
                  color:var(--text-dim);
                  text-transform:uppercase;
                  letter-spacing:.06em;
                  margin-bottom:8px;
                "
              >
                Ajuste
              </span>

              <h3
                style="
                  margin:0;
                  font-size:18px;
                  color:var(--text-strong);
                  line-height:1.2;
                "
              >
                Hola ${String(clientName)}
              </h3>
            </article>
          `;
        })
        .join("")}
    </section>
  `;
}

export function renderCards({ items = [], state = {} } = {}) {
  return renderTable({ items, state });
}

export default {
  renderHeader,
  renderLoadingState,
  renderErrorState,
  renderEmptyState,
  renderTable,
  renderCards,
};
