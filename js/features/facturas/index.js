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

  loadFacturas();

  // 🔥 cleanup al salir de la vista
  Onion.onCleanup(()=>{
    initialized = false;
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

    // 🔥 soporte flexible backend
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
      <tr>

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
   KPIs
========================= */

function updateKPIs(items, resumen){

  const totalPagado = Number(resumen.totalPagado || 0);
  const totalPendiente = Number(resumen.totalPendiente || 0);
  const totalFacturado = totalPagado + totalPendiente;

  const pagadas = items.filter(f => f.estadoPago === "pagada").length;
  const pendientes = items.length - pagadas;

  const totalEl = $("#facturas-total");
  const pagadasEl = $("#facturas-pagadas");
  const pendientesEl = $("#facturas-pendientes");

  if(totalEl) totalEl.textContent = formatMoney(totalFacturado);
  if(pagadasEl) pagadasEl.textContent = pagadas;
  if(pendientesEl) pendientesEl.textContent = pendientes;

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
