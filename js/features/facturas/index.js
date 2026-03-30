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

    // 🔥 EVITA CLICK EN BOTONES (igual incidencias)
    if(e.target.closest("button")) return;

    const row = e.target.closest("tr[data-id]");
    if(!row) return;

    const id = row.dataset.id;
    if(!id) return;

    // 🔥 NAVEGACIÓN REAL AL DETALLE
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

    const cliente = (f.cliente || "").toLowerCase();
    const id = String(f.numero || f.id || "").toLowerCase();

    const e = mapEstado(f.estadoPago);

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
  const el = $("#facturas-body");
  if(el){
    el.innerHTML = `<tr><td colspan="6">Cargando facturas...</td></tr>`;
  }
}

function setEmpty(){
  const el = $("#facturas-body");
  if(el){
    el.innerHTML = `<tr><td colspan="6">No hay facturas</td></tr>`;
  }
}

function setError(){
  const el = $("#facturas-body");
  if(el){
    el.innerHTML = `<tr><td colspan="6">Error cargando facturas</td></tr>`;
  }
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

        <td>${d.id}</td>

        <td>
          <div class="cell-user">
            <div class="table-avatar">
              ${getInitials(d.cliente)}
            </div>
            <div class="user-info">
              <span class="user-name">${escapeHTML(d.cliente)}</span>
            </div>
          </div>
        </td>

        <td>${d.fecha}</td>

        <td>${d.total}</td>

        <td><span class="badge ${d.estado.class}">${d.estado.label}</span></td>

        <td>
          <div class="actions">

            <button class="btn-action" onclick="event.stopPropagation(); window.open('${Onion.config.API}/facturas/${d.id}/pdf')">
              Descargar
            </button>

            ${
              d.estado.raw === "pendiente"
              ? `<button class="btn-action btn-pay" onclick="event.stopPropagation(); pagarFactura('${d.id}', this)">Pagar</button>`
              : ""
            }

          </div>
        </td>

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
    id: f.id || f.numero || "--",
    cliente: f.cliente || "Cliente",
    fecha: formatFecha(f.fecha),
    total: formatMoney(f.total),
    estado: getEstado(f.estadoPago),
    estadoRaw: mapEstado(f.estadoPago)
  };

}

/* =========================
   ACTION GLOBAL (PAY)
========================= */

window.pagarFactura = async function(id, btn){

  try{

    await Onion.fetch(Onion.config.API + "/facturas/" + id + "/pagar", {
      method:"POST"
    });

    const row = btn.closest("tr");

    row.querySelector(".badge").textContent = "Pagada";
    row.querySelector(".badge").className = "badge pagada";

    btn.remove();

    toast("Factura pagada");

  }catch(e){
    console.error(e);
    toast("Error al pagar");
  }

};

/* =========================
   HELPERS
========================= */

function mapEstado(e){
  e = (e || "").toLowerCase();
  if(e === "pagada") return "pagada";
  return "pendiente";
}

function getEstado(e){
  e = (e || "").toLowerCase();
  if(e === "pagada") return { label:"Pagada", class:"pagada", raw:"pagada" };
  return { label:"Pendiente", class:"pendiente", raw:"pendiente" };
}

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

/* =========================
   TOAST
========================= */

function toast(msg){

  let c = document.getElementById("toast-container");

  if(!c){
    c = document.createElement("div");
    c.id = "toast-container";
    document.body.appendChild(c);
  }

  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = msg;

  c.appendChild(el);

  requestAnimationFrame(()=> el.classList.add("show"));

  setTimeout(()=>{
    el.classList.remove("show");
    setTimeout(()=> el.remove(), 300);
  },2000);

}

})();
