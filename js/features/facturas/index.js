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

  Onion.cleanupEvent(root, "click", (e)=>{

    // 🔥 ACCIONES
    const action = e.target.closest("[data-action]");
    if(action){
      e.stopPropagation();

      const row = action.closest("tr[data-id]");
      const id = row?.dataset.id;

      if(!id) return;

      const type = action.dataset.action;

      if(type === "download"){
        downloadFactura(id);
      }

      if(type === "send"){
        sendFactura(id);
      }

      return;
    }

    // 🔥 CLICK EN FILA
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

  if(panel){
    panel.classList.remove("ready");
  }

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
  const el = $("#facturas-body");
  if(!el) return;

  el.innerHTML = `
    <tr class="table-loading">
      <td colspan="6">Cargando facturas...</td>
    </tr>
  `;
}

function setEmpty(){
  const el = $("#facturas-body");
  if(!el) return;

  el.innerHTML = `
    <tr>
      <td colspan="6">No hay facturas</td>
    </tr>
  `;
}

function setError(){
  const el = $("#facturas-body");
  if(!el) return;

  el.innerHTML = `
    <tr>
      <td colspan="6">Error cargando facturas</td>
    </tr>
  `;
}

/* =========================
   RENDER LISTADO
========================= */

function render(items){

  const tbody = $("#facturas-body");
  if(!tbody) return;

  tbody.innerHTML = items.map(f => {

    const estado = getEstado(f.estadoPago);
    const id = f.id || f.numero;

    return `
      <tr data-id="${id}" style="cursor:pointer">
        <td>${escapeHTML(f.numero || f.id || "--")}</td>
        <td>${escapeHTML(f.cliente || "-")}</td>
        <td>${formatFecha(f.fecha)}</td>
        <td>${formatMoney(f.total)}</td>
        <td>
          <span class="badge ${estado.class}">
            ${estado.label}
          </span>
        </td>
        <td class="acciones">
          <button data-action="download">Descargar</button>
          <button data-action="send">Enviar</button>
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
}

function sendFactura(id){
  alert("Enviar factura " + id);
  // aquí luego metes API real
}

/* =========================
   KPIs
========================= */

function updateKPIs(items){

  const pagadas = items.filter(f => f.estadoPago === "pagada");
  const pendientes = items.filter(f => f.estadoPago === "pendiente");

  const totalPagado = pagadas.reduce((acc, f) => acc + Number(f.total || 0), 0);

  if($("#facturas-total")) $("#facturas-total").textContent = formatMoney(totalPagado);
  if($("#facturas-pagadas")) $("#facturas-pagadas").textContent = pagadas.length;
  if($("#facturas-pendientes")) $("#facturas-pendientes").textContent = pendientes.length;

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

  const btn = document.getElementById("volver-facturas");

  if(btn){
    Onion.cleanupEvent(btn, "click", ()=>{
      initialized = false;
      init();
    });
  }

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

function formatFecha(f){
  if(!f) return "--";

  try{
    return new Date(f).toLocaleDateString("es-ES");
  }catch{
    return "--";
  }
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
