"use strict";

(function(){

const Onion = window.Onion;

if(!Onion){
  console.error("💥 Onion no disponible (usuario detalle)");
  return;
}

/* =========================================================
   STATE
========================================================= */
let initialized = false;
let user = null;

let observer = null;

/* 🔥 CONTROL PRO */
let currentRequestId = 0;
let currentAbort = null;


/* =========================================================
   ROOT
========================================================= */
function getRoot(){
  return document.querySelector(".panel-content.usuario-detalle");
}

function $(id){
  const root = getRoot();
  return root ? root.querySelector("#" + id) : null;
}


/* =========================================================
   🔥 LOADER CONTROL (IGUAL FACTURAS)
========================================================= */
function setLoading(active){

  const loader = document.getElementById("usuario-loading");
  const content = document.getElementById("usuario-content");

  if(!loader || !content) return;

  if(active){
    loader.style.display = "flex";
    content.style.display = "none";
  }else{
    loader.style.display = "none";
    content.style.display = "block";
  }

}


/* =========================================================
   🔥 BUTTON STATE
========================================================= */
function setBtnLoading(btn, active, textLoading){

  if(!btn) return;

  if(active){
    btn.dataset.original = btn.textContent;
    btn.textContent = textLoading;
    btn.disabled = true;
    btn.classList.add("loading");
  }else{
    btn.textContent = btn.dataset.original || btn.textContent;
    btn.disabled = false;
    btn.classList.remove("loading");
  }

}


/* =========================================================
   INIT
========================================================= */
function init(){

  const root = getRoot();
  if(!root || initialized) return;

  if(!Onion.state?.user){
    return setTimeout(init,100);
  }

  initialized = true;

  setLoading(true);

  bindEvents();
  observeDOM();

  requestAnimationFrame(()=>{
    loadUser(getId());
  });

  Onion.onCleanup(()=>{
    initialized = false;
    currentRequestId++;
    currentAbort?.abort();
  });

}

init();


/* =========================================================
   OBSERVER (SPA SAFE)
========================================================= */
function observeDOM(){

  if(observer) return;

  observer = new MutationObserver(()=>{
    if(!getRoot()){
      initialized = false;
      currentRequestId++;
      setTimeout(init,100);
    }
  });

  observer.observe(document.body,{
    childList:true,
    subtree:true
  });

}


/* =========================================================
   EVENTS
========================================================= */
function bindEvents(){

  const root = getRoot();
  if(!root) return;

  Onion.cleanupEvent(root,"click", async (e)=>{

    const t = e.target;

    if(t.id === "btn-back"){
      Onion.router.navigate("/usuarios");
    }

    if(t.id === "btn-edit-user"){
      Onion.ui.toast?.info("Editar usuario (pendiente)");
    }

    if(t.id === "btn-toggle-user"){
      await toggleUser(t);
    }

  });

}


/* =========================================================
   ID
========================================================= */
function getId(){
  return new URLSearchParams(location.search).get("id");
}


/* =========================================================
   LOAD
========================================================= */
async function loadUser(id){

  const root = getRoot();
  if(!id || !root){
    setLoading(false);
    return;
  }

  const requestId = ++currentRequestId;

  if(currentAbort) currentAbort.abort();
  currentAbort = new AbortController();

  document.activeElement?.blur();
  setLoading(true);

  clearUI();

  try{

    const res = await fetch(
      `${Onion.config.API}/users/${id}`,
      {
        headers: getAuthHeaders(),
        signal: currentAbort.signal
      }
    );

    if(requestId !== currentRequestId) return;
    if(!res.ok) throw new Error("API ERROR");

    const json = await res.json();

    if(requestId !== currentRequestId) return;

    user = json?.user || json;

    requestAnimationFrame(()=>{
      render();
    });

  }catch(e){

    if(e.name === "AbortError") return;

    if(requestId !== currentRequestId) return;

    console.error("💥 ERROR LOAD USER:", e);
    Onion.ui.toast?.error("Error cargando usuario");

  }finally{

    if(requestId === currentRequestId){
      setTimeout(()=> setLoading(false), 80);
    }

  }

}


/* =========================================================
   CLEAR UI
========================================================= */
function clearUI(){

  set("detalle-nombre","--");
  set("detalle-nombre-full","--");
  set("detalle-email","--");
  set("detalle-id","--");
  set("detalle-rol","--");
  set("detalle-tipo","--");
  set("detalle-estado","--");
  set("detalle-fecha","--");
  set("detalle-notas","--");

}


/* =========================================================
   RENDER
========================================================= */
function render(){

  if(!user) return;

  set("detalle-nombre", user.name || user.username);
  set("detalle-nombre-full", user.name || user.username);
  set("detalle-email", user.email || "-");
  set("detalle-id", "ID: " + user.id);
  set("detalle-rol", user.role || "-");
  set("detalle-tipo", user.tipo || "-");
  set("detalle-estado", user.active ? "Activo" : "Inactivo");
  set("detalle-fecha", formatFecha(user.createdAt || user.created_at));
  set("detalle-notas", user.notas || "-");

  renderAvatar(user);

}


/* =========================================================
   ACTIONS
========================================================= */
async function toggleUser(btn){

  if(!user) return;

  setBtnLoading(btn, true, "Procesando...");

  try{

    const res = await fetch(
      `${Onion.config.API}/users/${user.id}/toggle`,
      {
        method:"POST",
        headers: getAuthHeaders()
      }
    );

    const data = await res.json();

    if(!data.ok) throw new Error();

    user.active = !user.active;

    render();

    Onion.ui.toast?.success("Estado actualizado");

  }catch(e){

    console.error("💥 TOGGLE ERROR:", e);
    Onion.ui.toast?.error("Error actualizando usuario");

  }

  setBtnLoading(btn, false);

}


/* =========================================================
   AUTH
========================================================= */
function getAuthHeaders(){
  const token = Onion.auth?.getToken?.();
  return token ? { Authorization: "Bearer " + token } : {};
}


/* =========================================================
   HELPERS
========================================================= */
function set(id, value){
  const el = $(id);
  if(el) el.textContent = value || "-";
}

function formatFecha(f){
  return f ? new Date(f).toLocaleDateString("es-ES") : "--";
}


/* =========================================================
   AVATAR
========================================================= */
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
