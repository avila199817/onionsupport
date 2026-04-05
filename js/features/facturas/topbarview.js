"use strict";

(function(){

  let mounted = false;

  /* =========================
     🔥 STATE
  ========================= */
  const state = {
    search: "",
    estado: ""
  };


  /* =========================
     🔥 RENDER TOPBARVIEW
  ========================= */
  function renderTopbar(){

    const container = document.getElementById("topbarview-container");
    if(!container) return;

    if(container.querySelector(".topbarview")) return;

    const div = document.createElement("div");
    div.className = "topbarview";

    div.innerHTML = `
      <input 
        type="text"
        id="search-factura"
        placeholder="Buscar factura..."
        autocomplete="off"
      >

      <select id="filter-estado-factura">
        <option value="">Estado pago</option>
        <option value="pagada">Pagada</option>
        <option value="pendiente">Pendiente</option>
      </select>

      <button id="btn-new-factura" class="btn-primary">
        + Nueva
      </button>
    `;

    container.appendChild(div);
  }


  /* =========================
     🔥 RENDER TABLE HEAD
  ========================= */
  function renderTableHead(){

    const container = document.getElementById("tablehead-container");
    if(!container) return;

    if(container.querySelector(".table-head")) return;

    const div = document.createElement("div");
    div.className = "table-head";

    div.innerHTML = `
      <table>
        <thead>
          <tr>
            <th class="col-id">ID</th>
            <th class="col-main">Cliente</th>
            <th class="col-secondary">Empresa</th>
            <th class="col-date">Fecha</th>
            <th class="col-importe">Importe</th>
            <th class="col-status">Pago</th>
            <th class="col-actions">Acciones</th>
          </tr>
        </thead>
      </table>
    `;

    container.appendChild(div);
  }


  /* =========================
     🔥 FILTER LOGIC
  ========================= */
  function applyFilters(){

    const rows = document.querySelectorAll("#facturas-body tr");

    rows.forEach(row => {

      if(row.classList.contains("table-loading")) return;

      const text = row.innerText.toLowerCase();
      const estado = row.dataset.estado || "";

      const matchSearch = text.includes(state.search);
      const matchEstado = !state.estado || estado === state.estado;

      row.style.display = (matchSearch && matchEstado) ? "" : "none";
    });
  }


  /* =========================
     🔥 SCROLL EFFECT (GLASS)
  ========================= */
  function initScrollEffect(){

    const container = document.querySelector(".table-container");
    const head = document.querySelector(".table-head");

    if(!container || !head) return;

    container.addEventListener("scroll", () => {
      if(container.scrollTop > 10){
        head.classList.add("scrolled");
      } else {
        head.classList.remove("scrolled");
      }
    });
  }


  /* =========================
     🔥 INIT LOGIC
  ========================= */
  function init(){

    if(mounted) return;
    mounted = true;

    const btn = document.getElementById("btn-new-factura");
    const input = document.getElementById("search-factura");
    const select = document.getElementById("filter-estado-factura");

    const user = window.Onion?.user;

    // 🔥 SOLO ADMIN
    if(!user || user.role !== "admin"){
      if(btn) btn.remove();
    }

    if(btn){
      btn.addEventListener("click", onCreateFactura);
    }

    if(input){
      input.addEventListener("input", (e)=>{
        state.search = e.target.value.toLowerCase();
        applyFilters();
      });
    }

    if(select){
      select.addEventListener("change", (e)=>{
        state.estado = e.target.value;
        applyFilters();
      });
    }

    initScrollEffect();
  }


  /* =========================
     🔥 ACTIONS
  ========================= */
  function onCreateFactura(){
    console.log("crear factura");
  }


  /* =========================
     🔥 CLEANUP
  ========================= */
  function destroy(){

    const topbar = document.getElementById("topbarview-container");
    if(topbar) topbar.innerHTML = "";

    const tablehead = document.getElementById("tablehead-container");
    if(tablehead) tablehead.innerHTML = "";

    mounted = false;
  }


  /* =========================
     🔥 START
  ========================= */
  function start(){
    renderTopbar();
    renderTableHead();
    init();
  }


  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }


  /* =========================
     🔥 EXPORT
  ========================= */
  window.FacturasUI = {
    start,
    destroy,
    applyFilters
  };

})();
