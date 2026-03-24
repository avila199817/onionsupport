"use strict";

try {
  const config = JSON.parse(localStorage.getItem("onion_config") || "{}");
  const dark = config.darkMode;

  if(dark === false){
    document.documentElement.setAttribute("data-theme","light");
  } else {
    document.documentElement.removeAttribute("data-theme");
  }
} catch {}
