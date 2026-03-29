"use strict";

(function(){

const Onion = window.Onion;

if(!Onion){
  console.error("💥 Onion no disponible (incidencias)");
  return;
}

let initialized = false;
let currentItems = [];
let filteredItems = [];

/* =========================
   ROOT
========================= */

function getRoot(){
  return document.querySelector(".panel-content.incidencias");
}

function $(selector){
  return getRoot()?.querySelector(selector);
}

/* =========================
   SPA NAV
========================= */

function showView(viewClass){

  document.querySelectorAll(".panel-content")
    .forEach(v => v.style.display = "none");

  const view = document.querySelector(`.panel-content.${viewClass}`);
  if(view) view.style.display = "flex";

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
  loadIncidencias();

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

    Onion.router.navigate(`/incidencias/detalle?id=${id}`);

  });

  $("#btn-new-incidencia")?.onclick = crearIncidencia;

  $("#search-incidencia")?.addEventListener("input", debounce(applyFilters, 250));
  $("#filter-status")?.addEventListener("change", applyFilters);
  $("#filter-priority")?.addEventListener("change", applyFilters);

  document.addEventListener("click", globalEvents);

}

/* =========================
   GLOBAL EVENTS
========================= */

function globalEvents(e){

  if(e.target.id === "btn-back"){
    showView("incidencias");
  }

  if(e.target.id === "btn-save-incidencia"){
    saveIncidencia();
  }

}

/* =========================
   NUEVA INCIDENCIA
========================= */

function crearIncidencia(){
  Onion.router.navigate("/incidencias/nueva");
}

/* =========================
   SAVE
========================= */

async function saveIncidencia(){

  const data = {
    message: document.getElementById("inc-message")?.value || "",
    subject: document.getElementById("inc-title")?.value || "",
    name: Onion.state?.user?.name || "",
    priority: document.getElementById("inc-priority")?.value || "low"
  };

  if(!data.message.trim()){
    alert("⚠️ El mensaje es obligatorio");
    return;
  }

  try{

    await Onion.fetch(Onion.config.API + "/tickets", {
      method: "POST",
      body: JSON.stringify(data)
    });

    showView("incidencias");
    loadIncidencias();

  }catch(err){

    console.error("💥 Error creando incidencia:", err);
    alert("❌ Error creando incidencia");

  }

}

/* =========================
   FILTERS
========================= */

function applyFilters(){

  const search = ($("#search-incidencia")?.value || "").toLowerCase();
  const status = ($("#filter-status")?.value || "").toLowerCase();
  const priority = ($("#filter-priority")?.value || "").toLowerCase();

  filteredItems = currentItems.filter(i => {

    const title = (i.message || i.subject || "").toLowerCase();
    const usuario = (Onion.state?.user?.name || "").toLowerCase();

    const itemStatus = mapStatus(i.status);
    const itemPriority = mapPriority(i.priority);

    return (
      (!search || title.includes(search) || usuario.includes(search) || String(i.id).includes(search)) &&
      (!status || itemStatus === status) &&
      (!priority || itemPriority === priority)
    );

  });

  render(filteredItems);

}

/* =========================
   LOAD
========================= */

async function loadIncidencias(){

  const panel = getRoot();
  const tbody = $("#incidencias-body");

  panel?.classList.remove("ready");

  if(!tbody) return;

  setLoading();

  try{

    const res = await Onion.fetch(Onion.config.API + "/tickets");
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

    console.error("💥 ERROR INCIDENCIAS:", e);
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
  if(res.tickets) return res.tickets;
  if(res.data) return res.data;
  return [];
}

/* =========================
   STATES
========================= */

function setLoading(){
  $("#incidencias-body").innerHTML =
    `<tr><td colspan="8">Cargando incidencias...</td></tr>`;
}

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
      <tr data-id="${d.id}" style="cursor:pointer">

        <td>${d.id}</td>

        <td>${escapeHTML(d.title)}</td>

        <td>
          <div class="cell-user">
            <div class="table-avatar">
              ${renderAvatar(d)}
            </div>
            <div class="user-info">
              <span class="user-name">${escapeHTML(d.usuario)}</span>
            </div>
          </div>
        </td>

        <td>${escapeHTML(d.tecnico)}</td>

        <td><span class="badge ${d.estado.class}">${d.estado.label}</span></td>

        <td><span class="badge ${d.prioridad.class}">${d.prioridad.label}</span></td>

        <td>${d.fecha}</td>
        <td>${d.fechaCierre}</td>

      </tr>
    `;

  }).join("");

  tbody.innerHTML = html;

}

/* =========================
   MAP
========================= */

function mapItem(i){

  const user = Onion.state?.user;

  return {
    id: i.id || i.ticketId || "--",
    title: i.message || i.subject || "Sin título",
    usuario: user?.name || i.name || "-",
    tecnico: i.tecnico?.name || "-",

    // 🔥 AVATAR REAL FUNCIONANDO
    avatar: user?.avatar || null,

    estado: getEstado(i),
    prioridad: getPrioridad(i),
    fecha: formatFecha(i.createdAt),
    fechaCierre: i.status === "closed"
      ? formatFecha(i._ts ? i._ts * 1000 : i.closedAt)
      : "-"
  };
}

/* =========================
   AVATAR 🔥
========================= */

function renderAvatar(d){

  if(d.avatar){
    return `
      <img 
        src="${d.avatar}" 
        alt="${escapeHTML(d.usuario)}"
        loading="lazy"
        referrerpolicy="no-referrer"
        onerror="this.remove(); this.parentNode.innerHTML='${getInitials(d.usuario)}';"
      >
    `;
  }

  return getInitials(d.usuario);
}

/* =========================
   HELPERS
========================= */

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
  return name
    .split(" ")
    .map(n => n[0])
    .join("")
    .slice(0,2)
    .toUpperCase();
}

function debounce(fn, delay){
  let t;
  return function(...args){
    clearTimeout(t);
    t = setTimeout(()=> fn.apply(this, args), delay);
  };
}

})();
