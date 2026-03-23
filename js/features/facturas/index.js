(function(){

"use strict";

console.log("✅ Facturas FULL PRO cargado");


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

  const Onion = window.Onion;

  if(!Onion || !Onion.state?.user){
    return setTimeout(init, 100);
  }

  loadFacturas();

}

init();


/* =========================
   LOAD
========================= */

async function loadFacturas(){

  const tbody = $("#facturas-body");
  if(!tbody) return;

  setLoading();

  try{

    const res = await Onion.fetch(Onion.config.API + "/facturas");

    if(!res || !res.ok){
      throw new Error("Respuesta inválida");
    }

    const facturas = res.facturas || [];
    const resumen = res.resumen || {};

    if(!facturas.length){
      setEmpty();
      updateKPIs([], resumen);
      return;
    }

    render(facturas);
    updateKPIs(facturas, resumen);

  }catch(e){

    console.error("💥 ERROR FACTURAS:", e);
    setError();

  }

}


/* =========================
   STATES
========================= */

function setLoading(){
  $("#facturas-body").innerHTML = `
    <tr class="table-loading">
      <td colspan="5">Cargando facturas...</td>
    </tr>
  `;
}

function setEmpty(){
  $("#facturas-body").innerHTML = `
    <tr>
      <td colspan="5">No hay facturas</td>
    </tr>
  `;
}

function setError(){
  $("#facturas-body").innerHTML = `
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

        <td>#${f.numero || f.id}</td>

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
   KPIs (USANDO BACKEND)
========================= */

function updateKPIs(items, resumen){

  const totalPagado = resumen.totalPagado || 0;
  const totalPendiente = resumen.totalPendiente || 0;
  const totalFacturado = totalPagado + totalPendiente;

  const pagadas = items.filter(f => f.estadoPago === "pagada").length;
  const pendientes = items.filter(f => f.estadoPago !== "pagada").length;

  $("#facturas-total") &&
    ($("#facturas-total").textContent = formatMoney(totalFacturado));

  $("#facturas-pagadas") &&
    ($("#facturas-pagadas").textContent = pagadas);

  $("#facturas-pendientes") &&
    ($("#facturas-pendientes").textContent = pendientes);

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
  return new Date(f).toLocaleDateString("es-ES");
}

function formatMoney(n){
  return Number(n || 0).toLocaleString("es-ES") + " €";
}

function escapeHTML(str){
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

})();
