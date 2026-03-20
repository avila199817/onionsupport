(function(){

"use strict";

/* =====================================================
   CONFIG
===================================================== */

const PANEL_BASE = "/es/acceso/admin";
const STORAGE_KEY = "onion_user_slug";


/* =====================================================
   UTILS
===================================================== */

function clean(path){
  return (path || "")
    .replace(/\/index\.html?$/i,"")
    .replace(/\/+/g,"/")
    .replace(/\/+$/,"");
}

function join(a,b){
  const base = a.replace(/\/+$/,"");
  const sub  = (b || "").replace(/^\/+/,"");
  return sub ? `${base}/${sub}` : base;
}


/* =====================================================
   PARSE /@slug
===================================================== */

function parseSlug(){
  const path = clean(location.pathname);

  if(!path.startsWith("/@")) return null;

  const parts = path.split("/");

  const slug = parts[1]?.replace(/^@+/,"") || "";
  const sub  = clean(parts.slice(2).join("/"));

  if(!slug) return null;

  return {slug,sub};
}


/* =====================================================
   ROUTER CORE
===================================================== */

let isRouting = false;

function router(){

  if(isRouting) return;
  isRouting = true;

  const parsed = parseSlug();


  /* =====================================================
     SLUG → PANEL
  ===================================================== */

  if(parsed){

    const {slug,sub} = parsed;

    sessionStorage.setItem(STORAGE_KEY,slug);

    const target = join(PANEL_BASE,sub);

    if(clean(location.pathname) !== target){
      history.replaceState({}, "", target + location.search + location.hash);
    }

    isRouting = false;
    return;

  }


  /* =====================================================
     PANEL → SLUG
  ===================================================== */

  const slug = sessionStorage.getItem(STORAGE_KEY);

  if(!slug){
    isRouting = false;
    return;
  }

  const panelPath = clean(location.pathname);

  if(!panelPath.startsWith(PANEL_BASE)){
    isRouting = false;
    return;
  }

  const sub = clean(panelPath.slice(PANEL_BASE.length));

  const newUrl = join(`/@${slug}`,sub);

  if(clean(location.pathname) !== newUrl){
    history.replaceState({}, "", newUrl + location.search + location.hash);
  }

  isRouting = false;

}


/* =====================================================
   INIT
===================================================== */

router();
window.addEventListener("popstate",router);

})();