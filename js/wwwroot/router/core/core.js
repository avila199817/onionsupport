"use strict";

(function(){

  /* =========================================================
     GLOBAL
  ========================================================= */

  window.Onion = window.Onion || {};
  const Onion = window.Onion;

  /* =========================================================
     BASE (🔥 CLAVE PARA NO ROMPER NADA)
  ========================================================= */

  Onion.state  = Onion.state  || {};
  Onion.events = Onion.events || {};
  Onion.ui     = Onion.ui     || {};
  Onion.router = Onion.router || {};

  /* =========================================================
     STATE
  ========================================================= */

  Onion.state.renderId = Onion.state.renderId || 0;
  Onion.state.appReady = Onion.state.appReady || false;

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

  if(!Onion.init){
    Onion.init = async function(){

      Onion.setUser({
        name: "Ávila"
      });

      console.log("🧅 Init OK");

    };
  }

  /* =========================================================
     ROUTER SIMPLE (fallback)
  ========================================================= */

  if(!Onion.router.resolve){
    Onion.router.resolve = function(){
      return {
        page: "/app/views/index.html"
      };
    };
  }

  /* =========================================================
     RENDER SIMPLE (fallback)
  ========================================================= */

  if(!Onion.render){
    Onion.render = async function(){

      const container = document.getElementById("view-container");

      if(!container){
        console.error("❌ No existe #view-container");
        return;
      }

      try{

        const route = Onion.router.resolve();
        const url = route?.page || "/app/views/index.html";

        const res = await fetch(url);
        const html = await res.text();

        container.innerHTML = html;

        console.log("🎯 Render OK");

      }catch(e){

        console.error("💥 Render error:", e);

        container.innerHTML = "<h1>Error cargando vista</h1>";

      }

    };
  }

  /* =========================================================
     SAFE UTILS (OPCIONAL PERO ÚTIL)
  ========================================================= */

  Onion.safe = function(fn){
    try{
      return fn();
    }catch(e){
      console.error("💥 SAFE ERROR:", e);
      return null;
    }
  };

  /* =========================================================
     DEBUG
  ========================================================= */

  console.log("🧠 Core cargado");

})();
