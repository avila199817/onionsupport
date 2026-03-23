"use strict";

(function(){

const Onion = window.Onion;

if(!Onion){
  console.error("💥 Onion no disponible (dashboard)");
  return;
}

let interval = null;

/* =========================
   ROOT
========================= */

function getRoot(){
  return document.querySelector(".panel-content.dashboard");
}

function $(id){
  return getRoot()?.querySelector("#" + id);
}

/* =========================
   HELPERS
========================= */

function safe(n){
  return (n === 0 || n) ? n : 0;
}

function formatMoney(n){
  return new Intl.NumberFormat("es-ES", {
    style:"currency",
    currency:"EUR",
    maximumFractionDigits:0
  }).format(safe(n));
}

function timeAgo(date){
  if(!date) return "Ahora";

  const diff = Math.floor((Date.now() - new Date(date)) / 1000);

  if(diff < 60) return "Hace " + diff + "s";
  if(diff < 3600) return "Hace " + Math.floor(diff/60) + " min";
  if(diff < 86400) return "Hace " + Math.floor(diff/3600) + " h";

  return "Hace " + Math.floor(diff/86400) + " d";
}

/* =========================
   DASHBOARD DATA
========================= */

async function loadDashboard(){

  try{

    const data = await Onion.fetch(Onion.config.API + "/dashboard");
    if(!data) return;

    const k = data.kpis || {};

    $("home-incidencias").textContent = safe(k.tickets);
    $("home-clientes").textContent = safe(k.clientes);
    $("home-usuarios").textContent = safe(k.usuarios);

    const f = $("home-facturas");
    if(f){
      f.textContent = formatMoney(
        k.facturacionMensual ?? 0
      );
    }

    renderActivity(data.activity || []);

  }catch(e){
    Onion.error("💥 Dashboard error:", e);
  }

}

/* =========================
   ACTIVITY
========================= */

function renderActivity(items){

  const list = $("activity-list");
  if(!list) return;

  list.innerHTML = "";

  if(!items.length){
    list.innerHTML = "<div>Sin actividad</div>";
    return;
  }

  items.slice(0,5).forEach(i => {

    const el = document.createElement("div");

    el.innerHTML = `
      <div>
        <strong>${i.type}</strong>
        <p>${escapeHTML(i.desc)}</p>
        <small>${timeAgo(i.time)}</small>
      </div>
    `;

    list.appendChild(el);

  });

}

/* =========================
   SYSTEM (FIXED 🔥)
========================= */

async function loadSystem(){

  try{

    const base = Onion.config.API.replace("/api","");
    const data = await Onion.fetch(base + "/health");

    const api = $("status-api");
    if(api){
      api.textContent = "API OK";
    }

    const db = $("status-db");
    if(db){
      db.textContent = "DB " + (data?.db?.status || "unknown");
    }

    const up = $("status-uptime");
    if(up){
      up.textContent = data?.uptime || "--";
    }

  }catch(e){
    Onion.warn("⚠️ Health error");
  }

}

/* =========================
   INIT
========================= */

async function init(){

  const root = getRoot();
  if(!root) return;

  Onion.log("📊 Dashboard init");

  await loadDashboard();
  loadSystem();

  interval = setInterval(()=>{
    loadDashboard();
    loadSystem();
  }, 60000);

  Onion.onCleanup(()=>{
    if(interval){
      clearInterval(interval);
      interval = null;
    }
  });

}

/* =========================
   START
========================= */

init();

/* =========================
   HELPERS
========================= */

function escapeHTML(str){
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

})();
