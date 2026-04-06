"use strict";

(function(){

const Onion = window.Onion;

if(!Onion){
  console.error("💥 Onion no disponible (incidencias)");
  return;
}

/* =========================================================
   VIEW ENGINE
========================================================= */

const view = Onion.createView();

/* =========================================================
   STATE
========================================================= */

let initialized = false;
let currentItems = [];
let filteredItems = [];
let loading = false;
let requestId = 0;

/* 🔥 CACHE DATA */
let cache = null;

/* 🔥 CACHE DOM */
let rootEl = null;
let tbodyEl = null;
let loaderEl = null;

/* 🔥 FILTROS */
let externalFilters = {
  search: "",
  estado: "",
  prioridad: ""
};

/* =========================================================
   ROOT + CACHE DOM
========================================================= */

function initDOM(){

  rootEl = document.querySelector(".panel-content.incidencias");
  if(!rootEl) return false;

  tbodyEl = rootEl.querySelector("#incidencias-body");
  loaderEl = rootEl.querySelector(".table-loader");

  return true;
}

/* =========================================================
   LOADER
========================================================= */

function showLoader(){
  if(loaderEl) loaderEl.classList.remove("hidden");
}

function hideLoader(){
  if(loaderEl) loaderEl.classList.add("hidden");
}

/* =========================================================
   SKELETON
========================================================= */

function renderSkeleton(){
  if(!tbodyEl) return;

  tbodyEl.innerHTML = `
    <tr><td colspan="8">Cargando incidencias...</td></tr>
  `;
}

/* =========================================================
   INIT
========================================================= */

function init(){

  if(initialized) return;
  if(!Onion.state?.user){
    return setTimeout(init, 50);
  }

  if(!initDOM()) return;

  initialized = true;

  bindEvents();

  showLoader();
  renderSkeleton();

  loadIncidencias();

  Onion.onCleanup(()=>{
    initialized = false;
    rootEl = null;
    tbodyEl = null;
    loaderEl = null;
  });

}

init();

/* =========================================================
   EVENTS
========================================================= */

function bindEvents(){

  Onion.cleanupEvent(rootEl, "click", (e)=>{

    if(e.target.closest("button")) return;

    const row = e.target.closest("tr[data-id]");
    if(row){
      Onion.router.navigate("/incidencias/detalle?id=" + row.dataset.id);
    }

  });

}

/* =========================================================
   LOAD
========================================================= */

async function loadIncidencias(){

  if(loading) return;
  if(!tbodyEl) return;

  loading = true;

  const currentRequest = ++requestId;

  document.activeElement?.blur();

  /* 🔥 CACHE INSTANT */
  if(cache){
    currentItems = cache;
    filteredItems = cache;
    applyFilters();
  }

  try{

    const res = await view.safeFetch(() =>
      Onion.fetch(Onion.config.API + "/tickets")
    );

    if(currentRequest !== requestId) return;

    if(!res){
      setError();
      return;
    }

    const items = normalize(res);

    cache = items;

    currentItems = items;
    filteredItems = items;

    if(!items.length){
      setEmpty();
      return;
    }

    applyFilters();

  }catch(e){

    console.error("💥 ERROR INCIDENCIAS:", e);
    setError();

  }finally{
    loading = false;
  }

}

/* =========================================================
   NORMALIZE
========================================================= */

function normalize(res){

  if(!res) return [];

  if(Array.isArray(res)) return res;
  if(Array.isArray(res.tickets)) return res.tickets;
  if(Array.isArray(res.data)) return res.data;
  if(Array.isArray(res.items)) return res.items;

  return [];

}

/* =========================================================
   FILTERS (OPTIMIZADO)
========================================================= */

function applyFilters(){

  const search = externalFilters.search.toLowerCase();
  const estado = externalFilters.estado.toLowerCase();
  const prioridad = externalFilters.prioridad.toLowerCase();

  filteredItems = currentItems.filter(i => {

    const title = (i.subject || i.message || "").toLowerCase();
    const usuario = (i.cliente?.nombre || "").toLowerCase();
    const email = (i.cliente?.email || "").toLowerCase();
    const id = String(i.id || "").toLowerCase();

    const s = mapStatus(i.status);
    const p = mapPriority(i.priority);

    return (
      (!search || title.includes(search) || usuario.includes(search) || email.includes(search) || id.includes(search)) &&
      (!estado || s === estado) &&
      (!prioridad || p === prioridad)
    );

  });

  render(filteredItems);

}

/* =========================================================
   STATES
========================================================= */

function setEmpty(){
  if(!tbodyEl) return;
  tbodyEl.innerHTML = `<tr><td colspan="8">No hay incidencias</td></tr>`;
  hideLoader();
}

function setError(){
  if(!tbodyEl) return;
  tbodyEl.innerHTML = `<tr><td colspan="8">Error cargando incidencias</td></tr>`;
  hideLoader();
}

/* =========================================================
   RENDER (ULTRA OPTIMIZADO 🔥)
========================================================= */

function render(items){

  if(!tbodyEl) return;

  if(!items.length){
    setEmpty();
    return;
  }

  const fragment = document.createDocumentFragment();

  for(let i = 0; i < items.length; i++){

    const d = mapItem(items[i]);

    const tr = document.createElement("tr");
    tr.dataset.id = d.id;

    tr.innerHTML = `
      <td class="col-id">${d.id}</td>

      <td class="col-main">
        <div class="cell-user">
          <div class="table-avatar">
            ${renderAvatar(d)}
          </div>
          <div class="user-info">
            <span class="user-name">${escapeHTML(d.usuario)}</span>
            <span class="user-sub">${escapeHTML(d.email)}</span>
          </div>
        </div>
      </td>

      <td class="col-main">${escapeHTML(d.title)}</td>
      <td class="col-secondary">${escapeHTML(d.tecnico)}</td>

      <td class="col-status">
        <span class="badge ${d.estado.class}">
          ${d.estado.label}
        </span>
      </td>

      <td class="col-status">
        <span class="badge ${d.prioridad.class}">
          ${d.prioridad.label}
        </span>
      </td>

      <td class="col-date">${d.fecha}</td>
      <td class="col-date">${d.fechaCierre}</td>
    `;

    fragment.appendChild(tr);
  }

  tbodyEl.innerHTML = "";
  tbodyEl.appendChild(fragment);

  hideLoader();

}

/* =========================================================
   HELPERS
========================================================= */

function mapItem(i){
  return {
    id: i.id || i.ticketId || "--",
    title: i.subject || i.message || "Sin título",
    usuario: i.cliente?.nombre || "Usuario",
    email: i.cliente?.email || "-",
    tecnico: i.tecnico?.name || "-",
    avatar: i.cliente?.avatar || null,
    estado: getEstado(i),
    prioridad: getPrioridad(i),
    fecha: formatFecha(i.createdAt),
    fechaCierre: i.status === "closed"
      ? formatFecha(i.closedAt || (i._ts ? i._ts * 1000 : null))
      : "-"
  };
}

function renderAvatar(d){
  if(d.avatar){
    return `<img src="${d.avatar}" alt="${escapeHTML(d.usuario)}" />`;
  }

  const initials = getInitials(d.usuario);
  const color = getAvatarColor(d.usuario);

  return `<div style="width:100%;height:100%;border-radius:50%;display:flex;align-items:center;justify-content:center;background:${color};color:#fff;font-weight:600;font-size:12px;">${initials}</div>`;
}

function mapStatus(s){
  s = (s || "").toLowerCase();
  if(s === "closed") return "cerrada";
  if(s === "in_progress") return "progreso";
  return "abierta";
}

function mapPriority(p){
  p = (p || "").toLowerCase();
  if(p === "high") return "alta";
  if(p === "medium") return "media";
  return "baja";
}

function getEstado(i){
  const s = mapStatus(i.status);
  if(s === "cerrada") return { label:"Cerrada", class:"success" };
  if(s === "progreso") return { label:"En progreso", class:"warning" };
  return { label:"Abierta", class:"info" };
}

function getPrioridad(i){
  const p = mapPriority(i.priority);
  if(p === "alta") return { label:"Alta", class:"error" };
  if(p === "media") return { label:"Media", class:"warning" };
  return { label:"Baja", class:"neutral" };
}

function formatFecha(f){
  if(!f) return "--";
  return new Date(f).toLocaleDateString("es-ES");
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

function getAvatarColor(name){
  const colors = ["#6366f1","#22c55e","#eab308","#ef4444","#06b6d4","#a855f7","#f97316"];
  let hash = 0;
  for(let i = 0; i < name.length; i++){
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

/* =========================================================
   EXTERNAL
========================================================= */

window.IncidenciasUIExternal = {
  applyFilters: (uiState)=>{
    externalFilters = uiState || externalFilters;
    applyFilters();
  }
};

})();
