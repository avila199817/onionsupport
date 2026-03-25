"use strict";

(function(){
  try{
    const config = JSON.parse(localStorage.getItem("onion_config") || "{}");

    const theme = config.darkMode === false ? "light" : "dark";

    document.documentElement.setAttribute("data-theme", theme);

  }catch(e){
    document.documentElement.setAttribute("data-theme", "dark");
  }
})();
