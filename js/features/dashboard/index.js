"use strict";

(function(){

const Onion = window.Onion;

if(!Onion){
  console.error("💥 Onion no disponible (dashboard)");
  return;
}

let interval = null;
let initialized = false;

/* =========================
   CONFIG
========================= */

// 🔥 ajusta esto si quieres sacarlo de config
const HEALTH_KEY = Onion.config?.HEALTH_KEY || "";

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
  return Number(n || 0);
}

function formatMoney(n){
  return new Intl.NumberFormat("es-ES", {
    style:"currency",
    currency:"EUR",
    maximumFractionDigits:0
  }).format(safe(n));
}

function setText(id, value){
  const el = $(id);
  if(el) el.textContent = value;
}

/* =========================
   MES
========================= */

function setMonthLabel(){

  const el = $("facturacion-mes-label");
  if(!el) return;

  const now = new Date();

  const meses = [
    "Enero","Febrero","Marzo","Abril","Mayo","Junio",
    "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"
  ];

  el.textContent = meses[now.getMonth()] + " " + now.getFullYear();

}

/* =========================
   DASHBOARD DATA
========================= */

async function loadDashboardData(){

  const resFacturas = await Onion.fetch(Onion.config.API + "/facturas");
  const facturas = resFacturas?.facturas || resFacturas?.data || [];

  const pagadas = facturas.filter(f => f.estadoPago === "pagada");
  const pendientes = facturas.filter(f => f.estadoPago === "pendiente");

  const totalPagado = pagadas.reduce((acc, f) => acc + safe(f.total), 0);
  const totalPendiente = pendientes.reduce((acc, f) => acc + safe(f.total), 0);

  const now = new Date();
  const startMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const mensualPagado = pagadas
    .filter(f => new Date(f.fecha || f.createdAt) >= startMonth)
    .reduce((acc, f) => acc + safe(f.total), 0);

  setText("home-facturas", formatMoney(totalPagado));
  setText("home-facturas-pendiente", formatMoney(totalPendiente));
  setText("home-facturacion-mes", formatMoney(mensualPagado));

  const res = await Onion.fetch(Onion.config.API + "/dashboard");
  const data = res?.data || res;
  const k = data?.kpis || {};

  setText("home-usuarios", safe(k.usuarios));
  setText("home-usuarios-inactivos", safe(k.usuariosInactivos));

  setText("home-clientes", safe(k.clientes));
  setText("home-clientes-inactivos", safe(k.clientesInactivos));

  setText("tickets-hoy", safe(k.ticketsToday));
  setText("resueltos-hoy", safe(k.resueltosToday));
  setText("pendientes-hoy", safe(k.pendientesToday));

  renderActivity(data.activity || []);

}

/* =========================
   SYSTEM (🔥 NUEVO PRO)
========================= */

async function loadSystem(){

  try{

    const base = new URL(Onion.config.API).origin;

    const res = await fetch(base + "/health/internal", {
      headers: {
        "x-health-key": HEALTH_KEY
      }
    });

    if(!res.ok){
      throw new Error("Health unauthorized / failed");
    }

    const data = await res.json();

    /* =========================
       STATUS GENERAL
    ========================= */

    setText("status-api", "API · " + (data?.api?.latency || "--") + " ms");
    setText("status-db", "DB · " + (data?.db?.status || "--"));
    setText("status-uptime", "Uptime · " + (data?.uptime || "--"));

    /* =========================
       CPU
    ========================= */

    const cpu = $("cpu-usage");
    if(cpu && data?.system?.cpu){

      cpu.textContent =
        "CPU: " + data.system.cpu.usage + "% · " +
        data.system.cpu.cores + " cores · load " +
        data.system.cpu.load;
    }

    /* =========================
       RAM
    ========================= */

    const ram = $("ram-usage");
    if(ram && data?.system?.ram){

      ram.textContent =
        "RAM: " + data.system.ram.usage + "% · " +
        data.system.ram.usedMB + "MB / " +
        data.system.ram.totalMB + "MB";
    }

    /* =========================
       DISK
    ========================= */

    const disk = $("disk-usage");
    if(disk && data?.system?.disk){

      disk.textContent =
        "Disco: " + data.system.disk.percent + "% · " +
        data.system.disk.used + "GB / " +
        data.system.disk.total + "GB";
    }

    /* =========================
       EVENT LOOP
    ========================= */

    const loop = $("event-loop");
    if(loop && data?.system?.eventLoop){
      loop.textContent =
        "Event Loop: " + data.system.eventLoop.lag + " ms";
    }

    /* =========================
       NODE MEMORY (OPCIONAL)
    ========================= */

    const node = $("node-memory");
    if(node && data?.system?.node){
      node.textContent =
        "Node: heap " + data.system.node.heapUsedMB + "MB / " +
        data.system.node.heapTotalMB + "MB";
    }

  }catch(e){

    console.error("💥 HEALTH FAIL:", e);

    setText("status-api", "API · error");
    setText("status-db", "DB · error");

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

  items.slice(0,3).forEach(i => {

    const el = document.createElement("div");
    el.className = "activity-item";

    el.innerHTML = `
      <div class="activity-title">${escapeHTML(i.desc)}</div>
      <div class="activity-meta">${timeAgo(i.time)}</div>
    `;

    list.appendChild(el);

  });

}

/* =========================
   LOAD
========================= */

async function loadDashboard(){

  const panel = getRoot();

  if(panel){
    panel.classList.remove("ready");
  }

  try{

    await loadDashboardData();
    await loadSystem();

    requestAnimationFrame(()=>{
      panel?.classList.add("ready");
    });

  }catch(e){

    console.error("💥 Dashboard error:", e);

    panel?.classList.add("ready");

  }

}

/* =========================
   INIT
========================= */

function init(){

  const root = getRoot();
  if(!root) return;

  if(initialized) return;
  initialized = true;

  setMonthLabel();

  loadDashboard();

  interval = setInterval(()=>{
    loadDashboardData();
    loadSystem();
  }, 60000);

  Onion.onCleanup(()=>{
    initialized = false;
    if(interval) clearInterval(interval);
  });

}

/* =========================
   START
========================= */

init();

/* =========================
   HELPERS
========================= */

function timeAgo(date){
  if(!date) return "Ahora";

  const diff = Math.floor((Date.now() - new Date(date)) / 1000);

  if(diff < 60) return "Hace " + diff + "s";
  if(diff < 3600) return "Hace " + Math.floor(diff/60) + " min";
  if(diff < 86400) return "Hace " + Math.floor(diff/3600) + " h";

  return "Hace " + Math.floor(diff/86400) + " d";
}

function escapeHTML(str){
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

})();
