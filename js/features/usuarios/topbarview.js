"use strict";

(function(){

  let mounted = false;

  /* =========================
     🔥 STATE UI
  ========================= */
  const state = {
    search: "",
    estado: "",
    rol: "",
    tipo: ""
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
        id="search-usuario"
        placeholder="Buscar usuario..."
        autocomplete="off"
      >

      <select id="filter-estado-usuario">
        <option value="">Estado</option>
        <option value="activo">Activo</option>
        <option value="inactivo">Inactivo</option>
      </select>

      <select id="filter-rol-usuario">
        <option value="">Rol</option>
        <option value="admin">Admin</option>
        <option value="user">Usuario</option>
      </select>

      <select id="filter-tipo-usuario">
        <option value="">Tipo</option>
        <option value="particular">Particular</option>
        <option value="empresa">Empresa</option>
      </select>

      <button id="btn-new-usuario" class="btn-primary">
        + Nuevo
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
            <th class="col-main">Usuario</th>
            <th class="col-secondary">Rol</th>
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

    const btn = document.getElementById("btn-new-usuario");
    const input = document.getElementById("search-usuario");
    const estado = document.getElementById("filter-estado-usuario");
    const rol = document.getElementById("filter-rol-usuario");
    const tipo = document.getElementById("filter-tipo-usuario");

    const user = window.Onion?.state?.user;

    // 🔥 SOLO ADMIN
    if(!user || user.role !== "admin"){
      btn?.remove();
    }

    /* 🔥 CREAR USUARIO */
    btn?.addEventListener("click", ()=>{
      window.Onion?.router?.navigate("/usuarios/nuevo");
    });

    /* 🔥 SEARCH */
    input?.addEventListener("input", (e)=>{
      state.search = e.target.value.toLowerCase();
      triggerFilters();
    });

    /* 🔥 ESTADO */
    estado?.addEventListener("change", (e)=>{
      state.estado = e.target.value;
      triggerFilters();
    });

    /* 🔥 ROL */
    rol?.addEventListener("change", (e)=>{
      state.rol = e.target.value;
      triggerFilters();
    });

    /* 🔥 TIPO */
    tipo?.addEventListener("change", (e)=>{
      state.tipo = e.target.value;
      triggerFilters();
    });

  }


  /* =========================
     🔥 TRIGGER FILTROS (GLOBAL)
  ========================= */
  function triggerFilters(){

    if(window.UsuariosUIExternal?.applyFilters){
      window.UsuariosUIExternal.applyFilters(state);
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
  window.UsuariosUI = {
    start,
    destroy
  };

})();
