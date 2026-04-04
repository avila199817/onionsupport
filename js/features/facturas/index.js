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

let currentSort = {
  field: null,
  direction: null
};

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
   INIT (SPA SAFE)
========================= */

function init(){

  const root = getRoot();
  if(!root || initialized) return;

  if(!Onion.state?.user){
    return setTimeout(init, 100);
  }

  initialized = true;

  console.log("🔥 INIT FACTURAS");

  bindEvents();

  requestAnimationFrame(()=>{
    loadFacturas();
  });

  Onion.onCleanup(()=>{
    initialized = false;
  });

}

/* 🔥 CLAVE SPA */
window.initPage = init;

/* =========================
   EVENTS
========================= */

function bindEvents(){

  const root = getRoot();
  if(!root) return;

  Onion.cleanupEvent(root, "click", (e)=>{

    const th = e.target.closest("th[data-sort]");
    if(th){
      handleSort(th);
      return;
    }

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
   SORT
========================= */

function handleSort(th){

  const field = th.dataset.sort;

  if(currentSort.field === field){
    currentSort.direction = currentSort.direction === "asc" ? "desc" : "asc";
  }else{
    currentSort.field = field;
    currentSort.direction = "asc";
  }

  updateSortUI();
  applySort();
}

function applySort(){

  if(!currentSort.field){
    render(filteredItems);
    return;
  }

  const dir = currentSort.direction === "asc" ? 1 : -1;

  filteredItems.sort((a,b)=>{

    const A = getSortValue(a, currentSort.field);
    const B = getSortValue(b, currentSort.field);

    if(A > B) return 1 * dir;
    if(A < B) return -1 * dir;
    return 0;
  });

  render(filteredItems);
}

function getSortValue(f, field){

  switch(field){

    case "numero":
      return Number(f.numeroFacturaLegal || f.numero || f.id || 0);

    case "cliente":
      return safeText(f.cliente?.nombre || f.cliente?.nombreContacto);

    case "empresa":
      return safeText(f.cliente?.empresa || f.cliente?.razonSocial);

    case "fecha":
      return new Date(f.fechaFactura || f.fecha || 0).getTime();

    case "total":
      return Number(f.total || 0);

    case "estadoPago":
      return safeText(f.estadoPago);

    default:
      return "";
  }

}

function updateSortUI(){

  document.querySelectorAll("th[data-sort]").forEach(th=>{
    th.classList.remove("asc","desc");

    if(th.dataset.sort === currentSort.field){
      th.classList.add(currentSort.direction);
    }
  });

}

/* =========================
   LOAD
========================= */

async function loadFacturas(){

  if(loading) return;
  loading = true;

  const tbody = $("#facturas-body");
  if(!tbody) return;

  const requestId = ++currentRequestId;

  document.activeElement?.blur();

  try{

    await new Promise(r => requestAnimationFrame(r));
    await new Promise(r => requestAnimationFrame(r));
    await new Promise(r => setTimeout(r, 150));

    const res = await Onion.fetch(Onion.config.API + "/facturas");
    const items = normalize(res);

    if(requestId !== currentRequestId) return;

    currentItems = items;
    filteredItems = items;

    if(!items.length){
      setEmpty();
      return;
    }

    applyFilters();

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

    if(btn.classList.contains("loading")) return;

    btn.classList.add("loading");
    const original = btn.textContent;
    btn.textContent = "⏳";

    try{

      const res = await Onion.fetch(
        Onion.config.API + "/facturas/" + id + "/descargar"
      );

      if(!res || !res.ok || !res.url){
        Onion.ui.toast?.error("Error descargando PDF");
        return;
      }

      const link = document.createElement("a");
      link.href = res.url;
      link.download = `factura-${id}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      Onion.ui.toast?.success("Factura descargada 📄");

    }catch(e){
      console.error("💥 ERROR DOWNLOAD:", e);
      Onion.ui.toast?.error("Error descargando PDF");
    }finally{
      btn.textContent = original;
      btn.classList.remove("loading");
    }

  }

  if(btn.classList.contains("pay")){
    Onion.ui.toast?.info("💳 Simulación pago factura " + id);
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
    const estadoPago = safeText(f.estadoPago);

    return (
      (!search || cliente.includes(search) || empresa.includes(search) || id.includes(search)) &&
      (!estado || estadoPago === estado)
    );

  });

  applySort();

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

  if(!items.length){
    setEmpty();
    return;
  }

  tbody.innerHTML = items.map(f => {

    const d = mapItem(f);

    return `
<tr data-id="${d.id}">
  <td class="col-id">${d.numero}</td>

  <td class="col-main">${escapeHTML(d.cliente.nombre)}</td>
  <td class="col-secondary">${escapeHTML(d.empresa || "-")}</td>

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
</tr>`;
  }).join("");

}

/* =========================
   HELPERS
========================= */

function mapItem(f){

  return {
    id: f.id,
    numero: f.numeroFacturaLegal || f.numero || f.id,
    cliente: {
      nombre: cleanValue(f.cliente?.nombre, "Cliente")
    },
    empresa: cleanValue(f.cliente?.empresa, ""),
    fecha: formatFecha(f.fechaFactura || f.fecha),
    total: formatMoney(f.total),
    estadoPago: getEstadoPago(f.estadoPago)
  };

}

function cleanValue(val, fallback){
  if(!val) return fallback;
  return String(val).trim();
}

function safeText(val){
  return String(val || "").toLowerCase();
}

function getEstadoPago(e){
  e = (e || "").toLowerCase();
  if(e === "pagada") return { label:"Pagada", class:"success" };
  return { label:"Pendiente", class:"warning" };
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
