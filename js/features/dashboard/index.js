(function(){

"use strict";

const Onion = window.Onion;

if(!Onion){
  console.error("💥 Onion no disponible (dashboard)");
  return;
}

let initialized = false;
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

function animate(el, value){
  if(!el) return;

  value = safe(value);

  const start = 0;
  const duration = 400;
  const t0 = performance.now();

  function frame(t){
    const p = Math.min((t - t0)/duration, 1);
    el.textContent = Math.floor(start + (value - start)*p);
    if(p < 1) requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}

function calcTrend(current, prev){
  current = safe(current);
  prev = safe(prev);

  if(prev === 0) return 0;

  return Math.round(((current - prev) / prev) * 100);
}

function setTrend(el, value, label){
  if(!el) return;

  const trend = value >= 0 ? "up" : "down";
  const sign = value >= 0 ? "+" : "";

  el.innerHTML = `
    <span class="trend ${trend}">${sign}${value}%</span>
    <span class="card-extra">${label}</span>
  `;
}

/* =========================
   DASHBOARD DATA
========================= */

async function loadDashboard(){

  try{

    const data = await Onion.fetch(Onion.config.API + "/dashboard");
    if(!data) return;

    const k = data.kpis || {};

    const tickets = safe(k.tickets);
    const clientes = safe(k.clientes);
    const usuarios = safe(k.usuarios);

    const facturacion = safe(
      k.facturacionMensual ??
      k.facturacionMes ??
      k.facturacion ?? 0
    );

    animate($("home-incidencias"), tickets);
    animate($("home-clientes"), clientes);
    animate($("home-usuarios"), usuarios);

    const f = $("home-facturas");
    if(f) f.textContent = formatMoney(facturacion);

    const cards = getRoot()?.querySelectorAll(".card") || [];

    if(cards.length >= 4){

      setTrend(cards[0].querySelector(".card-meta"),
        calcTrend(tickets, k.ticketsPrev || 0),
        "vs última semana"
      );

      setTrend(cards[1].querySelector(".card-meta"),
        calcTrend(clientes, k.clientesPrev || 0),
        "crecimiento"
      );

      setTrend(cards[2].querySelector(".card-meta"),
        calcTrend(facturacion, k.facturacionPrev || 0),
        "este mes"
      );

      setTrend(cards[3].querySelector(".card-meta"),
        calcTrend(usuarios, k.usuariosPrev || 0),
        "últimas 24h"
      );

    }

    const summary = getRoot()?.querySelectorAll(".summary-value") || [];

    if(summary.length >= 3){
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
    list.innerHTML = "<div class='activity-empty'>Sin actividad reciente</div>";
    return;
  }

  items.slice(0,5).forEach(i => {

    const el = document.createElement("div");
    el.className = "activity-item";

    const title =
      i.type === "ticket" ? "Nueva incidencia creada" :
      i.type === "factura" ? "Factura generada" :
      i.type === "cliente" ? "Cliente creado" :
      "Actividad";

    const desc = escapeHTML(i.desc || i.id || "Sin datos");

    el.innerHTML = `
      <div class="activity-line"></div>
      <div class="activity-content">
        <span class="activity-title">${title}</span>
        <span class="activity-desc">${desc}</span>
        <span class="activity-time">${timeAgo(i.time)}</span>
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

    const start = performance.now();

    const data = await Onion.fetch(Onion.config.API + "/health");

    const latency = Math.floor(performance.now() - start);

    const api = $("status-api");
    if(api){
      api.innerHTML = `<span class="status-dot"></span> API · ${latency}ms`;
      api.className = "status-item ok";
    }

    const db = $("status-db");
    if(db){
      const ok = data?.db?.status === "up";
      db.innerHTML = `<span class="status-dot"></span> Base de datos ${ok ? "activa" : "error"}`;
      db.className = "status-item " + (ok ? "ok" : "warn");
    }

    const up = $("status-uptime");
    if(up){
      const uptime = data?.uptime || "--";
      up.innerHTML = `<span class="status-dot"></span> TIME · ${uptime}`;
      up.className = "status-item ok";
    }

    const cpu = safe(data?.system?.cpu?.usage);
    const ram = safe(data?.system?.ram?.usage);
    const diskUsed = safe(data?.system?.disk?.used);
    const diskTotal = safe(data?.system?.disk?.total);

    const diskPercent = diskTotal
      ? Math.round((diskUsed / diskTotal) * 100)
      : 0;

    const warn = $("system-warning");

    if(warn){
      warn.style.display =
        (cpu > 80 || ram > 85 || diskPercent > 90) ? "block" : "none";
    }

  }catch(e){

    const api = $("status-api");
    if(api){
      api.innerHTML = `<span class="status-dot"></span> API caída`;
      api.className = "status-item warn";
    }

  }

}

/* =========================
   INIT
========================= */

async function init(){

  if(initialized) return;

  const root = getRoot();
  if(!root) return;

  if(!Onion.state?.user){
    return setTimeout(init, 100);
  }

  initialized = true;

  Onion.log("📊 Dashboard init");

  await run();

  interval = setInterval(run, 60000);

  // 🔥 cleanup real SPA
  Onion.onCleanup(()=>{
    initialized = false;

    if(interval){
      clearInterval(interval);
      interval = null;
    }
  });

}

async function run(){
  await Promise.all([
    loadDashboard(),
    loadSystem()
  ]);
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
