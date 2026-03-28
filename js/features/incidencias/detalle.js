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
   STATES (SOFT UI)
========================= */

function setLoading(){

  const grid = $(".form-grid");
  if(!grid) return;

  grid.innerHTML = `<div class="user-sub">Cargando incidencia...</div>`;
}

function setEmpty(){

  const grid = $(".form-grid");
  if(!grid) return;

  grid.innerHTML = `<div class="user-sub">No se encontró la incidencia</div>`;
}

function setError(msg){

  const grid = $(".form-grid");
  if(!grid) return;

  grid.innerHTML = `<div class="badge error">❌ ${msg}</div>`;
}


/* =========================
   RENDER (🔥 LIMPIO)
========================= */

function render(i){

  // básicos
  setText("#detalle-id", i.id || "--");
  setText("#detalle-usuario", i.name || "Usuario");
  setText("#detalle-titulo", i.subject || "-");
  setText("#detalle-mensaje", i.message || "-");
  setText("#detalle-fecha", formatFecha(i.createdAt));

  // badges
  const estado = formatEstado(i.status);
  const prioridad = formatPrioridad(i.priority);

  setBadge("#detalle-estado", estado);
  setBadge("#detalle-prioridad", prioridad);

}


/* =========================
   BADGES
========================= */

function setBadge(selector, data){

  const el = $(selector);
  if(!el) return;

  el.innerHTML = `
    <span class="badge ${data.class}">
      ${data.label}
    </span>
  `;
}


/* =========================
   TEXT
========================= */

function setText(selector, value){

  const el = $(selector);
  if(!el) return;

  el.textContent = value;
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
   SECURITY
========================= */

function escapeHTML(str){
  return String(str)
    .replace(/&/g,"&amp;")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;");
}

})();
