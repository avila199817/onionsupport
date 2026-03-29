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
  const root = getRoot();
  return root ? root.querySelector(selector) : null;
}

/* =========================
   INIT
========================= */

function init(){

  const root = getRoot();
  if(!root || initialized) return;

  if(!Onion.state || !Onion.state.user){
    setTimeout(init, 100);
    return;
  }

  initialized = true;

  bindEvents();
  loadIncidencias();

  Onion.onCleanup(function(){
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

  Onion.cleanupEvent(root, "click", function(e){

    if(e.target.closest("button")) return;

    const row = e.target.closest("tr[data-id]");
    if(!row) return;

    const id = row.dataset.id;
    if(!id) return;

    Onion.router.navigate("/incidencias/detalle?id=" + id);

  });

  const btnNew = $("#btn-new-incidencia");
  if(btnNew){
    btnNew.onclick = function(){
      Onion.router.navigate("/incidencias/nueva");
    };
  }

  const search = $("#search-incidencia");
  if(search){
    search.addEventListener("input", debounce(applyFilters, 250));
  }

  const status = $("#filter-status");
  if(status){
    status.addEventListener("change", applyFilters);
  }

  const priority = $("#filter-priority");
  if(priority){
    priority.addEventListener("change", applyFilters);
  }

}

/* =========================
   LOAD
========================= */

async function loadIncidencias(){

  const panel = getRoot();
  const tbody = $("#incidencias-body");

  if(!tbody) return;

  if(panel) panel.classList.remove("ready");

  setLoading();

  try{

    const res = await Onion.fetch(Onion.config.API + "/tickets");

    const items = normalize(res);

    currentItems = items;
    filteredItems = items;

    if(!items || items.length === 0){
      setEmpty();
      if(panel) panel.classList.add("ready");
      return;
    }

    render(items);

    if(panel) panel.classList.add("ready");

  }catch(e){

    console.error("💥 ERROR INCIDENCIAS:", e);
    setError();

    if(panel) panel.classList.add("ready");

  }

}

/* =========================
   NORMALIZE
========================= */

function normalize(res){

  if(!res) return [];

  if(Array.isArray(res)) return res;

  if(res.tickets && Array.isArray(res.tickets)) return res.tickets;

  if(res.data && Array.isArray(res.data)) return res.data;

  if(res.items && Array.isArray(res.items)) return res.items;

  return [];

}

/* =========================
   FILTERS
========================= */

function applyFilters(){

  const searchVal = ($("#search-incidencia")?.value || "").toLowerCase();
  const statusVal = ($("#filter-status")?.value || "").toLowerCase();
  const priorityVal = ($("#filter-priority")?.value || "").toLowerCase();

  filteredItems = currentItems.filter(function(i){

    const title = (i.message || i.subject || "").toLowerCase();
    const id = String(i.id || "").toLowerCase();

    const s = mapStatus(i.status);
    const p = mapPriority(i.priority);

    if(searchVal && !(title.includes(searchVal) || id.includes(searchVal))){
      return false;
    }

    if(statusVal && s !== statusVal){
      return false;
    }

    if(priorityVal && p !== priorityVal){
      return false;
    }

    return true;

  });

  render(filteredItems);

}

/* =========================
   STATES
========================= */

function setLoading(){
  const el = $("#incidencias-body");
  if(el){
    el.innerHTML = `<tr><td colspan="8">Cargando incidencias...</td></tr>`;
  }
}

function setEmpty(){
  const el = $("#incidencias-body");
  if(el){
    el.innerHTML = `<tr><td colspan="8">No hay incidencias</td></tr>`;
  }
}

function setError(){
  const el = $("#incidencias-body");
  if(el){
    el.innerHTML = `<tr><td colspan="8">Error cargando incidencias</td></tr>`;
  }
}

/* =========================
   RENDER
========================= */

function render(items){

  const tbody = $("#incidencias-body");
  if(!tbody) return;

  let html = "";

  for(let i=0;i<items.length;i++){

    const d = mapItem(items[i]);

    html += `
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
  }

  tbody.innerHTML = html;

}

/* =========================
   MAP
========================= */

function mapItem(i){

  const user = Onion.state.user;

  return {
    id: i.id || i.ticketId || "--",
    title: i.message || i.subject || "Sin título",
    usuario: (user && user.name) ? user.name : (i.name || "-"),
    tecnico: i.tecnico && i.tecnico.name ? i.tecnico.name : "-",
    avatar: user && user.avatar ? user.avatar : null,
    estado: getEstado(i),
    prioridad: getPrioridad(i),
    fecha: formatFecha(i.createdAt),
    fechaCierre: i.status === "closed"
      ? formatFecha(i._ts ? i._ts * 1000 : i.closedAt)
      : "-"
  };

}

/* =========================
   AVATAR
========================= */

function renderAvatar(d){

  if(d.avatar){
    return `<img src="${d.avatar}" alt=""
      onerror="this.remove(); this.parentNode.innerHTML='${getInitials(d.usuario)}';">`;
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
  return name.split(" ").map(function(n){ return n[0]; }).join("").slice(0,2).toUpperCase();
}

function debounce(fn, delay){
  let t;
  return function(){
    clearTimeout(t);
    const args = arguments;
    t = setTimeout(function(){
      fn.apply(null, args);
    }, delay);
  };
}

})();
