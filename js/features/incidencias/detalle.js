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
let sending = false;


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
   AUTH
========================= */

function getAuthHeaders(){
  const token = Onion.auth?.getToken?.();
  return token ? { Authorization: "Bearer " + token } : {};
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
      if(sending) return;
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

  const msg = $("#detalle-mensaje");

  if(msg){

    msg.addEventListener("click", ()=>{
      msg.setAttribute("contenteditable","true");
      msg.focus();
    });

    msg.addEventListener("blur", ()=>{
      msg.setAttribute("contenteditable","false");
    });

    msg.addEventListener("keydown", (e)=>{
      if(e.key === "Enter"){
        e.preventDefault();
        msg.blur();
      }
    });

  }

}


/* =========================
   LOAD
========================= */

async function loadDetalle(){

  const id = getId();
  if(!id) return setError("ID no válido");

  setLoading();

  try{

    const res = await fetch(Onion.config.API + "/tickets/" + id + "?t=" + Date.now(), {
      cache: "no-store",
      headers: getAuthHeaders()
    });

    const json = await res.json();
    const data = json?.ticket || json;

    if(!data){
      setEmpty();
      return;
    }

    currentItem = data;
    render(data);

  }catch(err){

    console.error(err);
    setError("Error cargando incidencia");

  }finally{
    clearLoading();
  }

}


/* =========================
   🔥 UPLOAD DIRECTO AZURE
========================= */

async function uploadFile(file){

  const res = await fetch(Onion.config.API + "/uploads/upload-url", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeaders()
    },
    body: JSON.stringify({
      fileName: file.name,
      fileType: file.type,
      fileSize: file.size
    })
  });

  const { uploadUrl, blobUrl } = await res.json();

  await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "x-ms-blob-type": "BlockBlob",
      "Content-Type": file.type
    },
    body: file
  });

  return {
    name: file.name,
    url: blobUrl
  };
}


/* =========================
   UPDATE (🔥 PRO)
========================= */

async function updateTicket(){

  if(sending) return;
  sending = true;

  if(!currentItem){
    sending = false;
    return;
  }

  const id = currentItem.id || currentItem.ticketId;

  const status = $("#edit-estado")?.value;
  const priority = $("#edit-prioridad")?.value;
  const message = $("#detalle-mensaje")?.innerText?.trim();

  const filesInput = $("#detalle-files");
  const files = filesInput?.files;

  try{

    setSaving(true);

    /* 🔥 SUBIDA DIRECTA */
    let uploaded = [];

    if(files && files.length){
      for(const f of files){
        const fileData = await uploadFile(f);
        uploaded.push(fileData);
      }
    }

    /* 🔥 SOLO JSON */
    const res = await fetch(Onion.config.API + "/tickets/" + id, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeaders()
      },
      body: JSON.stringify({
        status,
        priority,
        message,
        attachments: uploaded
      })
    });

    const json = await res.json();
    const data = json?.ticket || json;

    if(data){
      currentItem = data;
      render(data);
    }

    if(filesInput){
      filesInput.value = "";
      renderFiles([]);
    }

    showToast("Cambios guardados", "success");

  }catch(err){

    console.error(err);
    showToast("Error guardando cambios", "error");

  }finally{

    setSaving(false);

    setTimeout(()=>{
      sending = false;
    }, 300);

  }

}


/* =========================
   RENDER
========================= */

function render(i){

  const usuario = i.cliente?.nombre || "Usuario";

  setText("#detalle-id", i.id);
  setText("#detalle-usuario", usuario);
  setText("#detalle-titulo", i.subject || "Sin título");
  setText("#detalle-fecha", formatFecha(i.createdAt));

  $("#detalle-mensaje").textContent = i.message || "";

  setSelectValue($("#edit-estado"), i.status || "open");
  setSelectValue($("#edit-prioridad"), i.priority || "low");

  renderBlobs(i.attachments || []);

}


/* =========================
   UI HELPERS
========================= */

function setSelectValue(select, value){
  if(!select) return;
  select.value = value;
  select.dispatchEvent(new Event("change", { bubbles: true }));
}

function renderBlobs(files){
  const c = $("#detalle-blobs");
  if(!c) return;

  if(!files.length){
    c.innerHTML = `<div class="detalle-hint">Sin archivos</div>`;
    return;
  }

  c.innerHTML = files.map(f => `
    <div class="blob-item">
      <span>${f.name}</span>
      <button class="blob-download" data-url="${f.url}" data-name="${f.name}">
        Descargar
      </button>
    </div>
  `).join("");
}

function renderFiles(files){
  const list = $("#detalle-file-list");
  if(!list) return;

  list.innerHTML = [...files].map(f =>
    `<div>${f.name}</div>`
  ).join("");
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
  if(el) el.textContent = val ?? "--";
}

function formatFecha(f){
  return f ? new Date(f).toLocaleDateString("es-ES") : "--";
}

function getId(){
  return new URLSearchParams(location.search).get("id");
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
  $("#detalle-content").innerHTML = `<div>No encontrada</div>`;
}

function setError(msg){
  $("#detalle-content").innerHTML = `<div>${msg}</div>`;
}

function setSaving(active){
  const btn = $("#btn-save");
  if(btn){
    btn.disabled = active;
    btn.textContent = active ? "Guardando..." : "Guardar cambios";
  }
}


/* =========================
   TOAST
========================= */

function showToast(message, type="info"){

  const el = document.createElement("div");
  el.className = `toast show ${type}`;
  el.innerText = message;

  document.body.appendChild(el);

  setTimeout(()=>{
    el.classList.remove("show");
    setTimeout(()=> el.remove(), 300);
  }, 2000);

}

})();
