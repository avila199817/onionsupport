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
      const url = target.dataset.url;
      const name = target.dataset.name;
      downloadBlob(url, name);
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

    const res = await Onion.fetch(Onion.config.API + "/tickets/" + id);
    const data = res?.ticket || res?.data || res;

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
   UPDATE
========================= */

async function updateTicket(){

  if(!currentItem) return;

  const id = currentItem.id || currentItem.ticketId;

  const status = $("#edit-estado")?.value;
  const priority = $("#edit-prioridad")?.value;
  const message = $("#detalle-mensaje")?.innerText?.trim();

  const files = $("#detalle-files")?.files;

  try{

    setSaving(true);

    const formData = new FormData();

    if(status) formData.append("status", status);
    if(priority) formData.append("priority", priority);
    if(message !== undefined) formData.append("message", message);

    if(files?.length){
      for(const f of files){
        formData.append("files", f);
      }
    }

    await Onion.fetch(Onion.config.API + "/tickets/" + id, {
      method: "PATCH",
      body: formData
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

  if($("#edit-estado")) $("#edit-estado").value = i.status || "open";
  if($("#edit-prioridad")) $("#edit-prioridad").value = i.priority || "low";

  /* 🔥 VISUAL STATES */
  applyVisualState(i, usuario, avatar);

  renderBlobs(i.files || i.attachments || []);

}


/* =========================
   VISUAL STATE (🔥 CLAVE)
========================= */

function applyVisualState(i, usuario, avatar){

  const estado = $("#edit-estado");
  const prioridad = $("#edit-prioridad");

  if(!estado || !prioridad) return;

  /* RESET */
  estado.classList.remove("estado-open","estado-progress","estado-closed");
  prioridad.classList.remove("prio-low","prio-medium","prio-high");

  /* ESTADO */
  if(estado.value === "open") estado.classList.add("estado-open");
  if(estado.value === "in_progress") estado.classList.add("estado-progress");
  if(estado.value === "closed") estado.classList.add("estado-closed");

  /* PRIORIDAD */
  if(prioridad.value === "low") prioridad.classList.add("prio-low");
  if(prioridad.value === "medium") prioridad.classList.add("prio-medium");
  if(prioridad.value === "high") prioridad.classList.add("prio-high");

  /* 🔥 REGLA AVATAR */
  if(estado.value === "open" && prioridad.value === "low"){
    renderAvatar(usuario, avatar);
  }else{
    renderAvatar(usuario, null); // fallback
  }

}


/* =========================
   BLOBS
========================= */

function renderBlobs(files){

  const container = $("#detalle-blobs");
  if(!container) return;

  if(!files || !files.length){
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
   HELPERS
========================= */

function setText(sel, val){
  const el = $(sel);
  if(el) el.textContent = val ?? "--";
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

function getId(){
  return new URLSearchParams(window.location.search).get("id");
}


/* =========================
   UI STATES
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
