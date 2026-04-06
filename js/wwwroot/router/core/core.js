"use strict";

(function(){

  // Crear Onion global
  window.Onion = window.Onion || {};

  const Onion = window.Onion;

  /* =========================================================
     STATE
  ========================================================= */

  Onion.state = {
    renderId: 0,
    appReady: false
  };

  /* =========================================================
     USER (BÁSICO)
  ========================================================= */

  let _user = null;

  Onion.setUser = function(user){
    _user = user;
  };

  Onion.getUser = function(){
    return _user;
  };

  /* =========================================================
     INIT (FAKE)
  ========================================================= */

  Onion.init = async function(){

    // usuario fake para arrancar
    Onion.setUser({
      name: "Ávila"
    });

    console.log("🧅 Init OK");

  };

  /* =========================================================
     ROUTER SIMPLE
  ========================================================= */

  Onion.router = {

    resolve(){
      return {
        page: "/app/views/index.html"
      };
    }

  };

  /* =========================================================
     RENDER SIMPLE
  ========================================================= */

  Onion.render = async function(){

    const container = document.getElementById("view-container");

    if(!container){
      console.error("❌ No existe #view-container");
      return;
    }

    try{

      const res = await fetch("/app/views/index.html");
      const html = await res.text();

      container.innerHTML = html;

      console.log("🎯 Render OK");

    }catch(e){

      console.error("💥 Render error:", e);

      container.innerHTML = "<h1>Error cargando vista</h1>";

    }

  };

  console.log("🧠 Core cargado");

})();
