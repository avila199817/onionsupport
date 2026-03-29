"use strict";

(function(){

const Onion = window.Onion;

if(!Onion){
  console.error("💥 Onion no disponible (detalle.js)");
  return;
}

let initialized = false;
let currentItem = null;

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

    if(e.target.id === "btn-save"){
      updateTicket();
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

    const res = await Onion.fetch(Onion.config.API + "/tickets/" + id);

    // 🔥 NORMALIZACIÓN PRO
    const data = res?.ticket || res?.data || res?.incidencia || null;

    if(!data){
      setEmpty();
      return;
    }

    currentItem = data;
    render(data);

  }catch(err){

    console.error("💥 Error cargando incidencia:", err);
    setError("Error cargando incidencia");

  }

}


/* =========================
   UPDATE (PATCH)
========================= */

async function updateTicket(){

  if(!currentItem?.id && !currentItem?.ticketId) return;

  const id = currentItem.id || currentItem.ticketId;

  const status = $("#edit-estado")?.value;
  const priority = $("#edit-prioridad")?.value;

  try{

    setSaving(true);

    await Onion.fetch(Onion.config.API + "/tickets/" + id, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status,
        priority
      })
    });

    // 🔥 Reload limpio
    await loadDetalle();

  }catch(err){

    console.error("💥 Error actualizando:", err);
    toast("Error actualizando incidencia", "error");

  }finally{
    setSaving(false);
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
  const grid = $(".form-grid");
  if(grid){
    grid.innerHTML = `<div class="user-sub">Cargando incidencia...</div>`;
  }
}

function setEmpty(){
  const grid = $(".form-grid");
  if(grid){
    grid.innerHTML = `<div class="user-sub">No se encontró la incidencia</div>`;
  }
}

function setError(msg){
  const grid = $(".form-grid");
  if(grid){
    grid.innerHTML = `<div class="badge error">❌ ${msg}</div>`;
  }
}

function setSaving(active){
  const btn = $("#btn-save");
  if(!btn) return;

  btn.disabled = active;
  btn.textContent = active ? "Guardando..." : "Guardar cambios";
}


/* =========================
   RENDER
========================= */

function render(i){

  const usuario = i.cliente?.nombre || i.name || "Usuario";
  const avatar = i.cliente?.avatar || null;

  setText("#detalle-id", i.id || i.ticketId || "--");
  setText("#detalle-usuario", usuario);
  setText("#detalle-titulo", i.subject || "-");
  setText("#detalle-mensaje", i.message || "-");
  setText("#detalle-fecha", formatFecha(i.createdAt));

  renderAvatar(usuario, avatar);

  const estado = formatEstado(i.status);
  const prioridad = formatPrioridad(i.priority);

  setBadge("#detalle-estado", estado);
  setBadge("#detalle-prioridad", prioridad);

  if($("#edit-estado")) $("#edit-estado").value = i.status || "open";
  if($("#edit-prioridad")) $("#edit-prioridad").value = i.priority || "low";

}


/* =========================
   AVATAR
========================= */

function renderAvatar(nombre, avatar){

  const el = $("#detalle-avatar");
  if(!el) return;

  if(avatar){
    el.innerHTML = `<img src="${avatar}" alt="${escapeHTML(nombre)}" />`;
  }else{
    el.innerHTML = `<div class="avatar-fallback">${getInitials(nombre)}</div>`;
  }

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
   TOAST (PRO)
========================= */

function toast(msg, type="info"){

  let container = document.getElementById("toast-container");

  if(!container){
    container = document.createElement("div");
    container.id = "toast-container";
    document.body.appendChild(container);
  }

  const el = document.createElement("div");
  el.className = "toast toast-" + type;
  el.textContent = msg;

  container.appendChild(el);

  setTimeout(()=> el.classList.add("show"), 10);

  setTimeout(()=>{
    el.classList.remove("show");
    setTimeout(()=> el.remove(), 300);
  }, 3000);

}


/* =========================
   HELPERS
========================= */

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

})();
