/* =========================================================
   Onion SPA - Clientes View
   Archivo: src/views/clientesView.js

   Responsabilidades:
   - renderizar listado de clientes en formato cards
   - consumir API /api/clientes
   - gestionar estados: loading / empty / error
   - mantener consistencia visual con el panel SaaS
========================================================= */

import { AppCore } from "../core/core.js";
import { Toast } from "../ui/toast.js";

export const ClientesView = (() => {
  "use strict";

  /* =========================================================
     API
  ========================================================= */

  const API_ENDPOINT = `${AppCore.config.apiBase}/api/clientes`;

  /* =========================================================
     HELPERS
  ========================================================= */

  function escapeHtml(value = "") {
    return AppCore.utils.escapeHtml(String(value ?? ""));
  }

  function getView() {
    return AppCore.dom.viewContainer;
  }

  async function fetchClientes() {
    const token = AppCore.state.token;

    const res = await fetch(API_ENDPOINT, {
      headers: {
        "Content-Type": "application/json",
        Authorization: token ? `Bearer ${token}` : "",
      },
    });

    if (!res.ok) {
      throw new Error("API_ERROR");
    }

    return res.json();
  }

  /* =========================================================
     RENDER STATES
  ========================================================= */

  function renderLoading() {
    const view = getView();

    view.innerHTML = `
      <section class="content-wrapper">
        <div class="panel-block" style="padding:24px;">
          <p style="margin:0; color:var(--text-dim);">
            Cargando clientes...
          </p>
        </div>
      </section>
    `;
  }

  function renderError() {
    const view = getView();

    view.innerHTML = `
      <section class="content-wrapper">
        <div class="panel-block" style="padding:24px;">
          <p style="margin:0; color:var(--error);">
            Error cargando clientes
          </p>
        </div>
      </section>
    `;
  }

  function renderEmpty() {
    const view = getView();

    view.innerHTML = `
      <section class="content-wrapper">
        <div class="panel-block" style="padding:24px;">
          <p style="margin:0; color:var(--text-dim);">
            No hay clientes todavía.
          </p>
        </div>
      </section>
    `;
  }

  /* =========================================================
     CARD TEMPLATE
  ========================================================= */

  function clienteCard(c) {
    const name = escapeHtml(c.nombre || c.name || "Cliente");
    const email = escapeHtml(c.email || "-");
    const id = escapeHtml(c.id || "-");

    return `
      <div class="panel-block" style="padding:20px;">
        <div style="display:grid; gap:10px;">
          
          <div style="font-weight:600; font-size:15px;">
            ${name}
          </div>

          <div style="font-size:13px; color:var(--text-dim);">
            ${email}
          </div>

          <div style="font-size:12px; color:var(--text-dim);">
            ID: ${id}
          </div>

        </div>
      </div>
    `;
  }

  /* =========================================================
     MAIN RENDER
  ========================================================= */

  function renderClientes(clientes = []) {
    const view = getView();

    view.innerHTML = `
      <section class="content-wrapper">
        
        <div style="
          display:grid;
          gap:16px;
          grid-template-columns:repeat(auto-fill, minmax(260px, 1fr));
        ">
          ${clientes.map(clienteCard).join("")}
        </div>

      </section>
    `;
  }

  /* =========================================================
     INIT
  ========================================================= */

  async function render() {
    try {
      renderLoading();

      const data = await fetchClientes();

      const clientes = data?.items || data || [];

      if (!clientes.length) {
        return renderEmpty();
      }

      renderClientes(clientes);

    } catch (err) {
      console.error("CLIENTES VIEW ERROR:", err);

      Toast.error("No se pudieron cargar los clientes");

      renderError();
    }
  }

  /* =========================================================
     API
  ========================================================= */

  return {
    render,
  };

})();
