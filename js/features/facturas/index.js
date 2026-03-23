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
   INIT (ANTI DUPLICADO)
========================= */

function init(){

  if(initialized) return;

  const root = getRoot();
  if(!root) return;

  if(!Onion.state?.user){
    return setTimeout(init, 100);
  }

  initialized = true;

  Onion.log("📄 Facturas init");

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

  root.addEventListener("click", (e)=>{

    const row = e.target.closest("tr[data-id]");
    if(!row) return;

    const id = row.dataset.id;
    if(!id) return;

    openFactura(id);

  });

}

/* =========================
   LOAD DATA
========================= */

async function loadFacturas(){

  const tbody = $("#facturas-body");
  if(!tbody) return;

  setLoading();

  try{

    const res = await Onion.fetch(Onion.config.API + "/facturas");

    const facturas = res?.facturas || res?.data || [];
    const resumen = res?.resumen || {};

    if(!Array.isArray(facturas) || facturas.length === 0){
      setEmpty();
      updateKPIs([], resumen);
      return;
    }

    render(facturas);
    updateKPIs(facturas, resumen);

  }catch(e){

    Onion.error("💥 ERROR FACTURAS:", e);
    setError();

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
      <td colspan="5">Cargando facturas...</td>
    </tr>
  `;
}

function setEmpty(){
  const el = $("#facturas-body");
  if(!el) return;

  el.innerHTML = `
    <tr>
      <td colspan="5">No hay facturas</td>
    </tr>
  `;
}

function setError(){
  const el = $("#facturas-body");
  if(!el) return;

  el.innerHTML = `
    <tr>
      <td colspan="5">Error cargando facturas</td>
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

    return `
      <tr data-id="${f.id || f.numero}" style="cursor:pointer">

        <td>#${escapeHTML(f.numero || f.id || "--")}</td>

        <td>${escapeHTML(f.cliente || "-")}</td>

        <td>${formatFecha(f.fecha)}</td>

        <td>${formatMoney(f.total)}</td>

        <td>
          <span class="badge ${estado.class}">
            ${estado.label}
          </span>
        </td>

      </tr>
    `;

  }).join("");

}

/* =========================
   KPIs (FIX IMPORTANTE)
========================= */

function updateKPIs(items, resumen){

  // 🔥 SOLO facturado = lo cobrado (pagadas)
  const totalPagado = items
    .filter(f => f.estadoPago === "pagada")
    .reduce((acc, f) => acc + Number(f.total || 0), 0);

  const totalPendiente = items
    .filter(f => f.estadoPago === "pendiente")
    .reduce((acc, f) => acc + Number(f.total || 0), 0);

  const totalEl = $("#facturas-total");
  const pagadasEl = $("#facturas-pagadas");
  const pendientesEl = $("#facturas-pendientes");

  if(totalEl) totalEl.textContent = formatMoney(totalPagado);
  if(pagadasEl) pagadasEl.textContent = items.filter(f => f.estadoPago === "pagada").length;
  if(pendientesEl) pendientesEl.textContent = items.filter(f => f.estadoPago === "pendiente").length;

}

/* =========================
   OPEN FACTURA
========================= */

function openFactura(id){

  Onion.log("📄 Abrir factura:", id);

  // 👉 OPCIÓN 1: navegación interna
  if(Onion.router){
    Onion.router.go(`/facturas/${id}`);
    return;
  }

  // 👉 OPCIÓN 2: fallback
  window.location.href = `/facturas/${id}`;

}

/* =========================
   HELPERS
========================= */

function getEstado(estado){

  const e = (estado || "").toLowerCase();

  if(e === "pagada"){
    return { label:"Pagada", class:"pagada" };
  }

  if(e === "pendiente"){
    return { label:"Pendiente", class:"pendiente" };
  }

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
