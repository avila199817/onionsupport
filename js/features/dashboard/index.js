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

function setText(id, value){
  const el = $(id);
  if(el) el.textContent = value;
}

/* =========================
   DASHBOARD DATA
========================= */

async function loadDashboard(){

  try{

    const data = await Onion.fetch(Onion.config.API + "/dashboard");
    if(!data) return;

    const k = data.kpis || {};

    // KPIs
    setText("home-incidencias", safe(k.tickets));
    setText("home-clientes", safe(k.clientes));
    setText("home-usuarios", safe(k.usuarios));

    const f = $("home-facturas");
    if(f){
      f.textContent = formatMoney(k.facturacionMensual);
    }

    // SUMMARY (HOY)
    const summary = getRoot()?.querySelectorAll(".summary-item .summary-value");
    if(summary && summary.length >= 3){
      summary[0].textContent = safe(k.ticketsToday);
      summary[1].textContent = safe(k.resueltosToday);
      summary[2].textContent = safe(k.pendientesToday);
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
   SYSTEM (HEALTH)
========================= */

async function loadSystem(){

  try{

    const base = Onion.config.API.replace("/api","");
    const data = await Onion.fetch(base + "/health");

    // STATUS TEXTOS
    setText("status-api", "API OK");

    const db = $("status-db");
    if(db){
      db.textContent = "DB " + (data?.db?.status || "unknown");
    }

    const up = $("status-uptime");
    if(up){
      up.textContent = data?.uptime || "--";
    }

    // CPU
    const cpu = $("cpu-usage");
    if(cpu){
      const val = data?.system?.cpu?.usage ?? 0;
      cpu.textContent = "CPU: " + val + "%";
    }

    // RAM
    const ram = $("ram-usage");
    if(ram){
      const val = data?.system?.ram?.usage ?? 0;
      ram.textContent = "RAM: " + val + "%";
    }

    // DISK
    const disk = $("disk-usage");
    if(disk){
      const val = data?.system?.disk?.percent ?? 0;
      disk.textContent = "Disco: " + val + "%";
    }

    // WARNING
    const warn = $("system-warning");
    if(warn){

      const cpuVal = data?.system?.cpu?.usage ?? 0;
      const ramVal = data?.system?.ram?.usage ?? 0;
      const diskVal = data?.system?.disk?.percent ?? 0;

      const high =
        cpuVal > 85 ||
        ramVal > 85 ||
        diskVal > 90 ||
        data?.status === "degraded";

      warn.style.display = high ? "block" : "none";
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
