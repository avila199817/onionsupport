"use strict";

(function(){

  let mounted = false;

  /* =========================
     🔥 STATE UI CENTRALIZADO
  ========================= */
  const state = {
    search: "",
    estado: "",
    tipo: ""
  };

  let debounceTimer = null;


  /* =========================
     🔥 HELPERS
  ========================= */
  function getContainer(id){
    return document.getElementById(id);
  }


  /* =========================
     🔥 RENDER TOPBAR
  ========================= */
  function renderTopbar(){

    const container = getContainer("topbarview-container");
    if(!container) return;

    if(container.querySelector(".topbarview")) return;

    const div = document.createElement("div");
    div.className = "topbarview";

    div.innerHTML = `
      <div class="topbar-left">

        <input 
          type="text"
          id="search-cliente"
          placeholder="Buscar por nombre, empresa, email o ubicación..."
          autocomplete="off"
        >

        <select id="filter-estado-cliente">
          <option value="">Estado</option>
          <option value="activo">Activo</option>
          <option value="inactivo">Inactivo</option>
        </select>

        <select id="filter-tipo-cliente">
          <option value="">Tipo</option>
          <option value="particular">Particular</option>
          <option value="empresa">Empresa</option>
        </select>

      </div>

      <div class="topbar-right">

        <button id="btn-clear-filters" class="btn-secondary">
          Limpiar
        </button>

        <button id="btn-new-cliente" class="btn-primary">
          + Nuevo
        </button>

      </div>
    `;

    container.appendChild(div);
  }


  /* =========================
     🔥 RENDER TABLE HEAD
  ========================= */
  function renderTableHead(){

    const container = getContainer("tablehead-container");
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
            <th class="col-secondary">Ubicación</th>
            <th class="col-secondary">Tipo</th>
            <th class="col-status">Estado</th>
            <th class="col-date">Alta</th>
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

    const input = document.getElementById("search-cliente");
    const estado = document.getElementById("filter-estado-cliente");
    const tipo = document.getElementById("filter-tipo-cliente");
    const btnNew = document.getElementById("btn-new-cliente");
    const btnClear = document.getElementById("btn-clear-filters");

    const user = window.Onion?.state?.user;

    /* 🔥 CONTROL ADMIN */
    if(!user || user.role !== "admin"){
      btnNew?.remove();
    }

    /* =========================
       🔥 CREAR CLIENTE
    ========================= */
    btnNew?.addEventListener("click", ()=>{
      window.Onion?.router?.navigate("/clientes/cliente");
    });


    /* =========================
       🔥 SEARCH (DEBOUNCE)
    ========================= */
    input?.addEventListener("input", (e)=>{

      clearTimeout(debounceTimer);

      debounceTimer = setTimeout(()=>{
        state.search = e.target.value.trim().toLowerCase();
        triggerFilters();
      }, 250);

    });


    /* =========================
       🔥 ESTADO
    ========================= */
    estado?.addEventListener("change", (e)=>{
      state.estado = e.target.value;
      triggerFilters();
    });


    /* =========================
       🔥 TIPO
    ========================= */
    tipo?.addEventListener("change", (e)=>{
      state.tipo = e.target.value;
      triggerFilters();
    });


    /* =========================
       🔥 LIMPIAR FILTROS
    ========================= */
    btnClear?.addEventListener("click", ()=>{

      state.search = "";
      state.estado = "";
      state.tipo = "";

      if(input) input.value = "";
      if(estado) estado.value = "";
      if(tipo) tipo.value = "";

      triggerFilters();

    });

  }


  /* =========================
     🔥 TRIGGER GLOBAL
  ========================= */
  function triggerFilters(){

    if(window.ClientesUIExternal?.applyFilters){
      window.ClientesUIExternal.applyFilters({ ...state });
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

    requestAnimationFrame(()=>{
      bindUIEvents();
      initScrollEffect();
    });

  }


  /* =========================
     🔥 DESTROY
  ========================= */
  function destroy(){

    const topbar = getContainer("topbarview-container");
    if(topbar) topbar.innerHTML = "";

    const tablehead = getContainer("tablehead-container");
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
  window.ClientesUI = {
    start,
    destroy
  };

})();
