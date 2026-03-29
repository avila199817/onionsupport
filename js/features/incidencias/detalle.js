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

  console.log("✅ INIT OK");

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
   AUTH (🔥 CLAVE)
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

    const root = getRoot();

    if(!root){
      console.warn("💥 DOM eliminado → reinicializando");
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
   LOAD (🔥 SIN CACHE + AUTH)
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

    console.log("📦 API:", data);

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
   UPDATE (🔥 FUNCIONA TODO)
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

    if(status) formData.append("status", status);
    if(priority) formData.append("priority", priority);
    if(message !== undefined) formData.append("message", message);

    if(files && files.length > 0){
      for(const f of files){
        formData.append("files", f);
      }
    }

    console.log("📤 ENVIANDO:", {
      status,
      priority,
      message,
      files: files?.length
    });

    const res = await fetch(Onion.config.API + "/tickets/" + id, {
      method: "PATCH",
      body: formData,
      headers: getAuthHeaders()
    });

    const json = await res.json();
    const data = json?.ticket || json;

    console.log("📦 PATCH:", data);

    if(data){
      currentItem = data;
      render(data);
    }

    if(filesInput){
      filesInput.value = "";
      renderFiles([]);
    }

    toast("Cambios guardados", "success");

  }catch(err){

    console.error(err);
    toast("Error guardando cambios", "error");

  }finally{
    setSaving(false);
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

  const msg = $("#detalle-mensaje");
  if(msg){
    msg.textContent = i.message || "";
  }

  setSelectValue($("#edit-estado"), i.status || "open");
  setSelectValue($("#edit-prioridad"), i.priority || "low");

  renderAvatar(usuario, avatar);
  applyVisualState();
  renderBlobs(i.attachments || []);

}


/* =========================
   SELECT FIX
========================= */

function setSelectValue(select, value){

  if(!select) return;

  const option = [...select.options].find(o => o.value === value);

  if(option){
    option.selected = true;
    select.selectedIndex = option.index;
  }else{
    select.selectedIndex = 0;
  }

  select.dispatchEvent(new Event("change", { bubbles: true }));

}


/* =========================
   VISUAL STATE
========================= */

function applyVisualState(){

  const estado = $("#edit-estado");
  const prioridad = $("#edit-prioridad");
  const avatarEl = $("#detalle-avatar");

  if(!estado || !prioridad) return;

  estado.className = "detalle-select estado-" + estado.value;
  prioridad.className = "detalle-select prio-" + prioridad.value;

  if(estado.value === "open" && prioridad.value === "low"){
    avatarEl?.classList.add("avatar-highlight");
  }else{
    avatarEl?.classList.remove("avatar-highlight");
  }

}


/* =========================
   BLOBS
========================= */

function renderBlobs(files){

  const container = $("#detalle-blobs");
  if(!container) return;

  if(!files.length){
    container.innerHTML = `<div class="detalle-hint">Sin archivos</div>`;
    return;
  }

  container.innerHTML = files.map(f => `
    <div class="blob-item">
      <span class="blob-name">${escapeHTML(f.name)}</span>
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

  list.innerHTML = [...files].map(f =>
    `<div class="file-item">${escapeHTML(f.name)}</div>`
  ).join("");

}


/* =========================
   DOWNLOAD
========================= */

async function downloadBlob(url, name){

  try{
    const res = await fetch(url);
    const blob = await res.blob();

    const a = document.createElement("a");
    const objectUrl = URL.createObjectURL(blob);

    a.href = objectUrl;
    a.download = name || "archivo";

    document.body.appendChild(a);
    a.click();

    a.remove();
    URL.revokeObjectURL(objectUrl);

  }catch(err){
    console.error(err);
    toast("Error descargando archivo", "error");
  }

}


/* =========================
   AVATAR
========================= */

function renderAvatar(nombre, avatar){

  const el = $("#detalle-avatar");
  if(!el) return;

  el.innerHTML = avatar
    ? `<img src="${avatar}" alt="${escapeHTML(nombre)}" />`
    : `<div class="avatar-fallback">${getInitials(nombre)}</div>`;

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

function escapeHTML(str){
  return String(str)
    .replace(/&/g,"&amp;")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;");
}

function getInitials(name){
  return name.split(" ").map(n=>n[0]).join("").slice(0,2).toUpperCase();
}

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
  $("#detalle-content").innerHTML = `<div class="detalle-hint">No encontrada</div>`;
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
   TOAST
========================= */

function toast(msg,type="info"){
  alert(msg);
}

})();
