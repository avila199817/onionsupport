(function(){

"use strict";

const Onion = window.Onion;

if(!Onion){
  console.error("💥 Onion no disponible (facturas)");
  return;
}

let initialized = false;

/* =========================
   ROOT / DOM
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
  if(!root) return;

  if(initialized) return;

  if(!Onion.state?.user){
    return setTimeout(init, 100);
  }

  initialized = true;

  bindEvents();
  loadFacturas();

  Onion.onCleanup(()=>{
    initialized = false;
  });

}

/* =========================
   EVENTS
========================= */

function bindEvents(){

  const root = getRoot();
  if(!root) return;

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

    const id = row.dataset.id;
    if(!id) return;

    openFactura(id);

  });

}

/* =========================
   LOAD
========================= */

async function loadFacturas(){

  const panel = getRoot();
  const tbody = $("#facturas-body");

  panel?.classList.remove("ready");

  if(!tbody) return;

  setLoading();

  try{

    const res = await Onion.fetch(Onion.config.API + "/facturas");
    const facturas = res?.facturas || res?.data || [];

    if(!Array.isArray(facturas) || facturas.length === 0){
      setEmpty();
      updateKPIs([]);
      panel?.classList.add("ready");
      return;
    }

    render(facturas);
    updateKPIs(facturas);

    requestAnimationFrame(()=>{
      panel?.classList.add("ready");
    });

  }catch(e){

    console.error("💥 ERROR FACTURAS:", e);

    setError();
    panel?.classList.add("ready");

  }

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

  tbody.innerHTML = items.map(f => {

    const estado = getEstado(f.estadoPago);
    const id = f.id || f.numero;
    const isPendiente = (f.estadoPago || "").toLowerCase() === "pendiente";

    return `
      <tr data-id="${id}" style="cursor:pointer">

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

        <td class="col-main">
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

}

/* =========================
   ACCIONES
========================= */

function downloadFactura(id){
  window.open(Onion.config.API + "/facturas/" + id + "/pdf", "_blank");
  toast("Factura descargada", "success");
}

function sendFactura(id){
  toast("Factura enviada (simulado)", "info");
}

/* 🔥 PAY PRO */
async function payFactura(id, row){

  try{

    toast("Procesando pago...", "info");

    await Onion.fetch(Onion.config.API + "/facturas/" + id + "/pagar", {
      method: "POST"
    });

    // UI update inmediata
    const badge = row.querySelector(".badge");
    if(badge){
      badge.textContent = "Pagada";
      badge.className = "badge pagada";
    }

    const payBtn = row.querySelector('[data-action="pay"]');
    if(payBtn) payBtn.remove();

    toast("Factura pagada correctamente", "success");

  }catch(e){

    console.error("💥 ERROR PAGO:", e);
    toast("Error al pagar factura", "error");

  }

}

/* =========================
   KPIs
========================= */

function updateKPIs(items){

  const pagadas = items.filter(f => f.estadoPago === "pagada");
  const pendientes = items.filter(f => f.estadoPago === "pendiente");

  const totalPagado = pagadas.reduce((acc, f) => acc + Number(f.total || 0), 0);

  $("#facturas-total") && ($("#facturas-total").textContent = formatMoney(totalPagado));
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

  root.classList.remove("ready");
  root.innerHTML = `<div class="table-loading">Cargando factura...</div>`;

  try{

    const res = await Onion.fetch(Onion.config.API + "/facturas/" + id);
    const f = res?.factura || res;

    if(!f){
      root.innerHTML = `<div>Error cargando factura</div>`;
      root.classList.add("ready");
      return;
    }

    renderFacturaDetalle(f);

    requestAnimationFrame(()=>{
      root.classList.add("ready");
    });

  }catch(e){

    console.error("💥 ERROR FACTURA DETALLE:", e);

    root.innerHTML = `<div>Error cargando factura</div>`;
    root.classList.add("ready");

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
   TOAST (🔥 PRO)
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

  setTimeout(()=>{
    el.classList.add("show");
  },10);

  setTimeout(()=>{
    el.classList.remove("show");
    setTimeout(()=> el.remove(), 300);
  },3000);

}

/* =========================
   HELPERS
========================= */

function getEstado(estado){

  const e = (estado || "").toLowerCase();

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
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/* =========================
   START
========================= */

init();

})();
