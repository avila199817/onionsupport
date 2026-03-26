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

      let config = {};

      try{
        config = JSON.parse(localStorage.getItem("onion_config")) || {};
      }catch{}

      const dark = config.darkMode;

      // fallback a sistema
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;

      const isDark = typeof dark === "boolean" ? dark : prefersDark;

      const theme = isDark ? "dark" : "light";

      document.documentElement.setAttribute("data-theme", theme);

    }

  };

})();
