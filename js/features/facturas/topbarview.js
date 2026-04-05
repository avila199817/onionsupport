"use strict";

(function(){

  let mounted = false;

  /* =========================
     🔥 RENDER HTML (SAFE)
  ========================= */
  function render(){

    const container = document.getElementById("topbarview-container");
    if(!container) return;

    // 🔥 evitar duplicados
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
     🔥 INIT LOGIC (ROBUST)
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

    // 🔥 evitar doble bind global
    if(mounted) return;
    mounted = true;

    btn.addEventListener("click", onCreateFactura);
  }

  function onCreateFactura(){
    console.log("crear factura");
  }

  /* =========================
     🔥 CLEANUP (PRO)
  ========================= */
  function destroy(){
    const container = document.getElementById("topbarview-container");
    if(!container) return;

    container.innerHTML = "";
    mounted = false;
  }

  /* =========================
     🔥 START
  ========================= */
  function start(){
    render();
    init();
  }

  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }

  /* 🔥 opcional: exponer para SPA */
  window.TopbarView = {
    start,
    destroy
  };

})();
