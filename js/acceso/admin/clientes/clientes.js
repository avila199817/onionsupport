(function(){

"use strict";

/* =====================================================
   SINGLETON
===================================================== */

if(window.__onionClientesLoaded) return;
window.__onionClientesLoaded = true;


/* =====================================================
   STATE
===================================================== */

let tbody = null;
let initialized = false;


/* =====================================================
   API
===================================================== */

const API = {

  async getClientes(){

    const res = await Onion.fetch(
      Onion.config.API + "/clientes"
    );

    // 🔥 NORMALIZACIÓN UNIVERSAL
    return res?.clientes || res?.data || res || [];

  }

};


/* =====================================================
   HELPERS
===================================================== */

function qs(id){
  return document.getElementById(id);
}

function safe(v){
  return v && String(v).trim() !== "" ? v : "-";
}


/* =====================================================
   AVATAR PRO (CDN + FALLBACK + INICIALES)
===================================================== */

function avatar(c){

  const fallback = "/media/img/Usuario.png";
  let src = c?.logo || c?.avatar;

  if(src){

    if(typeof src !== "string") return fallback;

    if(!src.startsWith("http")){
      src = Onion.config.API.replace("/api","") + src;
    }

    return `
<img
  src="${src}"
  class="cliente-avatar"
  loading="lazy"
  onerror="this.src='${fallback}'">
`;
  }

  // 🔥 FALLBACK INICIALES

  const nombre = (c?.empresa || "CL").trim();

  const iniciales = nombre
    .split(" ")
    .slice(0,2)
    .map(p => p[0])
    .join("")
    .toUpperCase();

  return `
<div class="cliente-avatar cliente-avatar-fallback">
${iniciales}
</div>
`;

}


/* =====================================================
   BADGES
===================================================== */

function badgeTipo(tipo){

  if(!tipo) return `<span class="badge badge-neutral">-</span>`;

  const t = tipo.toLowerCase();

  if(t === "empresa"){
    return `<span class="badge badge-empresa">Empresa</span>`;
  }

  if(t === "particular"){
    return `<span class="badge badge-particular">Particular</span>`;
  }

  return `<span class="badge badge-neutral">${tipo}</span>`;
}


/* =====================================================
   ADAPTER (🔥 SINCRONIZADO BACKEND)
===================================================== */

function adaptCliente(c){

  return {
    id: c.id || "-",
    userId: c.userId || null,

    empresa: c.nombreFiscal || "-",

    nombre: c.nombreContacto || c.contacto?.nombre || "-",

    email: c.email || c.contacto?.email || "-",

    nif: c.nif || "-",

    tipo: c.tipo || "-",

    avatar: c.avatar || null,
    logo: c.logo || null
  };

}


/* =====================================================
   RENDER
===================================================== */

function renderClientes(list = []){

  if(!Array.isArray(list) || list.length === 0){
    renderState("No hay clientes.","empty");
    return;
  }

  const html = list.map(raw => {

    const c = adaptCliente(raw);

    const email = safe(c.email) !== "-"
      ? `<a href="mailto:${c.email}">${c.email}</a>`
      : "-";

    return `

<tr data-id="${safe(c.id)}">

  <!-- 🏢 EMPRESA -->
  <td>
    <div class="cliente-cell">

      ${avatar(c)}

      <span class="cliente-empresa">
        ${safe(c.empresa)}
      </span>

    </div>
  </td>

  <!-- 👤 CONTACTO -->
  <td>
    <span class="usuario-username">
      ${safe(c.nombre)}
    </span>
  </td>

  <!-- 📧 EMAIL -->
  <td class="cliente-email">
    ${email}
  </td>

  <!-- 🪪 NIF -->
  <td class="cliente-nif">
    ${safe(c.nif)}
  </td>

  <!-- 🏷️ TIPO -->
  <td class="cliente-tipo">
    ${badgeTipo(c.tipo)}
  </td>

  <!-- ⚙️ ACCIONES -->
  <td>

    <div class="cliente-actions">

      <button
        class="btn btn-ghost btn-sm btn-ver"
        data-id="${c.id}">
        Ver
      </button>

      <button
        class="btn-editar"
        data-id="${c.id}">
        ✏️
      </button>

    </div>

  </td>

</tr>

`;

  }).join("");

  tbody.innerHTML = html;

}


/* =====================================================
   STATES
===================================================== */

function renderState(message,cls="loading"){

  if(!tbody) return;

  tbody.innerHTML = `
<tr>
<td colspan="6" class="${cls}">
${message}
</td>
</tr>
`;

}


/* =====================================================
   EVENTS
===================================================== */

function initTableActions(){

  tbody.addEventListener("click",(e)=>{

    const btn = e.target.closest("button");
    if(!btn) return;

    const id = btn.dataset.id;
    if(!id) return;

    if(btn.classList.contains("btn-ver")){
      Onion.go(`/clientes/cliente?id=${id}`);
    }

    if(btn.classList.contains("btn-editar")){
      Onion.go(`/clientes/cliente?id=${id}&edit=true`);
    }

  });

}


/* =====================================================
   LOAD
===================================================== */

async function loadClientes(){

  renderState("Cargando clientes…");

  try{

    const clientes = await API.getClientes();

    console.log("📡 CLIENTES:", clientes);

    renderClientes(clientes);

  }
  catch(err){

    console.error("💥 CLIENTES ERROR:", err);

    renderState("Error cargando clientes.","error");

    window.toast?.error?.("Error cargando clientes");

  }

}


/* =====================================================
   INIT
===================================================== */

function init(){

  tbody = qs("clientes-body");

  if(!tbody){
    console.warn("❌ clientes-body no encontrado");
    return;
  }

  console.log("✅ CLIENTES INIT OK");

  initTableActions();
  loadClientes();

}


/* =====================================================
   BOOT
===================================================== */

function boot(){

  if(!window.Onion){
    return setTimeout(boot, 50);
  }

  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", waitUser, { once:true });
  }else{
    waitUser();
  }

}

boot();


function waitUser(){

  if(Onion.state?.user){
    safeInit();
  }else{
    window.addEventListener("onion:user-ready", safeInit, { once:true });
  }

}


function safeInit(){

  if(initialized) return;
  initialized = true;

  init();

}

})();