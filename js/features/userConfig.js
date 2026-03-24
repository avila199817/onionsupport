"use strict";

(function(){

  if(!window.Onion){
    console.error("💥 Onion no está definido (userConfig.js)");
    return;
  }

  const Onion = window.Onion;

  Onion.userConfig = {

    /* =========================
       GET
    ========================= */

    get(key){
      try{
        return JSON.parse(localStorage.getItem("onion_config"))?.[key];
      }catch{
        return null;
      }
    },

    /* =========================
       SET
    ========================= */

    set(key, value){

      let config = {};

      try{
        config = JSON.parse(localStorage.getItem("onion_config")) || {};
      }catch{}

      config[key] = value;

      localStorage.setItem("onion_config", JSON.stringify(config));

    },

    /* =========================
       APPLY (GLOBAL)
    ========================= */

    apply(){

      const dark = this.get("darkMode");

      // 🔥 fallback a sistema
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;

      const isDark = dark !== null ? dark : prefersDark;

      if(isDark){
        document.documentElement.removeAttribute("data-theme");
      }else{
        document.documentElement.setAttribute("data-theme","light");
      }

    }

  };

})();
