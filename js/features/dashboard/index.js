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

    const res = await Onion.fetch(Onion.config.API + "/dashboard");
    const data = res?.data || res;

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

    const base = new URL(Onion.config.API).origin;

    const res = await Onion.fetch(base + "/health");
    const data = res?.data || res;

    // STATUS
    setText("status-api", "API OK");

    const db = $("status-db");
    if(db){
      db.textContent = "DB " + (data?.db?.status || "--");
    }

    const up = $("status-uptime");
    if(up){
      up.textContent = data?.uptime || "--";
    }

    // CPU
    const cpu = $("cpu-usage");
    if(cpu){
      cpu.textContent = data?.system?.cpu
        ? "CPU: " + data.system.cpu.usage + "%"
        : "CPU: --";
    }

    // RAM
    const ram = $("ram-usage");
    if(ram){
      ram.textContent = data?.system?.ram
        ? "RAM: " + data.system.ram.usage + "%"
        : "RAM: --";
    }

    // DISK
    const disk = $("disk-usage");
    if(disk){
      disk.textContent = data?.system?.disk
        ? "Disco: " + data.system.disk.percent + "%"
        : "Disco: --";
    }

    // WARNING
    const warn = $("system-warning");
    if(warn){

      const cpuVal = data?.system?.cpu?.usage;
      const ramVal = data?.system?.ram?.usage;
      const diskVal = data?.system?.disk?.percent;

      const high =
        cpuVal > 85 ||
        ramVal > 85 ||
        diskVal > 90 ||
        data?.status === "degraded";

      warn.style.display = high ? "block" : "none";
    }

  }catch(e){
    console.error("💥 HEALTH FAIL:", e);
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
