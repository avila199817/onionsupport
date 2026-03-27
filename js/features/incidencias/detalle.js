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
    <div style="padding:20px; color:var(--dim);">
      Cargando incidencia...
    </div>
  `;
}

function setEmpty(){
  $("#detalle-content").innerHTML = `
    <div style="padding:20px; color:var(--dim);">
      No se encontró la incidencia
    </div>
  `;
}

function setError(msg){
  $("#detalle-content").innerHTML = `
    <div style="padding:20px; color:#ef4444;">
      ❌ ${msg}
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
    <div style="display:flex; flex-direction:column; gap:16px;">

      <div>
        <strong>ID:</strong> ${escapeHTML(i.id || "--")}
      </div>

      <div>
        <strong>Cliente:</strong> ${escapeHTML(i.name || "-")}
      </div>

      <div>
        <strong>Título:</strong> ${escapeHTML(i.subject || "-")}
      </div>

      <div>
        <strong>Mensaje:</strong><br>
        <div style="margin-top:6px; color:var(--text);">
          ${escapeHTML(i.message || "-")}
        </div>
      </div>

      <div>
        <strong>Estado:</strong>
        <span class="badge ${estado.class}">
          ${estado.label}
        </span>
      </div>

      <div>
        <strong>Prioridad:</strong>
        <span class="badge ${prioridad.class}">
          ${prioridad.label}
        </span>
      </div>

      <div>
        <strong>Fecha:</strong> ${formatFecha(i.createdAt)}
      </div>

    </div>
  `;

}

/* =========================
   FORMAT
========================= */

function formatEstado(s){
  s = (s || "").toLowerCase();

  if(s === "closed") return { label:"Cerrada", class:"cerrada" };
  if(s === "in_progress") return { label:"En progreso", class:"progreso" };

  return { label:"Abierta", class:"abierta" };
}

function formatPrioridad(p){
  p = (p || "").toLowerCase();

  if(p === "high") return { label:"Alta", class:"alta" };
  if(p === "medium") return { label:"Media", class:"media" };

  return { label:"Baja", class:"baja" };
}

function formatFecha(f){
  if(!f) return "--";
  return new Date(f).toLocaleDateString("es-ES");
}

/* =========================
   SECURITY
========================= */

function escapeHTML(str){
  return String(str)
    .replace(/&/g,"&amp;")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;");
}

})();
