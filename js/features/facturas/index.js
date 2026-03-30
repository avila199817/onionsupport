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
  loadFacturas();

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

    if(e.target.closest("button")) return;

    const row = e.target.closest("tr[data-id]");
    if(!row) return;

    const id = row.dataset.id;
    if(!id) return;

    Onion.router.navigate("/facturas/detalle?id=" + id);

  });

  $("#btn-new-factura")?.addEventListener("click", ()=>{
    Onion.router.navigate("/facturas/nueva");
  });

  $("#search-factura")?.addEventListener("input", debounce(applyFilters, 250));
  $("#filter-estado-factura")?.addEventListener("change", applyFilters);

}

/* =========================
   LOAD
========================= */

async function loadFacturas(){

  const panel = getRoot();
  const tbody = $("#facturas-body");

  if(!tbody) return;

  panel?.classList.remove("ready");
  setLoading();

  try{

    const res = await Onion.fetch(Onion.config.API + "/facturas");
    const items = normalize(res);

    currentItems = items;
    filteredItems = items;

    if(!items.length){
      setEmpty();
      panel?.classList.add("ready");
      return;
    }

    render(items);
    panel?.classList.add("ready");

  }catch(e){

    console.error("💥 ERROR FACTURAS:", e);
    setError();
    panel?.classList.add("ready");

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

    const cliente = getClienteNombre(f).toLowerCase();
    const id = String(f.numeroFacturaLegal || f.id || "").toLowerCase();

    const e = mapEstadoPago(f.estadoPago);

    return (
      (!search || cliente.includes(search) || id.includes(search)) &&
      (!estado || e === estado)
    );

  });

  render(filteredItems);

}

/* =========================
   STATES
========================= */

function setLoading(){
  $("#facturas-body").innerHTML =
    `<tr><td colspan="8">Cargando facturas...</td></tr>`;
}

function setEmpty(){
  $("#facturas-body").innerHTML =
    `<tr><td colspan="8">No hay facturas</td></tr>`;
}

function setError(){
  $("#facturas-body").innerHTML =
    `<tr><td colspan="8">Error cargando facturas</td></tr>`;
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
      <tr data-id="${d.id}" style="cursor:pointer">

        <td class="col-id">${d.numero}</td>

        <td class="col-main">
          <div class="cell-user">
            <div class="table-avatar">
              ${getInitials(d.cliente)}
            </div>
            <div class="user-info">
              <span class="user-name">${escapeHTML(d.cliente)}</span>
            </div>
          </div>
        </td>

        <td class="col-date">${d.fecha}</td>

        <td class="col-importe">${d.total}</td>

        <td class="col-status">
          <span class="badge ${d.estadoPago.class}">
            ${d.estadoPago.label}
          </span>
        </td>

        <td class="col-status">
          <span class="badge ${d.estadoFactura.class}">
            ${d.estadoFactura.label}
          </span>
        </td>

        <td class="col-method">${d.metodo}</td>

        <td class="col-date">${d.fechaEnvio}</td>

      </tr>
    `;

  }).join("");

  tbody.innerHTML = html;

}

/* =========================
   MAP
========================= */

function mapItem(f){

  return {
    id: f.id,
    numero: f.numeroFacturaLegal || f.id || "--",
    cliente: getClienteNombre(f),
    fecha: formatFecha(f.fechaFactura),
    total: formatMoney(f.total),

    estadoPago: getEstadoPago(f),
    estadoFactura: getEstadoFactura(f),

    metodo: f.formaPago || "-",
    fechaEnvio: f.fechaEnvio ? formatFecha(f.fechaEnvio) : "-"
  };

}

/* =========================
   CLIENTE
========================= */

function getClienteNombre(f){
  return f?.cliente?.razonSocial ||
         f?.cliente?.nombreContacto ||
         "Cliente";
}

/* =========================
   ESTADOS
========================= */

function mapEstadoPago(e){
  e = (e || "").toLowerCase();
  if(e === "pagada") return "pagada";
  return "pendiente";
}

function getEstadoPago(f){

  const e = (f.estadoPago || "").toLowerCase();

  // 🔥 DETECTAR VENCIDA
  if(e !== "pagada" && isVencida(f.fechaFactura)){
    return { label:"Vencida", class:"error" };
  }

  if(e === "pagada"){
    return { label:"Pagada", class:"success" };
  }

  return { label:"Pendiente", class:"warning" };
}

function getEstadoFactura(f){

  const e = (f.estado || "").toLowerCase();

  if(e === "emitida") return { label:"Emitida", class:"info" };
  if(e === "borrador") return { label:"Borrador", class:"neutral" };
  if(e === "anulada") return { label:"Anulada", class:"error" };

  return { label:"-", class:"" };
}

/* =========================
   VENCIMIENTO
========================= */

function isVencida(fecha){

  if(!fecha) return false;

  const f = new Date(fecha);
  const hoy = new Date();

  const diff = (hoy - f) / (1000 * 60 * 60 * 24);

  return diff > 30; // 🔥 configurable
}

/* =========================
   HELPERS
========================= */

function formatFecha(f){
  if(!f) return "--";
  return new Date(f).toLocaleDateString("es-ES");
}

function formatMoney(n){
  return Number(n || 0).toLocaleString("es-ES", {
    minimumFractionDigits:2,
    maximumFractionDigits:2
  }) + " €";
}

function escapeHTML(str){
  return String(str)
    .replace(/&/g,"&amp;")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;");
}

function getInitials(name){
  if(!name) return "?";
  return name.split(" ").map(n => n[0]).join("").slice(0,2).toUpperCase();
}

function debounce(fn, delay){
  let t;
  return function(...args){
    clearTimeout(t);
    t = setTimeout(()=> fn.apply(this, args), delay);
  };
}

})();
