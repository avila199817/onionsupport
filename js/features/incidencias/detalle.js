"use strict";

(function(){

const Onion = window.Onion;

if(!Onion){
  console.error("💥 Onion no disponible (detalle.js)");
  return;
}

/* =========================================================
   STATE
========================================================= */
let initialized = false;
let currentItem = null;

let observer = null;

let sending = false;
let deleting = false;

let selectedFiles = [];

/* 🔥 CONTROL PRO */
let currentRequestId = 0;
let currentAbort = null;


/* =========================================================
   ROOT
========================================================= */
function getRoot(){
  return document.querySelector(".panel-view.incidencia-detalle");
}

function $(selector){
  const root = getRoot();
  return root ? root.querySelector(selector) : null;
}


/* =========================================================
   INIT
========================================================= */
function init(){

  const root = getRoot();
  if(!root || initialized) return;

  if(!Onion.state?.user){
    return setTimeout(init, 100);
  }

  initialized = true;

  /* 🔥 FORZAR LOADER DESDE EL PRIMER FRAME */
  root.classList.add("loading");

  bindEvents();
  observeDOM();

  /* 🔥 Espera 1 frame para evitar paint previo */
  requestAnimationFrame(()=>{
    loadDetalle();
  });

  Onion.onCleanup(()=>{
    initialized = false;
    currentAbort?.abort();
  });

}

init();


/* =========================================================
   AUTH
========================================================= */
function getAuthHeaders(){
  const token = Onion.auth?.getToken?.();
  return token ? { Authorization: "Bearer " + token } : {};
}


/* =========================================================
   OBSERVER
========================================================= */
function observeDOM(){

  if(observer) return;

  observer = new MutationObserver(()=>{
    if(!getRoot()){
      initialized = false;
      setTimeout(init, 100);
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
      Onion.router.navigate("/incidencias");
    }

    if(t.id === "btn-save"){
      if(sending) return;
      await updateTicket();
    }

    if(t.id === "btn-attach"){
      $("#inc-files")?.click();
    }

    if(t.classList.contains("file-remove")){
      const i = Number(t.dataset.index);
      selectedFiles.splice(i,1);
      renderFiles();
    }

    if(t.classList.contains("blob-download")){
      downloadBlob(t.dataset.url, t.dataset.name);
    }

    if(t.classList.contains("blob-delete")){
      if(deleting) return;
      await deleteBlob(t.dataset.url);
    }

  });

  Onion.cleanupEvent(root,"change",(e)=>{

    if(e.target.id === "inc-files"){
      selectedFiles = [...selectedFiles, ...e.target.files];
      renderFiles();
      e.target.value = "";
    }

  });

}


/* =========================================================
   LOAD DETALLE
========================================================= */
async function loadDetalle(){

  const root = getRoot();
  const id = getId();

  if(!id || !root) return;

  const requestId = ++currentRequestId;

  if(currentAbort) currentAbort.abort();
  currentAbort = new AbortController();

  /* 🔥 UX CONTROL TOTAL */
  document.activeElement?.blur();
  root.classList.add("loading");

  clearUI();

  try{

    const res = await fetch(Onion.config.API + "/tickets/" + id,{
      headers:getAuthHeaders(),
      signal:currentAbort.signal
    });

    if(requestId !== currentRequestId) return;
    if(!res.ok) throw new Error();

    const json = await res.json();

    if(requestId !== currentRequestId) return;

    currentItem = json?.ticket || json;

    /* 🔥 PINTADO SUAVE (evita flicker) */
    requestAnimationFrame(()=>{
      render(currentItem);
    });

  }catch(err){

    if(err.name === "AbortError") return;

    console.error("💥 loadDetalle:", err);
    showToast("❌ Error cargando");

  }finally{

    if(requestId === currentRequestId){

      /* 🔥 PEQUEÑO DELAY PARA SUAVIDAD VISUAL */
      setTimeout(()=>{
        root.classList.remove("loading");
      }, 80);

    }

  }

}


/* =========================================================
   CLEAR UI
========================================================= */
function clearUI(){

  setText("#detalle-usuario","--");
  setText("#detalle-userid","--");
  setText("#detalle-id","--");
  setText("#detalle-fecha","--");
  setText("#detalle-fecha-cierre","--");
  setText("#detalle-tecnico","--");
  setText("#detalle-titulo","--");

  const msg = $("#detalle-mensaje");
  if(msg) msg.textContent = "";

}


/* =========================================================
   RENDER
========================================================= */
function render(i){

  if(!i) return;

  const nombre =
    i?.cliente?.nombre ||
    i?.name ||
    i?.userName ||
    "Usuario";

  const avatar =
    i?.cliente?.avatar ||
    i?.avatar ||
    null;

  setText("#detalle-usuario", nombre);
  setText("#detalle-userid", i?.userId || "--");

  setText("#detalle-id", i?.id);
  setText("#detalle-fecha", formatFecha(i?.createdAt));
  setText("#detalle-fecha-cierre", formatFecha(i?.closedAt));

  const tecnico =
    typeof i?.assignedTo === "object"
      ? i?.assignedTo?.name
      : i?.assignedTo;

  setText("#detalle-tecnico", tecnico || "No asignado");

  setText("#detalle-titulo", i?.subject);

  const msg = $("#detalle-mensaje");
  if(msg){
    msg.textContent = i?.message || "";
  }

  if($("#edit-estado")) $("#edit-estado").value = i?.status || "open";
  if($("#edit-prioridad")) $("#edit-prioridad").value = i?.priority || "low";

  renderAvatar(nombre, avatar);

  const userFiles = (i?.attachments || []).filter(f => f.type !== "team");
  const teamFiles = (i?.attachments || []).filter(f => f.type === "team");

  renderBlobs("#detalle-blobs-user", userFiles, true);
  renderBlobs("#detalle-blobs-team", teamFiles, false);

}


/* =========================================================
   AVATAR
========================================================= */
function renderAvatar(nombre, avatar){

  const el = $("#detalle-avatar");
  if(!el) return;

  el.innerHTML = "";

  if(avatar){
    el.innerHTML = `<img src="${avatar}" />`;
    return;
  }

  const initials = (nombre || "U")
    .split(" ")
    .map(w=>w[0])
    .slice(0,2)
    .join("")
    .toUpperCase();

  el.textContent = initials;

}


/* =========================================================
   FILE LIST
========================================================= */
function renderFiles(){

  const list = $("#file-list");
  if(!list) return;

  list.innerHTML = selectedFiles.map((f,i)=>`
    <div class="blob-item">
      <span>${f.name}</span>
      <button class="blob-delete file-remove" data-index="${i}">✕</button>
    </div>
  `).join("");

}


/* =========================================================
   BLOBS
========================================================= */
function renderBlobs(selector, files, allowDelete){

  const c = $(selector);
  if(!c) return;

  if(!files || !files.length){
    c.innerHTML = `<div class="view-hint">Sin archivos</div>`;
    return;
  }

  c.innerHTML = files.map(f=>`
    <div class="blob-item">
      <span>${f.name}</span>

      <div class="blob-actions">
        <button class="blob-download" data-url="${f.url}" data-name="${f.name}">
          Descargar
        </button>

        ${allowDelete ? `
          <button class="blob-delete" data-url="${f.url}">
            🗑️
          </button>
        ` : ""}
      </div>
    </div>
  `).join("");

}


/* =========================================================
   DELETE
========================================================= */
async function deleteBlob(url){

  if(!confirm("¿Eliminar archivo?")) return;

  deleting = true;

  try{

    const res = await fetch(Onion.config.API + "/tickets/" + currentItem.id,{
      method:"PATCH",
      headers:{
        "Content-Type":"application/json",
        ...getAuthHeaders()
      },
      body:JSON.stringify({
        deleteAttachments:[url]
      })
    });

    if(!res.ok) throw new Error();

    const json = await res.json();

    currentItem = {
      ...currentItem,
      ...(json?.ticket || json)
    };

    render(currentItem);

    showToast("🗑️ Archivo eliminado");

  }catch{
    showToast("❌ Error eliminando");
  }

  deleting = false;

}


/* =========================================================
   UPDATE
========================================================= */
async function updateTicket(){

  if(!currentItem) return;

  sending = true;
  setSaving(true);

  try{

    const res = await fetch(Onion.config.API + "/tickets/" + currentItem.id,{
      method:"PATCH",
      headers:{
        "Content-Type":"application/json",
        ...getAuthHeaders()
      },
      body:JSON.stringify({
        status: $("#edit-estado")?.value,
        priority: $("#edit-prioridad")?.value,
        message: $("#detalle-mensaje")?.innerText.trim()
      })
    });

    if(!res.ok) throw new Error();

    const json = await res.json();

    currentItem = {
      ...currentItem,
      ...(json?.ticket || json)
    };

    render(currentItem);

    showToast("✔ Guardado");

  }catch(err){
    console.error(err);
    showToast("❌ Error guardando");
  }

  sending = false;
  setSaving(false);

}


/* =========================================================
   HELPERS
========================================================= */
function setText(sel,val){
  const el = $(sel);
  if(el) el.textContent = val || "--";
}

function formatFecha(f){
  return f ? new Date(f).toLocaleDateString("es-ES") : "--";
}

function getId(){
  return new URLSearchParams(location.search).get("id");
}

function setSaving(active){
  const btn = $("#btn-save");
  if(btn){
    btn.disabled = active;
    btn.textContent = active ? "Guardando..." : "Guardar cambios";
  }
}

function downloadBlob(url,name){
  const a=document.createElement("a");
  a.href=url;
  a.download=name;
  a.click();
}


/* =========================================================
   TOAST
========================================================= */
function showToast(msg){

  if(Onion.toast){
    Onion.toast(msg);
    return;
  }

  const el=document.createElement("div");
  el.innerText=msg;

  el.style.position="fixed";
  el.style.bottom="20px";
  el.style.right="20px";
  el.style.padding="10px 14px";
  el.style.background="#111";
  el.style.color="#fff";
  el.style.borderRadius="8px";
  el.style.fontSize="13px";
  el.style.zIndex="9999";

  document.body.appendChild(el);

  setTimeout(()=>el.remove(),2000);
}

})();
