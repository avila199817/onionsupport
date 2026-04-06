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

      // 🔥 fallback si queda vacío
      if(!root.innerHTML.trim()){
        root.innerHTML = `
          <div style="padding:20px">
            <h1>ONION OK 🔥</h1>
            <p>Render vacío pero funcionando</p>
          </div>
        `;
      }

    }catch(e){

      console.error("💥 RENDER ERROR:", e);

      root.innerHTML = `
        <div style="padding:20px">
          <h1>ONION RENDER OK 🔥</h1>
          <p>${e.message}</p>
        </div>
      `;

    }

  }

  /* =========================================================
     API
  ========================================================= */

  Onion.render = render;

})();
