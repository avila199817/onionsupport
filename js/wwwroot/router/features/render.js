"use strict";

(function(){

  if(!window.Onion){
    console.error("💥 Onion no existe (render.js)");
    return;
  }

  const Onion = window.Onion;

  const ROOT_ID = "view-container";

  let currentView = null;

  /* =========================================================
     ROOT
  ========================================================= */

  function getRoot(){

    const el = document.getElementById(ROOT_ID);

    if(!el){
      console.error("💥 #view-container no existe");
      return null;
    }

    return el;

  }

  /* =========================================================
     RENDER
  ========================================================= */

  function render(view){

    const root = getRoot();
    if(!root) return;

    try{

      // evitar renders innecesarios
      if(currentView === view) return;

      currentView = view;

      let html = "";

      if(typeof view === "function"){
        html = view();
      }else{
        html = view || "";
      }

      root.innerHTML = html;

    }catch(e){

      console.error("💥 RENDER ERROR:", e);
      root.innerHTML = "<h1>Error</h1>";

    }

  }

  /* =========================================================
     API
  ========================================================= */

  Onion.render = render;

})();
