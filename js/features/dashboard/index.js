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
   🔥 GREETING PRO
========================= */

function setGreeting(){

  const el = document.getElementById("greeting-text");
  if(!el) return;

  const hour = new Date().getHours();

  let greeting = "Buenos días";

  if(hour >= 12 && hour < 20){
    greeting = "Buenas tardes";
  } 
  else if(hour >= 20 || hour < 6){
    greeting = "Buenas noches";
  }

  // 🔥 SOLO NOMBRE
  const fullName = Onion.auth?.getUser?.()?.nombre || "Cristian";
  const name = fullName.split(" ")[0];

  el.textContent = `${greeting}, ${name}`;
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

  container.innerHTML = data.map((value, i) => {

    const isEmpty = value === 0;

    return `
      <div class="month ${isEmpty ? "empty" : ""}">
        <div 
          class="bar"
          data-value="${isEmpty ? "" : formatMoney(value)}"
          data-month="${months[i]}"
          style="height:0%">
        </div>
      </div>
    `;

  }).join("");

  /* 🔥 ANIMACIÓN */
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
      renderYearRevenue(new Array(12).fill(0));
      return;
    }

    /* KPIs */
    setText("home-facturas", formatMoney(data?.resumen?.totalFacturado));

    /* BARRAS */
    const evolucion = data?.charts?.evolucionMensual || [];
    const yearData = buildYearData(evolucion);

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

  if(!token) return;

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

  setGreeting();

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
