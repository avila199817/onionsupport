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
   DASHBOARD
========================= */

async function loadDashboard(){

  try{

    /* =========================
       FACTURAS (FUENTE REAL)
    ========================= */

    const resFacturas = await Onion.fetch(Onion.config.API + "/facturas");
    const facturas = resFacturas?.facturas || resFacturas?.data || [];

    const pagadas = facturas.filter(f => f.estadoPago === "pagada");
    const pendientes = facturas.filter(f => f.estadoPago === "pendiente");

    const totalPagado = pagadas.reduce((acc, f) => acc + safe(f.total), 0);
    const totalPendiente = pendientes.reduce((acc, f) => acc + safe(f.total), 0);

    /* =========================
       MES ACTUAL (SOLO PAGADAS)
    ========================= */

    const now = new Date();
    const startMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const mensualPagado = pagadas
      .filter(f => new Date(f.fecha || f.createdAt) >= startMonth)
      .reduce((acc, f) => acc + safe(f.total), 0);

    /* =========================
       PINTAR FACTURACIÓN
    ========================= */

    setText("home-facturas", formatMoney(totalPagado));
    setText("home-facturas-pendiente", formatMoney(totalPendiente));
    setText("home-facturacion-mes", formatMoney(mensualPagado));

    /* =========================
       DASHBOARD NORMAL
    ========================= */

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

  items.slice(0,8).forEach(i => {

    const el = document.createElement("div");
    el.className = "activity-item";

    el.innerHTML = `
      <div>
        <strong>${escapeHTML(i.type)}</strong>
        <p>${escapeHTML(i.desc)}</p>
        <small>${timeAgo(i.time)}</small>
      </div>
    `;

    list.appendChild(el);

  });

}

/* =========================
   SYSTEM
========================= */

async function loadSystem(){

  try{

    const base = new URL(Onion.config.API).origin;

    const res = await Onion.fetch(base + "/health");
    const data = res?.data || res;

    setText("status-api", "API · " + (data?.api?.latency || "--") + " ms");
    setText("status-db", "DB · " + (data?.db?.status || "--"));
    setText("status-uptime", "Uptime · " + (data?.uptime || "--"));

    const cpu = $("cpu-usage");
    if(cpu && data?.system?.cpu){

      const model =
        data.system.cpu.model ||
        (data.system.cpu.cores + " cores");

      cpu.textContent =
        "CPU: " + data.system.cpu.usage + "% · " +
        model + " · load " +
        data.system.cpu.load;
    }

    const ram = $("ram-usage");
    if(ram && data?.system?.ram){
      ram.textContent =
        "RAM: " + data.system.ram.usage + "% · " +
        data.system.ram.usedMB + "MB / " +
        data.system.ram.totalMB + "MB";
    }

    const disk = $("disk-usage");
    if(disk && data?.system?.disk){
      disk.textContent =
        "Disco: " + data.system.disk.percent + "% · " +
        data.system.disk.used + "GB / " +
        data.system.disk.total + "GB";
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

  setMonthLabel();

  await loadDashboard();
  loadSystem();

  interval = setInterval(()=>{
    loadDashboard();
    loadSystem();
  }, 60000);

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
