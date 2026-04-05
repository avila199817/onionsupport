"use strict";

(function(){

  if(!window.Onion){
    console.error("💥 Onion no disponible (i18n.js)");
    return;
  }

  const Onion = window.Onion;

  Onion.i18n = Onion.i18n || {};

  let current = "es";

  /* =========================
     SET LANG
  ========================= */

  Onion.i18n.setLang = function(lang){

    if(!lang) return;

    current = lang;

    try{
      Onion.userConfig?.set?.("lang", lang);
    }catch{}

    Onion.i18n.apply();
  };

  /* =========================
     GET
  ========================= */

  Onion.i18n.get = function(key){

    if(!key) return "";

    const langPack = Onion.i18n[current] || Onion.i18n["es"] || {};

    return langPack[key] || key;
  };

  /* =========================
     APPLY
  ========================= */

  Onion.i18n.apply = function(root){

    const scope = root || document;

    /* TEXT */
    scope.querySelectorAll("[data-i18n]").forEach(el=>{
      const key = el.getAttribute("data-i18n");
      if(!key) return;

      el.textContent = Onion.i18n.get(key);
    });

    /* PLACEHOLDER */
    scope.querySelectorAll("[data-i18n-placeholder]").forEach(el=>{
      const key = el.getAttribute("data-i18n-placeholder");
      if(!key) return;

      el.setAttribute("placeholder", Onion.i18n.get(key));
    });

    /* TITLE */
    scope.querySelectorAll("[data-i18n-title]").forEach(el=>{
      const key = el.getAttribute("data-i18n-title");
      if(!key) return;

      el.setAttribute("title", Onion.i18n.get(key));
    });

    /* VALUE (inputs/buttons) */
    scope.querySelectorAll("[data-i18n-value]").forEach(el=>{
      const key = el.getAttribute("data-i18n-value");
      if(!key) return;

      el.value = Onion.i18n.get(key);
    });

  };

})();
