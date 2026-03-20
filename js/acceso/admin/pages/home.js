(function(){

"use strict";

/* =========================
   CONFIG
========================= */

function ensureURL(url){
  if(!url) return "";
  if(url.startsWith("http")) return url;
  return "https://" + url.replace(/^\/+/,"");
}

const API = ensureURL(Onion?.config?.API || "");
const ROOT = ensureURL(API.replace(/\/api\/?$/,""));


/* =========================
   TOKEN
========================= */

function getToken(){
  return localStorage.getItem("onion_token");
}


/* =========================
   HELPERS
========================= */

function $(id){
  return document.getElementById(id);
}

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
  value = safe(value);
  if(!el) return;

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
   FETCH
========================= */

async function fetchJSON(url){

  try{

    const token = getToken();

    const res = await fetch(url, {
      headers:{
        ...(token && { "Authorization":"Bearer " + token })
      }
    });

    if(res.status === 401){
      window.location.href = "/es/acceso/";
      return null;
    }

    if(!res.ok){
      throw new Error("HTTP " + res.status);
    }

    return await res.json();

  }catch(e){
    console.warn("fetch error:", e.message);
    return null;
  }

}


/* =========================
   DASHBOARD
========================= */

async function loadDashboard(){

  const data = await fetchJSON(API + "/dashboard");
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

  const cards = document.querySelectorAll(".card");

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

  const summary = document.querySelectorAll(".summary-value");

  if(summary.length >= 3){
    summary[0].textContent = safe(k.ticketsToday);
    summary[1].textContent = safe(k.resueltosToday);
    summary[2].textContent = safe(k.pendientesToday);
  }

  const list = $("activity-list");
  if(!list) return;

  list.innerHTML = "";

  const items = data.activity || [];

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

    const desc = i.desc || i.id || "Sin datos";

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

    const token = getToken();
    const start = performance.now();

    const res = await fetch(ROOT + "/health", {
      headers:{
        ...(token && { "Authorization":"Bearer " + token })
      }
    });

    if(!res.ok) throw new Error("health fail");

    const latency = Math.floor(performance.now() - start);
    const data = await res.json();

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
      const uptime = data?.uptime || "0d 0h 0m";
      up.innerHTML = `<span class="status-dot"></span> TIME · ${uptime}`;
      up.className = "status-item ok";
    }

    const cpu = safe(data?.system?.cpu?.usage);
    const ram = safe(data?.system?.ram?.usage);
    const diskUsed = safe(data?.system?.disk?.used);
    const diskTotal = safe(data?.system?.disk?.total);

    const cpuEl = $("cpu-usage");
    const ramEl = $("ram-usage");
    const diskEl = $("disk-usage");
    const warn = $("system-warning");

    if(cpuEl) cpuEl.textContent = "CPU: " + cpu + "%";
    if(ramEl) ramEl.textContent = "RAM: " + ram + "%";

    const diskPercent = diskTotal ? Math.round((diskUsed / diskTotal) * 100) : 0;

    if(diskEl){
      diskEl.textContent = `DISCO: ${diskUsed} GB / ${diskTotal} GB (${diskPercent}%)`;
    }

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

let interval;

async function init(){
  await Promise.all([
    loadDashboard(),
    loadSystem()
  ]);
}

init(); // 🔥 CLAVE


/* =========================
   AUTO REFRESH
========================= */

interval = setInterval(init, 60000);

   
/* =========================
   DESTROY
========================= */

window.onPageDestroy = function(){

  console.log("💣 DESTROY HOME");

  if(interval){
    clearInterval(interval);
    interval = null;
  }

};

})();
