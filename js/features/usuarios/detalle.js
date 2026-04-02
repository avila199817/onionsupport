"use strict";

(function(){

const Onion = window.Onion;

if(!Onion){
  console.error("💥 Onion no disponible (usuario detalle)");
  return;
}

let initialized = false;

/* =========================
   ROOT
========================= */

function getRoot(){
  return document.querySelector(".panel-content.usuario-detalle");
}

function $(id){
  return getRoot()?.querySelector("#" + id);
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
  loadUser();

  Onion.onCleanup(()=>{
    initialized = false;
  });

}

init();

/* =========================
   EVENTS
========================= */

function bindEvents(){

  const btnBack = $("btn-back");

  if(btnBack){
    Onion.cleanupEvent(btnBack, "click", ()=>{
      Onion.router.navigate("/usuarios");
    });
  }

}

/* =========================
   GET ID
========================= */

function getId(){
  const params = new URLSearchParams(location.search);
  return params.get("id");
}

/* =========================
   LOAD
========================= */

async function loadUser(){

  const id = getId();
  if(!id) return;

  try{

    const res = await Onion.fetch(Onion.config.API + "/users/" + id);
    const u = res?.user || res;

    if(!u) return;

    render(u);

  }catch(err){
    console.error("💥 ERROR USER DETALLE:", err);
  }

}

/* =========================
   RENDER
========================= */

function render(u){

  set("detalle-nombre", u.name || u.username);
  set("detalle-nombre-full", u.name || u.username);
  set("detalle-email", u.email);
  set("detalle-id", "ID: " + u.id);
  set("detalle-rol", u.role || "-");
  set("detalle-tipo", u.tipo || "-");
  set("detalle-estado", u.active ? "Activo" : "Inactivo");
  set("detalle-fecha", formatFecha(u.createdAt || u.created_at));
  set("detalle-notas", u.notas || "-");

  renderAvatar(u);

}

/* =========================
   HELPERS
========================= */

function set(id, value){
  const el = $(id);
  if(el) el.textContent = value || "-";
}

function formatFecha(f){
  if(!f) return "-";
  return new Date(f).toLocaleDateString("es-ES");
}

/* =========================
   AVATAR
========================= */

function getInitials(name){
  if(!name) return "?";
  return name
    .split(" ")
    .map(n => n[0])
    .slice(0,2)
    .join("")
    .toUpperCase();
}

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

function renderAvatar(u){

  const el = $("detalle-avatar");
  if(!el) return;

  const name = u.name || u.username || "U";
  const initials = getInitials(name);
  const color = getAvatarColor(name);

  el.innerHTML = `
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
    ">
      ${initials}
    </div>
  `;
}

})();
