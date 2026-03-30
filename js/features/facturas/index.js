(function(){

"use strict";

const Onion = window.Onion;

if(!Onion){
  console.error("💥 Onion no disponible (facturas)");
  return;
}

let initialized = false;
let state = {
  facturas: [],
  filtered: []
};

/* =========================
   ROOT
========================= */

function getRoot(){
  return document.querySelector(".panel-content.facturas");
}

function $(selector){
  return getRoot()?.querySelector(selector);
}

/* =========================
   INIT
========================= */

function init(){

  const root = getRoot();
  if(!root || initialized) return;

  if(!Onion.state?.user){
    return setTimeout(init, 100);
  }

  initialized = true;

  bindEvents();
  loadFacturas();

  Onion.onCleanup(()=>{
    initialized = false;
    state.facturas = [];
    state.filtered = [];
  });

}

/* =========================
   EVENTS
========================= */

function bindEvents(){

  const root = getRoot();
  if(!root) return;

  // CLICK GLOBAL
  Onion.cleanupEvent(root, "click", async (e)=>{

    const action = e.target.closest("[data-action]");
    if(action){
      e.stopPropagation();

      const row = action.closest("tr[data-id]");
      const id = row?.dataset.id;
      if(!id) return;

      const type = action.dataset.action;

      if(type === "download") return downloadFactura(id);
      if(type === "send") return sendFactura(id);
      if(type === "pay") return payFactura(id, row);

      return;
    }

    const row = e.target.closest("tr[data-id]");
    if(!row) return;

    openFactura(row.dataset.id);

  });

  // SEARCH (DEBOUNCE)
  const search = $("#search-factura");
  if(search){
    let t;
    search.addEventListener("input", ()=>{
      clearTimeout(t);
      t = setTimeout(applyFilters, 250);
    });
  }

  // FILTER ESTADO
  const estado = $("#filter-estado-factura");
  if(estado){
    estado.addEventListener("change", applyFilters);
  }

}

/* =========================
   LOAD
========================= */

async function loadFacturas(){

  const panel = getRoot();
  const tbody = $("#facturas-body");

  if(!tbody) return;

  setLoading();

  try{

    const res = await Onion.fetch(Onion.config.API + "/facturas");
    const data = res?.facturas || res?.data || [];

    state.facturas = Array.isArray(data) ? data : [];
    state.filtered = [...state.facturas];

    if(state.facturas.length === 0){
      setEmpty();
      updateKPIs([]);
      return;
    }

    render(state.filtered);
    updateKPIs(state.facturas);

    panel?.classList.add("ready");

  }catch(e){

    console.error("💥 ERROR FACTURAS:", e);
    setError();

  }

}

/* =========================
   FILTERS
========================= */

function applyFilters(){

  const search = ($("#search-factura")?.value || "").toLowerCase();
  const estado = ($("#filter-estado-factura")?.value || "").toLowerCase();

  state.filtered = state.facturas.filter(f => {

    const matchSearch =
      !search ||
      (f.cliente || "").toLowerCase().includes(search) ||
      String(f.numero || f.id).includes(search);

    const matchEstado =
      !estado ||
      (f.estadoPago || "").toLowerCase() === estado;

    return matchSearch && matchEstado;

  });

  render(state.filtered);

}

/* =========================
   STATES
========================= */

function setLoading(){
  $("#facturas-body").innerHTML = `
    <tr class="table-loading">
      <td colspan="6">Cargando facturas...</td>
    </tr>
  `;
}

function setEmpty(){
  $("#facturas-body").innerHTML = `
    <tr>
      <td colspan="6">No hay facturas</td>
    </tr>
  `;
}

function setError(){
  $("#facturas-body").innerHTML = `
    <tr>
      <td colspan="6">Error cargando facturas</td>
    </tr>
  `;
}

/* =========================
   RENDER
========================= */

function render(items){

  const tbody = $("#facturas-body");
  if(!tbody) return;

  if(!items.length){
    return setEmpty();
  }

  const html = items.map(f => {

    const estado = getEstado(f.estadoPago);
    const id = f.id || f.numero;
    const isPendiente = estado.class === "pendiente";

    return `
      <tr data-id="${id}" class="row">

        <td class="col-id">
          ${escapeHTML(f.numero || f.id || "--")}
        </td>

        <td class="col-main">
          <div class="cell-user">
            <div class="table-avatar">
              ${getInitials(f.cliente)}
            </div>
            <div class="user-info">
              <div class="user-name">${escapeHTML(f.cliente || "-")}</div>
              <div class="user-sub">Cliente</div>
            </div>
          </div>
        </td>

        <td class="col-date">
          ${formatFecha(f.fecha)}
        </td>

        <td class="col-importe">
          ${formatMoney(f.total)}
        </td>

        <td class="col-status">
          <span class="badge ${estado.class}">
            ${estado.label}
          </span>
        </td>

        <td class="col-actions">
          <div class="actions">

            <button class="btn-action" data-action="download">
              Descargar
            </button>

            <button class="btn-action" data-action="send">
              Enviar
            </button>

            ${
              isPendiente ? `
                <button class="btn-action btn-pay" data-action="pay">
                  Pagar
                </button>
              ` : ""
            }

          </div>
        </td>

      </tr>
    `;

  }).join("");

  tbody.innerHTML = html;

}

/* =========================
   ACTIONS
========================= */

function downloadFactura(id){
  window.open(Onion.config.API + "/facturas/" + id + "/pdf", "_blank");
  toast("Factura descargada", "success");
}

function sendFactura(id){
  toast("Factura enviada", "info");
}

async function payFactura(id, row){

  try{

    toast("Procesando pago...", "info");

    await Onion.fetch(Onion.config.API + "/facturas/" + id + "/pagar", {
      method: "POST"
    });

    // UPDATE LOCAL STATE
    const f = state.facturas.find(x => (x.id || x.numero) == id);
    if(f) f.estadoPago = "pagada";

    // UPDATE UI
    const badge = row.querySelector(".badge");
    if(badge){
      badge.textContent = "Pagada";
      badge.className = "badge pagada";
    }

    row.querySelector('[data-action="pay"]')?.remove();

    updateKPIs(state.facturas);

    toast("Factura pagada", "success");

  }catch(e){

    console.error("💥 ERROR PAGO:", e);
    toast("Error al pagar", "error");

  }

}

/* =========================
   KPIs
========================= */

function updateKPIs(items){

  const pagadas = items.filter(f => f.estadoPago === "pagada");
  const pendientes = items.filter(f => f.estadoPago === "pendiente");

  const total = pagadas.reduce((acc, f) => acc + Number(f.total || 0), 0);

  $("#facturas-total") && ($("#facturas-total").textContent = formatMoney(total));
  $("#facturas-pagadas") && ($("#facturas-pagadas").textContent = pagadas.length);
  $("#facturas-pendientes") && ($("#facturas-pendientes").textContent = pendientes.length);

}

/* =========================
   DETALLE
========================= */

function openFactura(id){
  loadFacturaDetalle(id);
}

async function loadFacturaDetalle(id){

  const root = getRoot();
  if(!root) return;

  root.innerHTML = `<div class="table-loading">Cargando factura...</div>`;

  try{

    const res = await Onion.fetch(Onion.config.API + "/facturas/" + id);
    const f = res?.factura || res;

    if(!f){
      root.innerHTML = `<div>Error cargando factura</div>`;
      return;
    }

    renderFacturaDetalle(f);

  }catch(e){

    console.error("💥 ERROR DETALLE:", e);
    root.innerHTML = `<div>Error cargando factura</div>`;

  }

}

function renderFacturaDetalle(f){

  const root = getRoot();

  root.innerHTML = `
    <div class="factura-detalle">

      <button id="volver-facturas">← Volver</button>

      <h2>Factura #${escapeHTML(f.numero || f.id)}</h2>

      <p><strong>Cliente:</strong> ${escapeHTML(f.cliente || "-")}</p>
      <p><strong>Fecha:</strong> ${formatFecha(f.fecha)}</p>
      <p><strong>Estado:</strong> ${escapeHTML(f.estadoPago)}</p>

      <h3>Total</h3>
      <p>${formatMoney(f.total)}</p>

      ${
        f.items?.length ? `
          <h3>Conceptos</h3>
          <ul>
            ${f.items.map(i => `
              <li>${escapeHTML(i.descripcion)} - ${formatMoney(i.precio)}</li>
            `).join("")}
          </ul>
        ` : ""
      }

    </div>
  `;

  document.getElementById("volver-facturas")?.addEventListener("click", ()=>{
    initialized = false;
    init();
  });

}

/* =========================
   TOAST
========================= */

function toast(msg, type="info"){

  let container = document.getElementById("toast-container");

  if(!container){
    container = document.createElement("div");
    container.id = "toast-container";
    document.body.appendChild(container);
  }

  const el = document.createElement("div");
  el.className = "toast toast-" + type;
  el.textContent = msg;

  container.appendChild(el);

  requestAnimationFrame(()=> el.classList.add("show"));

  setTimeout(()=>{
    el.classList.remove("show");
    setTimeout(()=> el.remove(), 300);
  },2500);

}

/* =========================
   HELPERS
========================= */

function getEstado(e){
  e = (e || "").toLowerCase();
  if(e === "pagada") return { label:"Pagada", class:"pagada" };
  if(e === "pendiente") return { label:"Pendiente", class:"pendiente" };
  return { label:"Borrador", class:"borrador" };
}

function getInitials(name){
  if(!name) return "?";
  return name.split(" ").map(n => n[0]).join("").slice(0,2).toUpperCase();
}

function formatFecha(f){
  if(!f) return "--";
  return new Date(f).toLocaleDateString("es-ES");
}

function formatMoney(n){
  return Number(n || 0).toLocaleString("es-ES", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }) + " €";
}

function escapeHTML(str){
  return String(str)
    .replace(/&/g,"&amp;")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;");
}

/* =========================
   START
========================= */

init();

})();
