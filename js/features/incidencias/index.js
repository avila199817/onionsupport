"use strict";

(function(){

const Onion = window.Onion;

if(!Onion){
  console.error("💥 Onion no disponible (incidencias)");
  return;
}

/* =========================================================
   STATE
========================================================= */
let initialized = false;
let currentItems = [];
let filteredItems = [];
let loading = false;
let currentRequestId = 0;


/* =========================
   ROOT
========================= */

function getRoot(){
  return document.querySelector(".panel-content.incidencias");
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
    loadIncidencias();
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

    if(e.target.closest("button")) return;

    const row = e.target.closest("tr[data-id]");
    if(!row) return;

    const id = row.dataset.id;
    if(!id) return;

    Onion.router.navigate("/incidencias/detalle?id=" + id);

  });

  $("#btn-new-incidencia")?.addEventListener("click", ()=>{
    Onion.router.navigate("/incidencias/nueva");
  });

  $("#search-incidencia")?.addEventListener("input", debounce(applyFilters, 250));
  $("#filter-status")?.addEventListener("change", applyFilters);
  $("#filter-priority")?.addEventListener("change", applyFilters);

}


/* =========================
   LOAD
========================= */

async function loadIncidencias(){

  if(loading) return;
  loading = true;

  const tbody = $("#incidencias-body");
  if(!tbody) return;

  const requestId = ++currentRequestId;

  document.activeElement?.blur();
  tbody.innerHTML = "";

  try{

    const res = await Onion.fetch(Onion.config.API + "/tickets");
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

    console.error("💥 ERROR INCIDENCIAS:", e);

    if(requestId !== currentRequestId) return;

    setError();

  }finally{
    loading = false;
  }

}


/* =========================
   NORMALIZE
========================= */

function normalize(res){

  if(!res) return [];

  if(Array.isArray(res)) return res;
  if(Array.isArray(res.tickets)) return res.tickets;
  if(Array.isArray(res.data)) return res.data;
  if(Array.isArray(res.items)) return res.items;

  return [];

}


/* =========================
   FILTERS
========================= */

function applyFilters(){

  const search = ($("#search-incidencia")?.value || "").toLowerCase();
  const status = ($("#filter-status")?.value || "").toLowerCase();
  const priority = ($("#filter-priority")?.value || "").toLowerCase();

  filteredItems = currentItems.filter(i => {

    const title = (i.subject || i.message || "").toLowerCase();
    const usuario = (i.cliente?.nombre || "").toLowerCase();
    const email = (i.cliente?.email || "").toLowerCase();
    const id = String(i.id || "").toLowerCase();

    const s = mapStatus(i.status);
    const p = mapPriority(i.priority);

    return (
      (!search || title.includes(search) || usuario.includes(search) || email.includes(search) || id.includes(search)) &&
      (!status || s === status) &&
      (!priority || p === priority)
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
  $("#incidencias-body").innerHTML =
    `<tr><td colspan="8">No hay incidencias</td></tr>`;
}

function setError(){
  $("#incidencias-body").innerHTML =
    `<tr><td colspan="8">Error cargando incidencias</td></tr>`;
}


/* =========================
   RENDER
========================= */

function render(items){

  const tbody = $("#incidencias-body");
  if(!tbody) return;

  const html = items.map(i => {

    const d = mapItem(i);

    return `
<tr data-id="${d.id}">
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
</tr>
`;

  }).join("");

  tbody.innerHTML = html;

}


/* =========================
   MAP
========================= */

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


/* =========================
   AVATAR
========================= */

function renderAvatar(d){

  if(d.avatar){
    return `<img src="${d.avatar}" alt="${escapeHTML(d.usuario)}" />`;
  }

  const initials = getInitials(d.usuario);
  const color = getAvatarColor(d.usuario);

  return `
    <div style="
      width:100%;
      height:100%;
      border-radius:50%;
      display:flex;
      align-items:center;
      justify-content:center;
      background:${color};
      color:#fff;
      font-weight:600;
      font-size:12px;
    ">
      ${initials}
    </div>
  `;
}


/* =========================
   HELPERS
========================= */

function hashString(str){
  let hash = 0;
  for(let i = 0; i < str.length; i++){
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return hash;
}

function getAvatarColor(name){
  const colors = ["#6366f1","#22c55e","#eab308","#ef4444","#06b6d4","#a855f7","#f97316"];
  return colors[Math.abs(hashString(name)) % colors.length];
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

function debounce(fn, delay){
  let t;
  return (...args)=>{
    clearTimeout(t);
    t = setTimeout(()=>fn(...args), delay);
  };
}

})();
