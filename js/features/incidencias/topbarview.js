"use strict";

(function(){

  let mounted = false;

  /* =========================
     🔥 STATE UI CENTRALIZADO
  ========================= */
  const state = {
    search: "",
    estado: "",
    prioridad: ""
  };

  let debounceTimer = null;


  /* =========================
     🔥 ROOT HELPERS
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
          id="search-incidencia"
          placeholder="Buscar por ID, usuario, email o asunto..."
          autocomplete="off"
        >

        <select id="filter-estado-incidencia">
          <option value="">Estado</option>
          <option value="abierta">Abierta</option>
          <option value="progreso">En progreso</option>
          <option value="cerrada">Cerrada</option>
        </select>

        <select id="filter-prioridad-incidencia">
          <option value="">Prioridad</option>
          <option value="alta">Alta</option>
          <option value="media">Media</option>
          <option value="baja">Baja</option>
        </select>

      </div>

      <div class="topbar-right">
        <button id="btn-clear-filters" class="btn-secondary">
          Limpiar
        </button>

        <button id="btn-new-incidencia" class="btn-primary">
          + Nueva
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
            <th class="col-main">Usuario</th>
            <th class="col-main">Asunto</th>
            <th class="col-secondary">Técnico</th>
            <th class="col-status">Estado</th>
            <th class="col-status">Prioridad</th>
            <th class="col-date">Fecha</th>
            <th class="col-date">Cierre</th>
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

    const input = document.getElementById("search-incidencia");
    const estado = document.getElementById("filter-estado-incidencia");
    const prioridad = document.getElementById("filter-prioridad-incidencia");
    const btnNew = document.getElementById("btn-new-incidencia");
    const btnClear = document.getElementById("btn-clear-filters");

    const user = window.Onion?.state?.user;

    /* 🔥 CONTROL ADMIN */
    if(!user || user.role !== "admin"){
      btnNew?.remove();
    }

    /* =========================
       🔥 CREAR INCIDENCIA
    ========================= */
    btnNew?.addEventListener("click", ()=>{
      window.Onion?.router?.navigate("/incidencias/nueva");
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
       🔥 PRIORIDAD
    ========================= */
    prioridad?.addEventListener("change", (e)=>{
      state.prioridad = e.target.value;
      triggerFilters();
    });


    /* =========================
       🔥 LIMPIAR FILTROS
    ========================= */
    btnClear?.addEventListener("click", ()=>{

      state.search = "";
      state.estado = "";
      state.prioridad = "";

      if(input) input.value = "";
      if(estado) estado.value = "";
      if(prioridad) prioridad.value = "";

      triggerFilters();

    });

  }


  /* =========================
     🔥 TRIGGER GLOBAL
  ========================= */
  function triggerFilters(){

    if(window.IncidenciasUIExternal?.applyFilters){
      window.IncidenciasUIExternal.applyFilters({ ...state });
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
  window.IncidenciasUI = {
    start,
    destroy
  };

})();
