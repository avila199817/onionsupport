"use strict";

(function(){

  /* =========================
     🔥 RENDER HTML
  ========================= */
  function render(){

    const container = document.getElementById("topbarview-container");
    if(!container) return;

    container.innerHTML = `
      <div class="topbarview">

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

      </div>
    `;
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

    // 🔥 EVITAR DUPLICADOS
    if(btn.dataset.bound === "true") return;
    btn.dataset.bound = "true";

    btn.addEventListener("click", ()=>{
      console.log("crear factura");
    });

  }

  /* =========================
     🔥 START
  ========================= */
  function start(){
    render();
    requestAnimationFrame(init);
  }

  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }

})();
