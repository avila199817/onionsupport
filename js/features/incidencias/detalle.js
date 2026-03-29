"use strict";

(function(){

const Onion = window.Onion;

if(!Onion){
  console.error("💥 Onion no disponible (detalle.js)");
  return;
}

let initialized = false;
let currentItem = null;
let observer = null;


/* =========================
   INIT
========================= */

function init(){

  if(initialized) return;

  const root = getRoot();

  if(!root){
    return setTimeout(init, 100);
  }

  if(!Onion.state?.user){
    return setTimeout(init, 100);
  }

  initialized = true;

  bindEvents();
  loadDetalle();
  observeDOM();

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
   OBSERVER
========================= */

function observeDOM(){

  if(observer) return;

  observer = new MutationObserver(()=>{
    if(!getRoot()){
      initialized = false;
      setTimeout(init, 100);
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });

}


/* =========================
   EVENTS
========================= */

function bindEvents(){

  const root = getRoot();
  if(!root) return;

  Onion.cleanupEvent(root, "click", async (e)=>{

    const target = e.target;

    if(target.id === "btn-back"){
      Onion.router.navigate("/incidencias");
    }

    if(target.id === "btn-save"){
      await updateTicket();
    }

    if(target.id === "btn-attach-detalle"){
      $("#detalle-files")?.click();
    }

    if(target.classList.contains("blob-download")){
      downloadBlob(target.dataset.url, target.dataset.name);
    }

  });

  Onion.cleanupEvent(root, "change", (e)=>{

    if(e.target.id === "detalle-files"){
      renderFiles(e.target.files);
    }

    if(e.target.id === "edit-estado" || e.target.id === "edit-prioridad"){
      applyVisualState();
    }

  });

}


/* =========================
   LOAD (🔥 SIN CACHE)
========================= */

async function loadDetalle(){

  const id = getId();
  if(!id) return;

  try{

    const res = await fetch(Onion.config.API + "/tickets/" + id + "?t=" + Date.now(), {
      cache: "no-store"
    });

    const json = await res.json();
    const data = json?.ticket || json;

    currentItem = data;
    render(data);

  }catch(err){
    console.error(err);
  }

}


/* =========================
   UPDATE (🔥 FIX REAL)
========================= */

async function updateTicket(){

  if(!currentItem) return;

  const id = currentItem.id || currentItem.ticketId;

  const status = $("#edit-estado")?.value;
  const priority = $("#edit-prioridad")?.value;
  const message = $("#detalle-mensaje")?.innerText?.trim();

  const filesInput = $("#detalle-files");
  const files = filesInput?.files;

  try{

    setSaving(true);

    const formData = new FormData();

    formData.append("status", status);
    formData.append("priority", priority);
    formData.append("message", message || "");

    if(files && files.length){
      for(const f of files){
        formData.append("files", f);
      }
    }

    console.log("📤 ENVÍO:", { status, priority, message, files: files?.length });

    /* 🔥 FETCH REAL (NO Onion) */
    const res = await fetch(Onion.config.API + "/tickets/" + id, {
      method: "PATCH",
      body: formData
    });

    const json = await res.json();
    const data = json?.ticket || json;

    console.log("📦 PATCH OK:", data);

    if(data){
      currentItem = data;
      render(data);
    }

    if(filesInput){
      filesInput.value = "";
      renderFiles([]);
    }

    toast("Guardado");

  }catch(err){
    console.error(err);
    toast("Error");
  }finally{
    setSaving(false);
  }

}


/* =========================
   RENDER
========================= */

function render(i){

  setText("#detalle-id", i.id);
  setText("#detalle-usuario", i.cliente?.nombre);
  setText("#detalle-titulo", i.subject);
  setText("#detalle-fecha", formatFecha(i.createdAt));

  $("#detalle-mensaje").textContent = i.message || "";

  $("#edit-estado").value = i.status || "open";
  $("#edit-prioridad").value = i.priority || "low";

  renderBlobs(i.attachments || []);
}


/* =========================
   BLOBS
========================= */

function renderBlobs(files){

  const container = $("#detalle-blobs");
  if(!container) return;

  if(!files.length){
    container.innerHTML = "Sin archivos";
    return;
  }

  container.innerHTML = files.map(f => `
    <div>
      ${f.name}
      <button class="blob-download" data-url="${f.url}" data-name="${f.name}">
        Descargar
      </button>
    </div>
  `).join("");
}


/* =========================
   FILES
========================= */

function renderFiles(files){

  const list = $("#detalle-file-list");
  if(!list) return;

  list.innerHTML = [...files].map(f => f.name).join("<br>");
}


/* =========================
   DOWNLOAD
========================= */

async function downloadBlob(url, name){

  const res = await fetch(url);
  const blob = await res.blob();

  const a = document.createElement("a");
  const u = URL.createObjectURL(blob);

  a.href = u;
  a.download = name;

  document.body.appendChild(a);
  a.click();

  a.remove();
  URL.revokeObjectURL(u);

}


/* =========================
   HELPERS
========================= */

function setText(sel, val){
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
    btn.textContent = active ? "Guardando..." : "Guardar";
  }
}

function toast(msg){
  alert(msg);
}

})();
