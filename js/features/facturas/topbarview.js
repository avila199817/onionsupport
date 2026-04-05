"use strict";

(function(){

  let mounted = false;

  /* =========================
     🔥 STATE UI
  ========================= */
  const state = {
    search: "",
    estado: ""
  };


  /* =========================
     🔥 RENDER TOPBAR
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
     🔥 EVENTOS UI
  ========================= */
  function bindUIEvents(){

    const btn = document.getElementById("btn-new-factura");
    const input = document.getElementById("search-factura");
    const select = document.getElementById("filter-estado-factura");

    const user = window.Onion?.state?.user;

    // 🔥 SOLO ADMIN
    if(!user || user.role !== "admin"){
      btn?.remove();
    }

    /* 🔥 CREAR FACTURA */
    btn?.addEventListener("click", ()=>{
      window.Onion?.router?.navigate("/facturas/nueva");
    });

    /* 🔥 SEARCH */
    input?.addEventListener("input", (e)=>{
      state.search = e.target.value.toLowerCase();
      triggerFilters();
    });

    /* 🔥 ESTADO */
    select?.addEventListener("change", (e)=>{
      state.estado = e.target.value;
      triggerFilters();
    });

  }


  /* =========================
     🔥 TRIGGER FILTROS (GLOBAL)
  ========================= */
  function triggerFilters(){

    // 🔥 delega al sistema de facturas
    if(window.FacturasUIExternal?.applyFilters){
      window.FacturasUIExternal.applyFilters(state);
    }

  }


  /* =========================
     🔥 SCROLL EFFECT
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
     🔥 INIT
  ========================= */
  function init(){

    if(mounted) return;
    mounted = true;

    renderTopbar();
    renderTableHead();

    // 🔥 IMPORTANTE: esperar a que el DOM exista
    requestAnimationFrame(()=>{
      bindUIEvents();
      initScrollEffect();
    });

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

    if(document.readyState === "loading"){
      document.addEventListener("DOMContentLoaded", init);
    } else {
      init();
    }

  }

  start();


  /* =========================
     🔥 EXPORT
  ========================= */
  window.FacturasUI = {
    start,
    destroy
  };

})();
