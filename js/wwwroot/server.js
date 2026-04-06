"use strict";

(function(){

  // 🔥 CORE BASE
  if(!window.Onion){
    window.Onion = {};
  }

  const Onion = window.Onion;

  /* =========================================================
     RENDER SIMPLE
  ========================================================= */

  Onion.render = function(html){

    const el = document.getElementById("view-container");

    if(!el){
      console.error("💥 No existe view-container");
      return;
    }

    el.innerHTML = html;

  };

  /* =========================================================
     START
  ========================================================= */

  function start(){

    console.log("🧅 START LIMPIO");

    Onion.render(`
      <div style="padding:20px">
        <h1>FUNCIONA 🔥</h1>
      </div>
    `);

  }

  document.addEventListener("DOMContentLoaded", start);

})();
