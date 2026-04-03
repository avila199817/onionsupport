"use strict";

(function(){

const Onion = window.Onion;

if(!Onion){
  console.error("💥 Onion no disponible (facturas)");
  return;
}

let initialized = false;
let currentItems = [];
let filteredItems = [];
let loading = false;
let currentRequestId = 0;

/* =========================
   ROOT
========================= */

function getRoot(){
  return document.querySelector(".panel-content.facturas");
}

function $(selector){
  const root = getRoot();
  return root ? root.querySelector(selector) : null;
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

  requestAnimationFrame(()=>{
    loadFacturas();
  });

  Onion.onCleanup(()=>{
    initialized = false;
  });

}

init();

/* =========================
   EVENTS
========================= */

function bindEvents(){

  const root = getRoot();
  if(!root) return;

  Onion.cleanupEvent(root, "click", (e)=>{

    const btn = e.target.closest(".btn-action");

    if(btn){
      handleAction(btn);
      return;
    }

    const row = e.target.closest("tr[data-id]");
    if(!row) return;

    Onion.router.navigate("/facturas/detalle?id=" + row.dataset.id);

  });

  $("#btn-new-factura")?.addEventListener("click", ()=>{
    Onion.router.navigate("/facturas/nueva");
  });

  $("#search-factura")?.addEventListener("input", debounce(applyFilters, 250));
  $("#filter-estado-factura")?.addEventListener("change", applyFilters);

}

/* =========================
   LOAD (MISMO FIX QUE INCIDENCIAS)
========================= */

async function loadFacturas(){

  if(loading) return;
  loading = true;

  const tbody = $("#facturas-body");
  if(!tbody) return;

  const requestId = ++currentRequestId;

  document.activeElement?.blur();

  try{

    /* 🔥 FORZAR PINTADO DEL LOADER */
    await new Promise(r => requestAnimationFrame(r));
    await new Promise(r => requestAnimationFrame(r));

    /* 🔥 DELAY MÍNIMO (anti pantalla blanca) */
    await new Promise(r => setTimeout(r, 200));

    const res = await Onion.fetch(Onion.config.API + "/facturas");
    const items = normalize(res);

    if(requestId !== currentRequestId) return;

    currentItems = items;
    filteredItems = items;

    if(!items.length){
      setEmpty();
      return;
    }

    requestAnimationFrame(()=>{
      render(items);
    });

  }catch(e){

    console.error("💥 ERROR FACTURAS:", e);

    if(requestId !== currentRequestId) return;

    setError();

  }finally{
    loading = false;
  }

}

/* =========================
   ACTIONS
========================= */

async function handleAction(btn){

  const id = btn.dataset.id;
  if(!id) return;

  if(btn.classList.contains("view")){
    Onion.router.navigate("/facturas/detalle?id=" + id);
  }

  if(btn.classList.contains("download")){

    try{

      const res = await Onion.fetch(
        Onion.config.API + "/facturas/" + id + "/descargar"
      );

      if(!res || !res.ok || !res.url){
        alert("Error descargando PDF");
        return;
      }

      const link = document.createElement("a");
      link.href = res.url;
      link.download = `factura-${id}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

    }catch(e){
      console.error("💥 ERROR DOWNLOAD:", e);
      alert("Error descargando PDF");
    }

  }

  if(btn.classList.contains("pay")){
    alert("💳 Simulación pago factura " + id);
  }

}

/* =========================
   NORMALIZE
========================= */

function normalize(res){

  if(!res) return [];

  if(Array.isArray(res)) return res;
  if(Array.isArray(res.facturas)) return res.facturas;
  if(Array.isArray(res.data)) return res.data;
  if(Array.isArray(res.items)) return res.items;

  return [];

}

/* =========================
   FILTERS
========================= */

function applyFilters(){

  const search = ($("#search-factura")?.value || "").toLowerCase();
  const estado = ($("#filter-estado-factura")?.value || "").toLowerCase();

  filteredItems = currentItems.filter(f => {

    const cliente = safeText(f.cliente?.nombre || f.cliente?.nombreContacto);
    const empresa = safeText(f.cliente?.empresa || f.cliente?.razonSocial);
    const id = String(f.numero || f.id || "").toLowerCase();

    return (
      (!search || cliente.includes(search) || empresa.includes(search) || id.includes(search)) &&
      (!estado || (f.estadoPago || "").toLowerCase() === estado)
    );

  });

  requestAnimationFrame(()=>{
    render(filteredItems);
  });

}

/* =========================
   STATES
========================= */

function setEmpty(){
  $("#facturas-body").innerHTML =
    `<tr><td colspan="7">No hay facturas</td></tr>`;
}

function setError(){
  $("#facturas-body").innerHTML =
    `<tr><td colspan="7">Error cargando facturas</td></tr>`;
}

/* =========================
   RENDER
========================= */

function render(items){

  const tbody = $("#facturas-body");
  if(!tbody) return;

  const html = items.map(f => {

    const d = mapItem(f);

    return `
<tr data-id="${d.id}">
  <td class="col-id">${d.numero}</td>

  <td class="col-main">
    ${escapeHTML(d.cliente.nombre)}
  </td>

  <td class="col-date">${d.fecha}</td>
  <td class="col-importe">${d.total}</td>

  <td class="col-status">
    <span class="badge ${d.estadoPago.class}">
      ${d.estadoPago.label}
    </span>
  </td>

  <td class="col-actions">
    <button class="btn-action view" data-id="${d.id}">Ver</button>
    <button class="btn-action download" data-id="${d.id}">PDF</button>
  </td>
</tr>
`;

  }).join("");

  tbody.innerHTML = html;

}

/* =========================
   MAP + HELPERS
========================= */

function mapItem(f){
  return {
    id: f.id,
    numero: f.numeroFacturaLegal || f.numero || f.id,
    cliente: {
      nombre: f.cliente?.nombre || "Cliente"
    },
    fecha: formatFecha(f.fechaFactura || f.fecha),
    total: formatMoney(f.total),
    estadoPago: getEstadoPago(f.estadoPago)
  };
}

function safeText(val){
  return String(val || "").toLowerCase();
}

function getEstadoPago(e){
  e = (e || "").toLowerCase();
  if(e === "pagada") return { label:"Pagada", class:"success", raw:e };
  return { label:"Pendiente", class:"warning", raw:e };
}

function formatFecha(f){
  if(!f) return "--";
  return new Date(f).toLocaleDateString("es-ES");
}

function formatMoney(n){
  return Number(n || 0).toLocaleString("es-ES",{minimumFractionDigits:2}) + " €";
}

function escapeHTML(str){
  return String(str)
    .replace(/&/g,"&amp;")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;");
}

function debounce(fn, delay){
  let t;
  return (...args)=>{
    clearTimeout(t);
    t = setTimeout(()=>fn(...args), delay);
  };
}

})();
