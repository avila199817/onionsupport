"use strict";

(function(){

  if(!window.Onion){
    console.error("💥 Onion no existe (boot)");
    return;
  }

  const Onion = window.Onion;

  document.addEventListener("DOMContentLoaded", async () => {

    Onion.log("🚀 BOOT INIT");

    try{

      Onion.state.slug = localStorage.getItem("onion_user_slug");

      if(!Onion.state.slug){
        Onion.warn("No slug → redirect login");
        Onion.auth.redirectLogin();
        return;
      }

      // 🔥 INIT (esto ya hace render)
      await Onion.init();

    }catch(e){

      Onion.error("💥 BOOT ERROR:", e);

    }finally{

      // 🔥 ESTO ES LO QUE TE FALTABA
      document.body.classList.remove("loading");

      const loader = document.getElementById("app-loader");
      if(loader){
        loader.remove();
      }

      Onion.log("✅ APP READY");

    }

  });

})();
