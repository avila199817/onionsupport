"use strict";

(function(){

  let mounted = false;

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

    const container = document.querySelector(".table-head-container");
    if(!container) return;

    // evitar duplicados
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
     🔥 INIT LOGIC
  ========================= */
  function init(){

    const btn = document.getElementById("btn-new-factura");
    if(!btn) return;

    const user = window.Onion?.user;

    // 🔥 SOLO ADMIN
    if(!user || user.role !== "admin"){
      btn.remove();
      return;
    }

    if(mounted) return;
    mounted = true;

    btn.addEventListener("click", onCreateFactura);
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

    const tableHead = document.querySelector(".table-head-container");
    if(tableHead) tableHead.innerHTML = "";

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
     🔥 EXPORT (SPA READY)
  ========================= */
  window.FacturasUI = {
    start,
    destroy
  };

})();
