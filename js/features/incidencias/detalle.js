"use strict";

(function(){

const Onion = window.Onion;

if(!Onion){
  console.error("💥 Onion no disponible (detalle.js)");
  return;
}

let initialized = false;

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
  loadDetalle();

  Onion.onCleanup(()=>{
    initialized = false;
  });

}

init();

/* =========================
   ROOT
========================= */

function getRoot(){
  return document.querySelector(".panel-content.incidencia-detalle");
}

function $(selector){
  return getRoot()?.querySelector(selector);
}

/* =========================
   EVENTS
========================= */

function bindEvents(){

  const root = getRoot();
  if(!root) return;

  Onion.cleanupEvent(root, "click", (e)=>{

    if(e.target.id === "btn-back"){
      Onion.router.navigate("/incidencias");
    }

  });

}

/* =========================
   LOAD
========================= */

async function loadDetalle(){

  const container = $("#detalle-content");
  if(!container) return;

  const id = getId();

  if(!id){
    setError("ID no válido");
    return;
  }

  setLoading();

  try{

    const data = await Onion.fetch(Onion.config.API + "/tickets/" + id);

    if(!data){
      setEmpty();
      return;
    }

    render(data);

  }catch(err){

    console.error("💥 Error cargando incidencia:", err);
    setError("Error cargando incidencia");

  }

}

/* =========================
   GET ID
========================= */

function getId(){
  const params = new URLSearchParams(window.location.search);
  return params.get("id");
}

/* =========================
   STATES
========================= */

function setLoading(){
  $("#detalle-content").innerHTML = `
    <div class="form-grid">
      <div class="user-sub">Cargando incidencia...</div>
    </div>
  `;
}

function setEmpty(){
  $("#detalle-content").innerHTML = `
    <div class="form-grid">
      <div class="user-sub">No se encontró la incidencia</div>
    </div>
  `;
}

function setError(msg){
  $("#detalle-content").innerHTML = `
    <div class="form-grid">
      <div class="badge error">❌ ${msg}</div>
    </div>
  `;
}

/* =========================
   RENDER
========================= */

function render(i){

  const estado = formatEstado(i.status);
  const prioridad = formatPrioridad(i.priority);

  $("#detalle-content").innerHTML = `
    <div class="form-grid">

      <!-- HEADER INFO -->
      <div class="cell-user">
        <div class="table-avatar">
          ${getInitials(i.name)}
        </div>
        <div class="user-info">
          <span class="user-name">${escapeHTML(i.name || "Usuario")}</span>
          <span class="user-sub">Ticket #${escapeHTML(i.id || "--")}</span>
        </div>
      </div>

      <!-- TÍTULO -->
      <div>
        <div class="user-sub">Título</div>
        <div class="user-name">${escapeHTML(i.subject || "-")}</div>
      </div>

      <!-- MENSAJE -->
      <div>
        <div class="user-sub">Mensaje</div>
        <div class="col-main">${escapeHTML(i.message || "-")}</div>
      </div>

      <!-- ESTADO + PRIORIDAD -->
      <div style="display:flex; gap:10px; flex-wrap:wrap;">

        <span class="badge ${estado.class}">
          ${estado.label}
        </span>

        <span class="badge ${prioridad.class}">
          ${prioridad.label}
        </span>

      </div>

      <!-- FECHA -->
      <div>
        <div class="user-sub">Fecha</div>
        <div>${formatFecha(i.createdAt)}</div>
      </div>

    </div>
  `;

}

/* =========================
   FORMAT
========================= */

function formatEstado(s){
  s = (s || "").toLowerCase();

  if(s === "closed") return { label:"Cerrada", class:"success" };
  if(s === "in_progress") return { label:"En progreso", class:"warning" };

  return { label:"Abierta", class:"info" };
}

function formatPrioridad(p){
  p = (p || "").toLowerCase();

  if(p === "high") return { label:"Alta", class:"error" };
  if(p === "medium") return { label:"Media", class:"warning" };

  return { label:"Baja", class:"neutral" };
}

function formatFecha(f){
  if(!f) return "--";
  return new Date(f).toLocaleDateString("es-ES");
}

/* =========================
   HELPERS
========================= */

function getInitials(name){
  if(!name) return "?";
  return name.split(" ").map(n => n[0]).join("").slice(0,2).toUpperCase();
}

function escapeHTML(str){
  return String(str)
    .replace(/&/g,"&amp;")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;");
}

})();
