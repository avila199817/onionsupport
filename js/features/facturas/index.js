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

let sortState = {
  key: null,
  dir: "asc"
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
    sortState = { key:null, dir:"asc" };
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

  // SEARCH
  const search = $("#search-factura");
  if(search){
    let t;
    search.addEventListener("input", ()=>{
      clearTimeout(t);
      t = setTimeout(applyFilters, 250);
    });
  }

  // FILTER
  $("#filter-estado-factura")?.addEventListener("change", applyFilters);

  // SORT
  getRoot().querySelectorAll("th[data-sort]").forEach(th=>{
    th.addEventListener("click", ()=>{

      const key = th.dataset.sort;

      if(sortState.key === key){
        sortState.dir = sortState.dir === "asc" ? "desc" : "asc";
      }else{
        sortState.key = key;
        sortState.dir = "asc";
      }

      applySort();
      updateSortUI(th);
      render(state.filtered);

    });
  });

}

/* =========================
   LOAD
========================= */

async function loadFacturas(){

  const tbody = $("#facturas-body");
  if(!tbody) return;

  setLoading();

  try{

    const res = await Onion.fetch(Onion.config.API + "/facturas");
    const data = res?.facturas || res?.data || [];

    state.facturas = Array.isArray(data) ? data : [];
    state.filtered = [...state.facturas];

    if(!state.facturas.length){
      setEmpty();
      return;
    }

    applySort();
    render(state.filtered);

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

  applySort();
  render(state.filtered);

}

/* =========================
   SORT
========================= */

function applySort(){

  if(!sortState.key) return;

  const { key, dir } = sortState;

  state.filtered.sort((a,b)=>{

    let A = a[key];
    let B = b[key];

    if(key === "fecha"){
      A = new Date(A);
      B = new Date(B);
    }

    if(key === "total"){
      A = Number(A);
      B = Number(B);
    }

    if(typeof A === "string"){
      A = A.toLowerCase();
      B = B.toLowerCase();
    }

    if(A > B) return dir === "asc" ? 1 : -1;
    if(A < B) return dir === "asc" ? -1 : 1;

    return 0;

  });

}

function updateSortUI(active){

  getRoot().querySelectorAll("th[data-sort]").forEach(th=>{
    th.classList.remove("asc","desc");
  });

  active.classList.add(sortState.dir);

}

/* =========================
   STATES
========================= */

function setLoading(){
  $("#facturas-body").innerHTML =
    `<tr><td colspan="6">Cargando facturas...</td></tr>`;
}

function setEmpty(){
  $("#facturas-body").innerHTML =
    `<tr><td colspan="6">No hay facturas</td></tr>`;
}

function setError(){
  $("#facturas-body").innerHTML =
    `<tr><td colspan="6">Error cargando facturas</td></tr>`;
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

  tbody.innerHTML = items.map(f=>{

    const estado = getEstado(f.estadoPago);
    const id = f.id || f.numero;

    return `
    <tr data-id="${id}">

      <td class="col-id">${escapeHTML(f.numero || f.id || "--")}</td>

      <td class="col-main">
        <div class="cell-user">
          <div class="table-avatar">${getInitials(f.cliente)}</div>
          <div class="user-name">${escapeHTML(f.cliente || "-")}</div>
        </div>
      </td>

      <td class="col-date">${formatFecha(f.fecha)}</td>

      <td class="col-importe">${formatMoney(f.total)}</td>

      <td class="col-status">
        <span class="badge ${estado.class}">${estado.label}</span>
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
            estado.class === "pendiente"
            ? `<button class="btn-action btn-pay" data-action="pay">Pagar</button>`
            : ""
          }

        </div>
      </td>

    </tr>
    `;

  }).join("");

}

/* =========================
   ACTIONS
========================= */

function downloadFactura(id){
  window.open(Onion.config.API + "/facturas/" + id + "/pdf", "_blank");
}

function sendFactura(){
  toast("Factura enviada");
}

async function payFactura(id, row){

  try{

    await Onion.fetch(Onion.config.API + "/facturas/" + id + "/pagar", {
      method:"POST"
    });

    const badge = row.querySelector(".badge");
    if(badge){
      badge.textContent = "Pagada";
      badge.className = "badge pagada";
    }

    row.querySelector('[data-action="pay"]')?.remove();

    toast("Factura pagada");

  }catch(e){
    console.error(e);
    toast("Error al pagar");
  }

}

/* =========================
   DETALLE
========================= */

function openFactura(id){
  console.log("Abrir factura:", id);
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

/* =========================
   HELPERS
========================= */

function getEstado(e){
  e = (e || "").toLowerCase();
  if(e === "pagada") return {label:"Pagada", class:"pagada"};
  if(e === "pendiente") return {label:"Pendiente", class:"pendiente"};
  return {label:"-", class:""};
}

function getInitials(name){
  return name
    ? name.split(" ").map(n=>n[0]).join("").slice(0,2).toUpperCase()
    : "?";
}

function formatFecha(f){
  return f ? new Date(f).toLocaleDateString("es-ES") : "--";
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

/* =========================
   START
========================= */

init();

})();
