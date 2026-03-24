"use strict";

(function(){

  if(!window.Onion) return;

  const Onion = window.Onion;

  Onion.i18n = Onion.i18n || {};

  let current = "es";

  Onion.i18n.setLang = function(lang){
    current = lang;
    Onion.userConfig?.set("lang", lang);
    Onion.i18n.apply();
  };

  Onion.i18n.get = function(key){
    return Onion.i18n[current]?.[key] || key;
  };

  Onion.i18n.apply = function(){

    document.querySelectorAll("[data-i18n]").forEach(el=>{
      const key = el.getAttribute("data-i18n");
      el.textContent = Onion.i18n.get(key);
    });

    document.querySelectorAll("[data-i18n-placeholder]").forEach(el=>{
      const key = el.getAttribute("data-i18n-placeholder");
      el.setAttribute("placeholder", Onion.i18n.get(key));
    });

  };

})();
