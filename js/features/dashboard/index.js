"use strict";

(function(){

const Onion = window.Onion;

if(!Onion){
  console.error("💥 Onion no disponible (dashboard)");
  return;
}

let interval = null;
let initialized = false;
let loading = false;

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
   🔥 GREETING
========================= */

function setGreeting(){

  const el = document.getElementById("greeting-text");
  if(!el) return;

  const hour = new Date().getHours();

  let greeting = "Buenos días";

  if(hour >= 12 && hour < 20){
    greeting = "Buenas tardes";
  } else if(hour >= 20 || hour < 6){
    greeting = "Buenas noches";
  }

  const fullName = Onion.auth?.getUser?.()?.nombre || "Cristian";
  const name = fullName.split(" ")[0];

  el.textContent = `${greeting}, ${name}`;
}

/* =========================
   BUILD DATA
========================= */

function buildYearData(evolucion){

  const currentYear = new Date().getFullYear();

  const yearData = new Array(12).fill(0).map(() => ({
    paid: 0,
    pending: 0
  }));

  if(!Array.isArray(evolucion)) return yearData;

  evolucion.forEach(m => {

    if(!m?.mes) return;

    const [yearStr, mesStr] = m.mes.split("-");
    const year = Number(yearStr);
    const monthIndex = Number(mesStr) - 1;

    if(year !== currentYear) return;

    yearData[monthIndex] = {
      paid: safe(m.pagado),
      pending: safe(m.pendiente)
    };

  });

  return yearData;
}

/* =========================
   🔥 CLEAN BEFORE RENDER
========================= */

function clearChart(){
  const container = getRoot()?.querySelector(".year-grid");
  if(container) container.innerHTML = "";
}

/* =========================
   🔥 RENDER PRO (SIN FANTASMAS)
========================= */

function renderYearRevenue(data){

  const container = getRoot()?.querySelector(".year-grid");
  if(!container) return;

  const months = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
  const max = Math.max(...data.map(d => d.paid + d.pending), 1);

  // 🔥 render directo con valores finales (NO 0%)
  container.innerHTML = data.map((d, i) => {

    const total = d.paid + d.pending;

    const percent = (total / max) * 100;
    const paidPercent = total ? (d.paid / total) * 100 : 0;
    const pendingPercent = total ? (d.pending / total) * 100 : 0;

    return `
      <div class="month ${total === 0 ? "empty" : ""}">
        <div class="bar" data-month="${months[i]}" style="height:${total === 0 ? 2 : percent}%">

          ${
            total > 0
              ? `<span class="bar-label">${formatMoney(total)}</span>`
              : ""
          }

          <div class="bar-paid" style="height:${paidPercent}%"></div>
          <div class="bar-pending" style="height:${pendingPercent}%"></div>

        </div>
      </div>
    `;
  }).join("");

  // 🔥 animación suave SOLO visual
  requestAnimationFrame(()=>{
    container.querySelectorAll(".bar").forEach((bar, i)=>{
      bar.style.transform = "scaleY(0.95)";
      setTimeout(()=>{
        bar.style.transform = "scaleY(1)";
      }, i * 40);
    });
  });
}

/* =========================
   DATA
========================= */

async function loadDashboardData(){

  try {

    const res = await Onion.fetch(API + "/dashboard");
    const data = res?.data || {};

    setText("home-facturas", formatMoney(data?.resumen?.totalCobrado));

    const evolucion = data?.charts?.evolucionMensual || [];
    const yearData = buildYearData(evolucion);

    renderYearRevenue(yearData);

  } catch(e){

    console.error("💥 Dashboard error:", e);
  }
}

/* =========================
   LOAD
========================= */

async function loadDashboard(){

  if(loading) return;
  loading = true;

  const panel = getRoot();
  panel?.classList.remove("ready");

  setGreeting();

  // 🔥 limpiar antes de pintar
  clearChart();

  await loadDashboardData();

  requestAnimationFrame(()=>{
    panel?.classList.add("ready");
  });

  loading = false;
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
