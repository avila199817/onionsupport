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

  Onion.onCleanup(()=> initialized = false);

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

    if(e.target.id === "btn-comment"){
      sendComment();
    }

  });

}


/* =========================
   LOAD
========================= */

async function loadDetalle(){

  const id = getId();
  if(!id) return setError("ID no válido");

  setLoading();

  try{

    const res = await Onion.fetch(Onion.config.API + "/tickets/" + id);
    const data = res?.ticket || res?.data || null;

    if(!data){
      setEmpty();
      clearLoading();
      return;
    }

    currentItem = data;

    render(data);
    clearLoading();

  }catch(err){

    console.error("💥 Error:", err);
    setError("Error cargando incidencia");
    clearLoading();

  }

}


/* =========================
   UPDATE (🔥 TODO EN UNO)
========================= */

async function updateTicket(){

  if(!currentItem) return;

  const id = currentItem.id || currentItem.ticketId;

  const status = $("#edit-estado")?.value;
  const priority = $("#edit-prioridad")?.value;
  const message = $("#edit-message")?.value;

  try{

    setSaving(true);

    await Onion.fetch(Onion.config.API + "/tickets/" + id, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status,
        priority,
        message
      })
    });

    toast("Cambios guardados", "success");
    await loadDetalle();

  }catch(err){

    console.error(err);
    toast("Error guardando cambios", "error");

  }finally{
    setSaving(false);
  }

}


/* =========================
   COMMENT
========================= */

async function sendComment(){

  if(!currentItem) return;

  const text = $("#new-comment")?.value?.trim();
  if(!text) return;

  try{

    await Onion.fetch(Onion.config.API + "/tickets/" + currentItem.id, {
      method:"PATCH",
      headers:{ "Content-Type":"application/json" },
      body: JSON.stringify({ comment:text })
    });

    $("#new-comment").value = "";

    toast("Comentario añadido", "success");

    await loadDetalle();

  }catch(err){

    console.error(err);
    toast("Error enviando comentario", "error");

  }

}


/* =========================
   GET ID
========================= */

function getId(){
  return new URLSearchParams(window.location.search).get("id");
}


/* =========================
   STATES
========================= */

function setLoading(){
  const el = $("#detalle-content");
  if(el){
    el.style.opacity = "0.4";
    el.style.pointerEvents = "none";
  }
}

function clearLoading(){
  const el = $("#detalle-content");
  if(el){
    el.style.opacity = "1";
    el.style.pointerEvents = "auto";
  }
}

function setEmpty(){
  $("#detalle-content").innerHTML = `<div class="user-sub">No encontrada</div>`;
}

function setError(msg){
  $("#detalle-content").innerHTML = `<div class="badge error">${msg}</div>`;
}

function setSaving(active){
  const btn = $("#btn-save");
  if(btn){
    btn.disabled = active;
    btn.textContent = active ? "Guardando..." : "Guardar cambios";
  }
}


/* =========================
   RENDER
========================= */

function render(i){

  const usuario = i.cliente?.nombre || "Usuario";
  const avatar = i.cliente?.avatar;

  setText("#detalle-id", i.id);
  setText("#detalle-usuario", usuario);
  setText("#detalle-titulo", i.subject || "Sin título");
  setText("#detalle-fecha", formatFecha(i.createdAt));

  if($("#edit-message")){
    $("#edit-message").value = i.message || "";
  }

  renderAvatar(usuario, avatar);

  setBadge("#detalle-estado", formatEstado(i.status));
  setBadge("#detalle-prioridad", formatPrioridad(i.priority));

  if($("#edit-estado")) $("#edit-estado").value = i.status;
  if($("#edit-prioridad")) $("#edit-prioridad").value = i.priority;

  renderComments(i.comments);

}


/* =========================
   COMMENTS
========================= */

function renderComments(list){

  const el = $("#comments-list");
  if(!el) return;

  if(!list?.length){
    el.innerHTML = `<div class="user-sub">Sin comentarios</div>`;
    return;
  }

  el.innerHTML = list.map(c => `
    <div class="comment-item ${c.role}">
      <div class="comment-meta">
        ${c.role} · ${formatFecha(c.createdAt)}
      </div>
      <div class="comment-text">${escapeHTML(c.message)}</div>
    </div>
  `).join("");

}


/* =========================
   AVATAR (🔥 BIEN HECHO)
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

function setBadge(sel, d){
  const el = $(sel);
  if(el) el.innerHTML = `<span class="badge ${d.class}">${d.label}</span>`;
}


/* =========================
   HELPERS
========================= */

function setText(sel, val){
  const el = $(sel);
  if(el) el.textContent = val;
}

function formatEstado(s){
  if(s==="closed") return {label:"Cerrada",class:"success"};
  if(s==="in_progress") return {label:"En progreso",class:"warning"};
  return {label:"Abierta",class:"info"};
}

function formatPrioridad(p){
  if(p==="high") return {label:"Alta",class:"error"};
  if(p==="medium") return {label:"Media",class:"warning"};
  return {label:"Baja",class:"neutral"};
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
  return name.split(" ").map(n=>n[0]).join("").slice(0,2).toUpperCase();
}


/* =========================
   TOAST
========================= */

function toast(msg,type="info"){

  let c = document.getElementById("toast-container");

  if(!c){
    c = document.createElement("div");
    c.id = "toast-container";
    document.body.appendChild(c);
  }

  const el = document.createElement("div");
  el.className = "toast toast-" + type;
  el.textContent = msg;

  c.appendChild(el);

  setTimeout(()=> el.classList.add("show"),10);

  setTimeout(()=>{
    el.classList.remove("show");
    setTimeout(()=> el.remove(),300);
  },3000);

}

})();
