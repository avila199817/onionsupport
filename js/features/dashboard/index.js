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

const API = Onion.config?.API || "";

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

/* =========================
   🔥 BUILD 12 MESES
========================= */

function buildYearData(evolucion){

  const currentYear = new Date().getFullYear();
  const yearData = new Array(12).fill(0);

  if(!Array.isArray(evolucion)) return yearData;

  evolucion.forEach(m => {

    if(!m?.mes) return;

    const [yearStr, mesStr] = m.mes.split("-");
    const year = Number(yearStr);
    const monthIndex = Number(mesStr) - 1;

    if(year !== currentYear) return;
    if(monthIndex < 0 || monthIndex > 11) return;

    yearData[monthIndex] = safe(m.total);

  });

  return yearData;
}

/* =========================
   🔥 RENDER BARRAS PRO
========================= */

function renderYearRevenue(data){

  const container = getRoot()?.querySelector(".year-grid");

  if(!container){
    console.error("💥 .year-grid no encontrado");
    return;
  }

  const months = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
  const max = Math.max(...data, 1);

  // 🔥 HTML alineado con CSS PRO
  container.innerHTML = data.map((value, i) => {

    const isEmpty = value === 0;

    return `
      <div class="month ${isEmpty ? "empty" : ""}">
        <div 
          class="bar"
          data-value="${formatMoney(value)}"
          data-month="${months[i]}"
          style="height:0%">
        </div>
      </div>
    `;

  }).join("");

  // 🔥 ANIMACIÓN PROGRESIVA
  requestAnimationFrame(()=>{

    const bars = container.querySelectorAll(".bar");

    bars.forEach((bar, i)=>{

      const value = safe(data[i]);
      const percent = (value / max) * 100;

      requestAnimationFrame(()=>{
        setTimeout(()=>{
          bar.style.height = (value === 0 ? 2 : percent) + "%";
        }, i * 45);
      });

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

    if(!data){
      console.warn("⚠️ Dashboard sin data");
      renderYearRevenue(new Array(12).fill(0));
      return;
    }

    console.log("🔥 DASHBOARD:", data);

    /* =========================
       KPIs
    ========================= */

    setText("home-facturas", formatMoney(data?.resumen?.totalFacturado));
    setText("home-facturas-pendiente", formatMoney(data?.resumen?.totalPendiente));

    const ultimoMes = data?.charts?.cashflowMensual?.slice(-1)?.[0]?.total || 0;
    setText("home-facturacion-mes", formatMoney(ultimoMes));

    setText("home-clientes", safe(data?.counters?.clientes));
    setText("home-usuarios", safe(data?.counters?.usuarios));

    /* =========================
       🔥 BARRAS
    ========================= */

    const evolucion = data?.charts?.evolucionMensual || [];
    const yearData = buildYearData(evolucion);

    console.log("📊 YEAR DATA:", yearData);

    renderYearRevenue(yearData);

  } catch(e){

    console.error("💥 Dashboard error:", e);
    renderYearRevenue(new Array(12).fill(0));

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

    const base = new URL(API, window.location.origin).origin;

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
