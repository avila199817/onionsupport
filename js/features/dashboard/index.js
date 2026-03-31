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

const API = Onion.config?.API;

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
  if(el) el.textContent = value ?? "--";
}

function parseDate(d){
  if(!d) return null;
  const date = new Date(d);
  return isNaN(date) ? null : date;
}

/* =========================
   MES LABEL
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
   🔥 TRANSFORM DATA → 12 MESES
========================= */

function buildYearData(evolucion){

  const now = new Date();
  const currentYear = now.getFullYear();

  const mesesMap = {
    "01":0,"02":1,"03":2,"04":3,"05":4,"06":5,
    "07":6,"08":7,"09":8,"10":9,"11":10,"12":11
  };

  const yearData = new Array(12).fill(0);

  evolucion.forEach(m => {

    if(!m?.mes) return;

    const [year, mes] = m.mes.split("-");

    if(Number(year) !== currentYear) return;

    const idx = mesesMap[mes];

    if(idx !== undefined){
      yearData[idx] = safe(m.total);
    }

  });

  return yearData;
}

/* =========================
   🔥 RENDER BARRAS (PRO)
========================= */

function renderYearRevenue(data){

  const container = document.querySelector(".year-grid");
  if(!container) return;

  const months = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];

  const max = Math.max(...data, 1);

  container.innerHTML = data.map((value, i) => {

    return `
      <div class="month">
        <div class="bar" style="height:0%"></div>
        <span>${months[i]}</span>
        <strong>${formatMoney(value)}</strong>
      </div>
    `;

  }).join("");

  requestAnimationFrame(()=>{

    const bars = container.querySelectorAll(".bar");

    bars.forEach((bar, i)=>{
      const value = data[i];
      const percent = (value / max) * 100;
      bar.style.height = percent + "%";
    });

  });

}

/* =========================
   DASHBOARD DATA
========================= */

async function loadDashboardData(){

  try {

    const res = await Onion.fetch(API + "/dashboard");

    const data = res?.data || {};

    /* =========================
       KPIs
    ========================= */

    setText("home-facturas", formatMoney(data?.resumen?.totalFacturado));
    setText("home-facturas-pendiente", formatMoney(data?.resumen?.totalPendiente));
    setText("home-facturacion-mes", formatMoney(data?.charts?.cashflowMensual?.slice(-1)[0]?.total));

    setText("home-clientes", safe(data?.counters?.clientes));
    setText("home-usuarios", safe(data?.counters?.usuarios));

    /* =========================
       🔥 BARRAS AÑO (PRO)
    ========================= */

    const evolucion = data?.charts?.evolucionMensual || [];

    const yearData = buildYearData(evolucion);

    renderYearRevenue(yearData);

  } catch(e){
    console.error("💥 Dashboard error:", e);
  }
}

/* =========================
   SYSTEM
========================= */

async function loadSystem(){

  const token = Onion.auth?.getToken?.();

  if(!token){
    setText("status-api", "API · no auth");
    setText("status-db", "DB · no auth");
    return;
  }

  try{

    const base = new URL(API).origin;

    const res = await fetch(base + "/health/internal", {
      headers: {
        "Authorization": "Bearer " + token
      }
    });

    const data = await res.json();

    setText("status-api", "API · " + (data?.api?.latency ?? "--") + " ms");
    setText("status-db", "DB · " + (data?.db?.status ?? "--"));
    setText("status-uptime", "Uptime · " + (data?.uptime ?? "--"));

  }catch(e){

    setText("status-api", "API · error");
    setText("status-db", "DB · error");

  }
}

/* =========================
   LOAD
========================= */

async function loadDashboard(){

  const panel = getRoot();
  panel?.classList.remove("ready");

  await Promise.allSettled([
    loadDashboardData(),
    loadSystem()
  ]);

  requestAnimationFrame(()=>{
    panel?.classList.add("ready");
  });
}

/* =========================
   INIT
========================= */

function init(){

  const root = getRoot();
  if(!root || initialized) return;

  initialized = true;

  setMonthLabel();
  loadDashboard();

  interval = setInterval(loadDashboard, 60000);

  Onion.onCleanup(()=>{
    initialized = false;
    if(interval) clearInterval(interval);
  });
}

/* =========================
   START
========================= */

init();

})();
