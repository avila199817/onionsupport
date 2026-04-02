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
   🔥 BUILD YEAR DATA (REAL)
========================= */

function buildYearData(facturas){

  const currentYear = new Date().getFullYear();

  const yearData = new Array(12).fill(0).map(() => ({
    paid: 0,
    pending: 0
  }));

  if(!Array.isArray(facturas)) return yearData;

  facturas.forEach(f => {

    if(!f?.fechaFactura) return;

    const date = new Date(f.fechaFactura);
    const year = date.getFullYear();
    const monthIndex = date.getMonth();

    if(year !== currentYear) return;

    const base = safe(f.baseImponible);

    if(f.estadoPago === "pagada"){
      yearData[monthIndex].paid += base;
    } else {
      yearData[monthIndex].pending += base;
    }

  });

  return yearData;
}

/* =========================
   🔥 KPI CALC REAL (PRO)
========================= */

function calculateKPIs(facturas){

  let totalCobrado = 0;
  let totalIVA = 0;
  let totalIRPF = 0;
  let totalPendiente = 0;

  facturas.forEach(f => {

    const base = safe(f.baseImponible);
    const iva = safe(f.impuestos?.[0]?.importe);
    const irpf = safe(f.irpf);

    if(f.estadoPago === "pagada"){
      totalCobrado += base;
      totalIVA += iva;
      totalIRPF += irpf;
    } else {
      totalPendiente += base;
    }

  });

  const beneficio = totalCobrado - totalIRPF;

  return {
    totalCobrado,
    totalIVA,
    totalIRPF,
    totalPendiente,
    beneficio
  };
}

/* =========================
   🔥 LOADER
========================= */

function showLoader(){
  const container = getRoot()?.querySelector(".year-grid");
  if(!container) return;
  container.classList.add("skeleton-grid");
}

function hideLoader(){
  const container = getRoot()?.querySelector(".year-grid");
  if(!container) return;
  container.classList.remove("skeleton-grid");
  container.innerHTML = "";
}

/* =========================
   🔥 RENDER CHART
========================= */

function renderYearRevenue(data){

  const container = getRoot()?.querySelector(".year-grid");
  if(!container) return;

  const months = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
  const max = Math.max(...data.map(d => d.paid + d.pending), 1);

  const html = data.map((d, i) => {

    const total = d.paid + d.pending;

    const percent = (total / max) * 100;
    const paidPercent = total ? (d.paid / total) * 100 : 0;
    const pendingPercent = total ? (d.pending / total) * 100 : 0;

    return `
      <div class="month ${total === 0 ? "empty" : ""}">
        <div class="bar" data-month="${months[i]}" style="height:${total === 0 ? 2 : percent}%">

          <div class="bar-paid" style="height:${paidPercent}%">
            ${d.paid > 0 ? `<span class="bar-label">${formatMoney(d.paid)}</span>` : ""}
          </div>

          <div class="bar-pending" style="height:${pendingPercent}%">
            ${d.pending > 0 ? `<span class="bar-label negative">${formatMoney(d.pending)}</span>` : ""}
          </div>

        </div>
      </div>
    `;
  }).join("");

  container.innerHTML = html;

  requestAnimationFrame(()=>{
    container.querySelectorAll(".bar").forEach(bar=>{
      bar.classList.add("animate");
    });
  });
}

/* =========================
   🔥 DATA
========================= */

async function loadDashboardData(){

  try {

    const res = await Onion.fetch(API + "/facturas"); // 🔥 usamos facturas reales
    const facturas = res?.data || [];

    const yearData = buildYearData(facturas);
    const kpis = calculateKPIs(facturas);

    // 🔥 KPIs REALES
    setText("home-facturas", formatMoney(kpis.totalCobrado));
    setText("home-iva", formatMoney(kpis.totalIVA));
    setText("home-irpf", formatMoney(kpis.totalIRPF));
    setText("home-beneficio", formatMoney(kpis.beneficio));
    setText("home-pendiente", formatMoney(kpis.totalPendiente));

    hideLoader();
    renderYearRevenue(yearData);

  } catch(e){

    console.error("💥 Dashboard error:", e);
    hideLoader();
  }
}

/* =========================
   🔥 LOAD
========================= */

async function loadDashboard(){

  if(loading) return;
  loading = true;

  const panel = getRoot();
  panel?.classList.remove("ready");

  setGreeting();
  showLoader();

  await loadDashboardData();

  requestAnimationFrame(()=>{
    panel?.classList.add("ready");
  });

  loading = false;
}

/* =========================
   🔥 INIT
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
